import React, { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Check,
  Minus,
  FolderX,
  BookOpen,
  FolderTree,
  FileText,
} from "lucide-react";

export type TaxonomyLesson = {
  id: string;
  title: string;
  itemCount?: number;
  itemBadges?: React.ReactNode;
};

export type TaxonomyModule = {
  id: string;
  title: string;
  itemCount?: number;
  itemBadges?: React.ReactNode;
  lessons?: TaxonomyLesson[];
};

export type TaxonomyCourse = {
  id: string;
  title: string;
  itemCount?: number;
  modules: TaxonomyModule[];
};

export interface TaxonomySelectorProps {
  courses: TaxonomyCourse[];
  selectedCourseIds: Set<string>;
  selectedModuleIds: Set<string>;
  selectedLessonIds?: Set<string>;
  onSelectionChange: (selection: {
    courseIds: Set<string>;
    moduleIds: Set<string>;
    lessonIds?: Set<string>;
  }) => void;
  emptyMessage?: string;
  itemLabelSingular?: string;
}

export function TaxonomySelector({
  courses,
  selectedCourseIds,
  selectedModuleIds,
  selectedLessonIds = new Set(),
  onSelectionChange,
  emptyMessage = "برای این بخش هنوز سرفصل یا محتوایی ثبت نشده است.",
  itemLabelSingular = "کارت",
}: TaxonomySelectorProps) {
  // Accordion expansion state for Course and Module nodes
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleExpandCourse = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const toggleExpandModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  // Helper to compute module selection state
  const getModuleState = (module: TaxonomyModule) => {
    if (!module.lessons || module.lessons.length === 0) {
      return selectedModuleIds.has(module.id) ? "checked" : "unchecked";
    }
    let count = 0;
    for (const les of module.lessons) {
      if (selectedLessonIds.has(les.id)) count++;
    }
    if (count === module.lessons.length) return "checked";
    if (count === 0) return "unchecked";
    return "indeterminate";
  };

  // Helper to compute course selection state
  const getCourseState = (course: TaxonomyCourse) => {
    if (course.modules.length === 0) {
      return selectedCourseIds.has(course.id) ? "checked" : "unchecked";
    }
    let checkedCount = 0;
    let indetCount = 0;
    for (const mod of course.modules) {
      const st = getModuleState(mod);
      if (st === "checked") checkedCount++;
      else if (st === "indeterminate" || selectedModuleIds.has(mod.id)) indetCount++;
    }
    if (checkedCount === course.modules.length) return "checked";
    if (checkedCount === 0 && indetCount === 0) return "unchecked";
    return "indeterminate";
  };

  // Toggle selection for an entire Course
  const toggleCourseSelect = (course: TaxonomyCourse) => {
    const currentState = getCourseState(course);
    const shouldSelect = currentState !== "checked";

    const nextCourses = new Set(selectedCourseIds);
    const nextModules = new Set(selectedModuleIds);
    const nextLessons = new Set(selectedLessonIds);

    if (shouldSelect) {
      nextCourses.add(course.id);
      for (const m of course.modules) {
        nextModules.add(m.id);
        if (m.lessons) {
          for (const l of m.lessons) nextLessons.add(l.id);
        }
      }
    } else {
      nextCourses.delete(course.id);
      for (const m of course.modules) {
        nextModules.delete(m.id);
        if (m.lessons) {
          for (const l of m.lessons) nextLessons.delete(l.id);
        }
      }
    }

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
      lessonIds: nextLessons,
    });
  };

  // Toggle selection for a single Module
  const toggleModuleSelect = (course: TaxonomyCourse, module: TaxonomyModule) => {
    const nextCourses = new Set(selectedCourseIds);
    const nextModules = new Set(selectedModuleIds);
    const nextLessons = new Set(selectedLessonIds);

    const mState = getModuleState(module);
    const shouldSelect = mState !== "checked";

    if (shouldSelect) {
      nextModules.add(module.id);
      if (module.lessons) {
        for (const l of module.lessons) nextLessons.add(l.id);
      }
    } else {
      nextModules.delete(module.id);
      if (module.lessons) {
        for (const l of module.lessons) nextLessons.delete(l.id);
      }
    }

    // Check parent Course state
    const allModsChecked = course.modules.every((m) => {
      const st = m.id === module.id ? (shouldSelect ? "checked" : "unchecked") : getModuleState(m);
      return st === "checked";
    });

    if (allModsChecked && course.modules.length > 0) {
      nextCourses.add(course.id);
    } else {
      nextCourses.delete(course.id);
    }

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
      lessonIds: nextLessons,
    });
  };

  // Toggle selection for a single Lesson
  const toggleLessonSelect = (
    course: TaxonomyCourse,
    module: TaxonomyModule,
    lesson: TaxonomyLesson,
  ) => {
    const nextCourses = new Set(selectedCourseIds);
    const nextModules = new Set(selectedModuleIds);
    const nextLessons = new Set(selectedLessonIds);

    const isLessonSelected = nextLessons.has(lesson.id);
    if (isLessonSelected) {
      nextLessons.delete(lesson.id);
    } else {
      nextLessons.add(lesson.id);
    }

    // Update parent module selection
    if (module.lessons && module.lessons.length > 0) {
      const selectedCount = module.lessons.filter((l) => nextLessons.has(l.id)).length;
      if (selectedCount === module.lessons.length) {
        nextModules.add(module.id);
      } else {
        nextModules.delete(module.id);
      }
    }

    // Update parent course selection
    const allModsChecked = course.modules.every((m) => {
      if (m.lessons && m.lessons.length > 0) {
        return m.lessons.every((l) => nextLessons.has(l.id));
      }
      return nextModules.has(m.id);
    });

    if (allModsChecked && course.modules.length > 0) {
      nextCourses.add(course.id);
    } else {
      nextCourses.delete(course.id);
    }

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
      lessonIds: nextLessons,
    });
  };

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-3xl space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center">
          <FolderX className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-[var(--color-text)]">
          {emptyMessage}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
          پس از آپلود فایل آموزشی و تولید بخش‌ها، محتوا به طور خودکار در این قسمت قرار می‌گیرد.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans text-right" dir="rtl">
      {courses.map((course) => {
        const cState = getCourseState(course);
        const isExpanded = expandedCourses.has(course.id);
        const isCourseSelected = cState !== "unchecked";

        return (
          <div
            key={course.id}
            className={`rounded-2xl border transition-all overflow-hidden ${
              isCourseSelected
                ? "border-[#008080] bg-[#008080]/5 shadow-xs"
                : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            {/* Level 1: Course Row (Prominent parent group) */}
            <div
              className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                isCourseSelected
                  ? "bg-[#008080]/10 dark:bg-[#008080]/20 border-r-4 border-r-[#008080]"
                  : "bg-white/60 dark:bg-black/30 border-r-4 border-r-transparent"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleCourseSelect(course)}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    cState === "checked"
                      ? "bg-[#008080] border-[#008080] text-white"
                      : cState === "indeterminate"
                      ? "bg-[#008080]/20 border-[#008080] text-[#008080]"
                      : "border-[var(--color-border)] bg-white dark:bg-black/30"
                  }`}
                  aria-label={`انتخاب کل دوره ${course.title}`}
                >
                  {cState === "checked" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  {cState === "indeterminate" && <Minus className="w-3.5 h-3.5 stroke-[3]" />}
                </button>

                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isCourseSelected
                      ? "bg-[#008080] text-white shadow-xs"
                      : "bg-black/5 dark:bg-white/10 text-[var(--color-text-muted)]"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                </div>

                <div
                  className="truncate cursor-pointer select-none"
                  onClick={() => toggleExpandCourse(course.id)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide transition-colors ${
                        isCourseSelected
                          ? "bg-[#008080]/20 text-[#008080]"
                          : "bg-black/5 dark:bg-white/10 text-[var(--color-text-muted)]"
                      }`}
                    >
                      دوره آموزشی
                    </span>
                    <h3 className="text-base font-extrabold text-[var(--color-text)] truncate">
                      {course.title}
                    </h3>
                  </div>
                  <span className="text-[11px] text-[var(--color-text-muted)] mt-0.5 block">
                    دوره آموزشی ({course.modules.length} بخش)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {course.itemCount !== undefined && course.itemCount > 0 && (
                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-colors ${
                      isCourseSelected
                        ? "bg-[#008080] text-white shadow-xs"
                        : "bg-white/80 dark:bg-black/40 text-[var(--color-text-muted)] border border-[var(--color-border)]"
                    }`}
                  >
                    {course.itemCount} {itemLabelSingular}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleExpandCourse(course.id)}
                  aria-label={`نمایش سرفصل‌های ${course.title}`}
                  className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Level 2: Modules List */}
            {isExpanded && course.modules.length > 0 && (
              <div className="p-3 border-t border-[var(--color-border)] space-y-2 bg-[var(--color-surface)]">
                {course.modules.map((module) => {
                  const mState = getModuleState(module);
                  const isMExpanded = expandedModules.has(module.id);
                  const hasLessons = module.lessons && module.lessons.length > 0;

                  return (
                    <div key={module.id} className="space-y-1">
                      {/* Module Row */}
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all ${
                          mState !== "unchecked"
                            ? "bg-[#008080]/15 border-[#008080] font-bold text-[#008080] shadow-xs"
                            : "bg-white/60 dark:bg-black/30 border-[var(--color-border)]/80 text-[var(--color-text)] hover:border-[#008080]/50"
                        }`}
                      >
                        <div
                          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                          onClick={() => toggleModuleSelect(course, module)}
                        >
                          <div
                            className={`w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              mState === "checked"
                                ? "bg-[#008080] border-[#008080] text-white"
                                : mState === "indeterminate"
                                ? "bg-[#008080]/20 border-[#008080] text-[#008080]"
                                : "border-[var(--color-border)] bg-white dark:bg-black/30"
                            }`}
                          >
                            {mState === "checked" && <Check className="w-3 h-3 stroke-[3]" />}
                            {mState === "indeterminate" && <Minus className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="w-6 h-6 rounded-lg bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
                            <FolderTree className="w-3.5 h-3.5" />
                          </div>

                          <span className="truncate">{module.title}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {module.itemBadges}
                          {module.itemCount !== undefined && (
                            <span className="px-2.5 py-1 rounded-md bg-white/80 dark:bg-black/40 text-[11px] font-bold text-[var(--color-text-muted)] border border-[var(--color-border)]">
                              {module.itemCount} {itemLabelSingular}
                            </span>
                          )}

                          {hasLessons && (
                            <button
                              type="button"
                              onClick={() => toggleExpandModule(module.id)}
                              aria-label={`نمایش جلسات ${module.title}`}
                              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
                            >
                              {isMExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronLeft className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Level 3: Lessons List */}
                      {isMExpanded && hasLessons && (
                        <div className="mr-6 space-y-1.5 border-r-2 border-[#008080]/30 pr-3 py-1">
                          {module.lessons!.map((lesson) => {
                            const isLSelected = selectedLessonIds.has(lesson.id);

                            return (
                              <div
                                key={lesson.id}
                                onClick={() => toggleLessonSelect(course, module, lesson)}
                                className={`cursor-pointer p-2.5 rounded-lg border text-[11px] flex items-center justify-between gap-3 transition-all ${
                                  isLSelected
                                    ? "bg-[#008080]/20 border-[#008080] font-bold text-[#008080]"
                                    : "bg-white/40 dark:bg-black/20 border-[var(--color-border)]/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[#008080]/40"
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                      isLSelected
                                        ? "bg-[#008080] border-[#008080] text-white"
                                        : "border-[var(--color-border)] bg-white dark:bg-black/30"
                                    }`}
                                  >
                                    {isLSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                  </div>

                                  <div className="w-5 h-5 rounded-md bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
                                    <FileText className="w-3 h-3" />
                                  </div>

                                  <span className="truncate">{lesson.title}</span>
                                </div>

                                {lesson.itemCount !== undefined && (
                                  <span className="px-2 py-0.5 rounded bg-white/70 dark:bg-black/30 text-[10px] font-bold text-[var(--color-text-muted)] border border-[var(--color-border)]">
                                    {lesson.itemCount} {itemLabelSingular}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
