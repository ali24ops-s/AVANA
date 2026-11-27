import React, { useState, useEffect } from "react";
import { Send, CheckCircle2, XCircle, RotateCcw, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../ui/index.js";
import {
  useSubmitAssertionReview,
  useRecordReviewDecision,
  useWithdrawAssertionReview,
} from "../../hooks/usePocketAssertions.js";
import type { ReviewDecision } from "../../lib/api/pocket.js";

export type InitialReviewActionMode =
  | "submit"
  | "approve"
  | "reject"
  | "request_changes"
  | "withdraw";

export interface AssertionReviewWorkflowModalProps {
  assertionId: string;
  assertionKey: string;
  mode: InitialReviewActionMode | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

const MODE_CONFIG: Record<
  InitialReviewActionMode,
  {
    title: string;
    subtitle: string;
    notesLabel: string;
    notesRequired: boolean;
    submitLabel: string;
    variant: "primary" | "danger" | "secondary";
    icon: typeof Send;
    successMessage: string;
    warningText?: string;
  }
> = {
  submit: {
    title: "ارسال Assertion برای بازبینی",
    subtitle: "انتقال گزاره از وضعیت پیش‌نویس به صف بازبینی اولیه",
    notesLabel: "یادداشت ارسال (اختیاری)",
    notesRequired: false,
    submitLabel: "تأیید و ارسال برای بازبینی",
    variant: "primary",
    icon: Send,
    successMessage: "Assertion با موفقیت برای بازبینی اولیه ارسال شد.",
  },
  approve: {
    title: "تأیید بازبینی اولیه",
    subtitle: "تغییر وضعیت به «بازبینی‌شده» (Reviewed) جهت آماده‌سازی برای داوری بالینی",
    notesLabel: "یادداشت بازبینی (اختیاری)",
    notesRequired: false,
    submitLabel: "تأیید بازبینی اولیه",
    variant: "primary",
    icon: CheckCircle2,
    successMessage: "بازبینی اولیه با موفقیت تأیید شد.",
    warningText:
      "توجه: تأیید بازبینی اولیه به‌معنای تأیید بالینی (Clinical Verification) یا انتشار نیست. برای تأیید بالینی، رأی داوران دارای Credential فعال الزامی است.",
  },
  reject: {
    title: "رد بازبینی اولیه",
    subtitle: "بازگرداندن گزاره به وضعیت پیش‌نویس همراه با ثبت دلیل رد",
    notesLabel: "دلیل رد بازبینی *",
    notesRequired: true,
    submitLabel: "ثبت رد بازبینی",
    variant: "danger",
    icon: XCircle,
    successMessage: "رد بازبینی اولیه ثبت شد و گزاره به پیش‌نویس بازگشت.",
  },
  request_changes: {
    title: "درخواست اصلاح محتوا",
    subtitle: "بازگرداندن گزاره به پیش‌نویس همراه با توضیح اصلاحات موردنیاز",
    notesLabel: "توضیح اصلاحات موردنیاز *",
    notesRequired: true,
    submitLabel: "ثبت درخواست اصلاح",
    variant: "secondary",
    icon: RotateCcw,
    successMessage: "درخواست اصلاح ثبت شد و گزاره به پیش‌نویس بازگشت.",
  },
  withdraw: {
    title: "انصراف از بازبینی",
    subtitle: "خارج کردن گزاره از صف بازبینی و بازگشت به پیش‌نویس",
    notesLabel: "دلیل انصراف (اختیاری)",
    notesRequired: false,
    submitLabel: "تأیید انصراف از بازبینی",
    variant: "secondary",
    icon: RotateCcw,
    successMessage: "انصراف از بازبینی با موفقیت ثبت شد.",
  },
};

export function AssertionReviewWorkflowModal({
  assertionId,
  assertionKey,
  mode,
  onClose,
  onSuccess,
}: AssertionReviewWorkflowModalProps) {
  const submitMutation = useSubmitAssertionReview();
  const decisionMutation = useRecordReviewDecision();
  const withdrawMutation = useWithdrawAssertionReview();

  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isOpen = Boolean(mode);
  const config = mode ? MODE_CONFIG[mode] : null;
  const isPending =
    submitMutation.isPending || decisionMutation.isPending || withdrawMutation.isPending;

  useEffect(() => {
    if (isOpen) {
      setNotes("");
      setConfirmed(false);
      setValidationError(null);
      submitMutation.reset();
      decisionMutation.reset();
      withdrawMutation.reset();
    }
  }, [isOpen, mode, assertionId]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || !config) return;
    setValidationError(null);

    const trimmedNotes = notes.trim();
    if (config.notesRequired && !trimmedNotes) {
      setValidationError("ثبت توضیح یا دلیل برای این عملیات الزامی است.");
      return;
    }
    if (!confirmed) {
      setValidationError("لطفاً تأیید صریح انجام عملیات را علامت بزنید.");
      return;
    }

    try {
      if (mode === "submit") {
        await submitMutation.mutateAsync({
          id: assertionId,
          body: trimmedNotes ? { notes: trimmedNotes } : undefined,
        });
      } else if (mode === "withdraw") {
        await withdrawMutation.mutateAsync({
          id: assertionId,
          body: trimmedNotes ? { reason: trimmedNotes } : undefined,
        });
      } else {
        const decision: ReviewDecision = mode;
        await decisionMutation.mutateAsync({
          id: assertionId,
          body: {
            decision,
            ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          },
        });
      }

      onSuccess?.(config.successMessage);
      onClose();
    } catch {
      // Surfaced via mutation error state
    }
  };

  const activeError =
    submitMutation.error ?? decisionMutation.error ?? withdrawMutation.error;
  const apiError =
    activeError instanceof Error
      ? activeError.message
      : activeError
        ? "خطا در اجرای عملیات بازبینی"
        : null;

  if (!config) return null;
  const Icon = config.icon;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              {config.title}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
              {assertionKey}
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {config.subtitle}
          </p>

          {config.warningText && (
            <Alert variant="warning" title="نکته مهم">
              <div className="flex items-start gap-2 text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{config.warningText}</span>
              </div>
            </Alert>
          )}

          {(validationError || apiError) && (
            <Alert variant="error" title="خطا">
              <span className="text-xs sm:text-sm">{validationError || apiError}</span>
            </Alert>
          )}

          <div>
            <label
              htmlFor="review-workflow-notes"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              {config.notesLabel}
            </label>
            <textarea
              id="review-workflow-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="توضیحات یا یادداشت بازبینی را وارد کنید..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              required={config.notesRequired}
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/50 cursor-pointer text-xs text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-[var(--color-border)] text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)]"
            />
            <span>تأیید می‌کنم که قصد ثبت این اقدام در تاریخچه Assertion را دارم.</span>
          </label>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={isPending}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            variant={config.variant}
            size="sm"
            isLoading={isPending}
            disabled={isPending || !confirmed}
          >
            {config.submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
