import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  X,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import { Checkbox } from "@avana/ui";

export interface AdminCourseDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: {
    id: string;
    name: string;
    status?: string;
    product?: { active?: boolean; price?: number } | null;
    hasPurchaseHistory?: boolean;
    hasPurchases?: boolean;
  } | null;
  onSuccess?: () => void;
}

export function AdminCourseDeleteModal({
  isOpen,
  onClose,
  course,
  onSuccess,
}: AdminCourseDeleteModalProps) {
  const adminApi = useAdmin();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"name_confirmation" | "purchase_warning">("name_confirmation");
  const [confirmationName, setConfirmationName] = useState("");
  const [deleteSourceDocuments, setDeleteSourceDocuments] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens with a course
  useEffect(() => {
    if (isOpen) {
      setStep("name_confirmation");
      setConfirmationName("");
      setDeleteSourceDocuments(false);
      setDeleting(false);
      setError(null);
    }
  }, [isOpen, course?.id]);

  if (!isOpen || !course) return null;

  const hasPurchaseHistory = Boolean(course.hasPurchaseHistory || course.hasPurchases);
  const isNameMatched = confirmationName.trim() === course.name.trim();

  const performDelete = async () => {
    try {
      setDeleting(true);
      setError(null);

      await adminApi.deleteOfficialCourse(course.id, {
        confirmationName: confirmationName.trim(),
        deleteSourceDocuments,
      });

      // Invalidate relevant react-query caches
      await queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "official-courses"] });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || "خطا در حذف دوره. لطفاً مجدداً تلاش کنید.");
    } finally {
      setDeleting(false);
    }
  };

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameMatched || deleting) return;

    if (hasPurchaseHistory) {
      setError(null);
      setStep("purchase_warning");
    } else {
      void performDelete();
    }
  };

  const handlePurchaseWarningConfirm = () => {
    if (deleting) return;
    void performDelete();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-course-title"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between p-5 sm:p-6 border-b border-[var(--color-border)] ${
            step === "purchase_warning" ? "bg-amber-500/10" : "bg-rose-500/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                step === "purchase_warning"
                  ? "bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-500"
              }`}
            >
              {step === "purchase_warning" ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="delete-course-title" className="text-base font-bold text-[var(--color-text)]">
                {step === "purchase_warning"
                  ? "هشدار جدی: وجود سابقه خرید دوره"
                  : "حذف قطعی دوره آموزشی"}
              </h3>
              <p
                className={`text-xs ${
                  step === "purchase_warning"
                    ? "text-amber-700 dark:text-amber-300 font-medium"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {step === "purchase_warning"
                  ? "نیاز به تأیید مجدد ادمین برای حذف دوره دارای خریدار"
                  : "این عملیات دائمی و غیرقابل بازگشت است"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label="بستن پنجره"
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl hover:bg-[var(--color-surface-warm)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {step === "name_confirmation" ? (
          <form onSubmit={handleInitialSubmit} className="p-5 sm:p-6 space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {hasPurchaseHistory && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200/90">
                  این دوره دارای سابقه خرید ثبت‌شده است. پس از تأیید نام دوره، مرحله دوم تأیید و هشدار به شما نمایش داده خواهد شد.
                </p>
              </div>
            )}

            {/* Deletion Scope Warning */}
            <div className="p-4 rounded-xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] text-xs text-[var(--color-text)] space-y-2 leading-relaxed">
              <p>
                با تأیید حذف، تمامی داده‌های مربوط به دوره <strong>«{course.name}»</strong> شامل:
              </p>
              <ul className="list-disc list-inside text-[11px] text-[var(--color-text-muted)] space-y-1 ms-2">
                <li>فصل‌ها، درس‌ها و ساختار آموزشی</li>
                <li>فلش‌کارت‌ها و سؤالات آزمون تولیدشده</li>
                <li>پیش‌نویس‌ها و وظایف پردازش هوش مصنوعی</li>
                <li>محصول تجاری اختصاصی دوره در کاتالوگ</li>
              </ul>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold pt-1">
                به‌صورت دائمی از پایگاه داده حذف خواهند شد.
              </p>
            </div>

            {/* Exact Name Confirmation Field */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[var(--color-text)]">
                برای تأیید، لطفاً نام دقیق دوره را بنویسید:
              </label>
              <div className="p-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)] select-all text-center">
                {course.name}
              </div>
              <input
                type="text"
                value={confirmationName}
                onChange={(e) => setConfirmationName(e.target.value)}
                placeholder="نام دوره را اینجا بنویسید..."
                disabled={deleting}
                aria-label="تأیید نام دوره برای حذف"
                className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl px-4 py-2.5 text-xs text-[var(--color-text)] placeholder:[var(--color-text-muted)] focus:outline-none transition-colors"
                autoFocus
              />
            </div>

            {/* Delete Source Documents Option */}
            <Checkbox
              checked={deleteSourceDocuments}
              onChange={(e) => setDeleteSourceDocuments(e.target.checked)}
              disabled={deleting}
              label="حذف اسناد و فایل‌های منبع اختصاصی"
              description="فقط فایل‌هایی که در دوره یا بسته آموزشی دیگری استفاده نشده‌اند حذف خواهند شد."
              className="w-full p-3.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)]/70 transition-colors"
            />

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors"
              >
                انصراف
              </button>

              <button
                type="submit"
                disabled={!isNameMatched || deleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>حذف قطعی و برگشت‌ناپذیر دوره</span>
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Severe Purchase Warning & Second Explicit Confirmation */
          <div className="p-5 sm:p-6 space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Critical Impact Information Box */}
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-3.5">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>توجه بسیار مهم: این دوره دارای سابقه خرید توسط کاربران است</span>
              </div>

              <div className="space-y-2.5 text-[11px] leading-relaxed">
                <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200">
                  <Ban className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <p>
                    <strong>قطع دسترسی دانشجویان:</strong> دسترسی تمامی خریداران و دانشجویان به محتوای این دوره به‌طور کامل قطع خواهد شد.
                  </p>
                </div>

                <div className="flex items-start gap-2 text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <p>
                    <strong>حفظ سوابق مالی و تراکنش‌ها:</strong> سوابق مالی، فاکتورها، تراکنش‌های پرداخت و لاگ‌های حسابداری بدون تغییر در سیستم حفظ می‌شوند.
                  </p>
                </div>

                <div className="flex items-start gap-2 text-[var(--color-text-muted)]">
                  <Trash2 className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <p>
                    ساختار آموزشی دوره (فصل‌ها، درس‌ها، آزمون‌ها و فلش‌کارت‌ها) به‌صورت دائمی حذف خواهد شد.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              آیا با آگاهی کامل از قطع دسترسی خریداران، مایل به حذف قطعی دوره <strong>«{course.name}»</strong> هستید؟
            </p>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setStep("name_confirmation")}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors flex items-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>بازگشت به مرحله قبل</span>
              </button>

              <button
                type="button"
                onClick={handlePurchaseWarningConfirm}
                disabled={deleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>تأیید نهایی و حذف دوره دارای سابقه خرید</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
