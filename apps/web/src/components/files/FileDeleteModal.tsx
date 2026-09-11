import { AlertTriangle, Trash2, Loader2, BookOpen, Layers, HelpCircle, FileText } from "lucide-react";
import { Dialog } from "@avana/ui";
import type { DocumentDetailResource, DocumentResource } from "@avana/contracts";
import { toPersianDigits } from "@avana/domain";

export interface FileDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  document: DocumentDetailResource | DocumentResource | null;
  count?: number; // for bulk delete
  isDeleting?: boolean;
}

export function FileDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  document,
  count = 1,
  isDeleting = false,
}: FileDeleteModalProps) {
  const isBulk = count > 1;
  const detailDoc = document as DocumentDetailResource | null;
  const usage = detailDoc?.usage;

  const hasDependencies =
    (usage?.lessons_count ?? 0) > 0 ||
    (usage?.flashcards_count ?? 0) > 0 ||
    (usage?.quizzes_count ?? 0) > 0 ||
    Boolean(usage?.course) ||
    Boolean(document?.course_id);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => !isDeleting && onClose()}
      maxWidth="md"
      hideHeader
      ariaLabel={isBulk ? `حذف ${count.toLocaleString("fa-IR")} فایل` : "حذف فایل آموزشی"}
    >
      <div className="p-6 space-y-5 text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              {isBulk ? `حذف ${count.toLocaleString("fa-IR")} فایل؟` : "حذف فایل آموزشی؟"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              این عملیات غیرقابل بازگشت است.
            </p>
          </div>
        </div>

        {/* Description / Warnings */}
        <div className="space-y-3 text-xs text-[var(--color-text)] bg-[var(--color-surface-warm)] p-4 rounded-2xl border border-[var(--color-border)]">
          {!isBulk && document && (
            <p className="font-semibold text-[var(--color-text)] break-all">
              «{document.original_name}»
            </p>
          )}

          <p>
            با حذف فایل، فایل منبع خام از سرور و کلیه چانک‌های متنی استخراج‌شده پاک خواهند شد.
          </p>

          {/* Dependency Warning */}
          {hasDependencies && !isBulk && (
            <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
              <span className="font-bold text-[#008080] block">
                محتوای آموزشی تاییدشده در دوره باقی می‌ماند:
              </span>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                درس‌ها، فلش‌کارت‌ها و آزمون‌های تاییدشده از دوره شما حذف نخواهند شد و برای مطالعه در دسترس باقی می‌مانند.
              </p>
              <ul className="space-y-1 text-[var(--color-text)]">
                {usage?.course && (
                  <li className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#008080] shrink-0" />
                    <span>متصل به دوره: {usage.course.name}</span>
                  </li>
                )}
                {(usage?.lessons_count ?? 0) > 0 && (
                  <li className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{toPersianDigits(usage?.lessons_count)} درس فعال در دوره</span>
                  </li>
                )}
                {(usage?.flashcards_count ?? 0) > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>{toPersianDigits(usage?.flashcards_count)} فلش‌کارت فعال در دوره</span>
                  </li>
                )}
                {(usage?.quizzes_count ?? 0) > 0 && (
                  <li className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{toPersianDigits(usage?.quizzes_count)} آزمون فعال در دوره</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {isBulk && (
            <p className="text-amber-700 dark:text-amber-300 font-medium">
              تعداد {count.toLocaleString("fa-IR")} فایل انتخاب‌شده حذف خواهند شد.
            </p>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال حذف...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>تأیید و حذف نهایی</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
