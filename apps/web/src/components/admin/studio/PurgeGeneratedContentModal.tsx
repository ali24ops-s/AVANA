import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X, FileText } from "lucide-react";

export interface PurgeGeneratedContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  onConfirm: () => void;
  isPurging: boolean;
  error?: string | null;
}

export function PurgeGeneratedContentModal({
  isOpen,
  onClose,
  documentName,
  onConfirm,
  isPurging,
  error,
}: PurgeGeneratedContentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPurging && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPurging, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purge-modal-title"
      dir="rtl"
    >
      <div
        ref={modalRef}
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id="purge-modal-title" className="text-base font-black text-[var(--color-text)]">
              حذف محتوای تولیدشده
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPurging}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]/50 transition-colors disabled:opacity-40"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Target File Badge */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-[var(--color-text-muted)] font-medium">فایل منبع انتخابی:</div>
              <div className="text-xs font-bold text-[var(--color-text)] truncate" dir="ltr">
                {documentName}
              </div>
            </div>
          </div>

          {/* Required Explicit Disclaimer */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs sm:text-sm leading-relaxed space-y-2">
            <p className="font-bold">
              تمام محتوای تولیدشده از این فایل، شامل درسنامه‌ها، آزمون‌ها و فلش‌کارت‌ها حذف خواهد شد. فایل منبع و اطلاعات اصلی آن حفظ می‌شوند. این عملیات قابل بازگشت نیست.
            </p>
          </div>

          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            پس از حذف، وضعیت این فایل به حالت آماده برای تولید بازنشانی می‌شود و خود فایل منبع و تکه‌های متنی (Chunks) آن برای تولید مجدد احتمالی در دسترس خواهند بود.
          </p>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="flex-1">{error}</div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)]/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isPurging}
            className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPurging}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPurging && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>حذف دائمی محتوا</span>
          </button>
        </div>
      </div>
    </div>
  );
}
