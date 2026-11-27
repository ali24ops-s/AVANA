import { Link } from "react-router-dom";
import {
  Stethoscope,
  RefreshCw,
  FileText,
  Clock,
  CheckCircle2,
  Globe,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Award,
  ArrowLeft,
  ListChecks,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { PageHeader, Button, Alert, Card, LoadingState } from "../../../components/ui/index.js";
import { AdminPocketNavigation } from "../../../components/admin/pocket/AdminPocketNavigation.js";
import { usePocketAdminSummary } from "../../../hooks/usePocketAdminSummary.js";
import { usePocketPermissions } from "../../../hooks/usePocketPermissions.js";
import { formatPersianExamDateTime } from "../../../utils/date.js";

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: typeof FileText;
  tone?: "default" | "teal" | "amber" | "emerald" | "rose";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

function StatCard({ title, value, subtitle, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <Card className="p-4 sm:p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-muted)]">{title}</p>
          <p className="text-2xl font-black text-[var(--color-text)] tabular-nums">
            {toPersianDigits(value)}
          </p>
          {subtitle && (
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{subtitle}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONE_CLASSES[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

export function AdminPocketDashboardPage() {
  const { canManageReviewers, isLoading: isPermLoading } = usePocketPermissions();

  const {
    data: summary,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketAdminSummary({
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
              مشاهده داشبورد مدیریتی AVANA Pocket فقط برای مدیر کل سیستم (platform_admin) مجاز است.
            </span>
          </div>
        </Alert>
      </div>
    );
  }

  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت آمار داشبورد AVANA Pocket";

  const isDatabaseEmpty =
    summary &&
    summary.assertions.total === 0 &&
    summary.operations.activeReviewerCredentialsCount === 0 &&
    summary.operations.activeSafetyOverridesCount === 0;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="داشبورد AVANA Pocket"
        badge={{
          text: "AVANA Pocket",
          icon: <Stethoscope className="w-3.5 h-3.5" />,
        }}
        description="نمای کلی و لحظه‌ای از وضعیت گزاره‌های علمی، اعتبار بالینی (Resolver) و عملیات مدیریتی"
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            {summary?.generatedAt && (
              <span className="text-xs text-[var(--color-text-muted)]">
                آخرین به‌روزرسانی:{" "}
                {toPersianDigits(formatPersianExamDateTime(summary.generatedAt))}
              </span>
            )}
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
          <LoadingState message="در حال دریافت آمار عملیاتی Pocket..." />
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
      ) : !summary ? null : (
        <div className="space-y-6">
          {isDatabaseEmpty && (
            <Alert variant="info" title="بدون داده عملیاتی">
              <span className="text-xs sm:text-sm">
                هنوز هیچ گزاره علمی، اعتبارنامه داور یا Safety Override در سیستم ثبت نشده است.
              </span>
            </Alert>
          )}

          {/* بخش دوم: شاخص‌های اصلی Assertionها */}
          <section className="space-y-3" aria-labelledby="pocket-main-kpis">
            <div className="flex items-center justify-between gap-2">
              <h2 id="pocket-main-kpis" className="text-sm sm:text-base font-bold text-[var(--color-text)]">
                شاخص‌های اصلی گزاره‌های علمی
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">
                پیش‌نویس: {toPersianDigits(summary.assertions.draft)} · تأیید بالینی:{" "}
                {toPersianDigits(summary.assertions.verified)} · منسوخ:{" "}
                {toPersianDigits(summary.assertions.superseded)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="کل Assertionها"
                value={summary.assertions.total}
                subtitle={`بازنشسته: ${toPersianDigits(summary.assertions.retired)}`}
                icon={FileText}
                tone="teal"
              />
              <StatCard
                title="در انتظار بازبینی"
                value={summary.assertions.inReview}
                subtitle={`پیش‌نویس: ${toPersianDigits(summary.assertions.draft)}`}
                icon={Clock}
                tone="amber"
              />
              <StatCard
                title="بازبینی‌شده"
                value={summary.assertions.reviewed}
                subtitle={`در انتظار انتشار (Verified): ${toPersianDigits(summary.assertions.verified)}`}
                icon={CheckCircle2}
                tone="default"
              />
              <StatCard
                title="منتشرشده"
                value={summary.assertions.published}
                subtitle={`نسخه‌های پیشین (Superseded): ${toPersianDigits(summary.assertions.superseded)}`}
                icon={Globe}
                tone="emerald"
              />
            </div>
          </section>

          {/* بخش سوم: وضعیت اعتبار بالینی (Resolver) */}
          <section className="space-y-3" aria-labelledby="pocket-clinical-kpis">
            <div className="flex items-center justify-between gap-2">
              <h2
                id="pocket-clinical-kpis"
                className="text-sm sm:text-base font-bold text-[var(--color-text)]"
              >
                وضعیت اعتبار بالینی (ارزیابی Resolver)
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">
                گزاره‌های ارزیابی‌شده (Reviewed / Verified / Published):{" "}
                {toPersianDigits(summary.clinical.evaluatedAssertionsCount)} · دارای مانع اعتبار:{" "}
                {toPersianDigits(summary.clinical.verificationBlockedCount)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="دارای Quorum کامل"
                value={summary.clinical.quorumMetCount}
                icon={ShieldCheck}
                tone="emerald"
              />
              <StatCard
                title="فاقد Quorum"
                value={summary.clinical.quorumNotMetCount}
                icon={Clock}
                tone="amber"
              />
              <StatCard
                title="دارای تعارض بالینی"
                value={summary.clinical.activeConflictCount}
                icon={AlertTriangle}
                tone="rose"
              />
              <StatCard
                title="دارای Safety Override فعال"
                value={summary.clinical.activeSafetyOverrideCount}
                icon={ShieldAlert}
                tone="rose"
              />
            </div>
          </section>

          {/* بخش چهارم: وضعیت مدیریت */}
          <section className="space-y-3" aria-labelledby="pocket-ops-kpis">
            <h2 id="pocket-ops-kpis" className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              وضعیت مدیریت و عملیات
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                title="داوران دارای Credential فعال"
                value={summary.operations.activeReviewerCredentialsCount}
                subtitle="دارای اعتبارنامه فعال، غیرمعلق و منقضی‌نشده"
                icon={Award}
                tone="teal"
              />
              <StatCard
                title="Safety Overrideهای فعال"
                value={summary.operations.activeSafetyOverridesCount}
                subtitle="محدودیت‌های فعال در سطح گزاره یا موجودیت"
                icon={ShieldAlert}
                tone="rose"
              />
            </div>
          </section>

          {/* بخش پنجم: دسترسی سریع */}
          <section className="space-y-3" aria-labelledby="pocket-quick-links">
            <h2
              id="pocket-quick-links"
              className="text-sm sm:text-base font-bold text-[var(--color-text)]"
            >
              دسترسی سریع
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link
                to="/admin/pocket/reviewers"
                className="group p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary-default)] transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300 flex items-center justify-center">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--color-text)]">مدیریت داوران</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      اعطا، تعلیق و لغو اعتبارنامه‌ها
                    </div>
                  </div>
                </div>
                <ArrowLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary-default)] transition-colors" />
              </Link>

              <Link
                to="/admin/pocket/safety-overrides"
                className="group p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary-default)] transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-300 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--color-text)]">
                      مدیریت Safety Override
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      محدودسازی اضطراری و سوابق
                    </div>
                  </div>
                </div>
                <ArrowLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary-default)] transition-colors" />
              </Link>

              <Link
                to="/admin/pocket/assertions"
                className="group p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary-default)] transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300 flex items-center justify-center">
                    <ListChecks className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--color-text)]">
                      فهرست Assertionها
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      صف بازبینی، فیلترها و وضعیت بالینی
                    </div>
                  </div>
                </div>
                <ArrowLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary-default)] transition-colors" />
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
