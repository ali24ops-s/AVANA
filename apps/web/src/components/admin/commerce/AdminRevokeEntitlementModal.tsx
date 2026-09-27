import { useState } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  AlertTriangle,
  X,
  Loader2,
  BookOpen,
  FolderTree,
  User,
  ShieldAlert,
  Calendar,
  Layers,
} from "lucide-react";
import type { AdminEntitlementRecord } from "../../../lib/api/admin.js";
import { formatPersianDate, getSourceTypeBadge, getResourceTypeLabel } from "./commerceUtils.js";

interface AdminRevokeEntitlementModalProps {
  isOpen: boolean;
  entitlement: AdminEntitlementRecord | null;
  userEmail?: string;
  onClose: () => void;
  onSuccess: (updatedEnt?: AdminEntitlementRecord) => void;
}

export function AdminRevokeEntitlementModal({
  isOpen,
  entitlement,
  userEmail,
  onClose,
  onSuccess,
}: AdminRevokeEntitlementModalProps) {
  const adminApi = useAdmin();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !entitlement) return null;

  const targetEmail = userEmail || entitlement.userEmail;
  const srcBadge = getSourceTypeBadge(entitlement.sourceType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await adminApi.revokeCommerceEntitlement(
        entitlement.id,
        reason.trim() || undefined,
      );
      onSuccess(res.entitlement);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در لغو دسترسی کاربر به این منبع.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-modal-title"
    >
      <div
        className="bg-[var(--color-surface)] border border-rose-500/30 rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-rose-500/10">
          <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-bold text-lg">
            <AlertTriangle className="w-5 h-5" />
            <span id="revoke-modal-title">تأیید لغو دسترسی کاربر</span>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Warning Banner */}
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-xs text-rose-700 dark:text-rose-200 leading-relaxed font-medium">
            <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-600 dark:text-rose-300 mb-1">
                توجه: این عملیات بلافاصله اعمال می‌شود.
              </p>
              <p>
                با لغو این دسترسی، کاربر دیگر به این دوره دسترسی نخواهد داشت.
                سوابق یادگیری و اطلاعات خرید او حذف نمی‌شود.
              </p>
            </div>
          </div>

          {/* Target User & Resource Info */}
          <div className="bg-[var(--color-surface-warm)] p-4 rounded-xl border border-[var(--color-border)] space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                <span>کاربر:</span>
              </span>
              <span className="text-[var(--color-text)] font-medium font-mono" dir="ltr">
                {targetEmail}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                {entitlement.resourceType === "course" ? (
                  <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <FolderTree className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                )}
                <span>عنوان منبع:</span>
              </span>
              <span className="text-[var(--color-text)] font-bold">
                {entitlement.resourceTitle || entitlement.resourceId || getResourceTypeLabel(entitlement.resourceType)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                <span>روش اعطا:</span>
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${srcBadge.className}`}>
                {srcBadge.label}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                <span>تاریخ شروع:</span>
              </span>
              <span className="text-[var(--color-text)] font-medium">
                {formatPersianDate(entitlement.startsAt, false)}
              </span>
            </div>
          </div>

          {/* Reason Field */}
          <div>
            <label
              htmlFor="revoke-reason-input"
              className="block text-xs font-medium text-[var(--color-text)] mb-2"
            >
              علت لغو دسترسی (اختیاری):
            </label>
            <textarea
              id="revoke-reason-input"
              rows={3}
              placeholder="مثال: درخواست بازگشت وجه کاربر، لغو دستی توسط مدیریت یا تغییر برنامه آموزشی..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl p-3 text-sm text-[var(--color-text)] focus:outline-none focus:border-rose-500 transition-colors placeholder:text-[var(--color-text-muted)]"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isSubmitting
                  ? "در حال قطع دسترسی..."
                  : "لغو دسترسی"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
