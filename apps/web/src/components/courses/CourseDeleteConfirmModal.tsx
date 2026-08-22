/**
 * CourseDeleteConfirmModal Component.
 *
 * Professional RTL confirmation dialog before removing a course from
 * the user's personal "My Courses" list.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

export interface CourseDeleteConfirmModalProps {
  open: boolean;
  courseTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
}

export function CourseDeleteConfirmModal({
  open,
  courseTitle,
  onClose,
  onConfirm,
  isDeleting = false,
}: CourseDeleteConfirmModalProps) {
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

  if (!open) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-xl overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-delete-title"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden glass-panel flex flex-col p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-950/50 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="course-delete-title"
              className="text-base font-bold text-white leading-tight"
            >
              حذف از دوره‌های من
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              آیا مطمئن هستید که می‌خواهید دوره{" "}
              <span className="font-bold text-white">«{courseTitle}»</span> را
              از دوره‌های خود حذف کنید؟
            </p>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              این عمل فقط دوره را از لیست شخصی شما حذف می‌کند و اطلاعات دوره در
              سیستم باقی می‌ماند.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-red-950/50 disabled:opacity-50 active:scale-98"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال حذف...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>حذف دوره</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}

