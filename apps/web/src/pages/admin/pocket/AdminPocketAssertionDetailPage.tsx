import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  BookOpen,
  ExternalLink,
  History,
  GitBranch,
  AlertTriangle,
  FileText,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Globe,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { PageHeader, Button, Alert, Card, LoadingState } from "../../../components/ui/index.js";
import { AdminStatusBadge } from "../../../components/admin/AdminUI.js";
import { AdminPocketNavigation } from "../../../components/admin/pocket/AdminPocketNavigation.js";
import { AggregateTypeBadge } from "../../../components/pocket/AggregateTypeBadge.js";
import {
  AssertionReviewWorkflowModal,
  type InitialReviewActionMode,
} from "../../../components/pocket/AssertionReviewWorkflowModals.js";
import { PublishAssertionModal } from "../../../components/pocket/PublishAssertionModal.js";
import { ResolveConflictModal } from "../../../components/admin/pocket/ResolveConflictModal.js";
import { usePocketAdminAssertionDetail } from "../../../hooks/usePocketAssertions.js";
import { usePocketPermissions } from "../../../hooks/usePocketPermissions.js";
import type {
  PocketAdminAssertionConflictItem,
  ScientificAssertionStatus,
} from "../../../lib/api/pocket.js";
import { formatPersianExamDate, formatPersianExamDateTime } from "../../../utils/date.js";

const CONFLICT_STATUS_LABELS: Record<string, string> = {
  active_discrepancy: "تعارض فعال",
  resolved: "حل‌شده (نیازمند تأیید مجدد)",
  dismissed: "ردشده / بی‌موضوع",
};

const CONFLICT_STATUS_COLORS: Record<string, string> = {
  "تعارض فعال": "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
  "حل‌شده (نیازمند تأیید مجدد)":
    "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  "ردشده / بی‌موضوع": "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
};

const WORKFLOW_STATUS_LABELS: Record<ScientificAssertionStatus, string> = {
  draft: "پیش‌نویس",
  in_review: "در انتظار بازبینی",
  reviewed: "بازبینی‌شده",
  verified: "تأییدشده بالینی",
  published: "منتشرشده",
  superseded: "منسوخ‌شده",
  retired: "بازنشسته",
};

const WORKFLOW_STATUS_COLOR_MAP: Record<string, string> = {
  پیش‌نویس: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
  "در انتظار بازبینی": "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
  بازبینی‌شده: "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
  "تأییدشده بالینی": "text-teal-600 dark:text-teal-300 bg-teal-500/10 border-teal-500/20",
  منتشرشده: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  منسوخ‌شده: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
  بازنشسته: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
};

