/**
 * ChapterPackageModal Component.
 *
 * Safe student-friendly preview and interaction modal for an Educational Chapter Package.
 * Displays available content tabs (Lesson outline, Summary overview, Flashcards, Quiz).
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  X,
  BookOpen,
  Layers,
  HelpCircle,
  FileText,
  Clock,
  Sparkles,
  ShoppingBag,
  GraduationCap,
  ExternalLink,
} from "lucide-react";
import type { ChapterPackageItem } from "@avana/domain";
import { formatToman } from "../commerce/userCommerceUtils.js";

export interface ChapterPackageModalProps {
  packageItem: ChapterPackageItem | null;
  open: boolean;
  onClose: () => void;
  onBuy: (pkg: ChapterPackageItem) => void;
}

type TabType = "lesson" | "summary" | "flashcard" | "quiz";

export function ChapterPackageModal({
  packageItem,
  open,
  onClose,
  onBuy,
}: ChapterPackageModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("lesson");

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

  // Set initial active tab based on what contents exist
  useEffect(() => {
    if (packageItem) {
      if (packageItem.contents.lesson.exists) {
        setActiveTab("lesson");
      } else if (packageItem.contents.summary.exists) {
        setActiveTab("summary");
      } else if (packageItem.contents.flashcards.exists) {
        setActiveTab("flashcard");
      } else if (packageItem.contents.quiz.exists) {
        setActiveTab("quiz");
      }
    }
  }, [packageItem]);

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

  if (!open || !packageItem) return null;

  const { contents, stats, access, purchase } = packageItem;
  const hasAccess = access.hasAccess;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--header-height,5rem)] z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-xl overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-package-title"
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
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Sparkles className="w-3 h-3" />
                <span>{packageItem.subject || "آموزش پزشکی و داروسازی"}</span>
              </span>

              <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
                <span>دوره: {packageItem.courseTitle}</span>
              </span>
            </div>

            <h2
              id="chapter-package-title"
              className="text-lg sm:text-xl font-extrabold text-white"
            >
              {packageItem.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-white/10 bg-slate-900/40 overflow-x-auto scrollbar-none shrink-0">
          {contents.lesson.exists && (
            <button
              type="button"
              data-testid="tab-package-lesson"
              onClick={() => setActiveTab("lesson")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "lesson"
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-400" />
              <span>درسنامه ({contents.lesson.count} جلسه)</span>
            </button>
          )}

          {contents.summary.exists && (
            <button
              type="button"
              data-testid="tab-package-summary"
              onClick={() => setActiveTab("summary")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "summary"
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>خلاصه و جمع‌بندی</span>
            </button>
          )}

          {contents.flashcards.exists && (
            <button
              type="button"
              data-testid="tab-package-flashcard"
              onClick={() => setActiveTab("flashcard")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "flashcard"
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-4 h-4 text-amber-400" />
              <span>فلش‌کارت‌ها ({stats.flashcardCount})</span>
            </button>
          )}

          {contents.quiz.exists && (
            <button
              type="button"
              data-testid="tab-package-quiz"
              onClick={() => setActiveTab("quiz")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 ${
                activeTab === "quiz"
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <HelpCircle className="w-4 h-4 text-purple-400" />
              <span>آزمون تستی ({stats.quizQuestionCount} سوال)</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Tab: Lesson */}
          {activeTab === "lesson" && contents.lesson.exists && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 leading-relaxed">
                این بسته شامل درسنامه ساختاریافته به همراه مفاهیم علمی، جداول آموزشی و نکات بالینی استاندارد است.
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">عنوان درسنامه:</h4>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-sm font-semibold text-white">
                  {contents.lesson.title || packageItem.title}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Summary */}
          {activeTab === "summary" && contents.summary.exists && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 leading-relaxed">
                {contents.summary.overview ||
                  "خلاصه پربازده شامل نکات کلیدی و جمع‌بندی سریع مفاهیم اصلی این فصل برای مرور شب امتحان."}
              </div>
            </div>
          )}

          {/* Tab: Flashcards */}
          {activeTab === "flashcard" && contents.flashcards.exists && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 leading-relaxed">
                مجموعه {stats.flashcardCount} فلش‌کارت مرور فعال با سیستم تکرار فاصله‌دار (Spaced Repetition) جهت تثبیت در حافظه بلندمدت.
              </div>
            </div>
          )}

          {/* Tab: Quiz */}
          {activeTab === "quiz" && contents.quiz.exists && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 leading-relaxed">
                آزمون تستی چهارگزینه‌ای شامل {stats.quizQuestionCount} سوال مفهومی به همراه پاسخ تشریحی و تحلیل گزینه‌ها.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer CTA */}
        <div className="p-5 sm:p-6 border-t border-white/10 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">مجموع زمان تقریبی مطالعه:</span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-full border border-teal-500/20">
              <Clock className="w-3.5 h-3.5" />
              <span>~{stats.estimatedReadingMinutes || 20} دقیقه</span>
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {hasAccess ? (
              <Link
                to={`/courses/${packageItem.courseId}/learn`}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-900/40 transition-all"
              >
                <span>ورود به محیط مطالعه و یادگیری</span>
                <ExternalLink className="w-4 h-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBuy(packageItem);
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 shadow-md shadow-purple-900/40 transition-all cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>
                  خرید بسته آموزشی {purchase.price > 0 ? `(${formatToman(purchase.price)})` : ""}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
