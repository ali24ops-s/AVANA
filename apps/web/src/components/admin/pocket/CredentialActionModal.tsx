import React, { useState, useEffect } from "react";
import { AlertTriangle, Ban, PauseCircle, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../../ui/index.js";
import {
  useSuspendReviewerCredential,
  useReactivateReviewerCredential,
  useRevokeReviewerCredential,
} from "../../../hooks/usePocketReviewerCredentials.js";
import type { ClinicalReviewerCredential } from "../../../lib/api/pocket.js";

export type CredentialActionMode = "suspend" | "reactivate" | "revoke";

export interface CredentialActionModalProps {
  credential: ClinicalReviewerCredential | null;
  mode: CredentialActionMode | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CredentialActionModal({
  credential,
  mode,
  onClose,
  onSuccess,
}: CredentialActionModalProps) {
  const suspendMutation = useSuspendReviewerCredential();
  const reactivateMutation = useReactivateReviewerCredential();
  const revokeMutation = useRevokeReviewerCredential();

  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isOpen = Boolean(credential && mode);
  const isSuspend = mode === "suspend";
  const isReactivate = mode === "reactivate";
  const isRevoke = mode === "revoke";
  const isReasonRequired = isSuspend || isRevoke;
  const isPending =
    suspendMutation.isPending || reactivateMutation.isPending || revokeMutation.isPending;

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setConfirmed(false);
      setValidationError(null);
      suspendMutation.reset();
      reactivateMutation.reset();
      revokeMutation.reset();
    }
  }, [isOpen, credential?.id, mode]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credential || !mode) return;
    setValidationError(null);

    const trimmedReason = reason.trim();
    if (isReasonRequired && !trimmedReason) {
      setValidationError(isSuspend ? "ثبت دلیل تعلیق الزامی است." : "ثبت دلیل لغو الزامی است.");
      return;
    }
    if (!confirmed) {
      setValidationError("لطفاً تأیید صریح انجام عملیات را علامت بزنید.");
      return;
    }

    try {
      if (isSuspend) {
        await suspendMutation.mutateAsync({
          id: credential.id,
          body: { reason: trimmedReason },
        });
      } else if (isReactivate) {
        await reactivateMutation.mutateAsync({
          id: credential.id,
          body: trimmedReason ? { reason: trimmedReason } : undefined,
        });
      } else {
        await revokeMutation.mutateAsync({
          id: credential.id,
          body: { reason: trimmedReason },
        });
      }
      onSuccess?.();
      onClose();
    } catch {
      // Error surfaced via mutation error state
    }
  };

  const activeError =
    suspendMutation.error ?? reactivateMutation.error ?? revokeMutation.error;
  const apiError =
    activeError instanceof Error
      ? activeError.message
      : activeError
        ? "خطا در اجرای عملیات روی اعتبارنامه"
        : null;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isReactivate
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }`}
          >
            {isSuspend ? (
              <PauseCircle className="w-5 h-5" />
            ) : isReactivate ? (
              <RotateCcw className="w-5 h-5" />
            ) : (
              <Ban className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              {isSuspend
                ? "تعلیق اعتبارنامه داور بالینی"
                : isReactivate
                  ? "فعال‌سازی مجدد اعتبارنامه داور بالینی"
                  : "لغو دائم اعتبارنامه داور بالینی"}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
              {credential?.medicalLicenseNumber}
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <Alert variant={isReactivate ? "info" : "warning"} title="هشدار عملیاتی">
            <div className="flex items-start gap-2 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {isSuspend
                  ? "با تعلیق این اعتبارنامه، داور بلافاصله امکان تأیید یا رد بالینی گزاره‌ها را از دست می‌دهد. سوابق داوری‌های قبلی حفظ خواهند شد."
                  : isReactivate
                    ? "با فعال‌سازی مجدد این اعتبارنامه، دسترسی داور بالینی به وضعیت فعال بازمی‌گردد."
                    : "لغو اعتبارنامه غیرقابل بازگشت است و دسترسی داوری بالینی این کاربر به‌طور کامل مسدود می‌شود."}
              </span>
            </div>
          </Alert>

          {(validationError || apiError) && (
            <Alert variant="error" title="خطا">
              <span className="text-xs sm:text-sm">{validationError || apiError}</span>
            </Alert>
          )}

          <div>
            <label
              htmlFor="credential-action-reason"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              دلیل {isSuspend ? "تعلیق *" : isReactivate ? "فعال‌سازی مجدد (اختیاری)" : "لغو *"}
            </label>
            <textarea
              id="credential-action-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isSuspend
                  ? "دلیل تعلیق اعتبارنامه را شرح دهید..."
                  : isReactivate
                    ? "در صورت نیاز، توضیح فعال‌سازی مجدد را وارد کنید..."
                    : "دلیل لغو دائم اعتبارنامه را وارد کنید..."
              }
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              required={isReasonRequired}
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/50 cursor-pointer text-xs text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-[var(--color-border)] text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)]"
            />
            <span>
              تأیید می‌کنم که از پیامدهای{" "}
              {isSuspend ? "تعلیق" : isReactivate ? "فعال‌سازی مجدد" : "لغو دائم"} این اعتبارنامه
              مطلع هستم و قصد اجرای آن را دارم.
            </span>
          </label>
        </DialogContent>

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isPending}>
            انصراف
          </Button>
          <Button
            type="submit"
            variant={isReactivate ? "primary" : "danger"}
            size="sm"
            isLoading={isPending}
            disabled={isPending || !confirmed}
          >
            {isSuspend
              ? "تأیید و تعلیق اعتبارنامه"
              : isReactivate
                ? "تأیید و فعال‌سازی مجدد"
                : "تأیید و لغو اعتبارنامه"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