const BLOCK_REASON_LABELS: Record<string, string> = {
  no_verifications: "هنوز رأی داوری بالینی ثبت نشده است",
  quorum_not_met: "حدنصاب (Quorum) داوری بالینی تکمیل نشده است",
  active_disagreement: "مخالفت فعال داور بالینی ثبت شده است",
  unresolved_clinical_conflict: "تعارض بالینی حل‌نشده وجود دارد",
  active_safety_override: "Safety Override فعال روی گزاره یا موجودیت اعمال شده است",
  all_approvals_invalidated: "تمامی تأییدهای قبلی به دلیل انقضا یا تعلیق اعتبارنامه نامعتبر شده‌اند",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  submitted_for_review: "ارسال برای بازبینی",
  review_approved: "تأیید بازبینی اولیه",
  review_rejected: "رد در بازبینی اولیه",
  review_changes_requested: "درخواست اصلاح",
  review_withdrawn: "انصراف از بازبینی",
  clinical_verified: "تأیید بالینی (Verification)",
  clinical_verification_rejected: "رد در داوری بالینی",
  published: "انتشار رسمی",
  superseded: "منسوخ‌شدن با نسخه جدید",
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

export function AdminPocketAssertionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const {
    canManageReviewers,
    canReview,
    canPublish,
    isLoading: isPermLoading,
  } = usePocketPermissions();
  const [reviewActionMode, setReviewActionMode] = useState<InitialReviewActionMode | null>(null);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [resolveConflictTarget, setResolveConflictTarget] =
    useState<PocketAdminAssertionConflictItem | null>(null);
  const [actionSuccessBanner, setActionSuccessBanner] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketAdminAssertionDetail(id, {
    enabled: !isPermLoading && canManageReviewers,
  });

  if (!isPermLoading && !canManageReviewers) {
    return (
      <div className="space-y-6" dir="rtl">
        <AdminPocketNavigation />
        <Alert variant="error" title="دسترسی محدود">
          <div className="flex items-center gap-2 text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              مشاهده جزئیات مدیریتی Assertion فقط برای مدیر کل سیستم (platform_admin) مجاز است.
            </span>
          </div>
        </Alert>
      </div>
    );
  }

  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت جزئیات Assertion";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="جزئیات Assertion بالینی"
        badge={{
          text: "AVANA Pocket",
          icon: <FileText className="w-3.5 h-3.5" />,
        }}
        description="بررسی محتوای علمی، منابع و استنادات، وضعیت اعتبارسنجی Resolver و تاریخچه تغییرات"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/admin/pocket/assertions"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>بازگشت به فهرست</span>
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

      <AdminPocketNavigation />

      {isLoading || isPermLoading ? (
        <div className="py-16 flex justify-center">
          <LoadingState message="در حال دریافت جزئیات Assertion..." />
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
      ) : !data ? (
        <Alert variant="warning" title="یافت نشد">
          <span className="text-xs sm:text-sm">Assertion مورد نظر یافت نشد.</span>
        </Alert>
      ) : (
        <div className="space-y-6">
          {actionSuccessBanner && (
            <Alert variant="success" title="عملیات موفق">
              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                <span>{actionSuccessBanner}</span>
                <button
                  type="button"
                  onClick={() => setActionSuccessBanner(null)}
                  className="underline text-xs cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </Alert>
          )}

          {/* عملیات گردش کار بازبینی اولیه (فقط برای وضعیت‌های مجاز draft / in_review) */}
          {canReview &&
            (data.assertion.status === "draft" || data.assertion.status === "in_review") && (
              <Card className="p-4 sm:p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-[var(--color-text)]">
                    عملیات گردش کار بازبینی اولیه
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {data.assertion.status === "draft"
                      ? "این گزاره در وضعیت پیش‌نویس است و می‌تواند برای بازبینی اولیه ارسال شود."
                      : "این گزاره در صف بازبینی اولیه است. تصمیم بازبین را ثبت کنید یا از بازبینی انصراف دهید."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {data.assertion.status === "draft" && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setReviewActionMode("submit")}
                    >
                      <Send className="w-4 h-4" />
                      <span>ارسال برای بازبینی</span>
                    </Button>
                  )}

                  {data.assertion.status === "in_review" && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setReviewActionMode("approve")}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تأیید بازبینی اولیه</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setReviewActionMode("request_changes")}
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>درخواست اصلاح</span>
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setReviewActionMode("reject")}
                      >
                        <XCircle className="w-4 h-4" />
                        <span>رد بازبینی</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setReviewActionMode("withdraw")}
                      >
                        <span>انصراف از بازبینی</span>
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            )}

          {/* بخش مستقل انتشار رسمی (فقط برای دارای مجوز انتشار: platform_admin) */}
          {canPublish && (() => {
            const activePublishedVersion = data.versions.find(
              (v) => v.isActivePublished && v.id !== data.assertion.id,
            );
            const isAlreadyPublished = data.assertion.status === "published";
            const isSupersededOrRetired =
              data.assertion.status === "superseded" || data.assertion.status === "retired";
            const isVerifiedStatus = data.assertion.status === "verified";
            const canTriggerPublish =
              isVerifiedStatus && data.clinicalSummary.isClinicallyVerified;

            return (
              <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                      <Globe className="w-5 h-5 text-[var(--color-primary-default)]" />
                      <span>انتشار رسمی</span>
                    </h2>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      انتشار اتمیک فقط پس از احراز تمام پیش‌شرط‌های Resolver و Quorum در Backend انجام می‌شود.
                    </p>
                  </div>

                  {isAlreadyPublished ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                      این نسخه هم‌اکنون منتشر شده است
                    </span>
                  ) : isSupersededOrRetired ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      امکان انتشار نسخه {WORKFLOW_STATUS_LABELS[data.assertion.status]} وجود ندارد
                    </span>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!canTriggerPublish}
                      onClick={() => setIsPublishModalOpen(true)}
                    >
                      <Globe className="w-4 h-4" />
                      <span>انتشار رسمی نسخه {toPersianDigits(data.assertion.versionNumber)}</span>
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block mb-1">وضعیت فعلی</span>
                    <span className="font-bold text-[var(--color-text)]">
                      {WORKFLOW_STATUS_LABELS[data.assertion.status] ?? data.assertion.status}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block mb-1">تأییدهای معتبر / Quorum</span>
                    <span className="font-bold text-[var(--color-text)]">
                      {toPersianDigits(data.clinicalSummary.validApprovalCount)} از{" "}
                      {toPersianDigits(data.clinicalSummary.requiredApprovals)} (
                      {data.clinicalSummary.quorumSatisfied ? "تکمیل" : "ناکامل"})
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block mb-1">Conflict / Override</span>
                    <span className="font-bold text-[var(--color-text)]">
                      {data.clinicalSummary.hasActiveConflict ||
                      data.clinicalSummary.hasActiveSafetyOverride
                        ? "دارای مانع فعال"
                        : "بدون مانع"}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] block mb-1">نسخه منتشرشده قبلی</span>
                    <span className="font-bold text-[var(--color-text)]">
                      {activePublishedVersion
                        ? `نسخه ${toPersianDigits(activePublishedVersion.versionNumber)} (منسوخ خواهد شد)`
                        : "ندارد"}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* بخش اول: اطلاعات اصلی Assertion */}
          <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm sm:text-base font-bold text-[var(--color-text)]" dir="ltr">
                    {data.assertion.assertionKey}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)]">
                    نسخه {toPersianDigits(data.assertion.versionNumber)}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
                  {data.assertion.id}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <AggregateTypeBadge type={data.assertion.aggregateType} size="sm" />
                <AdminStatusBadge
                  status={WORKFLOW_STATUS_LABELS[data.assertion.status] ?? data.assertion.status}
                  colorMap={WORKFLOW_STATUS_COLOR_MAP}
                />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xs font-bold text-[var(--color-text-muted)]">متن کامل Assertion</h2>
              <p className="text-sm sm:text-base text-[var(--color-text)] leading-relaxed bg-[var(--color-surface-warm)]/40 p-4 rounded-xl border border-[var(--color-border)]">
                {data.assertion.statementText}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 text-xs">
              <div>
                <span className="text-[var(--color-text-muted)] block mb-1">نوع Assertion</span>
                <span className="font-mono font-semibold text-[var(--color-text)]">
                  {data.assertion.assertionType}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block mb-1">موجودیت مرتبط</span>
                <span className="font-bold text-[var(--color-text)] block">
                  {data.assertion.aggregateTitleFa || "ثبت نشده"}
                </span>
                {data.assertion.aggregateTitleEn && (
                  <span className="text-[11px] text-[var(--color-text-muted)]" dir="ltr">
                    {data.assertion.aggregateTitleEn}
                  </span>
                )}
                <span className="text-[11px] font-mono text-[var(--color-text-muted)] block" dir="ltr">
                  {data.assertion.aggregateId}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block mb-1">تاریخ ایجاد</span>
                <span className="text-[var(--color-text)]">
                  {toPersianDigits(formatPersianExamDateTime(data.assertion.createdAt))}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block mb-1">آخرین به‌روزرسانی</span>
                <span className="text-[var(--color-text)]">
                  {toPersianDigits(formatPersianExamDateTime(data.assertion.updatedAt))}
                </span>
              </div>
            </div>
          </Card>

          {/* بخش دوم: جزئیات علمی و بالینی */}
          <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              جزئیات علمی و بالینی
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">جمعیت هدف (Target Population)</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {data.assertion.targetPopulation || "ثبت نشده"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">محیط بالینی (Clinical Setting)</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {data.assertion.clinicalSetting || "ثبت نشده"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">حوزه جغرافیایی / مرجع (Jurisdiction)</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {data.assertion.jurisdiction || "ثبت نشده"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">تاریخ اعتبار علمی</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {data.assertion.validUntilDate
                    ? toPersianDigits(formatPersianExamDate(data.assertion.validUntilDate))
                    : "ثبت نشده"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">شناسه انتشار (Release ID)</span>
                <span className="font-mono text-[var(--color-text)]" dir="ltr">
                  {data.assertion.releaseId || "ثبت نشده"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">زمان منسوخ‌شدن</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {data.assertion.supersededAt
                    ? toPersianDigits(formatPersianExamDateTime(data.assertion.supersededAt))
                    : "ثبت نشده"}
                </span>
              </div>
            </div>
          </Card>

          {/* بخش چهارم: وضعیت اعتبارسنجی بالینی (Resolver) */}
          <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>وضعیت اعتبارسنجی بالینی (Resolver)</span>
              </h2>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                  data.clinicalSummary.isClinicallyVerified
                    ? "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                    : "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20"
                }`}
              >
                {data.clinicalSummary.isClinicallyVerified ? "دارای اعتبار بالینی" : "فاقد اعتبار بالینی"}
              </span>
            </div>

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
                <span className="text-[var(--color-text-muted)] block mb-1">تعارض بالینی فعال</span>
                <span className="font-bold text-[var(--color-text)]">
                  {data.clinicalSummary.hasActiveConflict ? "دارد" : "ندارد"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block mb-1">Safety Override فعال</span>
                <span className="font-bold text-[var(--color-text)]">
                  {data.clinicalSummary.hasActiveSafetyOverride ? "فعال (مسدود)" : "غیرفعال"}
                </span>
              </div>
            </div>

            {data.clinicalSummary.verificationBlockReasons.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1.5 text-xs">
                <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>دلایل عدم اعتبار یا مسدود بودن:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[var(--color-text)]">
                  {data.clinicalSummary.verificationBlockReasons.map((reason) => (
                    <li key={reason}>{BLOCK_REASON_LABELS[reason] ?? reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.conflicts.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold text-[var(--color-text)]">
                  تعارض‌های ثبت‌شده ({toPersianDigits(data.conflicts.length)})
                </h3>
                <div className="space-y-2">
                  {data.conflicts.map((conf) => {
                    const confLabel = CONFLICT_STATUS_LABELS[conf.status] ?? conf.status;
                    return (
                      <div
                        key={conf.id}
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          conf.status === "active_discrepancy"
                            ? "border-rose-500/20 bg-rose-500/5"
                            : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-[var(--color-text)]">
                            {conf.conflictSubject}
                          </span>
                          <div className="flex items-center gap-2">
                            <AdminStatusBadge
                              status={confLabel}
                              colorMap={CONFLICT_STATUS_COLORS}
                            />
                            {canPublish && conf.status === "active_discrepancy" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setResolveConflictTarget(conf)}
                              >
                                <span>تعیین تکلیف تعارض</span>
                              </Button>
                            )}
                          </div>
                        </div>
                        {conf.discrepancyDescription && (
                          <p className="text-[var(--color-text)] leading-relaxed">
                            {conf.discrepancyDescription}
                          </p>
                        )}
                        {conf.resolvedAt && (
                          <div className="text-[11px] text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)]/60 space-y-0.5">
                            <div>
                              زمان بررسی: {toPersianDigits(formatPersianExamDateTime(conf.resolvedAt))}
                            </div>
                            {conf.resolutionNotes && (
                              <div className="text-[var(--color-text)]">
                                توضیحات: {conf.resolutionNotes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* بخش سوم: منابع و استنادات علمی */}
          <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--color-primary-default)]" />
              <span>منابع و استنادات علمی ({toPersianDigits(data.citations.length)})</span>
            </h2>

            {data.citations.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded-xl">
                هیچ استناد یا منبع علمی برای این Assertion ثبت نشده است.
              </p>
            ) : (
              <div className="space-y-3">
                {data.citations.map((cit) => {
                  const isSourceAudited = cit.sourceAuditStatus === "approved" || cit.sourceAuditStatus === "verified";
                  return (
                    <div
                      key={cit.id}
                      className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-[var(--color-text)]">{cit.sourceTitle}</h3>
                          <p className="text-[var(--color-text-muted)] mt-0.5">
                            ناشر / سازمان: {cit.publisher} · نوع: {cit.sourceType} · ویرایش:{" "}
                            {cit.editionOrVersion}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isSourceAudited
                              ? "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                              : "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20"
                          }`}
                        >
                          {isSourceAudited ? "منبع ممیزی‌شده" : `وضعیت منبع: ${cit.sourceAuditStatus}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-[var(--color-text)]">
                        <div>
                          <span className="text-[var(--color-text-muted)]">بخش / صفحه استناد: </span>
                          <span className="font-semibold">{cit.locationReference}</span>
                        </div>
                        <div>
                          <span className="text-[var(--color-text-muted)]">تاریخ انتشار: </span>
                          <span>
                            {cit.publicationDate
                              ? toPersianDigits(formatPersianExamDate(cit.publicationDate))
                              : "ثبت نشده"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--color-text-muted)]">DOI: </span>
                          <span className="font-mono" dir="ltr">
                            {cit.doi || "ثبت نشده"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {isSafeExternalUrl(cit.canonicalUrl) && (
                          <a
                            href={cit.canonicalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary-default)] hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>مشاهده منبع اصلی</span>
                          </a>
                        )}
                        {isSafeExternalUrl(cit.sourceSnapshotUrl) && (
                          <a
                            href={cit.sourceSnapshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>اسنپ‌شات استناد</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* بخش پنجم و ششم: تاریخچه و نسخه‌ها */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* تاریخچه و Timeline */}
            <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <History className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>تاریخچه و Timeline ({toPersianDigits(data.history.length)})</span>
              </h2>

              {data.history.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded-xl">
                  هیچ رویدادی در Audit Log ثبت نشده است.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.history.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 space-y-1.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[var(--color-text)]">
                          {AUDIT_ACTION_LABELS[ev.action] ?? ev.action}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {toPersianDigits(formatPersianExamDateTime(ev.createdAt))}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)]">
                        تغییر وضعیت:{" "}
                        <span className="font-mono">
                          {ev.previousStatus ?? "—"} ← {ev.newStatus}
                        </span>
                      </div>
                      {ev.clinicalNotes && (
                        <p className="text-[var(--color-text)] leading-relaxed bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]">
                          {ev.clinicalNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* نسخه‌های Assertion */}
            <Card className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl space-y-4">
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>نسخه‌های Assertion ({toPersianDigits(data.versions.length)})</span>
              </h2>

              {data.versions.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded-xl">
                  اطلاعات نسخه یافت نشد.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.versions.map((ver) => {
                    const isCurrent = ver.id === data.assertion.id;
                    return (
                      <div
                        key={ver.id}
                        className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                          isCurrent
                            ? "border-[var(--color-primary-default)] bg-[var(--color-primary-default)]/5"
                            : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/30"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[var(--color-text)]">
                              نسخه {toPersianDigits(ver.versionNumber)}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)]">
                                نسخه جاری
                              </span>
                            )}
                            {ver.isActivePublished && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                                نسخه فعال منتشرشده
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            ایجاد: {toPersianDigits(formatPersianExamDateTime(ver.createdAt))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <AdminStatusBadge
                            status={WORKFLOW_STATUS_LABELS[ver.status] ?? ver.status}
                            colorMap={WORKFLOW_STATUS_COLOR_MAP}
                          />
                          {!isCurrent && (
                            <Link
                              to={`/admin/pocket/assertions/${ver.id}`}
                              className="text-xs font-semibold text-[var(--color-primary-default)] hover:underline"
                            >
                              مشاهده
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {data && (
        <>
          <AssertionReviewWorkflowModal
            assertionId={data.assertion.id}
            assertionKey={data.assertion.assertionKey}
            mode={reviewActionMode}
            onClose={() => setReviewActionMode(null)}
            onSuccess={(msg) => {
              setActionSuccessBanner(msg);
              void refetch();
            }}
          />
          <PublishAssertionModal
            isOpen={isPublishModalOpen}
            assertionId={data.assertion.id}
            assertionKey={data.assertion.assertionKey}
            statementText={data.assertion.statementText}
            versionNumber={data.assertion.versionNumber}
            clinicalSummary={data.clinicalSummary}
            activePublishedVersionNumber={
              data.versions.find((v) => v.isActivePublished && v.id !== data.assertion.id)
                ?.versionNumber ?? null
            }
            onClose={() => setIsPublishModalOpen(false)}
            onSuccess={() => {
              setActionSuccessBanner(
                `نسخه ${toPersianDigits(data.assertion.versionNumber)} با موفقیت منتشر رسمی شد.`,
              );
              void refetch();
            }}
          />
          <ResolveConflictModal
            conflict={resolveConflictTarget}
            onClose={() => setResolveConflictTarget(null)}
            onSuccess={(outcome) => {
              setActionSuccessBanner(
                outcome === "resolved"
                  ? "تعارض با وضعیت «حل‌شده» ثبت شد؛ تأمین مجدد Quorum بالینی برای اعتبارسنجی الزامی است."
                  : "تعارض با وضعیت «ردشده / بی‌موضوع» ثبت شد.",
              );
              void refetch();
            }}
          />
        </>
      )}
    </div>
  );
}
