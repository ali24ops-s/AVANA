import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import type { ExamCoverageCourse } from "@avana/domain";
import { isInternalIdentifier } from "../../lib/utils/exam-title-formatter.js";

export interface ExamHierarchyHeaderProps {
  coverage?: ExamCoverageCourse[];
  fallbackTopic?: string;
}

/**
 * Interactive Header Component displaying exact Course -> Module hierarchy.
 *
 * Requirements:
 * 1. Shows ONLY Courses and Modules from which exam questions actually originated.
 * 2. Strictly hides any Lesson IDs, Lesson titles, or "جلسه".
 * 3. Strictly hides any internal IDs or UUIDs.
 * 4. Courses are collapsed by default: [ Course Name ˅ ].
 * 5. Clicking a Course independently toggles expand/collapse showing its bulleted Modules:
 *    [ Course Name ˄ ]
 *      • Module Title 1
 *      • Module Title 2
 * 6. Supports multiple Courses with independent expand/collapse.
 * 7. Safe fallback when coverage is empty or undefined without leaking UUIDs.
 */
export function ExamHierarchyHeader({
  coverage,
  fallbackTopic,
}: ExamHierarchyHeaderProps) {
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setExpandedCourseIds(new Set());
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCourse = (courseId: string) => {
    setExpandedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  // Filter valid courses: only courses with at least 1 question
  const validCourses = (coverage || []).filter((c) => {
    if (!c || c.questionCount <= 0) return false;
    const title = c.title?.trim();
    if (!title || isInternalIdentifier(title)) return false;
    return true;
  });

  // Safe fallback if coverage is empty or has no valid courses
  if (validCourses.length === 0) {
    const rawFallback = fallbackTopic?.trim();
    const cleanFallback =
      rawFallback && !isInternalIdentifier(rawFallback) && !rawFallback.includes("جلسه")
        ? rawFallback
        : "آزمون جامع";

    return (
      <nav aria-label="مسیر آزمون" className="hidden md:flex items-center gap-2 text-[var(--color-text-muted)] font-body-md text-sm">
        <span className="material-symbols-outlined text-[18px]">menu_book</span>
        <span className="text-[var(--color-text-muted)]">آزمون</span>
        <span className="text-[var(--color-text-muted)] text-xs">←</span>
        <span className="text-[var(--color-text)] font-medium">{cleanFallback}</span>
      </nav>
    );
  }

  return (
    <nav
      ref={containerRef}
      aria-label="مسیر آزمون"
      className="hidden md:flex items-center gap-2.5 flex-wrap text-sm"
    >
      <div className="flex items-center gap-1.5 text-[var(--color-text-muted)] font-medium">
        <span className="material-symbols-outlined text-[18px] text-[var(--color-primary)]">menu_book</span>
        <span>آزمون</span>
        <span className="text-[var(--color-text-muted)] text-xs">←</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {validCourses.map((course) => {
          const isExpanded = expandedCourseIds.has(course.id);
          const validModules = (course.modules || []).filter((m) => {
            if (!m || m.questionCount <= 0) return false;
            const mTitle = m.title?.trim();
            if (!mTitle || isInternalIdentifier(mTitle) || mTitle.includes("جلسه")) return false;
            return true;
          });

          return (
            <div key={course.id} className="relative inline-block text-right">
              {/* Course Accordion Toggle Button */}
              <button
                type="button"
                onClick={() => toggleCourse(course.id)}
                aria-expanded={isExpanded}
                aria-label={`نمایش فصل‌های دوره ${course.title}`}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs md:text-sm font-medium transition-all shadow-xs ${
                  isExpanded
                    ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary-dark)]"
                    : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border-[var(--color-border)] hover:border-[var(--color-primary)]/40 text-[var(--color-text)]"
                }`}
              >
                <span className="font-semibold">{course.title}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isExpanded ? "text-[var(--color-primary)] rotate-180" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]"
                  }`}
                  aria-hidden="true"
                />
              </button>

              {/* Expanded Modules Dropdown Popover */}
              {isExpanded && (
                <div
                  role="region"
                  aria-label={`فصل‌های دوره ${course.title}`}
                  className="absolute top-full right-0 mt-2 z-50 min-w-[220px] max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3.5 shadow-elevated space-y-2"
                >
                  <div className="text-[11px] font-semibold text-[var(--color-text-muted)] border-b border-[var(--color-border)] pb-2 mb-2 flex items-center justify-between">
                    <span>فصل‌های شامل سؤال:</span>
                    <span className="text-[var(--color-primary)] font-mono text-[10px]">
                      {validModules.length} فصل
                    </span>
                  </div>

                  {validModules.length > 0 ? (
                    <ul className="space-y-2 text-right">
                      {validModules.map((module) => (
                        <li
                          key={module.id}
                          className="text-xs text-[var(--color-text)] flex items-start gap-2 pr-1"
                        >
                          <span className="text-[var(--color-primary)] font-bold leading-none mt-1">•</span>
                          <span className="font-medium leading-relaxed">{module.title}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)]">سرفصل پیش‌فرض</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
