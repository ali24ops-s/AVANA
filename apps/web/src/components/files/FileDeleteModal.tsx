import { AlertTriangle, Trash2, Loader2, BookOpen, Layers, HelpCircle, FileText } from "lucide-react";
import type { DocumentDetailResource, DocumentResource } from "@avana/contracts";

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
  if (!isOpen) return null;

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 transition-opacity"
        onClick={() => !isDeleting && onClose()}
      />

      {/* Modal Container */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        dir="rtl"
      >
        <div className="bg-[#0f172a] border border-rose-500/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-slate-200 font-sans">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isBulk ? `حذف ${count.toLocaleString("fa-IR")} فایل؟` : "حذف فایل آموزشی؟"}
              </h3>
              <p className="text-xs text-slate-400">
                این عملیات غیرقابل بازگشت است.
              </p>
            </div>
          </div>

          {/* Description / Warnings */}
          <div className="space-y-3 text-xs text-slate-300 bg-white/5 p-4 rounded-2xl border border-white/5">
            {!isBulk && document && (
              <p className="font-semibold text-white break-all">
                «{document.original_name}»
              </p>
            )}

            <p>
              با حذف فایل، منبع فیزیکی از سرور و کلیه چانک‌های متنی استخراج‌شده پاک خواهند شد.
            </p>

            {/* Dependency Warning */}
            {hasDependencies && !isBulk && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="font-bold text-amber-400 block">
                  هشدار وابستگی‌های آموزشی:
                </span>
                <ul className="space-y-1 text-slate-300">
                  {usage?.course && (
                    <li className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>متصل به دوره: {usage.course.name}</span>
                    </li>
                  )}
                  {(usage?.lessons_count ?? 0) > 0 && (
                    <li className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{usage?.lessons_count} درس تولیدشده از این فایل</span>
                    </li>
                  )}
                  {(usage?.flashcards_count ?? 0) > 0 && (
                    <li className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>{usage?.flashcards_count} فلش‌کارت متصل</span>
                    </li>
                  )}
                  {(usage?.quizzes_count ?? 0) > 0 && (
                    <li className="flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{usage?.quizzes_count} آزمون مرتبط</span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {isBulk && (
              <p className="text-amber-400/90 font-medium">
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
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              انصراف
            </button>

            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-950/40 disabled:opacity-50"
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
      </div>
    </>
  );
}
