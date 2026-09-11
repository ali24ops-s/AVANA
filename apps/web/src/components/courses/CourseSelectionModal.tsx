/**
 * CourseSelectionModal Component.
 *
 * Professional RTL modal allowing the user to pick and customize their
 * personal "My Courses" selection from available canonical and organization courses.
 */

import { useState, useEffect } from "react";
import {
  Check,
  GraduationCap,
  Loader2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { Dialog, DialogHeader, DialogContent, DialogFooter } from "@avana/ui";
import type { CourseResource } from "@avana/contracts";

export interface CourseSelectionModalProps {
  open: boolean;
  onClose: () => void;
  availableCourses: CourseResource[];
  selectedCourseIds: string[];
  onConfirm: (selectedIds: string[]) => Promise<void> | void;
  isSubmitting?: boolean;
  isLoadingAvailable?: boolean;
  isErrorAvailable?: boolean;
  onRetryAvailable?: () => void;
}

export function CourseSelectionModal({
  open,
  onClose,
  availableCourses,
  selectedCourseIds,
  onConfirm,
  isSubmitting = false,
  isLoadingAvailable = false,
  isErrorAvailable = false,
  onRetryAvailable,
}: CourseSelectionModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(selectedCourseIds),
  );

  // Initialize state only when modal opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(selectedCourseIds));
    }
  }, [open, selectedCourseIds]);

  const toggleCourse = (courseId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    await onConfirm(Array.from(selectedIds));
  };

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      maxWidth="2xl"
      ariaLabel="انتخاب دوره‌ها"
    >
      {/* Header */}
      <DialogHeader onClose={onClose}>
        <h2
          id="course-selection-title"
          className="text-lg md:text-xl font-bold text-[var(--color-text)] flex items-center gap-2"
        >
          <GraduationCap className="w-6 h-6 text-[#008080]" />
          <span>دوره‌های مورد علاقه‌ات را انتخاب کن</span>
        </h2>
        <p className="text-xs md:text-sm text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
          دوره‌هایی را که می‌خواهی در صفحه دوره‌های خودت ببینی انتخاب کن.
          بعداً هر زمان خواستی می‌توانی آن‌ها را تغییر بدهی.
        </p>
      </DialogHeader>

      {/* Content Area */}
      <DialogContent className="space-y-3">
        {isLoadingAvailable ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
            <p className="text-xs text-[var(--color-text-muted)]">
              در حال بارگذاری دوره‌های در دسترس...
            </p>
          </div>
        ) : isErrorAvailable ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-500" />
            <p className="text-xs text-[var(--color-text-muted)]">
              خطا در دریافت لیست دوره‌ها
            </p>
            {onRetryAvailable && (
              <button
                type="button"
                onClick={onRetryAvailable}
                className="px-4 py-2 bg-[#008080] hover:bg-[#007575] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                تلاش مجدد
              </button>
            )}
          </div>
        ) : availableCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-[var(--color-text-muted)]" />
            <p className="text-sm font-bold text-[var(--color-text)]">
              دوره‌ای برای انتخاب یافت نشد
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              هنوز هیچ دوره‌ای در سیستم ثبت نشده است.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableCourses.map((course) => {
              const isSelected = selectedIds.has(course.id);
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => toggleCourse(course.id)}
                  className={`text-right p-4 rounded-xl border transition-all duration-200 flex items-start gap-3 group relative cursor-pointer ${
                    isSelected
                      ? "bg-[#008080]/10 border-[#008080] ring-1 ring-[#008080]/30"
                      : "bg-[var(--color-surface-warm)] border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:border-[#008080]/40"
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div
                    className={`w-5 h-5 rounded-lg border mt-0.5 flex items-center justify-center shrink-0 transition-all ${
                      isSelected
                        ? "bg-[#008080] border-[#008080] text-white shadow-xs"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] group-hover:border-[#008080]/40"
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  {/* Course details */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-xs sm:text-sm font-bold truncate transition-colors ${
                        isSelected ? "text-[#008080]" : "text-[var(--color-text)]"
                      }`}
                    >
                      {course.title}
                    </h4>
                    {course.subject && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate">
                        {course.subject}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>

      {/* Footer */}
      <DialogFooter>
        <span className="text-xs text-[var(--color-text-muted)]">
          {selectedIds.size} دوره انتخاب شده
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || isLoadingAvailable}
            className="px-6 py-2.5 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 active:scale-98 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <span>تأیید و ادامه</span>
            )}
          </button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}

