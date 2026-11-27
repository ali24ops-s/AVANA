import React, { useState, useEffect } from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../../ui/index.js";
import { useActivateSafetyOverride } from "../../../hooks/usePocketSafetyOverrides.js";
import type { SafetyOverrideTargetType } from "../../../lib/api/pocket.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TARGET_TYPE_OPTIONS: Array<{ value: SafetyOverrideTargetType; label: string }> = [
  { value: "assertion", label: "گزاره علمی (Assertion)" },
  { value: "drug", label: "دارو (Drug)" },
  { value: "disease", label: "بیماری (Disease)" },
  { value: "treatment", label: "درمان (Treatment)" },
  { value: "emergency", label: "فوریت پزشکی (Emergency)" },
];

export interface ActivateSafetyOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ActivateSafetyOverrideModal({
  isOpen,
  onClose,
  onSuccess,
}: ActivateSafetyOverrideModalProps) {
  const activateMutation = useActivateSafetyOverride();

  const [targetEntityType, setTargetEntityType] = useState<SafetyOverrideTargetType>("assertion");
  const [targetEntityId, setTargetEntityId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetEntityType("assertion");
      setTargetEntityId("");
      setReason("");
      setConfirmed(false);
      setValidationError(null);
      activateMutation.reset();
    }
  }, [isOpen]);

  const handleClose = () => {
    if (activateMutation.isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedId = targetEntityId.trim();
    const trimmedReason = reason.trim();

    if (!trimmedId || !UUID_REGEX.test(trimmedId)) {
      setValidationError("شناسه موجودیت هدف باید یک UUID معتبر باشد.");
      return;
    }
    if (!trimmedReason) {
      setValidationError("ثبت دلیل بالینی یا عملیاتی برای فعال‌سازی Safety Override الزامی است.");
      return;
    }
    if (!confirmed) {
      setValidationError("لطفاً تأییدیه صریح پیامدهای این عملیات را علامت بزنید.");
      return;
    }

    try {
      await activateMutation.mutateAsync({
        targetEntityType,
        targetEntityId: trimmedId,
        reason: trimmedReason,
      });
      onSuccess?.();
      onClose();
    } catch {
      // Error surfaced via activateMutation.error
    }
  };

  const apiError =
    activateMutation.error instanceof Error
      ? activateMutation.error.message
      : activateMutation.isError
        ? "خطا در فعال‌سازی Safety Override"
        : null;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              ایجاد و فعال‌سازی Safety Override
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              تعلیق فوری اعتبار بالینی و مسدودسازی نمایش محتوا برای مصرف‌کنندگان
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <Alert variant="warning" title="هشدار حساسیت بالا">
            <div className="flex items-start gap-2 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                فعال‌سازی Safety Override بلافاصله از طریق Resolver بالینی اعمال می‌شود و می‌تواند
                محتوای هدف (گزاره یا کل موجودیت بالینی) را از دسترس کاربران و مصرف‌کنندگان خارج کند.
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
              htmlFor="override-target-type"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              نوع موجودیت هدف *
            </label>
            <select
              id="override-target-type"
              value={targetEntityType}
              onChange={(e) => setTargetEntityType(e.target.value as SafetyOverrideTargetType)}
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
            >
              {TARGET_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="override-target-id"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              شناسه موجودیت هدف (UUID) *
            </label>
            <input
              id="override-target-id"
              type="text"
              dir="ltr"
              value={targetEntityId}
              onChange={(e) => setTargetEntityId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-mono text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              required
            />
          </div>

          <div>
            <label
              htmlFor="override-reason"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              دلیل فعال‌سازی *
            </label>
            <textarea
              id="override-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="دلیل ایمنی، هشدار دارویی یا خطای بالینی مشاهده‌شده را شرح دهید..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
              required
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 cursor-pointer text-xs text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-[var(--color-border)] text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)]"
            />
            <span>
              می‌دانم که فعال‌سازی این Safety Override ممکن است محتوای بالینی مرتبط را بلافاصله از
              دسترس مصرف‌کنندگان خارج کند و اجرای آن را تأیید می‌کنم.
            </span>
          </label>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={activateMutation.isPending}
          >
            انصراف
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            isLoading={activateMutation.isPending}
            disabled={activateMutation.isPending || !confirmed}
          >
            تأیید و فعال‌سازی Override
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
