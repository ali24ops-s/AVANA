import { useState } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  AlertTriangle,
  X,
  Loader2,
  Calendar,
  Sparkles,
  User,
  ShieldAlert,
} from "lucide-react";
import type { AdminSubscriptionRecord } from "../../../lib/api/admin.js";
import { formatPersianDate } from "./commerceUtils.js";

interface AdminCancelSubscriptionModalProps {
  isOpen: boolean;
  subscription: AdminSubscriptionRecord | null;
  onClose: () => void;
  onSuccess: (updatedSub?: AdminSubscriptionRecord) => void;
}

export function AdminCancelSubscriptionModal({
  isOpen,
  subscription,
  onClose,
  onSuccess,
}: AdminCancelSubscriptionModalProps) {
  const adminApi = useAdmin();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !subscription) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await adminApi.cancelCommerceSubscription(
        subscription.id,
        reason.trim() || undefined,
      );
      onSuccess(res.subscription);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در لغو اشتراک کاربر.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div
        className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-rose-500/10">
          <div className="flex items-center gap-2.5 text-rose-400 font-bold text-lg">
            <AlertTriangle className="w-5 h-5" />
            <span id="cancel-modal-title">تأیید لغو اشتراک کاربر</span>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors disabled:opacity-50"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Warning Banner */}
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-xs text-rose-200 leading-relaxed font-medium">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-300 mb-1">
                توجه: این عملیات بلافاصله اعمال می‌شود.
              </p>
              <p>
                با لغو اشتراک، دسترسی کاربر به مزایای اشتراک بلافاصله قطع می‌شود.
                سوابق مالی و تاریخچه اشتراک کاربر برای گزارش‌گیری حفظ خواهد شد.
              </p>
            </div>
          </div>

          {/* Target User & Plan Info */}
          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-400" />
                <span>کاربر:</span>
              </span>
              <span className="text-slate-200 font-medium font-mono" dir="ltr">
                {subscription.userEmail}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>پلن اشتراک:</span>
              </span>
              <span className="text-slate-200 font-bold">
                {subscription.productTitle}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>انقضای فعلی:</span>
              </span>
              <span className="text-amber-300 font-medium">
                {formatPersianDate(subscription.expiresAt)}
              </span>
            </div>
          </div>

          {/* Reason Field */}
          <div>
            <label
              htmlFor="cancel-reason-input"
              className="block text-xs font-medium text-slate-300 mb-2"
            >
              علت لغو اشتراک (اختیاری):
            </label>
            <textarea
              id="cancel-reason-input"
              rows={3}
              placeholder="مثال: درخواست بازگشت وجه کاربر، عدم رعایت قوانین یا تغییر دستی وضعیت توسط پشتیبانی..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-rose-500 transition-colors placeholder:text-slate-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-rose-900/30"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isSubmitting
                  ? "در حال قطع دسترسی..."
                  : "لغو اشتراک و قطع دسترسی"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
