/**
 * ExamDeleteConfirmModal Component.
 *
 * Professional RTL confirmation dialog before removing/canceling a scheduled
 * exam registration for a course from the user's "Upcoming Exams" list.
 */

import { useState } from "react";
import { Trash2, AlertTriangle, Loader2, AlertCircle } from "lucide-react";
import { Dialog } from "@avana/ui";

export interface ExamDeleteConfirmModalProps {
  open: boolean;
  courseTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ExamDeleteConfirmModal({
  open,
  courseTitle,
  onClose,
  onConfirm,
}: ExamDeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (!isDeleting) {
      setError(null);
      onClose();
    }
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "خطا در لغو ثبت امتحان. لطفاً مجدداً تلاش کنید.";
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      maxWidth="md"
      hideHeader
      ariaLabel="لغو ثبت امتحان"
    >
      <div className="p-6 flex flex-col text-[var(--color-text)]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="exam-delete-title"
              className="text-base font-bold text-[var(--color-text)] leading-tight"
            >
              لغو ثبت امتحان
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-relaxed">
              آیا مطمئن هستید که می‌خواهید زمان‌بندی و ثبت امتحان درس{" "}
              <span className="font-bold text-[var(--color-text)]">«{courseTitle}»</span> را
              لغو کنید؟
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
              این عمل تنها تاریخ امتحان را از لیست امتحانات پیش‌رو حذف می‌کند و محتوا یا پیشرفت دوره شما دست‌نخورده باقی می‌ماند.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-card bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] text-[var(--avana-error)] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:opacity-50 active:scale-98 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال لغو...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>حذف ثبت امتحان</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
