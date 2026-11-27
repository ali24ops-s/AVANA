import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShieldCheck,
  Layers,
  Globe,
  Users,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import {
  PocketPageHeader,
  AggregateTypeBadge,
  VerificationBadge,
} from "../../components/pocket/index.js";
import {
  Card,
  Button,
  Skeleton,
  Alert,
  Dialog,
  DialogFooter,
} from "../../components/ui/index.js";
import { usePocketAssertion } from "../../hooks/usePocketAssertion.js";
import {
  usePocketVerifications,
  useVerifyAssertion,
  useRejectAssertionVerification,
  useRecordClinicalConflict,
} from "../../hooks/usePocketVerifications.js";
import { usePocketPermissions } from "../../hooks/usePocketPermissions.js";

export function PocketAssertionDetailPage() {
  const { id } = useParams<{ id: string }>();

  // 1. Fetch published assertion
  const {
    data: assertion,
    isLoading: isAssertionLoading,
    error: assertionError,
    refetch: refetchAssertion,
  } = usePocketAssertion(id);

  // 2. Fetch verifications & conflicts (backend enforces privacy)
  const {
    data: verificationsData,
    isLoading: isVerificationsLoading,
    refetch: refetchVerifications,
  } = usePocketVerifications(id);

  // 3. Clinical permissions
  const permissions = usePocketPermissions();
  const canVerify = permissions.canVerify;

  // Modals state for authorized clinical reviewers
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  const [reviewNotes, setReviewNotes] = useState("");
  const [conflictSubject, setConflictSubject] = useState("");
  const [conflictDescription, setConflictDescription] = useState("");
  const [conflictTargetId, setConflictTargetId] = useState("");

  const verifyMutation = useVerifyAssertion();
  const rejectMutation = useRejectAssertionVerification();
  const conflictMutation = useRecordClinicalConflict();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !reviewNotes.trim()) return;
    try {
      await verifyMutation.mutateAsync({
        id,
        body: { clinicalReviewNotes: reviewNotes.trim() },
      });
      setVerifyModalOpen(false);
      setReviewNotes("");
      void refetchVerifications();
    } catch {
      // Error handled by mutation state
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !reviewNotes.trim()) return;
    try {
      await rejectMutation.mutateAsync({
        id,
        body: { clinicalReviewNotes: reviewNotes.trim() },
      });
      setRejectModalOpen(false);
      setReviewNotes("");
      void refetchVerifications();
    } catch {
      // Error handled by mutation state
    }
  };

  const handleRecordConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !conflictSubject.trim() || !conflictTargetId.trim()) return;
    try {
      await conflictMutation.mutateAsync({
        assertionAId: id,
        assertionBId: conflictTargetId.trim(),
        conflictSubject: conflictSubject.trim(),
        discrepancyDescription: conflictDescription.trim(),
      });
      setConflictModalOpen(false);
      setConflictSubject("");
      setConflictDescription("");
      setConflictTargetId("");
      void refetchVerifications();
    } catch {
      // Error handled by mutation state
    }
  };

  const isLoading = isAssertionLoading || isVerificationsLoading;
  const isError = Boolean(assertionError);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6" dir="rtl">
        <Skeleton height={28} width="50%" className="mb-4" />
        <Skeleton height={140} width="100%" className="mb-6 rounded-[20px]" />
        <Skeleton height={180} width="100%" className="rounded-[20px]" />
      </div>
    );
  }

  if (isError || !assertion) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
        <Alert
          variant="error"
          title="بیانیه علمی یافت نشد"
        >
          ادعای علمی مورد نظر ممکن است در وضعیت پیش‌نویس، منسوخ‌شده، یا بازنشسته باشد و یا شناسه واردشده صحیح نباشد.
        </Alert>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refetchAssertion()}
            className="text-xs font-semibold text-[#008080] hover:underline"
          >
            تلاش مجدد
          </button>
          <span className="text-slate-300">|</span>
          <Link to="/pocket" className="text-xs text-[var(--color-text-secondary)] hover:underline">
            بازگشت به خانه پاکت
          </Link>
        </div>
      </div>
    );
  }

  const verifications = verificationsData?.verifications ?? [];
  const conflicts = verificationsData?.conflicts ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <PocketPageHeader
        title={`بیانیه علمی: ${assertion.assertionKey}`}
        subtitle={`مربوط به رکن ${assertion.aggregateType} | شناسه ریشه ادعا: ${assertion.assertionRootId}`}
        badge={
          <div className="flex items-center gap-2">
            <AggregateTypeBadge type={assertion.aggregateType} size="md" />
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)] font-mono font-medium border border-slate-200 dark:border-slate-700">
              <Layers className="w-3 h-3 text-[#008080]" />
              نگارش {assertion.versionNumber}
            </span>
            <VerificationBadge
              isVerified={assertion.isClinicallyVerified}
              verifiedAt={assertion.verifiedAt}
              size="md"
            />
          </div>
        }
        breadcrumbs={[
          { label: "خانه پاکت", to: "/pocket" },
          {
            label: `موجودیت ${assertion.aggregateType}`,
            to: `/pocket/${assertion.aggregateType}/${assertion.aggregateId}`,
          },
          { label: assertion.assertionKey },
        ]}
        backLink={{
          to: `/pocket/${assertion.aggregateType}/${assertion.aggregateId}`,
          label: "بازگشت به موجودیت والد",
        }}
        actions={
          canVerify ? (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setVerifyModalOpen(true)}
                className="gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تأیید بالینی</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectModalOpen(true)}
                className="gap-1.5 text-rose-600 border-rose-300 dark:border-rose-800 hover:bg-rose-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>رد اعتبارسنجی</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConflictModalOpen(true)}
                className="gap-1.5 text-amber-600 border-amber-300 dark:border-amber-800 hover:bg-amber-50"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>ثبت تضاد علمی</span>
              </Button>
            </div>
          ) : null
        }
      />

      {/* Statement Card */}
      <Card className="p-6 md:p-8 rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] mb-8 shadow-xs">
        <div className="mb-4">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            نوع بیانیه: {assertion.assertionType}
          </span>
        </div>

        <p className="text-base md:text-lg font-medium text-[var(--color-text-primary)] leading-relaxed mb-6">
          {assertion.statementText}
        </p>

        {/* Clinical Scopes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#008080]" />
            <span>جامعه هدف: <strong className="text-[var(--color-text-primary)]">{assertion.targetPopulation}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#008080]" />
            <span>محیط بالینی: <strong className="text-[var(--color-text-primary)]">{assertion.clinicalSetting}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#008080]" />
            <span>حوزه قضایی: <strong className="text-[var(--color-text-primary)]">{assertion.jurisdiction}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#008080]" />
            <span>
              تاریخ انتشار:{" "}
              <strong className="text-[var(--color-text-primary)]">
                {new Date(assertion.publishedAt).toLocaleDateString("fa-IR")}
              </strong>
            </span>
          </div>
          {assertion.validUntilDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span>
                اعتبار تا:{" "}
                <strong className="text-[var(--color-text-primary)]">
                  {new Date(assertion.validUntilDate).toLocaleDateString("fa-IR")}
                </strong>
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Clinical Verifications Section */}
      <section className="mb-10" aria-label="تأییدیه‌های داوران بالینی">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              سوابق اعتبارسنجی بالینی (Clinical Verifications)
            </h2>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
            {verifications.length} رکورد تأیید
          </span>
        </div>

        {verifications.length === 0 ? (
          <div className="p-5 rounded-[16px] bg-slate-50 dark:bg-slate-900/40 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] text-center">
            این ادعای علمی بدون نود اعتبارسنجی مستقل یا مستقیماً از طریق اسنپ‌شات اولیه منتشر گردیده است.
          </div>
        ) : (
          <div className="space-y-3">
            {verifications.map((v) => {
              const formattedDate = v.verifiedAt
                ? new Date(v.verifiedAt).toLocaleDateString("fa-IR")
                : "نامشخص";

              return (
                <div
                  key={v.id}
                  className="p-4 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-[var(--color-text-primary)]">
                        اقدام: {v.verificationAction === "clinical_verified" ? "تأیید بالینی مصوب" : v.verificationAction}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 font-medium">
                        داور بالینی معتبر AVANA
                      </span>
                    </div>
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">
                      تاریخ اعتبارسنجی: {formattedDate}
                    </span>
                  </div>

                  {/* Privileged review notes (only displayed if returned by backend to authorized reviewers) */}
                  {v.clinicalReviewNotes && (
                    <div className="mt-2 p-3 rounded-[12px] bg-slate-50 dark:bg-slate-900 border border-[var(--color-border)] text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      <strong className="text-[var(--color-text-primary)] block mb-1">
                        یادداشت تخصصی داور (Privileged Reviewer Critique):
                      </strong>
                      {v.clinicalReviewNotes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Clinical Conflicts Section */}
      <section aria-label="تضادهای بالینی">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              هشدارهای تضاد و تناقض علمی (Clinical Conflicts)
            </h2>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
            {conflicts.length} مورد ثبت‌شده
          </span>
        </div>

        {conflicts.length === 0 ? (
          <div className="p-5 rounded-[16px] bg-slate-50 dark:bg-slate-900/40 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] text-center">
            هیچ تضاد علمی ثبت‌شده‌ای برای این بیانیه گزارش نشده است.
          </div>
        ) : (
          <div className="space-y-3">
            {conflicts.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-[16px] bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 shadow-xs flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      موضوع تضاد: {c.conflictSubject}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono">
                      وضعیت: {c.status}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[var(--color-text-muted)]">
                    ثبت: {new Date(c.createdAt).toLocaleDateString("fa-IR")}
                  </span>
                </div>

                {/* Privileged discrepancy description (only rendered if returned by backend) */}
                {c.discrepancyDescription && (
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mt-1">
                    {c.discrepancyDescription}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Privileged Dialogs for Clinical Reviewers */}
      {canVerify && (
        <>
          {/* Verify Modal */}
          <Dialog
            isOpen={verifyModalOpen}
            onClose={() => setVerifyModalOpen(false)}
            title="تأیید بالینی بیانیه علمی"
            description="به عنوان داور بالینی معتبر، ارزیابی شواهد و انطباق این بیانیه با آخرین مراجع پزشکی را ثبت نمایید."
            maxWidth="md"
          >
            <form onSubmit={handleVerify}>
              <div className="py-3">
                <label htmlFor="verify-notes-input" className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                  یادداشت بالینی و مبانی شواهد (الزامی):
                </label>
                <textarea
                  id="verify-notes-input"
                  rows={4}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="شواهد ارزیابی‌شده و دلایل صحت علمی دوزاژ/راهنما..."
                  className="w-full p-2.5 rounded-[10px] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:border-[#008080]"
                  required
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVerifyModalOpen(false)}
                  disabled={verifyMutation.isPending}
                >
                  انصراف
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!reviewNotes.trim() || verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? "در حال ثبت..." : "تأیید نهایی بالینی"}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>

          {/* Reject Verification Modal */}
          <Dialog
            isOpen={rejectModalOpen}
            onClose={() => setRejectModalOpen(false)}
            title="رد اعتبارسنجی بیانیه علمی"
            description="در صورت وجود ایراد علمی یا خطای دارویی، نقد تفصیلی خود را ثبت نمایید تا بیانیه به وضعیت پیش‌نویس بازگردد."
            maxWidth="md"
          >
            <form onSubmit={handleReject}>
              <div className="py-3">
                <label htmlFor="reject-notes-input" className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                  شرح اشکال علمی و دلایل رد (الزامی):
                </label>
                <textarea
                  id="reject-notes-input"
                  rows={4}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="توضیح تعارض با گایدلاین، خطای دوز، عدم تطابق فارماکوکینتیک..."
                  className="w-full p-2.5 rounded-[10px] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:border-rose-500"
                  required
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={rejectMutation.isPending}
                >
                  انصراف
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  disabled={!reviewNotes.trim() || rejectMutation.isPending}
                >
                  {rejectMutation.isPending ? "در حال ثبت..." : "ثبت رد اعتبارسنجی"}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>

          {/* Conflict Modal */}
          <Dialog
            isOpen={conflictModalOpen}
            onClose={() => setConflictModalOpen(false)}
            title="ثبت تضاد و تناقض علمی (Clinical Conflict)"
            description="ثبت تناقض میان این بیانیه و بیانیه علمی دیگر جهت شفاف‌سازی بالینی."
            maxWidth="md"
          >
            <form onSubmit={handleRecordConflict}>
              <div className="py-3 space-y-3">
                <div>
                  <label htmlFor="conflict-target-id-input" className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                    شناسه بیانیه متناقض (Assertion B ID):
                  </label>
                  <input
                    id="conflict-target-id-input"
                    type="text"
                    value={conflictTargetId}
                    onChange={(e) => setConflictTargetId(e.target.value)}
                    placeholder="UUID بیانیه متناقض..."
                    className="w-full p-2 rounded-[10px] border border-[var(--color-border)] text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:border-[#008080]"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="conflict-subject-input" className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                    موضوع تضاد:
                  </label>
                  <input
                    id="conflict-subject-input"
                    type="text"
                    value={conflictSubject}
                    onChange={(e) => setConflictSubject(e.target.value)}
                    placeholder="مثال: تناقض در دوز ماکزیمم روزانه با UpToDate"
                    className="w-full p-2 rounded-[10px] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:border-[#008080]"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="conflict-desc-input" className="block text-xs font-bold text-[var(--color-text-primary)] mb-1">
                    شرح تفصیلی اختلاف بالینی:
                  </label>
                  <textarea
                    id="conflict-desc-input"
                    rows={3}
                    value={conflictDescription}
                    onChange={(e) => setConflictDescription(e.target.value)}
                    placeholder="توضیحات تکمیلی اختلاف..."
                    className="w-full p-2.5 rounded-[10px] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] bg-[var(--color-surface)] focus:outline-none focus:border-[#008080]"
                    required
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConflictModalOpen(false)}
                  disabled={conflictMutation.isPending}
                >
                  انصراف
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    !conflictSubject.trim() ||
                    !conflictTargetId.trim() ||
                    conflictMutation.isPending
                  }
                >
                  {conflictMutation.isPending ? "در حال ثبت..." : "ثبت تضاد"}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>
        </>
      )}
    </div>
  );
}
