import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  BookOpen,
  Layers,
  HelpCircle,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Zap,
  Clock,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { canUserGenerateContent } from "../../utils/generationPermissions.js";
import type { DocumentContentStatus } from "../../lib/api/generation.js";
import { toPersianDigits } from "@avana/domain";

export interface GenerateContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  contentStatus?: {
    lesson: DocumentContentStatus;
    flashcards: DocumentContentStatus;
    exam: DocumentContentStatus;
    review_summary?: DocumentContentStatus;
    all_generated?: boolean;
    can_generate?: boolean;
  } | null;
  isLoadingStatus?: boolean;
  isGenerating?: boolean;
  onConfirmGenerate: (selected: {
    lesson: boolean;
    flashcards: boolean;
    exam: boolean;
    review_summary: boolean;
  }) => void;
}

export function GenerateContentModal({
  isOpen,
  onClose,
  documentName,
  contentStatus,
  isLoadingStatus = false,
  isGenerating = false,
  onConfirmGenerate,
}: GenerateContentModalProps) {
  const { user, memberships } = useAuth();
  const isGenerationPermitted = user ? canUserGenerateContent(user, memberships) : true;

  // Local selection state for each content type
  const [selectedLesson, setSelectedLesson] = useState(true);
  const [selectedFlashcards, setSelectedFlashcards] = useState(true);
  const [selectedExam, setSelectedExam] = useState(true);
  const [selectedReviewSummary, setSelectedReviewSummary] = useState(false);

  // Sync initial selection when modal opens or contentStatus changes
  useEffect(() => {
    if (isOpen && contentStatus) {
      setSelectedLesson(true);
      setSelectedFlashcards(true);
      setSelectedExam(true);
      setSelectedReviewSummary(false);
    }
  }, [isOpen, contentStatus]);

  // Lock background body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key (always allowed, never blocked)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const isLessonGenerated = Boolean(contentStatus?.lesson?.generated);
  const isFlashcardsGenerated = Boolean(contentStatus?.flashcards?.generated);
  const isExamGenerated = Boolean(contentStatus?.exam?.generated);
  const isReviewSummaryGenerated = Boolean(contentStatus?.review_summary?.generated);

  // Determine how many NEW (ungenerated) items are selected
  const newItemsToGenerate = useMemo(() => {
    const items: Array<"lesson" | "flashcard" | "quiz" | "review_summary"> = [];
    if (!isLessonGenerated && selectedLesson) items.push("lesson");
    if (!isFlashcardsGenerated && selectedFlashcards) items.push("flashcard");
    if (!isExamGenerated && selectedExam) items.push("quiz");
    if (!isReviewSummaryGenerated && selectedReviewSummary) items.push("review_summary");
    return items;
  }, [
    isLessonGenerated,
    selectedLesson,
    isFlashcardsGenerated,
    selectedFlashcards,
    isExamGenerated,
    selectedExam,
    isReviewSummaryGenerated,
    selectedReviewSummary,
  ]);

  const allAvailableGenerated =
    isLessonGenerated &&
    isFlashcardsGenerated &&
    isExamGenerated &&
    isReviewSummaryGenerated;
  const hasNoNewSelection = newItemsToGenerate.length === 0;

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasNoNewSelection || isGenerating || allAvailableGenerated) return;

    onConfirmGenerate({
      lesson: !isLessonGenerated && selectedLesson,
      flashcards: !isFlashcardsGenerated && selectedFlashcards,
      exam: !isExamGenerated && selectedExam,
      review_summary: !isReviewSummaryGenerated && selectedReviewSummary,
    });
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-modal-title"
      onClick={() => {
        onClose();
      }}
    >
      <div
        className="w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden font-sans text-[var(--color-text)] space-y-0 relative z-[100000] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--color-border)] flex items-start justify-between gap-4 bg-[var(--color-surface)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#008080] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="generate-modal-title"
                className="text-base sm:text-lg font-black text-[var(--color-text)]"
              >
                انتخاب محتوای موردنظر
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate max-w-md" dir="ltr">
                {documentName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-xl transition-colors"
            aria-label="بستن"
            title={isGenerating ? "بستن پنجره (تولید در پس‌زمینه ادامه می‌یابد)" : "بستن"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {!isGenerationPermitted ? (
          <div className="p-6 space-y-6 text-center">
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>به‌زودی</span>
                </div>
                <h3 className="text-base font-bold text-amber-900">
                  قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد.
                </h3>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed max-w-sm mx-auto">
                فرآیند تولید خودکار محتوای آموزشی برای کاربران عادی به زودی فعال خواهد شد.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-bold border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {isLoadingStatus ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
              <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
              <p className="text-xs">در حال بررسی وضعیت محتوای فایل...</p>
            </div>
          ) : allAvailableGenerated ? (
            <div className="p-5 rounded-2xl bg-teal-50 border border-teal-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-teal-100 text-[#008080] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-teal-900">
                  تمام محتوای این فایل تولید شده است
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  درس، فلش‌کارت و آزمون برای این فایل از قبل در سیستم تولید شده و
                  موجود هستند.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-[var(--color-text-muted)]">
                مشخص کنید برای این فایل چه نوع محتوایی تولید شود. مواردی که از
                قبل تولید شده‌اند، غیرفعال هستند:
              </p>

              {/* 3 Content Option Cards */}
              <div className="space-y-3">
                {/* 1. LESSON OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isLessonGenerated
                      ? "bg-[var(--color-surface-warm)] border-[var(--color-border)] opacity-80 cursor-not-allowed"
                      : selectedLesson
                      ? "bg-[#008080]/10 border-[#008080] shadow-xs"
                      : "bg-[var(--color-surface-warm)] border-[var(--color-border)] hover:border-[#008080]/40"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isLessonGenerated
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-teal-50 border-teal-200 text-[#008080]"
                      }`}
                    >
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--color-text)]">
                          درس (Lesson)
                        </span>
                        {isLessonGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تولید شده ({toPersianDigits(contentStatus?.lesson?.count || 1)} درس)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#008080] border border-teal-200">
                            آماده تولید
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        محتوای آموزشی ساختاریافته و دسته‌بندی‌شده برای مطالعه عمیق
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isLessonGenerated || selectedLesson}
                    disabled={isLessonGenerated || isGenerating}
                    onChange={(e) => setSelectedLesson(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-[var(--color-border)] text-[#008080] focus:ring-[#008080] focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب درس"
                  />
                </label>

                {/* 2. FLASHCARDS OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isFlashcardsGenerated
                      ? "bg-[var(--color-surface-warm)] border-[var(--color-border)] opacity-80 cursor-not-allowed"
                      : selectedFlashcards
                      ? "bg-[#008080]/10 border-[#008080] shadow-xs"
                      : "bg-[var(--color-surface-warm)] border-[var(--color-border)] hover:border-[#008080]/40"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isFlashcardsGenerated
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-purple-50 border-purple-200 text-purple-700"
                      }`}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--color-text)]">
                          فلش‌کارت (Flashcards)
                        </span>
                        {isFlashcardsGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>
                              تولید شده ({toPersianDigits(contentStatus?.flashcards?.count || 1)} کارت)
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            آماده تولید
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        کارت‌های مرور اتمیک و یادگیری فاصله‌دار (SRS) برای تثبیت
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isFlashcardsGenerated || selectedFlashcards}
                    disabled={isFlashcardsGenerated || isGenerating}
                    onChange={(e) => setSelectedFlashcards(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-[var(--color-border)] text-[#008080] focus:ring-[#008080] focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب فلش‌کارت"
                  />
                </label>

                {/* 3. EXAM / QUIZ OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isExamGenerated
                      ? "bg-[var(--color-surface-warm)] border-[var(--color-border)] opacity-80 cursor-not-allowed"
                      : selectedExam
                      ? "bg-[#008080]/10 border-[#008080] shadow-xs"
                      : "bg-[var(--color-surface-warm)] border-[var(--color-border)] hover:border-[#008080]/40"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isExamGenerated
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-amber-50 border-amber-200 text-amber-700"
                      }`}
                    >
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--color-text)]">
                          آزمون (Exam / Quiz)
                        </span>
                        {isExamGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تولید شده ({toPersianDigits(contentStatus?.exam?.count || 1)} سؤال)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            آماده تولید
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        سؤالات تستی ۴ گزینه‌ای استاندارد همراه با پاسخ تشریحی
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isExamGenerated || selectedExam}
                    disabled={isExamGenerated || isGenerating}
                    onChange={(e) => setSelectedExam(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-[var(--color-border)] text-[#008080] focus:ring-[#008080] focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب آزمون"
                  />
                </label>

                {/* 4. REVIEW SUMMARY OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isReviewSummaryGenerated
                      ? "bg-[var(--color-surface-warm)] border-[var(--color-border)] opacity-80 cursor-not-allowed"
                      : selectedReviewSummary
                      ? "bg-[#008080]/10 border-[#008080] shadow-xs"
                      : "bg-[var(--color-surface-warm)] border-[var(--color-border)] hover:border-[#008080]/40"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isReviewSummaryGenerated
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-teal-50 border-teal-200 text-[#008080]"
                      }`}
                    >
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--color-text)]">
                          خلاصه مروری (Review Summary)
                        </span>
                        {isReviewSummaryGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تولید شده</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-[#008080] border border-teal-200">
                            مرور ۱۰–۱۵ دقیقه‌ای
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        نسخه فوق‌العاده فشرده با حداکثر اطلاعات مهم و نکات کلیدی آزمونی
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isReviewSummaryGenerated || selectedReviewSummary}
                    disabled={isReviewSummaryGenerated || isGenerating}
                    onChange={(e) => setSelectedReviewSummary(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-[var(--color-border)] text-[#008080] focus:ring-[#008080] focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب خلاصه مروری"
                  />
                </label>
              </div>

              {/* Validation Warning when 0 ungenerated items selected */}
              {hasNoNewSelection && !allAvailableGenerated && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>حداقل یک نوع محتوا را برای تولید انتخاب کنید.</span>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
            <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              <span>
                {newItemsToGenerate.length > 0
                  ? `${newItemsToGenerate.length} نوع محتوا برای تولید در صف قرار خواهد گرفت.`
                  : "موردی برای تولید انتخاب نشده است."}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs font-bold transition-colors"
                title={isGenerating ? "بستن پنجره (تولید در پس‌زمینه ادامه می‌یابد)" : "انصراف"}
              >
                {isGenerating ? "بستن پنجره" : "انصراف"}
              </button>

              {!allAvailableGenerated && (
                <button
                  type="submit"
                  disabled={hasNoNewSelection || isGenerating || isLoadingStatus}
                  className="px-5 py-2.5 rounded-xl bg-[#008080] hover:bg-[#007575] active:bg-[#006060] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال تولید هوشمند...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {newItemsToGenerate.length === 3
                          ? "تولید محتوا"
                          : "تولید محتوای انتخاب‌شده"}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
