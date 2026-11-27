import React, { useState, useEffect } from "react";
import { ShieldCheck, XCircle, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../ui/index.js";
import {
  useVerifyAssertion,
  useRejectAssertionVerification,
  useRecordClinicalConflict,
} from "../../hooks/usePocketVerifications.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClinicalVerificationModalMode = "verify" | "reject_verification" | "conflict";

export interface ClinicalVerificationModalProps {
  assertionId: string;
  assertionKey: string;
  parentVerificationId?: string | null;
  mode: ClinicalVerificationModalMode | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export function ClinicalVerificationModal({
  assertionId,
  assertionKey,
  parentVerificationId = null,
  mode,
  onClose,
  onSuccess,
}: ClinicalVerificationModalProps) {
  const verifyMutation = useVerifyAssertion();
  const rejectMutation = useRejectAssertionVerification();
  const conflictMutation = useRecordClinicalConflict();

  const [clinicalNotes, setClinicalNotes] = useState("");
  const [assertionBId, setAssertionBId] = useState("");
  const [conflictSubject, setConflictSubject] = useState("");
  const [discrepancyDescription, setDiscrepancyDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isOpen = Boolean(mode);
  const isPending =
    verifyMutation.isPending || rejectMutation.isPending || conflictMutation.isPending;

  useEffect(() => {
    if (isOpen) {
      setClinicalNotes("");
      setAssertionBId("");
      setConflictSubject("");
      setDiscrepancyDescription("");
      setConfirmed(false);
      setValidationError(null);
      verifyMutation.reset();
      rejectMutation.reset();
      conflictMutation.reset();
    }
  }, [isOpen, mode, assertionId]);

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setValidationError(null);

    if (mode === "conflict") {
      const trimmedB = assertionBId.trim();
      const trimmedSubject = conflictSubject.trim();
      const trimmedDesc = discrepancyDescription.trim();

      if (!trimmedB || !UUID_REGEX.test(trimmedB)) {
        setValidationError("شناسه Assertion مقابل (UUID) معتبر الزامی است.");
        return;
      }
      if (trimmedB === assertionId) {
        setValidationError("ثبت تعارض بین یک Assertion و خودش مجاز نیست.");
        return;
      }
      if (!trimmedSubject) {
        setValidationError("موضوع تعارض بالینی الزامی است.");
        return;
      }
      if (!trimmedDesc) {
        setValidationError("شرح دقیق تناقض یا اختلاف بالینی الزامی است.");
        return;
      }
      if (!confirmed) {
        setValidationError("لطفاً تأیید صریح ثبت تعارض را علامت بزنید.");
        return;
      }

      try {
        await conflictMutation.mutateAsync({
          assertionAId: assertionId,
          assertionBId: trimmedB,
          conflictSubject: trimmedSubject,
          discrepancyDescription: trimmedDesc,
        });
        onSuccess?.("تعارض بالینی با موفقیت ثبت شد و در ارزیابی Resolver اعمال گردید.");
        onClose();
      } catch {
        // Surfaced via conflictMutation.error
      }
      return;
    }

    const trimmedNotes = clinicalNotes.trim();
    if (!trimmedNotes) {
      setValidationError("ثبت یادداشت علمی و استدلال بالینی برای رأی داوری الزامی است.");
      return;
    }
    if (!confirmed) {
      setValidationError("لطفاً تأیید صریح ثبت رأی بالینی را علامت بزنید.");
      return;
    }

    try {
      if (mode === "verify") {
        await verifyMutation.mutateAsync({
          id: assertionId,
          body: {
            clinicalReviewNotes: trimmedNotes,
            parentVerificationId,
          },
        });
        onSuccess?.("تأیید بالینی (clinical_verified) با موفقیت به صورت append-only ثبت شد.");
      } else {
        await rejectMutation.mutateAsync({
          id: assertionId,
          body: {
            clinicalReviewNotes: trimmedNotes,
            parentVerificationId,
          },
        });
        onSuccess?.("رد بالینی (clinical_rejected) با موفقیت به صورت append-only ثبت شد.");
      }
      onClose();
    } catch {
      // Surfaced via mutation error state
    }
  };

  const activeError =
    verifyMutation.error ?? rejectMutation.error ?? conflictMutation.error;
  const apiError =
    activeError instanceof Error
      ? activeError.message
      : activeError
        ? "خطا در ثبت عملیات بالینی"
        : null;

  if (!mode) return null;

  const isVerify = mode === "verify";
  const isReject = mode === "reject_verification";
  const isConflict = mode === "conflict";

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} maxWidth="md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isVerify
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }`}
          >
            {isVerify ? (
              <ShieldCheck className="w-5 h-5" />
            ) : isReject ? (
              <XCircle className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              {isVerify
                ? "ثبت تأیید بالینی (Clinical Verification)"
                : isReject
                  ? "ثبت رد بالینی (Clinical Rejection)"
                  : "ثبت تعارض بالینی (Clinical Conflict)"}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
              {assertionKey}
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="space-y-4">
          <Alert variant={isVerify ? "info" : "warning"} title="توضیح حاکمیتی">
            <span className="text-xs leading-relaxed">
              {isVerify
                ? "رأی شما به‌صورت مستقل و append-only ثبت می‌شود و قابل ویرایش یا حذف نیست. وضعیت نهایی Quorum و انتشار فقط توسط Resolver و Backend تعیین می‌شود."
                : isReject
                  ? "رد بالینی (clinical_rejected) یک رأی رسمی در زنجیره داوری بالینی است و با رد بازبینی اولیه تفاوت دارد. این رأی به‌صورت append-only ثبت شده و مانع اعتبارسنجی بالینی می‌شود."
                  : "ثبت تعارض بالینی بین دو گزاره، وضعیت حل‌نشده ایجاد کرده و از طریق Resolver مانع انتشار یا اعتبار بالینی آن‌ها می‌شود."}
            </span>
          </Alert>

          {(validationError || apiError) && (
            <Alert variant="error" title="خطا">
              <span className="text-xs sm:text-sm">{validationError || apiError}</span>
            </Alert>
          )}

          {isConflict ? (
            <>
              <div>
                <label
                  htmlFor="conflict-assertion-b"
                  className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
                >
                  شناسه Assertion متعارض (UUID) *
                </label>
                <input
                  id="conflict-assertion-b"
                  type="text"
                  dir="ltr"
                  value={assertionBId}
                  onChange={(e) => setAssertionBId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-mono text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="conflict-subject"
                  className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
                >
                  موضوع تعارض *
                </label>
                <input
                  id="conflict-subject"
                  type="text"
                  value={conflictSubject}
                  onChange={(e) => setConflictSubject(e.target.value)}
                  placeholder="مثال: تناقض در دوز مصرفی یا منع مصرف"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="conflict-description"
                  className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
                >
                  شرح دقیق اختلاف بالینی *
                </label>
                <textarea
                  id="conflict-description"
                  rows={3}
                  value={discrepancyDescription}
                  onChange={(e) => setDiscrepancyDescription(e.target.value)}
                  placeholder="تناقض مشاهده‌شده بین دو گزاره را با استناد به شواهد شرح دهید..."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <label
                htmlFor="clinical-verification-notes"
                className="block text-xs sm:text-sm font-bold text-[var(--color-text)] mb-1.5"
              >
                {isVerify
                  ? "یادداشت ارزیابی شواهد بالینی *"
                  : "نقد علمی و دلیل رد بالینی *"}
              </label>
              <textarea
                id="clinical-verification-notes"
                rows={4}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder={
                  isVerify
                    ? "خلاصه ارزیابی منابع علمی و انطباق بالینی را ثبت کنید..."
                    : "اشکالات علمی، مغایرت با گایدلاین یا ریسک ایمنی را شرح دهید..."
                }
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]"
                required
              />
            </div>
          )}

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/50 cursor-pointer text-xs text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-[var(--color-border)] text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)]"
            />
            <span>
              تأیید می‌کنم که این اقدام با مسئولیت تخصصی اینجانب و به‌صورت غیرقابل ویرایش (append-only)
              ثبت می‌شود.
            </span>
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
            variant={isVerify ? "primary" : "danger"}
            size="sm"
            isLoading={isPending}
            disabled={isPending || !confirmed}
          >
            {isVerify
              ? "ثبت تأیید بالینی"
              : isReject
                ? "ثبت رد بالینی"
                : "ثبت تعارض بالینی"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
