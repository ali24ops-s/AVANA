import React, { useState, useEffect } from "react";
import {
  Mic,
  Copy,
  Check,
  Wand2,
  RefreshCw,
  Clock,
  CheckCircle2,
  Stethoscope,
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Edit3,
  RotateCcw,
  Save,
  Eye,
} from "lucide-react";
import type {
  PresentationSlideResource,
  PresentationReferenceResource,
} from "@avana/contracts";
import type { PresentationSpeakerContent } from "@avana/domain";
import { Button, Badge, Alert, Dialog, DialogHeader, DialogContent, DialogFooter } from "../ui/index.js";
import {
  formatDurationSeconds,
  splitSpeechTextIntoParagraphs,
  formatSpeechText,
  toPersianDigits,
} from "./presentation-utils.js";
import { useUpdatePresentationSlide } from "../../hooks/usePresentation.js";

// Helper functions for sessionStorage draft persistence
interface StoredSpeechDraft {
  text: string;
  savedAt: number;
  baseUpdatedAt?: string;
}

function getDraftStorageKey(projectId: string, slideId: string): string {
  return `avana_speech_draft_${projectId}_${slideId}`;
}

function loadDraftFromStorage(projectId: string, slideId: string): StoredSpeechDraft | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(getDraftStorageKey(projectId, slideId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSpeechDraft;
  } catch {
    return null;
  }
}

function saveDraftToStorage(
  projectId: string,
  slideId: string,
  text: string,
  baseUpdatedAt?: string,
) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const payload: StoredSpeechDraft = {
      text,
      savedAt: Date.now(),
      baseUpdatedAt,
    };
    sessionStorage.setItem(getDraftStorageKey(projectId, slideId), JSON.stringify(payload));
  } catch {
    // ignore quota/disabled storage
  }
}

function clearDraftFromStorage(projectId: string, slideId: string) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    sessionStorage.removeItem(getDraftStorageKey(projectId, slideId));
  } catch {
    // ignore
  }
}

interface SlideSpeechCardProps {
  projectId?: string;
  slide: PresentationSlideResource;
  references?: PresentationReferenceResource[];
  onGenerate: () => void;
  isGenerating: boolean;
  generateError?: string | null;
  className?: string;
  variant?: "full" | "compact";
}

