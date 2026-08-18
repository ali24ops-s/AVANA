import React, { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Check,
  Minus,
  FolderX,
  BookOpen,
  FolderTree,
} from "lucide-react";

export type TaxonomyModule = {
  id: string;
  title: string;
  itemCount?: number;
  itemBadges?: React.ReactNode;
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
  onSelectionChange: (selection: {
    courseIds: Set<string>;
    moduleIds: Set<string>;
  }) => void;
  emptyMessage?: string;
  itemLabelSingular?: string;
}

export function TaxonomySelector({
  courses,
  selectedCourseIds,
  selectedModuleIds,
  onSelectionChange,
  emptyMessage = "برای این بخش هنوز سرفصل یا محتوایی ثبت نشده است.",
  itemLabelSingular = "کارت",
}: TaxonomySelectorProps) {
  // Accordion expansion state for Course nodes
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
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

  // Helper to compute course selection state
  const getCourseState = (course: TaxonomyCourse) => {
    if (course.modules.length === 0) {
      return selectedCourseIds.has(course.id) ? "checked" : "unchecked";
    }
    let count = 0;
    for (const mod of course.modules) {
      if (selectedModuleIds.has(mod.id)) count++;
    }
    if (count === course.modules.length) return "checked";
    if (count === 0) return "unchecked";
    return "indeterminate";
  };

  // Toggle selection for an entire Course
  const toggleCourseSelect = (course: TaxonomyCourse) => {
    const currentState = getCourseState(course);
    const shouldSelect = currentState !== "checked";

    const nextCourses = new Set(selectedCourseIds);
    const nextModules = new Set(selectedModuleIds);

    if (shouldSelect) {
      nextCourses.add(course.id);
      for (const m of course.modules) {
        nextModules.add(m.id);
      }
    } else {
      nextCourses.delete(course.id);
      for (const m of course.modules) {
        nextModules.delete(m.id);
      }
    }

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
    });
  };

  // Toggle selection for a single Module
  const toggleModuleSelect = (course: TaxonomyCourse, module: TaxonomyModule) => {
    const nextCourses = new Set(selectedCourseIds);
    const nextModules = new Set(selectedModuleIds);

    const isModuleSelected = nextModules.has(module.id);
    if (isModuleSelected) {
      nextModules.delete(module.id);
    } else {
      nextModules.add(module.id);
    }

    // Check parent Course state based on updated nextModules
    const selectedModsCount = course.modules.filter((m) => nextModules.has(m.id)).length;
    if (selectedModsCount === course.modules.length && course.modules.length > 0) {
      nextCourses.add(course.id);
    } else {
      nextCourses.delete(course.id);
    }

    onSelectionChange({
      courseIds: nextCourses,
      moduleIds: nextModules,
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

        return (
          <div
            key={course.id}
            className={`rounded-2xl border transition-all overflow-hidden ${
              cState !== "unchecked"
                ? "border-[#008080] bg-[#008080]/5 shadow-xs"
                : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            {/* Level 1: Course Row */}
            <div className="p-4 flex items-center justify-between gap-3 bg-[var(--color-surface-warm)]/50">
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

                <div className="w-8 h-8 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>

                <div
                  className="truncate cursor-pointer select-none"
                  onClick={() => toggleExpandCourse(course.id)}
                >
                  <h3 className="text-sm font-extrabold text-[var(--color-text)] truncate">
                    {course.title}
                  </h3>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    دوره آموزشی ({course.modules.length} بخش)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {course.itemCount !== undefined && course.itemCount > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#008080]/10 text-[#008080] text-[11px] font-bold">
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
                  const isMSelected = selectedModuleIds.has(module.id);

                  return (
                    <div
                      key={module.id}
                      onClick={() => toggleModuleSelect(course, module)}
                      className={`cursor-pointer p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all ${
                        isMSelected
                          ? "bg-[#008080]/15 border-[#008080] font-bold text-[#008080] shadow-xs"
                          : "bg-white/60 dark:bg-black/30 border-[var(--color-border)]/80 text-[var(--color-text)] hover:border-[#008080]/50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div
                          className={`w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isMSelected
                              ? "bg-[#008080] border-[#008080] text-white"
                              : "border-[var(--color-border)] bg-white dark:bg-black/30"
                          }`}
                        >
                          {isMSelected && <Check className="w-3 h-3 stroke-[3]" />}
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
                      </div>
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
