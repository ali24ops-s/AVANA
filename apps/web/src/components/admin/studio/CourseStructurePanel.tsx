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
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-400" />
            <span>ساختار و درخت محتوای دوره (Course Builder)</span>
          </h3>
          <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
            {modules.length} فصل مصوب
          </span>
        </div>
        <p className="text-xs text-slate-400">
          نمایش ماژول‌ها، درسنامه‌ها و اقلام آموزشی تاییدشده در پایگاه‌داده رسمی. محتوای هوش مصنوعی پس از تایید نهایی در این بخش ثبت می‌شود.
        </p>
      </div>

      {/* Loading state */}
      {hierarchyQuery.isLoading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/40 rounded-3xl border border-slate-800">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
          <p className="text-xs">در حال بارگذاری ساختار دوره...</p>
        </div>
      )}

      {/* Error state */}
      {hierarchyQuery.isError && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{hierarchyQuery.error?.message || "خطا در دریافت ساختار دوره"}</span>
        </div>
      )}

      {/* Empty State */}
      {!hierarchyQuery.isLoading && modules.length === 0 && (
        <div className="bg-slate-900/40 rounded-3xl border border-slate-800/80 p-10 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-300">
            هنوز فصلی برای این دوره ثبت نهایی نشده است
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
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
                className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden transition-all shadow-md"
              >
                {/* Module Header */}
                <button
                  type="button"
                  onClick={() => toggleModule(mod.id)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-teal-950/50 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold text-xs">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">
                        {mod.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {mod.lessons.length} درسنامه
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Lessons in Module */}
                {isExpanded && (
                  <div className="border-t border-slate-800/80 bg-slate-950/40 divide-y divide-slate-800/50">
                    {mod.lessons.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        درسی در این فصل وجود ندارد.
                      </div>
                    ) : (
                      mod.lessons.map((lesson, lIdx) => (
                        <div
                          key={lesson.id}
                          className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {lIdx + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-200 truncate">
                                {lesson.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span>
                                  وضعیت:{" "}
                                  <span className="text-slate-300 font-semibold">
                                    {lesson.publicationStatus === "published"
                                      ? "منتشر شده"
                                      : "پیش‌نویس"}
                                  </span>
                                </span>
                                <span>•</span>
                                <span>
                                  {lesson.hasContent ? (
                                    <span className="text-emerald-400 font-bold">
                                      ✓ دارای متن درس
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">بدون متن</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Stats Badges & View Content */}
                          <div className="flex items-center gap-2 shrink-0">
                            {lesson.flashcardCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-purple-950/40 border border-purple-500/30 text-purple-300 text-[10px] font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-purple-400" />
                                <span>{lesson.flashcardCount} کارت</span>
                              </span>
                            )}

                            {lesson.quizCount > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                                <HelpCircle className="w-3 h-3 text-amber-400" />
                                <span>{lesson.quizCount} سؤال</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => setPreviewLesson(lesson)}
                              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-lg text-white">{previewLesson.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  شناسه درس: {previewLesson.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  فلش‌کارت‌های مرتبط: {previewLesson.flashcardCount}
                </span>
                <span className="px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  سؤالات تستی مرتبط: {previewLesson.quizCount}
                </span>
                <span className="px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  وضعیت محتوا: {previewLesson.hasContent ? "تکمیل شده" : "فاقد متن"}
                </span>
              </div>

              <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 text-xs text-slate-300 max-h-80 overflow-y-auto">
                <p className="text-slate-400">
                  درسنامه با موفقیت در ساختار رسمی دوره مستقر شده است و تمامی ارجاعات کارت‌ها و آزمون‌ها به این شناسه نگاشت شده‌اند.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
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