export const SlideSpeechCard: React.FC<SlideSpeechCardProps> = ({
  projectId = "",
  slide,
  references: _references = [],
  onGenerate,
  isGenerating,
  generateError,
  className = "",
  variant = "full",
}) => {
  const isCompact = variant === "compact";
  const updateMutation = useUpdatePresentationSlide(projectId);

  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showRawAiModal, setShowRawAiModal] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Unsaved drafts preserved across slide changes per slide.id
  const [draftsBySlideId, setDraftsBySlideId] = useState<Record<string, string>>({});
  const [hasServerConflict, setHasServerConflict] = useState(false);
  const [conflictDraftText, setConflictDraftText] = useState<string | null>(null);

  // Accordions for secondary sections, closed by default
  const [isKeyPointsOpen, setIsKeyPointsOpen] = useState(false);
  const [isScenarioOpen, setIsScenarioOpen] = useState(false);
  const [isTransitionOpen, setIsTransitionOpen] = useState(false);

  // Reset secondary accordions & sync drafts on active slide change
  useEffect(() => {
    setIsKeyPointsOpen(false);
    setIsScenarioOpen(false);
    setIsTransitionOpen(false);
    setIsEditing(false);
    setSaveSuccess(false);
    setSaveError(null);
    setHasServerConflict(false);
    setConflictDraftText(null);

    if (!projectId || !slide.id) return;

    // Check if in-memory draft already exists for this slide
    if (draftsBySlideId[slide.id] !== undefined) {
      return;
    }

    // Try restoring draft from sessionStorage
    const stored = loadDraftFromStorage(projectId, slide.id);
    if (stored && typeof stored.text === "string") {
      const storedText = stored.text.trim();
      const currentBaseline =
        (slide.speaker_notes?.trim() ||
          slide.speech_content?.speechText?.trim() ||
          (slide.extraction_metadata?.speechContent as any)?.speechText?.trim() ||
          "");

      // If stored draft is identical to current baseline, it's already saved
      if (storedText === currentBaseline) {
        clearDraftFromStorage(projectId, slide.id);
        return;
      }

      // Check conflict: If slide was updated on the server after the draft was written
      const slideUpdatedTime = slide.updated_at ? new Date(slide.updated_at).getTime() : 0;
      if (
        slideUpdatedTime > stored.savedAt &&
        slide.speaker_notes &&
        slide.speaker_notes.trim() !== storedText
      ) {
        setHasServerConflict(true);
        setConflictDraftText(stored.text);
      } else {
        // Safe to restore draft into draftsBySlideId
        setDraftsBySlideId((prev) => ({
          ...prev,
          [slide.id]: stored.text,
        }));
      }
    }
  }, [slide.id, projectId]);

  // Extract raw AI speech content
  const speechContent: PresentationSpeakerContent | null =
    slide.speech_content ??
    ((slide.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);

  const rawAiText = speechContent?.speechText?.trim() || "";
  const savedSpeakerNotes = slide.speaker_notes?.trim() || "";

  // Active baseline: saved speaker_notes takes precedence, falling back to raw AI text
  const baselineText = savedSpeakerNotes || rawAiText;

  // Current text being displayed/edited: if draft exists for this slide, use draft; otherwise baseline
  const currentText =
    draftsBySlideId[slide.id] !== undefined ? draftsBySlideId[slide.id] : baselineText;

  // Determine if there are unsaved local modifications
  const isDraftDirty = draftsBySlideId[slide.id] !== undefined && draftsBySlideId[slide.id] !== baselineText;

  // Determine if user has custom edits (either saved or draft) compared to raw AI text
  const hasManualEdits =
    Boolean(savedSpeakerNotes && savedSpeakerNotes !== rawAiText) ||
    (Boolean(rawAiText) && currentText.trim() !== rawAiText.trim());

  // Text metrics
  const wordCount = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  // Estimated reading time at ~130 Persian words per minute
  const estimatedSeconds = wordCount > 0 ? Math.max(10, Math.round((wordCount / 130) * 60)) : 0;

  const unsupportedContent = slide.extraction_metadata?.unsupportedContent as
    | {
        hasCharts?: boolean;
        hasSmartArt?: boolean;
        hasGroupedShapes?: boolean;
        warningMessage?: string;
      }
    | undefined;

  // Warn before browser unload if there are unsaved local modifications
  useEffect(() => {
    if (!isDraftDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "تغییرات ذخیره‌نشده‌ای در متن ارائه شفاهی وجود دارد. آیا از خروج اطمینان دارید؟";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDraftDirty]);

  const handleKeepLocalDraft = () => {
    if (conflictDraftText !== null) {
      setDraftsBySlideId((prev) => ({
        ...prev,
        [slide.id]: conflictDraftText,
      }));
    }
    setHasServerConflict(false);
  };

  const handleDiscardLocalDraft = () => {
    clearDraftFromStorage(projectId, slide.id);
    setDraftsBySlideId((prev) => {
      const next = { ...prev };
      delete next[slide.id];
      return next;
    });
    setHasServerConflict(false);
  };

  const handleCopy = async () => {
    if (!currentText) return;
    try {
      await navigator.clipboard.writeText(formatSpeechText(currentText));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraftsBySlideId((prev) => ({
      ...prev,
      [slide.id]: val,
    }));
    if (val.trim() !== baselineText.trim()) {
      saveDraftToStorage(projectId, slide.id, val, slide.updated_at);
    } else {
      clearDraftFromStorage(projectId, slide.id);
    }
  };

  const handleSaveSpeech = async () => {
    if (!projectId || updateMutation.isPending) return;
    setSaveError(null);
    setSaveSuccess(false);

    const textBeingSaved = currentText.trim();

    try {
      await updateMutation.mutateAsync({
        slideId: slide.id,
        data: {
          speaker_notes: textBeingSaved || null,
          expected_updated_at: slide.updated_at,
        },
      });

      // Clear draft for this slide since it's saved, provided user didn't type newer changes
      setDraftsBySlideId((prev) => {
        const current = prev[slide.id];
        if (current === undefined || current.trim() === textBeingSaved) {
          clearDraftFromStorage(projectId, slide.id);
          const next = { ...prev };
          delete next[slide.id];
          return next;
        }
        // User typed newer edits while request was in-flight; keep newer draft
        return prev;
      });

      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      // Retain draft in draftsBySlideId and sessionStorage on error so nothing is lost!
      setSaveError(
        err instanceof Error
          ? `خطا در ذخیره متن سخنرانی: ${err.message}`
          : "خطا در ذخیره‌سازی متن سخنرانی. لطفاً اتصال اینترنت را بررسی فرمایید.",
      );
    }
  };

  const handleRestoreToAi = async () => {
    if (!rawAiText) return;
    clearDraftFromStorage(projectId, slide.id);
    setDraftsBySlideId((prev) => ({
      ...prev,
      [slide.id]: rawAiText,
    }));

    if (projectId && slide.speaker_notes) {
      try {
        await updateMutation.mutateAsync({
          slideId: slide.id,
          data: {
            speaker_notes: null,
            expected_updated_at: slide.updated_at,
          },
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } catch (err: unknown) {
        setSaveError(err instanceof Error ? err.message : "خطا در بازگردانی متن");
      }
    }
  };

  const handleRegenerateClick = () => {
    if (hasManualEdits) {
      setShowRegenerateConfirm(true);
    } else {
      onGenerate();
    }
  };

  const handleConfirmRegenerate = () => {
    setShowRegenerateConfirm(false);
    onGenerate();
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-[var(--color-border)] shadow-xs overflow-hidden transition-all ${className}`}
      dir="rtl"
    >
      {/* Header Bar */}
      <div
        className={`${
          isCompact ? "p-3 sm:p-3.5" : "px-5 py-3.5"
        } bg-gradient-to-l from-slate-50 to-white border-b border-slate-100 flex items-center justify-between gap-2.5 flex-wrap`}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                {isCompact ? "متن ارائه شفاهی" : "متن پیشنهادی برای ارائه شفاهی"}
              </h3>
              {currentText ? (
                <Badge variant={hasManualEdits ? "warning" : "success"} size="sm" className="text-[10px]">
                  {hasManualEdits ? "ویرایش‌شده توسط کاربر" : "آماده ارائه"}
                </Badge>
              ) : null}
              {isDraftDirty && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  تغییرات ذخیره‌نشده
                </span>
              )}
              {saveSuccess && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  ذخیره شد
                </span>
              )}
            </div>
            {!isCompact && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                متن طبیعی و روان متناسب با محتوای این اسلاید (بدون روخوانی ساده اسلاید)
              </p>
            )}
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {estimatedSeconds > 0 && (
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-slate-500 bg-slate-100/80 px-2 py-1 rounded-lg">
              <Clock className="w-3 h-3 text-[#008080]" />
              <span className="hidden sm:inline">زمان تخمینی:</span>
              <strong className="text-slate-700">
                {formatDurationSeconds(estimatedSeconds)}
              </strong>
              <span className="text-[10px] text-slate-400">({toPersianDigits(wordCount)} کلمه)</span>
            </div>
          )}

          {/* Copy Button */}
          {currentText && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1 sm:gap-1.5 text-xs text-slate-700 bg-white"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>کپی</span>
                </>
              )}
            </Button>
          )}

          {/* View Raw AI Text Toggle (if edited) */}
          {hasManualEdits && rawAiText && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRawAiModal(true)}
              className="gap-1 text-xs text-slate-600 bg-white"
              title="مشاهده متن اولیه تولیدشده توسط هوش مصنوعی"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">متن اولیه AI</span>
            </Button>
          )}

          {/* Restore to AI Text */}
          {hasManualEdits && rawAiText && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestoreToAi}
              disabled={updateMutation.isPending}
              className="gap-1 text-xs text-amber-700 bg-amber-50/60 border-amber-200 hover:bg-amber-100"
              title="بازگردانی به متن اولیه هوش مصنوعی"
            >
              <RotateCcw className="w-3 h-3 text-amber-600" />
              <span>بازگردانی</span>
            </Button>
          )}

          {/* Toggle Edit Mode */}
          {currentText && (
            <Button
              type="button"
              variant={isEditing ? "secondary" : "outline"}
              size="sm"
              onClick={() => setIsEditing((prev) => !prev)}
              className="gap-1 text-xs font-semibold"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? "حالت نمایش" : "ویرایش متن"}</span>
            </Button>
          )}

          {/* Save Button (when edited or dirty) */}
          {(isDraftDirty || isEditing) && projectId && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveSpeech}
              disabled={!isDraftDirty || updateMutation.isPending}
              isLoading={updateMutation.isPending}
              className="gap-1 text-xs font-bold"
            >
              <Save className="w-3.5 h-3.5" />
              <span>ذخیره تغییرات</span>
            </Button>
          )}

          {/* Regenerate with AI */}
          <Button
            type="button"
            variant={currentText ? "outline" : "primary"}
            size="sm"
            onClick={handleRegenerateClick}
            disabled={isGenerating}
            isLoading={isGenerating}
            className="gap-1 sm:gap-1.5 text-xs font-bold"
          >
            {currentText ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {slide.is_paid
                    ? (isCompact ? "بازتولید رایگان" : "بازتولید رایگان با هوش مصنوعی")
                    : (isCompact ? "تولید مجدد (۱٬۵۰۰ ت)" : "تولید مجدد · ۱٬۵۰۰ تومان")}
                </span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>
                  {slide.is_paid
                    ? (isCompact ? "تولید رایگان" : "تولید رایگان با AI")
                    : (isCompact ? "تولید (۱٬۵۰۰ ت)" : "تولید هوشمند · ۱٬۵۰۰ تومان")}
                </span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Unsupported content warning */}
      {unsupportedContent && (unsupportedContent.hasCharts || unsupportedContent.hasSmartArt) && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            {unsupportedContent.warningMessage ||
              "این اسلاید شامل نمودار یا ساختار گرافیکی (SmartArt) است. متن سخنرانی بر پایه اطلاعات متنی استخراج‌شده تدوین شده و پیشنهاد می‌شود توضیحات تکمیلی را بررسی فرمایید."}
          </div>
        </div>
      )}

      {/* Error state */}
      {generateError && (
        <div className="p-5 pb-0">
          <Alert variant="error" className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{generateError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onGenerate}
                disabled={isGenerating}
                className="text-[11px] h-7 px-2"
              >
                تلاش مجدد
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {saveError && (
        <div className="p-5 pb-0">
          <Alert variant="error" className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{saveError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveSpeech}
                disabled={updateMutation.isPending}
                isLoading={updateMutation.isPending}
                className="text-[11px] h-7 px-2 shrink-0 bg-white"
              >
                تلاش مجدد
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {/* Server Conflict Banner */}
      {hasServerConflict && (
        <div className="mx-5 mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-2">
          <div className="flex items-start gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>تعارض همگام‌سازی: نسخه سرور پس از پیش‌نویس محلی شما به‌روزرسانی شده است.</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            نسخه این اسلاید روی سرور جدیدتر از پیش‌نویس ذخیره‌نشده شما است. مایلید از پیش‌نویس محلی استفاده کنید یا نسخه به‌روز سرور؟
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleKeepLocalDraft}
              className="text-xs bg-white text-slate-700"
            >
              استفاده از پیش‌نویس محلی
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDiscardLocalDraft}
              className="text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300"
            >
              استفاده از نسخه سرور
            </Button>
          </div>
        </div>
      )}

      {/* Body Content */}
      <div className="p-5 space-y-5">
        {/* State 1: Generating */}
        {isGenerating ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center animate-spin">
              <Wand2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">
              در حال تدوین هوشمند متن سخنرانی...
            </h4>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              هوش مصنوعی در حال تحلیل بار شناختی اسلاید و ساخت سناریوی گفتاری طبیعی و مستند است.
            </p>
          </div>
        ) : currentText ? (
          /* State 2: Content Ready (View or Inline Edit) */
          <div className="space-y-4">
            {isEditing ? (
              /* Inline Textarea Editor */
              <div className="p-4 rounded-2xl bg-amber-50/30 border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    <Edit3 className="w-4 h-4 text-amber-600" />
                    <span>ویرایش مستقیم متن سخنرانی</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {toPersianDigits(wordCount)} کلمه • تخمین {formatDurationSeconds(estimatedSeconds)}
                  </span>
                </div>
                <textarea
                  value={currentText}
                  onChange={handleTextChange}
                  rows={8}
                  placeholder="متن سخنرانی اسلاید را اینجا ویرایش فرمایید..."
                  className="w-full text-sm leading-loose p-3.5 bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#008080] focus:border-transparent text-slate-800 font-medium"
                />
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-slate-500">
                    پیش‌نویس شما حتی در صورت تعویض اسلاید تا زمان بستن صفحه حفظ خواهد شد.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                      className="text-xs bg-white"
                    >
                      بستن ویرایشگر
                    </Button>
                    {projectId && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleSaveSpeech}
                        disabled={!isDraftDirty || updateMutation.isPending}
                        isLoading={updateMutation.isPending}
                        className="text-xs font-bold gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        ذخیره تغییرات
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Main Oral Speech Text in Structured Paragraphs */
              <div className="p-4 sm:p-5 rounded-2xl bg-[#008080]/5 border border-[#008080]/20 relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#008080]">
                    <Mic className="w-4 h-4" />
                    <span>متن گفتاری اسلاید (بیان شفاهی در سخنرانی)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-[11px] font-bold text-[#008080] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    ویرایش
                  </button>
                </div>
                <div className="space-y-3.5 sm:space-y-4">
                  {splitSpeechTextIntoParagraphs(currentText).map((para, idx) => (
                    <p
                      key={idx}
                      className={`${
                        isCompact
                          ? "text-xs sm:text-sm leading-relaxed"
                          : "text-sm sm:text-base leading-loose"
                      } font-medium text-slate-800 text-justify selection:bg-[#008080]/20 whitespace-pre-line`}
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Accordion 1: Key Points (نکات کلیدی برای ارائه) */}
            {speechContent?.keyPoints && speechContent.keyPoints.length > 0 && (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsKeyPointsOpen((prev) => !prev);
                  }}
                  aria-expanded={isKeyPointsOpen}
                  className="w-full p-3 sm:p-3.5 flex items-center justify-between text-start hover:bg-slate-100/70 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#008080]" />
                    <span className="text-xs sm:text-sm font-bold text-slate-700">
                      نکات کلیدی برای ارائه
                    </span>
                    <span className="text-[10px] bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                      {speechContent.keyPoints.length} نکته
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      isKeyPointsOpen ? "rotate-180 text-[#008080]" : ""
                    }`}
                  />
                </button>

                {isKeyPointsOpen && (
                  <div className="px-4 pb-3.5 pt-1 border-t border-slate-200/60 bg-white/70">
                    <ul className="space-y-2 pt-2 pr-1">
                      {speechContent.keyPoints.map((point, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-700 flex items-start gap-2.5 leading-relaxed"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#008080] shrink-0 mt-2" />
                          <span className="flex-1 font-medium">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Accordion 2: Clinical Scenario */}
            {speechContent?.clinicalExample &&
              (speechContent.clinicalExample.scenario ||
                speechContent.clinicalExample.clinicalPearl) && (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsScenarioOpen((prev) => !prev);
                    }}
                    aria-expanded={isScenarioOpen}
                    className="w-full p-3 sm:p-3.5 flex items-center justify-between text-start hover:bg-emerald-100/50 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs sm:text-sm font-bold text-emerald-800">
                        سناریوی آموزشی و کاربردی
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-emerald-600 transition-transform duration-200 ${
                        isScenarioOpen ? "rotate-180 text-emerald-800" : ""
                      }`}
                    />
                  </button>

                  {isScenarioOpen && (
                    <div className="px-4 pb-3.5 pt-2 border-t border-emerald-200/60 bg-white/70 space-y-2.5">
                      {speechContent.clinicalExample.scenario && (
                        <div className="text-xs text-emerald-950 leading-relaxed">
                          <strong className="text-emerald-900 font-bold">سناریو: </strong>
                          <span>{speechContent.clinicalExample.scenario}</span>
                        </div>
                      )}
                      {speechContent.clinicalExample.clinicalPearl && (
                        <div className="text-xs text-emerald-950 leading-relaxed p-2.5 bg-white rounded-lg border border-emerald-200/80">
                          <strong className="text-emerald-800 font-bold">نکته کلیدی بالینی: </strong>
                          <span>{speechContent.clinicalExample.clinicalPearl}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            {/* Accordion 3: Next Slide Transition */}
            {speechContent?.transitionSentence && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsTransitionOpen((prev) => !prev);
                  }}
                  aria-expanded={isTransitionOpen}
                  className="w-full p-3 sm:p-3.5 flex items-center justify-between text-start hover:bg-amber-100/50 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4 text-amber-600" />
                    <span className="text-xs sm:text-sm font-bold text-amber-900">
                      جمله انتقال به اسلاید بعدی
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-amber-600 transition-transform duration-200 ${
                      isTransitionOpen ? "rotate-180 text-amber-900" : ""
                    }`}
                  />
                </button>

                {isTransitionOpen && (
                  <div className="px-4 pb-3.5 pt-2 border-t border-amber-200/60 bg-white/70">
                    <p className="text-xs text-amber-950 leading-relaxed italic">
                      «{speechContent.transitionSentence}»
                    </p>
                  </div>
                )}
              </div>
            )}


          </div>
        ) : (
          /* State 3: Empty / Pending Generation */
          <div className="py-8 px-4 rounded-2xl border-2 border-dashed border-slate-200 text-center space-y-3 bg-slate-50/50">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-[#008080] flex items-center justify-center mx-auto shadow-xs">
              <Wand2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                متن سخنرانی برای این اسلاید هنوز تولید نشده است
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                با زدن دکمه زیر، هوش مصنوعی AVANA متن روان سخنرانی، نکات کلیدی، توضیحات تکمیلی و سناریوهای آموزشی را برای این اسلاید تنظیم می‌کند.
              </p>
            </div>
            <div className="pt-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={onGenerate}
                disabled={isGenerating}
                isLoading={isGenerating}
                className="gap-2 text-xs font-bold"
              >
                <Wand2 className="w-4 h-4" />
                {slide.is_paid
                  ? "بازتولید رایگان با هوش مصنوعی"
                  : "تولید هوشمند متن سخنرانی · ۱٬۵۰۰ تومان"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal 1: View Raw AI-Generated Text */}
      <Dialog isOpen={showRawAiModal} onClose={() => setShowRawAiModal(false)} maxWidth="lg">
        <DialogHeader onClose={() => setShowRawAiModal(false)}>
          <h3 className="text-sm font-bold text-slate-800">متن اولیه تولیدشده توسط هوش مصنوعی</h3>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <p className="text-xs text-slate-500">
            این متن نسخه خام تولیدشده توسط Gemini است که بدون اعمال ویرایش‌های دستی شما نمایش داده می‌شود.
          </p>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-60 overflow-y-auto text-xs leading-loose text-slate-800 whitespace-pre-line font-medium select-text">
            {rawAiText || "متن اولیه‌ای در دسترس نیست."}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRawAiModal(false)}
          >
            بستن
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              handleRestoreToAi();
              setShowRawAiModal(false);
            }}
            className="gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            بازگردانی متن به این نسخه
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Modal 2: Confirm Regeneration Overwrite */}
      <Dialog isOpen={showRegenerateConfirm} onClose={() => setShowRegenerateConfirm(false)} maxWidth="md">
        <DialogHeader onClose={() => setShowRegenerateConfirm(false)}>
          <h3 className="text-sm font-bold text-slate-800">تأیید تولید مجدد با هوش مصنوعی</h3>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>این اسلاید شامل ویرایش‌های دستی شما است.</strong>
              <p className="mt-1 text-amber-800">
                آیا مایل به تولید مجدد هستید؟ متن تولیدشده جدید در سیستم قرار می‌گیرد، اما متن ویرایش‌شده شما در تاریخچه و با امکان بازگردانی محفوظ خواهد بود.
              </p>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRegenerateConfirm(false)}
          >
            انصراف
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleConfirmRegenerate}
            className="gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            تولید مجدد با AI
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

