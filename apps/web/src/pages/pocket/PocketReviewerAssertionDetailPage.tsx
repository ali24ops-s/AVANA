import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  BookOpen,
  ExternalLink,
  History,
  Stethoscope,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { PageHeader, Button, Alert, Card, LoadingState } from "../../components/ui/index.js";
import { AdminStatusBadge } from "../../components/admin/AdminUI.js";
import { AggregateTypeBadge } from "../../components/pocket/AggregateTypeBadge.js";
import {
  ClinicalVerificationModal,
  type ClinicalVerificationModalMode,
} from "../../components/pocket/ClinicalVerificationModals.js";
import { usePocketReviewerAssertionDetail } from "../../hooks/usePocketAssertions.js";
import { usePocketPermissions } from "../../hooks/usePocketPermissions.js";
import { formatPersianExamDateTime } from "../../utils/date.js";

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  draft: "پیش‌نویس",
  in_review: "در انتظار بازبینی",
  reviewed: "بازبینی‌شده (آماده داوری)",
  verified: "تأییدشده بالینی",
  published: "منتشرشده",
  superseded: "منسوخ‌شده",
  retired: "بازنشسته",
};

const WORKFLOW_STATUS_COLOR_MAP: Record<string, string> = {
  "بازبینی‌شده (آماده داوری)": "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
  "تأییدشده بالینی": "text-teal-600 dark:text-teal-300 bg-teal-500/10 border-teal-500/20",
  منتشرشده: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
};

function isSafeExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function PocketReviewerAssertionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canVerify, isLoading: isPermLoading } = usePocketPermissions();
  const [modalMode, setModalMode] = useState<ClinicalVerificationModalMode | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketReviewerAssertionDetail(id, {
    enabled: !isPermLoading && canVerify,
  });

  if (isPermLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex justify-center" dir="rtl">
        <LoadingState message="در حال بررسی اعتبارنامه داوری بالینی..." />
      </div>
    );
  }

  if (!canVerify) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-4" dir="rtl">
        <Alert variant="error" title="دسترسی محدود">
          <div className="flex items-start gap-2.5 text-sm leading-relaxed">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              ثبت رأی بالینی و مشاهده جزئیات داوری فقط برای داوران دارای اعتبارنامه بالینی فعال
              و معتبر مجاز است.
            </span>
          </div>
        </Alert>
      </div>
    );
  }

  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت جزئیات Assertion برای داوری";

  const canVoteOnStatus =
    data &&
    (data.assertion.status === "reviewed" ||
      data.assertion.status === "verified" ||
      data.assertion.status === "published");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6" dir="rtl">
      <PageHeader
        title="بررسی و داوری بالینی Assertion"
        badge={{
          text: "میز کار داور بالینی",
          icon: <Stethoscope className="w-3.5 h-3.5" />,
        }}
        description="بررسی مستندات علمی، منابع، وضعیت Resolver و ثبت رأی مستقل بالینی"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/pocket/reviewer-workbench"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
            >
              <ArrowRight className="w-4 h-4" />
              <span>بازگشت به صف داوری</span>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              <span>به‌روزرسانی</span>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <LoadingState message="در حال دریافت جزئیات علمی Assertion..." />
        </div>
      ) : isError ? (
        <Alert variant="error" title="خطا در دریافت اطلاعات">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
            <span>{errorMessage}</span>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="w-4 h-4" />
              <span>تلاش مجدد</span>
            </Button>
          </div>
        </Alert>
      ) : !data ? null : (
        <div className="space-y-6">
          {successBanner && (
            <Alert variant="success" title="ثبت موفق">
              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                <span>{successBanner}</span>
                <button
                  type="button"
                  onClick={() => setSuccessBanner(null)}
                  className="underline text-xs cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </Alert>
          )}

          {/* پنل عملیات داوری بالینی */}
          {canVoteOnStatus && (
            <Card className="p-4 sm:p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-[var(--color-text)]">
                    ثبت تصمیم داوری بالینی
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {data.myLatestVote
                      ? `آخرین رأی ثبت‌شده شما: ${
                          data.myLatestVote.verificationAction === "clinical_verified"
                            ? "تأیید بالینی"
                            : "رد بالینی"
                        } (${toPersianDigits(formatPersianExamDateTime(data.myLatestVote.verifiedAt))})`
                      : "هنوز رأی بالینی از طرف شما برای این نسخه ثبت نشده است."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setModalMode("verify")}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>ثبت تأیید بالینی</span>
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setModalMode("reject_verification")}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>ثبت رد بالینی</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModalMode("conflict")}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>ثبت Conflict</span>
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* اطلاعات اصلی Assertion */}
          <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
              <div>
                <span className="font-mono text-sm font-bold text-[var(--color-text)]" dir="ltr">
                  {data.assertion.assertionKey}
                </span>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  موجودیت مرتبط: {data.assertion.aggregateTitleFa || data.assertion.aggregateTitleEn || data.assertion.aggregateId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AggregateTypeBadge type={data.assertion.aggregateType} size="sm" />
                <AdminStatusBadge
                  status={WORKFLOW_STATUS_LABELS[data.assertion.status] ?? data.assertion.status}
                  colorMap={WORKFLOW_STATUS_COLOR_MAP}
                />
              </div>
            </div>

            <p className="text-sm sm:text-base text-[var(--color-text)] leading-relaxed bg-[var(--color-surface-warm)]/40 p-4 rounded-xl border border-[var(--color-border)]">
              {data.assertion.statementText}
            </p>
          </Card>

          {/* وضعیت Resolver و Quorum */}
          <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              وضعیت اعتبارسنجی بالینی (Resolver)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">تأییدهای معتبر / موردنیاز</span>
                <span className="text-base font-black text-[var(--color-text)]">
                  {toPersianDigits(data.clinicalSummary.validApprovalCount)} از{" "}
                  {toPersianDigits(data.clinicalSummary.requiredApprovals)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">وضعیت Quorum</span>
                <span className="font-bold text-[var(--color-text)]">
                  {data.clinicalSummary.quorumSatisfied ? "تکمیل‌شده" : "در انتظار تکمیل"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">Conflict فعال</span>
                <span className="font-bold text-[var(--color-text)]">
                  {data.clinicalSummary.hasActiveConflict ? "دارد" : "ندارد"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">Safety Override</span>
                <span className="font-bold text-[var(--color-text)]">
                  {data.clinicalSummary.hasActiveSafetyOverride ? "فعال (مسدود)" : "غیرفعال"}
                </span>
              </div>
            </div>

            {data.conflicts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[var(--color-text)]">
                  تعارض‌های ثبت‌شده ({toPersianDigits(data.conflicts.length)})
                </h3>
                {data.conflicts.map((conf) => (
                  <div
                    key={conf.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      conf.status === "active_discrepancy"
                        ? "border-rose-500/20 bg-rose-500/5"
                        : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--color-text)]">{conf.conflictSubject}</span>
                      <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                        {conf.status === "active_discrepancy"
                          ? "تعارض فعال"
                          : conf.status === "resolved"
                            ? "حل‌شده (نیازمند تأیید مجدد)"
                            : "ردشده / بی‌موضوع"}
                      </span>
                    </div>
                    {conf.discrepancyDescription && (
                      <p className="text-[var(--color-text)]">{conf.discrepancyDescription}</p>
                    )}
                    {conf.resolutionNotes && (
                      <p className="text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)]/60">
                        توضیحات بررسی: {conf.resolutionNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* منابع و تاریخچه */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-3">
              <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--color-primary-default)]" />
                <span>منابع و استنادات ({toPersianDigits(data.citations.length)})</span>
              </h2>
              {data.citations.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">منبعی ثبت نشده است.</p>
              ) : (
                data.citations.map((cit) => (
                  <div
                    key={cit.id}
                    className="p-3 rounded-xl border border-[var(--color-border)] text-xs space-y-1"
                  >
                    <div className="font-bold text-[var(--color-text)]">{cit.sourceTitle}</div>
                    <div className="text-[var(--color-text-muted)]">
                      {cit.publisher} · {cit.locationReference}
                    </div>
                    {isSafeExternalUrl(cit.canonicalUrl) && (
                      <a
                        href={cit.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--color-primary-default)] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>مشاهده منبع</span>
                      </a>
                    )}
                  </div>
                ))
              )}
            </Card>

            <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-3">
              <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--color-primary-default)]" />
                <span>تاریخچه و یادداشت‌های بالینی ({toPersianDigits(data.history.length)})</span>
              </h2>
              {data.history.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">رویدادی ثبت نشده است.</p>
              ) : (
                data.history.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl border border-[var(--color-border)] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--color-text)]">{ev.action}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {toPersianDigits(formatPersianExamDateTime(ev.createdAt))}
                      </span>
                    </div>
                    {ev.clinicalNotes && (
                      <p className="text-[var(--color-text)] bg-[var(--color-surface-warm)]/40 p-2 rounded-lg">
                        {ev.clinicalNotes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}

      {data && (
        <ClinicalVerificationModal
          assertionId={data.assertion.id}
          assertionKey={data.assertion.assertionKey}
          parentVerificationId={data.myLatestVote?.id ?? null}
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSuccess={(msg) => {
            setSuccessBanner(msg);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
