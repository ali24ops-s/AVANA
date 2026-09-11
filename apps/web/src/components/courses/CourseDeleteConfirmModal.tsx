/**
 * CourseDeleteConfirmModal Component.
 *
 * Professional RTL confirmation dialog before removing a course from
 * the user's personal "My Courses" list.
 */

import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog } from "@avana/ui";

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
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      maxWidth="md"
      hideHeader
      ariaLabel="حذف از دوره‌های من"
    >
      <div className="p-6 flex flex-col">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="course-delete-title"
              className="text-base font-bold text-[var(--color-text)] leading-tight"
            >
              حذف از دوره‌های من
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
              آیا مطمئن هستید که می‌خواهید دوره{" "}
              <span className="font-bold text-[var(--color-text)]">«{courseTitle}»</span> را
              از دوره‌های خود حذف کنید؟
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
              این عمل فقط دوره را از لیست شخصی شما حذف می‌کند و اطلاعات دوره در
              سیستم باقی می‌ماند.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 active:scale-98 cursor-pointer"
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
    </Dialog>
  );
}

