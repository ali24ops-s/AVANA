import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Check,
  Minus,
  FolderX,
  BookOpen,
  FolderTree,
  FileText,
  Search,
  X,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";

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
  sortOrder?: number;
};

export type TaxonomyCourse = {
  id: string;
  title: string;
  itemCount?: number;
  hasAccess?: boolean;
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
  hideLessons?: boolean;
  enableCourseSearch?: boolean;
  courseSearchPlaceholder?: string;
  className?: string;
  layout?: "accordion" | "two-panel";
  activeCourseId?: string | null;
  onActiveCourseChange?: (courseId: string | null) => void;
}

export function TaxonomySelector({
  courses,
  selectedCourseIds,
  selectedModuleIds,
  selectedLessonIds = new Set(),
  onSelectionChange,
  emptyMessage = "برای این بخش هنوز سرفصل یا محتوایی ثبت نشده است.",
  itemLabelSingular = "کارت",
  hideLessons = false,
  enableCourseSearch = false,
  courseSearchPlaceholder = "جست‌وجوی دوره...",
  className = "",
  layout = "accordion",
  activeCourseId: propActiveCourseId,
  onActiveCourseChange,
}: TaxonomySelectorProps) {
  // Search query state
  const [searchQuery, setSearchQuery] = useState("");

  // Accordion expansion state for Course and Module nodes
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    () => new Set(),
  );

  // Two-panel layout active course state
  const [internalActiveCourseId, setInternalActiveCourseId] = useState<string | null>(null);

  const activeCourseId = propActiveCourseId !== undefined ? propActiveCourseId : internalActiveCourseId;
  const setActiveCourseId = (id: string | null) => {
    if (onActiveCourseChange) {
      onActiveCourseChange(id);
    }
    setInternalActiveCourseId(id);
  };

  const activeCourse = useMemo(() => {
    if (!activeCourseId) return null;
    return courses.find((c) => c.id === activeCourseId) ?? null;
  }, [courses, activeCourseId]);

  const selectAllActiveCourseModules = () => {
    if (!activeCourse) return;
    const nextModules = new Set(selectedModuleIds);
    const nextCourses = new Set(selectedCourseIds);
    const nextLessons = new Set(selectedLessonIds);

    for (const m of activeCourse.modules) {
      nextModules.add(m.id);
      if (m.lessons) {
        for (const l of m.lessons) nextLessons.add(l.id);
      }
    }
    nextCourses.add(activeCourse.id);

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
      lessonIds: nextLessons,
    });
  };

  const deselectAllActiveCourseModules = () => {
    if (!activeCourse) return;
    const nextModules = new Set(selectedModuleIds);
    const nextCourses = new Set(selectedCourseIds);
    const nextLessons = new Set(selectedLessonIds);

    for (const m of activeCourse.modules) {
      nextModules.delete(m.id);
      if (m.lessons) {
        for (const l of m.lessons) nextLessons.delete(l.id);
      }
    }
    nextCourses.delete(activeCourse.id);

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
      lessonIds: nextLessons,
    });
  };

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
    if (hideLessons || !module.lessons || module.lessons.length === 0) {
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
      <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-card space-y-3">
        <div className="w-12 h-12 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
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

  // Filter courses by search query without changing their relative order
  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, searchQuery]);

  // Two-panel layout branch
  if (layout === "two-panel") {
    const activeCourseSelectedCount = activeCourse
      ? activeCourse.modules.filter((m) => selectedModuleIds.has(m.id)).length
      : 0;

    return (
      <div className={`font-sans text-start ${className}`} dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-12 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs overflow-hidden">
          {/* Panel 1 (Right in RTL): Courses List */}
          <div className="md:col-span-5 lg:col-span-4 flex flex-col border-b md:border-b-0 md:border-inline-end border-[var(--color-border)] bg-[var(--color-surface)] md:h-[480px] min-h-0">
            {/* Course Search */}
            {enableCourseSearch && (
              <div className="shrink-0 p-3 sm:p-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={courseSearchPlaceholder}
                    aria-label="جست‌وجوی دوره"
                    className="w-full ps-9 pe-8 py-2 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all"
                  />
                  <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="پاک کردن جست‌وجو"
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-sm cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Courses Scroll Area */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-2 sm:p-2.5 space-y-1.5 max-h-[260px] md:max-h-none">
              {filteredCourses.length === 0 && searchQuery ? (
                <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">
                  دوره‌ای با عبارت «{searchQuery}» یافت نشد.
                </div>
              ) : (
                filteredCourses.map((course) => {
                  const isActive = activeCourseId === course.id;
                  const cState = getCourseState(course);
                  const selectedCount = course.modules.filter((m) =>
                    selectedModuleIds.has(m.id),
                  ).length;

                  return (
                    <div
                      key={course.id}
                      onClick={() => setActiveCourseId(course.id)}
                      className={`group p-3 rounded-xl border text-sm transition-all flex items-center justify-between gap-2.5 cursor-pointer select-none ${
                        isActive
                          ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)] shadow-xs"
                          : "bg-[var(--color-surface)] border-[var(--color-border)]/70 text-[var(--color-text)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-warm)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {/* Course Select Checkbox */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCourseSelect(course);
                          }}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                            cState === "checked"
                              ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                              : cState === "indeterminate"
                              ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)]"
                          }`}
                          aria-label={`انتخاب کل دوره ${course.title}`}
                        >
                          {cState === "checked" && (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                          {cState === "indeterminate" && (
                            <Minus className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                        </button>

                        {/* Course Icon */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isActive
                              ? "bg-[var(--color-primary)] text-white shadow-xs"
                              : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]"
                          }`}
                        >
                          <BookOpen className="w-4 h-4" />
                        </div>

                        {/* Title and stats */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-xs sm:text-sm text-[var(--color-text)] truncate leading-snug">
                            {course.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                            <span>{toPersianDigits(course.modules.length)} فصل</span>
                            {course.itemCount !== undefined && course.itemCount > 0 && (
                              <>
                                <span>•</span>
                                <span>
                                  {toPersianDigits(course.itemCount)} {itemLabelSingular}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Left Badge and Chevron */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {selectedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)] border border-[var(--color-primary)]/30 whitespace-nowrap">
                            {toPersianDigits(selectedCount)} از {toPersianDigits(course.modules.length)}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeCourseId === course.id) {
                              setActiveCourseId(null);
                            } else {
                              setActiveCourseId(course.id);
                            }
                          }}
                          aria-label={`سرفصل‌های ${course.title}`}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isActive
                              ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10"
                              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                          }`}
                        >
                          <ChevronLeft
                            className={`w-4 h-4 transition-transform ${
                              isActive ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Panel 2 (Left in RTL): Chapters of Active Course */}
          <div className="md:col-span-7 lg:col-span-8 flex flex-col bg-[var(--color-surface)] md:h-[480px] min-h-0">
            {/* Chapters Header */}
            <div className="shrink-0 p-3.5 sm:p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between gap-3 flex-wrap min-h-[57px]">
              {activeCourse ? (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="p-1.5 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)] shrink-0">
                      <FolderTree className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)] truncate">
                        سرفصل‌های {activeCourse.title}
                      </h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {toPersianDigits(activeCourseSelectedCount)} از{" "}
                        {toPersianDigits(activeCourse.modules.length)} فصل انتخاب شده
                      </p>
                    </div>
                  </div>

                  {activeCourse.modules.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={selectAllActiveCourseModules}
                        disabled={activeCourseSelectedCount === activeCourse.modules.length}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        انتخاب همه
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllActiveCourseModules}
                        disabled={activeCourseSelectedCount === 0}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--avana-error)] hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        لغو انتخاب
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs font-semibold">
                  <FolderTree className="w-4 h-4" />
                  <span>سرفصل‌های دوره</span>
                </div>
              )}
            </div>

            {/* Chapters Scroll Area */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-2 max-h-[320px] md:max-h-none">
              {!activeCourse ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--color-text-muted)] space-y-2 min-h-[220px]">
                  <FolderTree className="w-8 h-8 opacity-40 mb-1" />
                  <p className="text-xs font-semibold">
                    یک دوره را از لیست سمت راست انتخاب کنید تا سرفصل‌های آن نمایش داده شود.
                  </p>
                </div>
              ) : activeCourse.modules.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--color-text-muted)] space-y-2 min-h-[220px]">
                  <FolderX className="w-8 h-8 opacity-40 mb-1" />
                  <p className="text-xs font-semibold">سرفصلی برای این دوره ثبت نشده است.</p>
                </div>
              ) : (
                activeCourse.modules.map((module) => {
                  const isSelected = selectedModuleIds.has(module.id);

                  return (
                    <div
                      key={module.id}
                      onClick={() => toggleModuleSelect(activeCourse, module)}
                      className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 transition-all cursor-pointer select-none ${
                        isSelected
                          ? "bg-[var(--color-primary-soft)]/70 border-[var(--color-primary)] font-bold text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)] shadow-xs"
                          : "bg-[var(--color-surface)] border-[var(--color-border)]/80 text-[var(--color-text)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-warm)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div
                          className={`w-4.5 h-4.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected
                              ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                              : "border-[var(--color-border)] bg-[var(--color-surface)]"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="flex-1 min-w-0 leading-relaxed break-words">
                          {module.title}
                        </span>
                      </div>

                      {module.itemCount !== undefined && (
                        <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-[var(--color-surface)] text-[11px] font-bold text-[var(--color-text-muted)] border border-[var(--color-border)] shrink-0 whitespace-nowrap">
                          {toPersianDigits(module.itemCount)} {itemLabelSingular}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 font-sans text-start ${className}`} dir="rtl">
      {/* Course Search Bar */}
      {enableCourseSearch && courses.length > 0 && (
        <div className="relative mb-2 sticky top-0 z-10 bg-[var(--color-surface)] pb-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={courseSearchPlaceholder}
            aria-label="جست‌وجوی دوره"
            className="w-full ps-10 pe-9 py-2 rounded-button bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] transition-all"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="پاک کردن جست‌وجو"
              className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-sm cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Empty Search Feedback */}
      {filteredCourses.length === 0 && searchQuery && (
        <div className="p-6 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-card">
          دوره‌ای با عبارت «{searchQuery}» یافت نشد.
        </div>
      )}

      {filteredCourses.map((course) => {
        const cState = getCourseState(course);
        const isExpanded = expandedCourses.has(course.id);
        const isCourseSelected = cState !== "unchecked";

        return (
          <div
            key={course.id}
            className={`rounded-card border transition-all overflow-hidden ${
              isCourseSelected
                ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/40 shadow-xs"
                : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            {/* Level 1: Course Row (Prominent parent group) */}
            <div
              className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition-colors ${
                isCourseSelected
                  ? "bg-[var(--color-primary-soft)] dark:bg-[var(--color-primary)]/20 border-s-4 border-s-[var(--color-primary)]"
                  : "bg-[var(--color-surface)]/80 dark:bg-black/30 border-s-4 border-s-transparent"
              }`}
            >
              {/* Main Content Area: Checkbox, Book Icon (sm+), and Title */}
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleCourseSelect(course)}
                  className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 transition-colors cursor-pointer ${
                    cState === "checked"
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : cState === "indeterminate"
                      ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                  aria-label={`انتخاب کل دوره ${course.title}`}
                >
                  {cState === "checked" && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  {cState === "indeterminate" && <Minus className="w-3.5 h-3.5 stroke-[3]" />}
                </button>

                {/* Desktop Book Icon */}
                <div
                  className={`hidden sm:flex w-8 h-8 rounded-button items-center justify-center shrink-0 transition-colors ${
                    isCourseSelected
                      ? "bg-[var(--color-primary)] text-white shadow-xs"
                      : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                </div>

                {/* Title Container */}
                <div
                  className="flex-1 min-w-0 cursor-pointer select-none"
                  onClick={() => toggleExpandCourse(course.id)}
                >
                  {/* Desktop Badges (hidden on mobile, inline on desktop) */}
                  <div className="hidden sm:inline-flex items-center gap-2 me-2 align-middle">
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-extrabold tracking-wide transition-colors ${
                        isCourseSelected
                          ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)]"
                          : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      دوره آموزشی
                    </span>
                    {course.hasAccess !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border ${
                          course.hasAccess
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {course.hasAccess ? "در دسترس" : "آزمون سفارشی"}
                      </span>
                    )}
                  </div>

                  {/* Single Course Title Element */}
                  <h3 className="text-sm sm:text-base font-extrabold text-[var(--color-text)] leading-snug sm:leading-normal sm:truncate inline-block align-middle break-words sm:break-normal">
                    {course.title}
                  </h3>

                  <span className="hidden sm:block text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    دوره آموزشی ({toPersianDigits(course.modules.length)} بخش)
                  </span>
                </div>
              </div>

              {/* Bottom Row on Mobile / Right Row on Desktop */}
              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border)]/50">
                {/* Mobile Badges Row */}
                <div className="flex sm:hidden items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-sm text-[10px] font-extrabold tracking-wide transition-colors ${
                      isCourseSelected
                        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)]"
                        : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    دوره آموزشی
                  </span>
                  {course.hasAccess !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border ${
                        course.hasAccess
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {course.hasAccess ? "در دسترس" : "آزمون سفارشی"}
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    ({toPersianDigits(course.modules.length)} بخش)
                  </span>
                </div>

                {/* Question Count & Chevron Expand Button */}
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  {course.itemCount !== undefined && course.itemCount > 0 && (
                    <span
                      className={`px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-button text-[11px] sm:text-xs font-extrabold whitespace-nowrap transition-colors ${
                        isCourseSelected
                          ? "bg-[var(--color-primary)] text-white shadow-xs"
                          : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                      }`}
                    >
                      {toPersianDigits(course.itemCount)} {itemLabelSingular}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleExpandCourse(course.id)}
                    aria-label={`نمایش سرفصل‌های ${course.title}`}
                    className="p-1.5 sm:p-2 rounded-button text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors min-h-[32px] sm:min-h-[36px] min-w-[32px] sm:min-w-[36px] flex items-center justify-center cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronLeft className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Level 2: Modules List */}
            {isExpanded && course.modules.length > 0 && (
              <div className="p-3 border-t border-[var(--color-border)] space-y-2 bg-[var(--color-surface)] max-h-[240px] sm:max-h-[280px] overflow-y-auto pe-1 overscroll-contain">
                {course.modules.map((module) => {
                  const mState = getModuleState(module);
                  const isMExpanded = expandedModules.has(module.id);
                  const hasLessons = !hideLessons && Boolean(module.lessons && module.lessons.length > 0);

                  return (
                    <div key={module.id} className="space-y-1">
                      {/* Module Row */}
                      <div
                        className={`p-2.5 sm:p-3 rounded-button border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 transition-all ${
                          mState !== "unchecked"
                            ? "bg-[var(--color-primary-soft)]/60 border-[var(--color-primary)] font-bold text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)] shadow-xs"
                            : "bg-[var(--color-surface)] border-[var(--color-border)]/80 text-[var(--color-text)] hover:border-[var(--color-primary)]/50"
                        }`}
                      >
                        <div
                          className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                          onClick={() => toggleModuleSelect(course, module)}
                        >
                          <div
                            className={`w-4.5 h-4.5 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 transition-colors ${
                              mState === "checked"
                                ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                                : mState === "indeterminate"
                                ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary)]"
                                : "border-[var(--color-border)] bg-[var(--color-surface)]"
                            }`}
                          >
                            {mState === "checked" && <Check className="w-3 h-3 stroke-[3]" />}
                            {mState === "indeterminate" && <Minus className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="w-6 h-6 rounded-sm bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                            <FolderTree className="w-3.5 h-3.5" />
                          </div>

                          <span className="flex-1 min-w-0 text-xs leading-relaxed sm:leading-snug break-words">
                            {module.title}
                          </span>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 shrink-0 ps-7 sm:ps-0">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            {module.itemBadges}
                            {module.itemCount !== undefined && (
                              <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-sm bg-[var(--color-surface)] text-[10px] sm:text-[11px] font-bold text-[var(--color-text-muted)] border border-[var(--color-border)] whitespace-nowrap">
                                {toPersianDigits(module.itemCount)} {itemLabelSingular}
                              </span>
                            )}
                          </div>

                          {hasLessons && (
                            <button
                              type="button"
                              onClick={() => toggleExpandModule(module.id)}
                              aria-label={`نمایش جلسات ${module.title}`}
                              className="p-1 rounded-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer shrink-0"
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
                        <div className="ms-4 sm:ms-6 space-y-1.5 border-s-2 border-s-[var(--color-primary)]/30 ps-2.5 sm:ps-3 py-1">
                          {module.lessons!.map((lesson) => {
                            const isLSelected = selectedLessonIds.has(lesson.id);

                            return (
                              <div
                                key={lesson.id}
                                onClick={() => toggleLessonSelect(course, module, lesson)}
                                className={`cursor-pointer p-2 sm:p-2.5 rounded-button border text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 transition-all ${
                                  isLSelected
                                    ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] font-bold text-[var(--color-primary-dark)] dark:text-[var(--color-primary-light)]"
                                    : "bg-[var(--color-surface)]/80 border-[var(--color-border)]/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40"
                                }`}
                              >
                                <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 transition-colors ${
                                      isLSelected
                                        ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                                        : "border-[var(--color-border)] bg-[var(--color-surface)]"
                                    }`}
                                  >
                                    {isLSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                  </div>

                                  <div className="w-5 h-5 rounded-sm bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                                    <FileText className="w-3 h-3" />
                                  </div>

                                  <span className="flex-1 min-w-0 text-[11px] leading-relaxed sm:leading-snug break-words">
                                    {lesson.title}
                                  </span>
                                </div>

                                {lesson.itemCount !== undefined && (
                                  <div className="ps-6 sm:ps-0 flex items-center">
                                    <span className="px-2 py-0.5 rounded-sm bg-[var(--color-surface)] text-[10px] font-bold text-[var(--color-text-muted)] border border-[var(--color-border)] shrink-0 whitespace-nowrap">
                                      {toPersianDigits(lesson.itemCount)} {itemLabelSingular}
                                    </span>
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
            )}
          </div>
        );
      })}
    </div>
  );
}
