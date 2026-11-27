import React, { useState, useEffect } from "react";
import { Globe, AlertTriangle, ShieldCheck } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../ui/index.js";
import { usePublishAssertion } from "../../hooks/usePocketAssertions.js";
import type { PocketAssertionClinicalSummary } from "../../lib/api/pocket.js";

function mapPublishErrorMessage(err: unknown): string {
  if (!err) return "خطا در انتشار رسمی گزاره";

  const errObj = err as {
    status?: number;
    message?: string;
    details?: Record<string, unknown>;
  };

  const primaryReason = String(errObj?.details?.primaryBlockReason ?? "");
  const rawMessage = (errObj?.message ?? (err instanceof Error ? err.message : "")).toLowerCase();

  if (primaryReason === "quorum_not_met" || rawMessage.includes("quorum_not_met")) {
    return "حدنصاب (Quorum) داوری بالینی هنوز تکمیل نشده است.";
  }
  if (
    primaryReason === "unresolved_clinical_conflict" ||
    rawMessage.includes("unresolved_clinical_conflict")
  ) {
    return "به‌دلیل وجود تعارض بالینی حل‌نشده، امکان انتشار این گزاره وجود ندارد.";
  }
  if (
    primaryReason === "active_safety_override" ||
    rawMessage.includes("active_safety_override")
  ) {
    return "به‌دلیل فعال بودن Safety Override، انتشار این گزاره مسدود است.";
  }
  if (
    primaryReason === "all_approvals_invalidated" ||
    rawMessage.includes("all_approvals_invalidated")
  ) {
    return "اعتبارنامه داوران تأییدکننده منقضی، معلق یا لغو شده است.";
  }
  if (
    primaryReason === "active_disagreement" ||
    rawMessage.includes("active_disagreement")
  ) {
    return "مخالفت فعال در داوری بالینی ثبت شده است و انتشار مجاز نیست.";
  }
  if (rawMessage.includes("already published")) {
    return "این نسخه قبلاً منتشر شده است.";
  }
  if (rawMessage.includes("superseded")) {
    return "امکان انتشار نسخه منسوخ‌شده (Superseded) وجود ندارد.";
  }
  if (errObj?.status === 403 || rawMessage.includes("platform_admin") || rawMessage.includes("restricted")) {
    return "شما مجوز لازم برای انتشار رسمی گزاره‌های بالینی را ندارید.";
  }
  if (errObj?.status === 404 || rawMessage.includes("not found")) {
    return "گزاره مورد نظر یافت نشد.";
  }
  if (errObj?.status === 409) {
    return "وضعیت فعلی گزاره یا پیش‌شرط‌های بالینی آن تغییر کرده و انتشار مجاز نیست.";
  }
  if (errObj?.status === 400) {
    return "وضعیت فعلی گزاره برای انتشار مجاز نیست (باید در وضعیت تأییدشده بالینی باشد).";
  }

  return "خطا در اجرای تراکنش انتشار رسمی. لطفاً وضعیت گزاره را دوباره بررسی کنید.";
}

export interface PublishAssertionModalProps {
  isOpen: boolean;
  assertionId: string;
  assertionKey: string;
  statementText: string;
  versionNumber: number;
  clinicalSummary: PocketAssertionClinicalSummary;
  activePublishedVersionNumber?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PublishAssertionModal({
  isOpen,
  assertionId,
  assertionKey,
  statementText,
  versionNumber,
  clinicalSummary,
  activePublishedVersionNumber,
  onClose,
  onSuccess,
}: PublishAssertionModalProps) {
  const publishMutation = usePublishAssertion();

  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNotes("");
      setConfirmed(false);
      setValidationError(null);
      publishMutation.reset();
    }
  }, [isOpen, assertionId]);

  const handleClose = () => {
    if (publishMutation.isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!confirmed) {
      setValidationError("لطفاً تأیید صریح انتشار رسمی را علامت بزنید.");
      return;
    }

    try {
      const trimmedNotes = notes.trim();
      await publishMutation.mutateAsync({
        id: assertionId,
        body: trimmedNotes ? { notes: trimmedNotes } : undefined,
      });
      onSuccess?.();
      onClose();
    } catch {
      // Mapped cleanly below via mapPublishErrorMessage
    }
  };

  const apiError = publishMutation.isError
    ? mapPublishErrorMessage(publishMutation.error)
    : null;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="lg">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              تأیید انتشار رسمی Assertion
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
              {assertionKey} (نسخه {toPersianDigits(versionNumber)})
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <Alert variant="warning" title="هشدار انتشار رسمی">
            <div className="flex items-start gap-2 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                با انتشار رسمی، این نسخه بلافاصله در دسترس تمام کاربران و مصرف‌کنندگان AVANA Pocket
                قرار می‌گیرد و نسخهٔ منتشرشدهٔ قبلی (در صورت وجود) به‌طور خودکار منسوخ (Superseded)
                خواهد شد.
              </span>
            </div>
          </Alert>

          {(validationError || apiError) && (
            <Alert variant="error" title="خطا در انتشار">
              <span className="text-xs sm:text-sm">{validationError || apiError}</span>
            </Alert>
          )}

          <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)]/50 border border-[var(--color-border)] space-y-2 text-xs">
            <div className="font-bold text-[var(--color-text-muted)]">متن کامل Assertion:</div>
            <p className="text-[var(--color-text)] leading-relaxed">{statementText}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                اعتبار بالینی:{" "}
                <strong>
                  {clinicalSummary.isClinicallyVerified ? "تأییدشده" : "فاقد اعتبار"}
                </strong>
              </span>
            </div>
            <div>
              تأییدهای معتبر:{" "}
              <strong>
                {toPersianDigits(clinicalSummary.validApprovalCount)} از{" "}
                {toPersianDigits(clinicalSummary.requiredApprovals)}
              </strong>
            </div>
            {activePublishedVersionNumber && (
              <div className="sm:col-span-2 text-amber-700 dark:text-amber-300">
                نسخه فعال فعلی (نسخه {toPersianDigits(activePublishedVersionNumber)}) پس از انتشار
                منسوخ (Superseded) خواهد شد.
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="publish-notes"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              یادداشت انتشار (اختیاری)
            </label>
            <textarea
              id="publish-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="توضیحات ثبت‌شده در تاریخچه انتشار..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
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
              تأیید می‌کنم که تمام پیش‌شرط‌های بالینی بررسی شده است و قصد انتشار رسمی این نسخه را
              دارم.
            </span>
          </label>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={publishMutation.isPending}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={publishMutation.isPending}
            disabled={publishMutation.isPending || !confirmed}
          >
            تأیید و انتشار رسمی
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
