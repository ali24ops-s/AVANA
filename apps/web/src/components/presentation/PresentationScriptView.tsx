import React, { useState } from "react";
import {
  Mic,
  Copy,
  Check,
  Sparkles,
  Wand2,
  RefreshCw,
  Clock,
  Edit3,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Filter,
} from "lucide-react";
import type { PresentationSlideResource } from "@avana/contracts";
import type { PresentationSpeakerContent } from "@avana/domain";
import { Button, Badge, Alert } from "../ui/index.js";
import {
  toPersianDigits,
  formatDurationSeconds,
  splitSpeechTextIntoParagraphs,
  formatSpeechText,
} from "./presentation-utils.js";
import { useUpdatePresentationSlide } from "../../hooks/usePresentation.js";

interface PresentationScriptViewProps {
  projectId: string;
  slides: PresentationSlideResource[];
  onGenerateSlide: (slideId: string) => void;
  generatingSlideId?: string | null;
  onSelectSlide?: (slideId: string) => void;
  isGeneratingAll?: boolean;
}

export const PresentationScriptView: React.FC<PresentationScriptViewProps> = ({
  projectId,
  slides,
  onGenerateSlide,
  generatingSlideId,
  onSelectSlide,
  isGeneratingAll = false,
}) => {
  const updateSlideMutation = useUpdatePresentationSlide(projectId);

  // Filter: 'all' | 'unwritten'
  const [filterMode, setFilterMode] = useState<"all" | "unwritten">("all");

  // Editing state per slide
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [savedSlideId, setSavedSlideId] = useState<string | null>(null);
  const [copiedSlideId, setCopiedSlideId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const sortedSlides = [...slides].sort((a, b) => a.slide_index - b.slide_index);

  const filteredSlides = sortedSlides.filter((slide) => {
    const speech =
      slide.speech_content ??
      ((slide.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);
    const hasSpeech = Boolean(speech?.speechText || slide.speaker_notes);
    if (filterMode === "unwritten") {
      return !hasSpeech;
    }
    return true;
  });

  const handleStartEdit = (slide: PresentationSlideResource) => {
    const speech =
      slide.speech_content ??
      ((slide.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);
    setEditingSlideId(slide.id);
    setEditText(speech?.speechText || slide.speaker_notes || "");
  };

  const handleSaveEdit = async (slide: PresentationSlideResource) => {
    if (updateSlideMutation.isPending) return;

    try {
      await updateSlideMutation.mutateAsync({
        slideId: slide.id,
        data: {
          speaker_notes: editText.trim(),
          expected_updated_at: slide.updated_at,
        },
      });

      setSavedSlideId(slide.id);
      setEditingSlideId(null);
      setTimeout(() => setSavedSlideId(null), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCopySingle = async (slideId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(formatSpeechText(text));
      setCopiedSlideId(slideId);
      setTimeout(() => setCopiedSlideId(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleCopyEntireScript = async () => {
    const fullScript = sortedSlides
      .map((s) => {
        const speech =
          s.speech_content ??
          ((s.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);
        const rawText = speech?.speechText || s.speaker_notes;
        const text = rawText ? formatSpeechText(rawText) : "(متنی برای این اسلاید ثبت نشده است)";
        return `[اسلاید ${s.slide_index}: ${s.title || "بدون عنوان"}]\n${text}\n`;
      })
      .join("\n---\n\n");

    try {
      await navigator.clipboard.writeText(fullScript);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 3000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto w-full" dir="rtl">
      {/* Top Script Controls Bar */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterMode === "all"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            همه اسلایدها ({toPersianDigits(sortedSlides.length)})
          </button>

          <button
            type="button"
            onClick={() => setFilterMode("unwritten")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterMode === "unwritten"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            فاقد متن ارائه
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyEntireScript}
          className="gap-1.5 text-xs bg-white text-slate-700"
        >
          {copiedAll ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-bold">کل متن کپی شد</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>کپی متن کامل سخنرانی</span>
            </>
          )}
        </Button>
      </div>

      {/* Slide Cards List */}
      <div className="space-y-5">
        {filteredSlides.map((slide) => {
          const speech =
            slide.speech_content ??
            ((slide.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);
          const hasSpeech = Boolean(speech?.speechText || slide.speaker_notes);
          const isThisGenerating = generatingSlideId === slide.id;
          const statusMeta = (slide.extraction_metadata?.generationStatus as string) || "draft";
          const isFailed = statusMeta === "failed";
          const isEditing = editingSlideId === slide.id;

          return (
            <div
              key={slide.id}
              className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                hasSpeech
                  ? "border-slate-200 hover:border-slate-300"
                  : isFailed
                  ? "border-red-200 bg-red-50/10"
                  : "border-amber-200/80 bg-amber-50/10"
              }`}
            >
              {/* Card Header */}
              <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div
                  className={`flex items-center gap-2.5 min-w-0 ${onSelectSlide ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                  onClick={() => onSelectSlide?.(slide.id)}
                  title={onSelectSlide ? "مشاهده اسلاید در بوم" : undefined}
                >
                  <span className="w-7 h-7 rounded-xl bg-[#008080] text-white flex items-center justify-center text-xs font-black shrink-0">
                    {toPersianDigits(slide.slide_index)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 truncate">
                      {slide.title || `اسلاید شماره ${toPersianDigits(slide.slide_index)}`}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {speech?.suggestedDurationSeconds && (
                    <span className="text-[11px] text-slate-500 flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-slate-200/60">
                      <Clock className="w-3 h-3 text-[#008080]" />
                      {formatDurationSeconds(speech.suggestedDurationSeconds)}
                    </span>
                  )}

                  {isThisGenerating ? (
                    <Badge variant="primary" size="sm" className="text-[10px]">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#008080] animate-ping" />
                        در حال تولید...
                      </span>
                    </Badge>
                  ) : hasSpeech ? (
                    <Badge variant="success" size="sm" className="text-[10px]">
                      آماده ارائه
                    </Badge>
                  ) : isFailed ? (
                    <Badge variant="error" size="sm" className="text-[10px]">
                      نیازمند تلاش مجدد
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm" className="text-[10px]">
                      فاقد متن
                    </Badge>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-5 space-y-3.5">
                {/* Raw text preview */}
                {slide.raw_text && (
                  <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 line-clamp-2">
                    <span className="font-bold text-slate-600">متن اسلاید: </span>
                    {slide.raw_text}
                  </div>
                )}

                {/* Speech Text Content */}
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={5}
                      className="w-full text-xs sm:text-sm font-medium p-3 rounded-xl border border-[#008080] focus:outline-hidden focus:ring-1 focus:ring-[#008080] leading-relaxed text-slate-800 bg-[#008080]/5"
                      placeholder="متن سخنرانی این اسلاید..."
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingSlideId(null)}
                        className="text-xs"
                      >
                        انصراف
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleSaveEdit(slide)}
                        isLoading={updateSlideMutation.isPending}
                        className="text-xs font-bold"
                      >
                        ذخیره تغییرات
                      </Button>
                    </div>
                  </div>
                ) : hasSpeech ? (
                  <div className="space-y-3">
                    <div className="p-3.5 sm:p-4 rounded-xl bg-[#008080]/5 border border-[#008080]/15">
                      <div className="space-y-3 sm:space-y-3.5">
                        {splitSpeechTextIntoParagraphs(speech?.speechText || slide.speaker_notes).map((para, idx) => (
                          <p
                            key={idx}
                            className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed text-justify selection:bg-[#008080]/20 whitespace-pre-line"
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* Key points if available */}
                    {speech?.keyPoints && speech.keyPoints.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {speech.keyPoints.map((point, pIdx) => (
                          <span
                            key={pIdx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#008080]" />
                            {point}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500">
                      هنوز متنی برای این اسلاید تدوین نشده است.
                    </p>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onGenerateSlide(slide.id)}
                      disabled={isThisGenerating || isGeneratingAll}
                      isLoading={isThisGenerating}
                      className="gap-1.5 text-xs font-bold mx-auto"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      تولید متن این اسلاید
                    </Button>
                  </div>
                )}

                {/* Card Actions Footer */}
                {hasSpeech && !isEditing && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {savedSlideId === slide.id && (
                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          تغییرات ذخیره شد
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopySingle(
                            slide.id,
                            speech?.speechText || slide.speaker_notes || "",
                          )
                        }
                        className="text-xs text-slate-500 hover:text-slate-800"
                      >
                        {copiedSlideId === slide.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">کپی شد</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>کپی</span>
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(slide)}
                        className="text-xs text-slate-500 hover:text-slate-800 gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>ویرایش دستی</span>
                      </Button>

                      {/* Secondary re-generation action */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onGenerateSlide(slide.id)}
                        disabled={isThisGenerating || isGeneratingAll}
                        isLoading={isThisGenerating}
                        className="text-xs text-slate-400 hover:text-[#008080] gap-1"
                        title="تولید مجدد متن این اسلاید"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>بازتولید</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
