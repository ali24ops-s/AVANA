import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Layers,
  Sparkles,
  HelpCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  X,
} from "lucide-react";
import { api, type AdminCourseHierarchy, type AdminCourseHierarchyLesson } from "../../../lib/api/admin.js";
import { toPersianDigits } from "@avana/domain";

export interface CourseStructurePanelProps {
  courseId: string;
}

export function CourseStructurePanel({ courseId }: CourseStructurePanelProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [previewLesson, setPreviewLesson] = useState<AdminCourseHierarchyLesson | null>(null);

  const hierarchyQuery = useQuery({
    queryKey: ["course-hierarchy", courseId],
    queryFn: async () => {
      return api.get<AdminCourseHierarchy>(`/admin/content/courses/${courseId}/hierarchy`);
    },
  });

  const hierarchy = hierarchyQuery.data;
  const modules = hierarchy?.modules ?? [];

  const toggleModule = (modId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>ساختار و درخت محتوای دوره (Course Builder)</span>
          </h3>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1 rounded-full border border-[var(--color-border)]">
            {modules.length} فصل مصوب
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          نمایش ماژول‌ها، درسنامه‌ها و اقلام آموزشی تاییدشده در پایگاه‌داده رسمی. محتوای هوش مصنوعی پس از تایید نهایی در این بخش ثبت می‌شود.
        </p>
      </div>

      {/* Loading state */}
      {hierarchyQuery.isLoading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary-default)]" />
          <p className="text-xs">در حال بارگذاری ساختار دوره...</p>
        </div>
      )}

      {/* Error state */}
      {hierarchyQuery.isError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{hierarchyQuery.error?.message || "خطا در دریافت ساختار دوره"}</span>
        </div>
      )}

      {/* Empty State */}
      {!hierarchyQuery.isLoading && modules.length === 0 && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-[var(--color-text-muted)] opacity-60 mx-auto" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">
            هنوز فصلی برای این دوره ثبت نهایی نشده است
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto">
            پیش‌نویس‌های تولیدشده توسط هوش مصنوعی ابتدا در برگه «پیش‌نویس‌ها و بازبینی» بررسی می‌شوند و پس از «تایید رسمی دوره»، ساختار آموزشی در این بخش مستقر خواهد شد.
          </p>
        </div>
      )}

      {/* Modules List */}
      {modules.length > 0 && (
        <div className="space-y-3">
          {modules.map((mod, index) => {
            const isExpanded = expandedModules.has(mod.id) || expandedModules.size === 0;
            return (
              <div
                key={mod.id}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden transition-all shadow-sm"
              >
                {/* Module Header */}
                <button
                  type="button"
                  onClick={() => toggleModule(mod.id)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-[var(--color-surface-warm)]/60 transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] flex items-center justify-center font-bold text-xs">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[var(--color-text)]">
                        {mod.title}
                      </h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {toPersianDigits(mod.lessons.length)} درسنامه
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Lessons in Module */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 divide-y divide-[var(--color-border)]">
                    {mod.lessons.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                        درسی در این فصل وجود ندارد.
                      </div>
                    ) : (
                      mod.lessons.map((lesson, lIdx) => (
                        <div
                          key={lesson.id}
                          className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-[var(--color-surface-warm)]/70 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center justify-center text-[10px] font-bold shrink-0">
                              {toPersianDigits(lIdx + 1)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-[var(--color-text)] truncate">
                                {lesson.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-muted)] mt-0.5">
                                <span>
                                  وضعیت:{" "}
                                  <span className="text-[var(--color-text)] font-semibold">
                                    {lesson.publicationStatus === "published"
                                      ? "منتشر شده"
                                      : "پیش‌نویس"}
                                  </span>
                                </span>
                                <span>•</span>
                                <span>
                                  {lesson.hasContent ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                      ✓ دارای متن درس
                                    </span>
                                  ) : (
                                    <span className="text-[var(--color-text-muted)]">بدون متن</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Stats Badges & View Content */}
                          <div className="flex items-center gap-2 shrink-0">
                            {lesson.flashcardCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 text-[10px] font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                                <span>{toPersianDigits(lesson.flashcardCount)} کارت</span>
                              </span>
                            )}

                            {lesson.quizCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1">
                                <HelpCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>{toPersianDigits(lesson.quizCount)} سؤال</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => setPreviewLesson(lesson)}
                              className="px-2.5 py-1 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold transition-colors"
                            >
                              مشاهده
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lesson Details Preview Modal */}
      {previewLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
              <div>
                <h3 className="font-bold text-lg text-[var(--color-text)]">{previewLesson.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  شناسه درس: {previewLesson.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  فلش‌کارت‌های مرتبط: {toPersianDigits(previewLesson.flashcardCount)}
                </span>
                <span className="px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  سؤالات تستی مرتبط: {toPersianDigits(previewLesson.quizCount)}
                </span>
                <span className="px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  وضعیت محتوا: {previewLesson.hasContent ? "تکمیل شده" : "فاقد متن"}
                </span>
              </div>

              <div className="p-4 bg-[var(--color-surface-warm)]/50 rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text)] max-h-80 overflow-y-auto">
                <p className="text-[var(--color-text-muted)]">
                  درسنامه با موفقیت در ساختار رسمی دوره مستقر شده است و تمامی ارجاعات کارت‌ها و آزمون‌ها به این شناسه نگاشت شده‌اند.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] border border-[var(--color-border)] text-xs font-bold transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
