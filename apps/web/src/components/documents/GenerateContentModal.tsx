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
} from "lucide-react";
import type { DocumentContentStatus } from "../../lib/api/generation.js";

export interface GenerateContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  contentStatus?: {
    lesson: DocumentContentStatus;
    flashcards: DocumentContentStatus;
    exam: DocumentContentStatus;
    all_generated?: boolean;
    can_generate?: boolean;
  } | null;
  isLoadingStatus?: boolean;
  isGenerating?: boolean;
  onConfirmGenerate: (selected: {
    lesson: boolean;
    flashcards: boolean;
    exam: boolean;
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
  // Local selection state for each content type
  const [selectedLesson, setSelectedLesson] = useState(true);
  const [selectedFlashcards, setSelectedFlashcards] = useState(true);
  const [selectedExam, setSelectedExam] = useState(true);

  // Sync initial selection when modal opens or contentStatus changes
  useEffect(() => {
    if (isOpen && contentStatus) {
      // By default: select if NOT already generated; if already generated, keep checked but disabled
      setSelectedLesson(true);
      setSelectedFlashcards(true);
      setSelectedExam(true);
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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  const isLessonGenerated = Boolean(contentStatus?.lesson?.generated);
  const isFlashcardsGenerated = Boolean(contentStatus?.flashcards?.generated);
  const isExamGenerated = Boolean(contentStatus?.exam?.generated);

  // Determine how many NEW (ungenerated) items are selected
  const newItemsToGenerate = useMemo(() => {
    const items: Array<"lesson" | "flashcard" | "quiz"> = [];
    if (!isLessonGenerated && selectedLesson) items.push("lesson");
    if (!isFlashcardsGenerated && selectedFlashcards) items.push("flashcard");
    if (!isExamGenerated && selectedExam) items.push("quiz");
    return items;
  }, [
    isLessonGenerated,
    selectedLesson,
    isFlashcardsGenerated,
    selectedFlashcards,
    isExamGenerated,
    selectedExam,
  ]);

  const allAvailableGenerated =
    isLessonGenerated && isFlashcardsGenerated && isExamGenerated;
  const hasNoNewSelection = newItemsToGenerate.length === 0;

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasNoNewSelection || isGenerating || allAvailableGenerated) return;

    onConfirmGenerate({
      lesson: !isLessonGenerated && selectedLesson,
      flashcards: !isFlashcardsGenerated && selectedFlashcards,
      exam: !isExamGenerated && selectedExam,
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
        if (!isGenerating) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-xl bg-[#0f172a] border border-slate-700/80 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden font-sans text-slate-200 space-y-0 relative z-[100000] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="generate-modal-title"
                className="text-base sm:text-lg font-black text-white"
              >
                انتخاب محتوای موردنظر
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md" dir="ltr">
                {documentName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {isLoadingStatus ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-xs">در حال بررسی وضعیت محتوای فایل...</p>
            </div>
          ) : allAvailableGenerated ? (
            <div className="p-5 rounded-2xl bg-teal-950/40 border border-teal-500/30 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-teal-200">
                  تمام محتوای این فایل تولید شده است
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  درس، فلش‌کارت و آزمون برای این فایل از قبل در سیستم تولید شده و
                  موجود هستند.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                مشخص کنید برای این فایل چه نوع محتوایی تولید شود. مواردی که از
                قبل تولید شده‌اند، غیرفعال هستند:
              </p>

              {/* 3 Content Option Cards */}
              <div className="space-y-3">
                {/* 1. LESSON OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isLessonGenerated
                      ? "bg-slate-900/60 border-slate-800 opacity-80 cursor-not-allowed"
                      : selectedLesson
                      ? "bg-teal-950/20 border-teal-500/40 shadow-sm"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isLessonGenerated
                          ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                          : "bg-teal-500/10 border-teal-500/20 text-teal-400"
                      }`}
                    >
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">
                          درس (Lesson)
                        </span>
                        {isLessonGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تولید شده ({contentStatus?.lesson?.count || 1} درس)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20">
                            آماده تولید
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        محتوای آموزشی ساختاریافته و دسته‌بندی‌شده برای مطالعه عمیق
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isLessonGenerated || selectedLesson}
                    disabled={isLessonGenerated || isGenerating}
                    onChange={(e) => setSelectedLesson(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب درس"
                  />
                </label>

                {/* 2. FLASHCARDS OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isFlashcardsGenerated
                      ? "bg-slate-900/60 border-slate-800 opacity-80 cursor-not-allowed"
                      : selectedFlashcards
                      ? "bg-purple-950/20 border-purple-500/40 shadow-sm"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isFlashcardsGenerated
                          ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                          : "bg-purple-500/10 border-purple-500/20 text-purple-400"
                      }`}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">
                          فلش‌کارت (Flashcards)
                        </span>
                        {isFlashcardsGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>
                              تولید شده ({contentStatus?.flashcards?.count || 1} کارت)
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            آماده تولید
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        کارت‌های مرور اتمیک و یادگیری فاصله‌دار (SRS) برای تثبیت
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isFlashcardsGenerated || selectedFlashcards}
                    disabled={isFlashcardsGenerated || isGenerating}
                    onChange={(e) => setSelectedFlashcards(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب فلش‌کارت"
                  />
                </label>

                {/* 3. EXAM / QUIZ OPTION */}
                <label
                  className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    isExamGenerated
                      ? "bg-slate-900/60 border-slate-800 opacity-80 cursor-not-allowed"
                      : selectedExam
                      ? "bg-amber-950/20 border-amber-500/40 shadow-sm"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isExamGenerated
                          ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                          : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      }`}
                    >
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">
                          آزمون (Exam / Quiz)
                        </span>
                        {isExamGenerated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تولید شده ({contentStatus?.exam?.count || 1} سؤال)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            آماده تولید
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        سؤالات تستی ۴ گزینه‌ای استاندارد همراه با پاسخ تشریحی
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isExamGenerated || selectedExam}
                    disabled={isExamGenerated || isGenerating}
                    onChange={(e) => setSelectedExam(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                    aria-label="انتخاب آزمون"
                  />
                </label>
              </div>

              {/* Validation Warning when 0 ungenerated items selected */}
              {hasNoNewSelection && !allAvailableGenerated && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>حداقل یک نوع محتوا را برای تولید انتخاب کنید.</span>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
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
                disabled={isGenerating}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors disabled:opacity-50"
              >
                انصراف
              </button>

              {!allAvailableGenerated && (
                <button
                  type="submit"
                  disabled={hasNoNewSelection || isGenerating || isLoadingStatus}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-lg shadow-teal-950/50 flex items-center gap-2"
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
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}
