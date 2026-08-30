/**
 * PackDetailModal Component.
 *
 * Safe student-friendly preview modal for a published Content Pack.
 * Displays lesson outline, sample flashcards, quiz topics, and review summary
 * without leaking raw payloads, source document IDs, or storage keys.
 */

import { useState, useEffect } from "react";
import {
  X,
  BookOpen,
  Layers,
  HelpCircle,
  FileText,
  Clock,
  Users,
  PlusCircle,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useLibraryPack } from "../../hooks/useLibrary.js";
import type { PublicContentPackDetailResource } from "@avana/domain";

export interface PackDetailModalProps {
  packId: string | null;
  open: boolean;
  onClose: () => void;
  onAddToCourse: (pack: PublicContentPackDetailResource) => void;
}

type TabType = "lesson" | "flashcard" | "quiz" | "summary";

export function PackDetailModal({
  packId,
  open,
  onClose,
  onAddToCourse,
}: PackDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("lesson");
  const { data, isLoading, isError, error, refetch } = useLibraryPack(
    open ? packId : null,
  );

  useEffect(() => {
    if (open) {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "hidden";
      }
    } else {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [open]);

  useEffect(() => {
    const preview = data?.pack?.preview;
    if (preview) {
      if (preview.lesson) {
        setActiveTab("lesson");
      } else if (preview.flashcard) {
        setActiveTab("flashcard");
      } else if (preview.quiz) {
        setActiveTab("quiz");
      } else if (preview.review_summary) {
        setActiveTab("summary");
      }
    }
  }, [data]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !packId) return null;

  const pack = data?.pack;
  const preview = pack?.preview;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--header-height,5rem)] z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-xl overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pack-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-3xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden glass-panel flex flex-col max-h-[calc(100vh-var(--header-height,5rem)-2rem)] sm:max-h-[calc(100vh-var(--header-height,5rem)-3rem)] my-auto">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-slate-900/80 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Sparkles className="w-3 h-3" />
                <span>{pack?.subject || "آموزش پزشکی و بالینی"}</span>
              </span>
              {pack && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-teal-400" />
                  <span>{pack.usage_count} نصب در دوره‌ها</span>
                </span>
              )}
            </div>

            <h2
              id="pack-detail-title"
              className="text-lg sm:text-xl font-bold text-white truncate"
            >
              {pack?.title || "جزئیات بسته آموزشی"}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              سازنده:{" "}
              <span className="text-slate-200 font-medium">
                {pack?.creator?.name || "کاربر آوانا"}
              </span>{" "}
              • انتشار:{" "}
              {pack?.published_at
                ? new Date(pack.published_at).toLocaleDateString("fa-IR")
                : "—"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
              <p className="text-xs text-slate-400">در حال دریافت پیش‌نمایش بسته...</p>
            </div>
          )}

          {isError && (
            <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-bold text-rose-300">
                خطا در دریافت اطلاعات بسته آموزشی
              </p>
              <p className="text-xs text-slate-400">
                {error?.message || "امکان اتصال به سرور وجود ندارد."}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold rounded-xl transition-colors"
              >
                تلاش مجدد
              </button>
            </div>
          )}

          {pack && (
            <>
              {/* Description */}
              {pack.description && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-300 leading-relaxed">
                  {pack.description}
                </div>
              )}

              {/* Stats Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      {pack.stats.session_count} جلسه
                    </div>
                    <div className="text-[10px] text-slate-400">درسنامه آموزشی</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      {pack.stats.flashcard_count} کارت
                    </div>
                    <div className="text-[10px] text-slate-400">فلش‌کارت مرور</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-purple-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      {pack.stats.quiz_question_count} سوال
                    </div>
                    <div className="text-[10px] text-slate-400">آزمون ارزیابی</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      ~{pack.stats.estimated_reading_minutes} دقیقه
                    </div>
                    <div className="text-[10px] text-slate-400">زمان مطالعه تقریبی</div>
                  </div>
                </div>
              </div>

              {/* Preview Navigation Tabs */}
              <div className="flex items-center gap-1 border-b border-white/10 pb-1">
                {preview?.lesson && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("lesson")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                      activeTab === "lesson"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>عناوین جلسات درس</span>
                  </button>
                )}

                {preview?.flashcard && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("flashcard")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                      activeTab === "flashcard"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>نمونه فلش‌کارت‌ها</span>
                  </button>
                )}

                {preview?.quiz && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("quiz")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                      activeTab === "quiz"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>سرفصل‌های آزمون</span>
                  </button>
                )}

                {preview?.review_summary && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("summary")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                      activeTab === "summary"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>خلاصه مروری</span>
                  </button>
                )}
              </div>

              {/* Tab Content Panels */}
              <div className="space-y-4">
                {/* 1. Lesson Sessions Outline */}
                {activeTab === "lesson" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300">
                      سرفصل جلسات درسنامه:
                    </h4>
                    {preview?.lesson?.sessionTitles &&
                    preview.lesson.sessionTitles.length > 0 ? (
                      <div className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                        {preview.lesson.sessionTitles.map((title, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 text-xs text-slate-200"
                          >
                            <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-medium">{title}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {preview?.lesson?.title || "درسنامه آموزشی شامل جلسات ساختاریافته"}
                      </p>
                    )}
                  </div>
                )}

                {/* 2. Sample Flashcards */}
                {activeTab === "flashcard" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300">
                      نمونه پرسش‌های فلش‌کارت ({preview?.flashcard?.totalCards ?? pack.stats.flashcard_count} کارت در بسته):
                    </h4>
                    {preview?.flashcard?.sampleQuestions &&
                    preview.flashcard.sampleQuestions.length > 0 ? (
                      <div className="grid gap-2.5">
                        {preview.flashcard.sampleQuestions.map((q, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-slate-200 flex items-start gap-2.5"
                          >
                            <Layers className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>{q}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        مجموعه فلش‌کارت‌های مرور مبتنی بر الگوریتم فاصله‌گذاری تکرار (Spaced Repetition).
                      </p>
                    )}
                  </div>
                )}

                {/* 3. Sample Quiz */}
                {activeTab === "quiz" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300">
                      مباحث و ساختار آزمون ({preview?.quiz?.totalQuestions ?? pack.stats.quiz_question_count} سوال تستی چهارگزینه‌ای):
                    </h4>
                    {preview?.quiz?.topics && preview.quiz.topics.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {preview.quiz.topics.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        آزمون ارزیابی استاندارد چندگزینه‌ای با کلید پاسخ و توضیحات تشریحی.
                      </p>
                    )}
                  </div>
                )}

                {/* 4. Review Summary */}
                {activeTab === "summary" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300">
                      مرور اجمالی مباحث و نکات مهم:
                    </h4>
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 leading-relaxed">
                      {preview?.review_summary?.overview ||
                        "این بسته شامل خلاصه جامع نکات کلیدی برای مرور سریع و جمع‌بندی پیش از امتحانات می‌باشد."}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer with Primary Add CTA */}
        {pack && (
          <div className="p-4 sm:p-6 border-t border-white/10 flex items-center justify-between gap-4 bg-slate-900/90 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              انصراف
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onAddToCourse(pack);
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-lg shadow-teal-900/40 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>افزودن این بسته به دوره من</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
