import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../../ui/index.js";
import { useResolveClinicalConflict } from "../../../hooks/usePocketVerifications.js";
import type {
  PocketAdminAssertionConflictItem,
  ResolveConflictOutcome,
} from "../../../lib/api/pocket.js";

export interface ResolveConflictModalProps {
  conflict: PocketAdminAssertionConflictItem | null;
  onClose: () => void;
  onSuccess?: (outcome: ResolveConflictOutcome) => void;
}

export function ResolveConflictModal({
  conflict,
  onClose,
  onSuccess,
}: ResolveConflictModalProps) {
  const resolveMutation = useResolveClinicalConflict();
  const [outcome, setOutcome] = useState<ResolveConflictOutcome>("resolved");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isOpen = Boolean(conflict);
  const isPending = resolveMutation.isPending;

  useEffect(() => {
    if (isOpen) {
      setOutcome("resolved");
      setResolutionNotes("");
      setConfirmed(false);
      setValidationError(null);
      resolveMutation.reset();
    }
  }, [isOpen, conflict?.id]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conflict) return;
    setValidationError(null);

    const trimmedNotes = resolutionNotes.trim();
    if (!trimmedNotes) {
      setValidationError("ثبت توضیحات حل یا رد تعارض الزامی است.");
      return;
    }
    if (!confirmed) {
      setValidationError("لطفاً تأیید صریح انجام عملیات را علامت بزنید.");
      return;
    }

    try {
      await resolveMutation.mutateAsync({
        conflictId: conflict.id,
        body: {
          outcome,
          resolutionNotes: trimmedNotes,
        },
      });
      onSuccess?.(outcome);
      onClose();
    } catch {
      // Surfaced via resolveMutation.error
    }
  };

  const apiError =
    resolveMutation.error instanceof Error
      ? resolveMutation.error.message
      : resolveMutation.error
        ? "خطا در ثبت نتیجه بررسی تعارض"
        : null;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              تعیین تکلیف تعارض بالینی
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {conflict?.conflictSubject}
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <Alert variant="info" title="اثر تصمیم بر اعتبار بالینی">
            <div className="text-xs leading-relaxed space-y-1">
              {outcome === "resolved" ? (
                <p>
                  در حالت <strong>حل‌شده (Resolved)</strong>، تعارض واقعی بوده و برطرف شده است.
                  رأی‌های قبلی حفظ می‌شوند اما برای بازگشت اعتبار بالینی، حدنصاب کامل Quorum باید
                  مجدداً با رأی‌های پس از حل تعارض تأمین شود.
                </p>
              ) : (
                <p>
                  در حالت <strong>ردشده / بی‌موضوع (Dismissed)</strong>، گزارش تعارض فاقد موضوعیت
                  تشخیص داده می‌شود و اعتبار بالینی بر اساس رأی‌های معتبر فعلی بدون نیاز به رأی‌گیری
                  مجدد محاسبه خواهد شد.
                </p>
              )}
            </div>
          </Alert>

          {(validationError || apiError) && (
            <Alert variant="error" title="خطا">
              <span className="text-xs sm:text-sm">{validationError || apiError}</span>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setOutcome("resolved")}
              className={`p-3 rounded-xl border text-right text-xs transition-all cursor-pointer ${
                outcome === "resolved"
                  ? "border-emerald-500 bg-emerald-500/10 text-[var(--color-text)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>حل‌شده (Resolved)</span>
              </div>
              <p className="mt-1 text-[11px] opacity-80">نیازمند تأمین مجدد Quorum</p>
            </button>

            <button
              type="button"
              onClick={() => setOutcome("dismissed")}
              className={`p-3 rounded-xl border text-right text-xs transition-all cursor-pointer ${
                outcome === "dismissed"
                  ? "border-sky-500 bg-sky-500/10 text-[var(--color-text)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <XCircle className="w-4 h-4 text-sky-600" />
                <span>ردشده / بی‌موضوع (Dismissed)</span>
              </div>
              <p className="mt-1 text-[11px] opacity-80">حفظ اعتبار رأی‌های قبلی</p>
            </button>
          </div>

          <div>
            <label
              htmlFor="conflict-resolution-notes"
              className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
            >
              توضیحات حل یا رد تعارض *
            </label>
            <textarea
              id="conflict-resolution-notes"
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="دلیل علمی یا اجرایی تصمیم خود را بنویسید..."
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
              تأیید می‌کنم که این تصمیم در تاریخچه دائمی تعارض و Audit Log ثبت خواهد شد.
            </span>
          </label>
        </DialogContent>

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isPending}>
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isPending}
            disabled={isPending || !confirmed}
          >
            {outcome === "resolved" ? "تأیید و ثبت حل تعارض" : "تأیید و رد تعارض"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
