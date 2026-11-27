import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../../ui/index.js";
import { useClearSafetyOverride } from "../../../hooks/usePocketSafetyOverrides.js";
import type { SafetyOverrideRecord } from "../../../lib/api/pocket.js";

export interface ClearSafetyOverrideModalProps {
  override: SafetyOverrideRecord | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ClearSafetyOverrideModal({
  override,
  onClose,
  onSuccess,
}: ClearSafetyOverrideModalProps) {
  const clearMutation = useClearSafetyOverride();

  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isOpen = Boolean(override);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setConfirmed(false);
      setValidationError(null);
      clearMutation.reset();
    }
  }, [isOpen, override?.id]);

  const handleClose = () => {
    if (clearMutation.isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!override) return;
    setValidationError(null);

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setValidationError("ثبت دلیل لغو (Clear) Safety Override الزامی است.");
      return;
    }
    if (!confirmed) {
      setValidationError("لطفاً تأیید صریح انجام عملیات را علامت بزنید.");
      return;
    }

    try {
      await clearMutation.mutateAsync({
        id: override.id,
        body: { reason: trimmedReason },
      });
      onSuccess?.();
      onClose();
    } catch {
      // Error surfaced via clearMutation.error
    }
  };

  const apiError =
    clearMutation.error instanceof Error
      ? clearMutation.error.message
      : clearMutation.isError
        ? "خطا در لغو Safety Override"
        : null;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              پاک‌سازی (Clear) Safety Override
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
              {override?.targetEntityType}: {override?.targetEntityId}
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <Alert variant="warning" title="توجه">
            <div className="flex items-start gap-2 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                با پاک‌سازی این Override، مسدودسازی اضطراری برداشته می‌شود و وضعیت نمایش محتوا
                دوباره بر اساس ارزیابی Resolver بالینی و اعتبار داوری‌ها تعیین خواهد شد.
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
              htmlFor="clear-override-reason"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              دلیل پاک‌سازی و رفع محدودیت *
            </label>
            <textarea
              id="clear-override-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="دلیل رفع Safety Override را شرح دهید..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              required
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
              تأیید می‌کنم که بررسی‌های لازم انجام شده است و قصد پاک‌سازی این Safety Override را دارم.
            </span>
          </label>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={clearMutation.isPending}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={clearMutation.isPending}
            disabled={clearMutation.isPending || !confirmed}
          >
            تأیید و پاک‌سازی Override
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
