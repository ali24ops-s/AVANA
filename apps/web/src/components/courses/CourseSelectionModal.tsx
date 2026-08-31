/**
 * CourseSelectionModal Component.
 *
 * Professional RTL modal allowing the user to pick and customize their
 * personal "My Courses" selection from available canonical and organization courses.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  GraduationCap,
  Loader2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
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
  }, [open, selectedCourseIds]);

  if (!open) return null;

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

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-xl overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-selection-title"
    >

      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden glass-panel flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
          <div>
            <h2
              id="course-selection-title"
              className="text-lg md:text-xl font-bold text-white flex items-center gap-2"
            >
              <GraduationCap className="w-6 h-6 text-teal-400" />
              <span>دوره‌های مورد علاقه‌ات را انتخاب کن</span>
            </h2>
            <p className="text-xs md:text-sm text-slate-400 mt-1.5 leading-relaxed">
              دوره‌هایی را که می‌خواهی در صفحه دوره‌های خودت ببینی انتخاب کن.
              بعداً هر زمان خواستی می‌توانی آن‌ها را تغییر بدهی.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0 disabled:opacity-50"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {isLoadingAvailable ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-xs text-slate-400">
                در حال بارگذاری دوره‌های در دسترس...
              </p>
            </div>
          ) : isErrorAvailable ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-xs text-slate-300">
                خطا در دریافت لیست دوره‌ها
              </p>
              {onRetryAvailable && (
                <button
                  type="button"
                  onClick={onRetryAvailable}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold"
                >
                  تلاش مجدد
                </button>
              )}
            </div>
          ) : availableCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-slate-400" />
              <p className="text-sm font-bold text-white">
                دوره‌ای برای انتخاب یافت نشد
              </p>
              <p className="text-xs text-slate-400">
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
                        ? "bg-teal-950/40 border-teal-500/70 shadow-[0_0_15px_rgba(20,184,166,0.15)] ring-1 ring-teal-500/50"
                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <div
                      className={`w-5 h-5 rounded-lg border mt-0.5 flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? "bg-teal-500 border-teal-500 text-slate-950 shadow-sm"
                          : "border-slate-500 bg-slate-800/60 group-hover:border-slate-400"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    {/* Course details */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-xs sm:text-sm font-bold truncate transition-colors ${
                          isSelected ? "text-white" : "text-slate-200"
                        }`}
                      >
                        {course.title}
                      </h4>
                      {course.subject && (
                        <p className="text-[11px] text-slate-400 mt-1 truncate">
                          {course.subject}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 bg-slate-900/90 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-400">
            {selectedIds.size} دوره انتخاب شده
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isSubmitting || isLoadingAvailable}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-teal-900/40 disabled:opacity-50 active:scale-98"
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
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}

