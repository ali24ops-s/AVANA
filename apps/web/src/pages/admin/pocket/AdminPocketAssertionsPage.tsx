import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { ListChecks, RefreshCw, ShieldAlert, Eye } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { PageHeader, Button, Alert } from "../../../components/ui/index.js";
import {
  AdminTable,
  AdminSearch,
  AdminFilter,
  AdminPagination,
  AdminStatusBadge,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { AdminPocketNavigation } from "../../../components/admin/pocket/AdminPocketNavigation.js";
import { AggregateTypeBadge } from "../../../components/pocket/AggregateTypeBadge.js";
import { usePocketAdminAssertions } from "../../../hooks/usePocketAssertions.js";
import { usePocketPermissions } from "../../../hooks/usePocketPermissions.js";
import type {
  ClinicalAggregateType,
  PocketAssertionClinicalSummary,
  ScientificAssertionStatus,
} from "../../../lib/api/pocket.js";
import { formatPersianExamDateTime } from "../../../utils/date.js";

const PAGE_SIZE = 20;

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

function resolveClinicalBadge(summary: PocketAssertionClinicalSummary): {
  label: string;
  className: string;
} {
  if (summary.hasActiveSafetyOverride) {
    return {
      label: "دارای Safety Override فعال",
      className: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    };
  }

  if (summary.hasActiveConflict) {
    return {
      label: "دارای تعارض فعال",
      className: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    };
  }

  if (summary.isClinicallyVerified) {
    return {
      label: `تأیید بالینی (${toPersianDigits(summary.validApprovalCount)}/${toPersianDigits(summary.requiredApprovals)})`,
      className: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    };
  }

  if (!summary.quorumSatisfied) {
    return {
      label: `در انتظار تکمیل Quorum (${toPersianDigits(summary.validApprovalCount)}/${toPersianDigits(summary.requiredApprovals)})`,
      className: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    };
  }

  return {
    label: "مسدودشده",
    className: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
  };
}

export function AdminPocketAssertionsPage() {
  const { canManageReviewers, isLoading: isPermLoading } = usePocketPermissions();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [aggregateTypeFilter, setAggregateTypeFilter] = useState<string>("all");
  const [sortValue, setSortValue] = useState<string>("updatedAt:desc");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const [sortByRaw, sortOrderRaw] = sortValue.split(":");
    return {
      status: statusFilter !== "all" ? (statusFilter as ScientificAssertionStatus) : undefined,
      aggregateType:
        aggregateTypeFilter !== "all"
          ? (aggregateTypeFilter as ClinicalAggregateType)
          : undefined,
      q: debouncedSearch || undefined,
      sortBy: sortByRaw === "createdAt" ? ("createdAt" as const) : ("updatedAt" as const),
      sortOrder: sortOrderRaw === "asc" ? ("asc" as const) : ("desc" as const),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [statusFilter, aggregateTypeFilter, debouncedSearch, sortValue, page]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketAdminAssertions(queryParams, {
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
              مشاهده فهرست مدیریتی Assertionها فقط برای مدیر کل سیستم (platform_admin) مجاز است.
            </span>
          </div>
        </Alert>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت فهرست Assertionهای AVANA Pocket";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="فهرست Assertionها و صف بازبینی"
        badge={{
          text: "AVANA Pocket",
          icon: <ListChecks className="w-3.5 h-3.5" />,
        }}
        description="پایش گزاره‌های علمی، وضعیت گردش کار بازبینی و وضعیت اعتبار بالینی (Resolver)"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            <span>به‌روزرسانی</span>
          </Button>
        }
      />

      <AdminPocketNavigation />

      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <AdminSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="جستجو بر اساس کلید گزاره، متن علمی یا نام موجودیت..."
        />
        <div className="flex flex-wrap items-center gap-2">
          <AdminFilter
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            label="وضعیت"
            options={[
              { value: "all", label: "همه وضعیت‌ها" },
              { value: "draft", label: "پیش‌نویس" },
              { value: "in_review", label: "در انتظار بازبینی" },
              { value: "reviewed", label: "بازبینی‌شده" },
              { value: "verified", label: "تأییدشده بالینی" },
              { value: "published", label: "منتشرشده" },
              { value: "superseded", label: "منسوخ‌شده" },
              { value: "retired", label: "بازنشسته" },
            ]}
          />
          <AdminFilter
            value={aggregateTypeFilter}
            onChange={(val) => {
              setAggregateTypeFilter(val);
              setPage(1);
            }}
            label="موجودیت"
            options={[
              { value: "all", label: "همه دسته‌ها" },
              { value: "drug", label: "دارو" },
              { value: "disease", label: "بیماری" },
              { value: "treatment", label: "درمان" },
              { value: "emergency", label: "فوریت پزشکی" },
            ]}
          />
          <AdminFilter
            value={sortValue}
            onChange={(val) => {
              setSortValue(val);
              setPage(1);
            }}
            label="مرتب‌سازی"
            options={[
              { value: "updatedAt:desc", label: "جدیدترین به‌روزرسانی" },
              { value: "updatedAt:asc", label: "قدیمی‌ترین به‌روزرسانی" },
              { value: "createdAt:desc", label: "جدیدترین ثبت" },
              { value: "createdAt:asc", label: "قدیمی‌ترین ثبت" },
            ]}
          />
        </div>
      </div>

      {isError && (
        <Alert variant="error" title="خطا در دریافت اطلاعات">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
            <span>{errorMessage}</span>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="w-4 h-4" />
              <span>تلاش مجدد</span>
            </Button>
          </div>
        </Alert>
      )}

      <AdminTable
        headers={[
          "کلید Assertion",
          "متن خلاصه",
          "نوع",
          "موجودیت مرتبط",
          "وضعیت گردش کار",
          "وضعیت بالینی (Resolver)",
          "آخرین به‌روزرسانی",
          "عملیات",
        ]}
      >
        {isLoading || isPermLoading ? (
          <AdminLoadingState colSpan={8} />
        ) : isError ? (
          <AdminErrorState message={errorMessage} colSpan={8} />
        ) : items.length === 0 ? (
          <AdminEmptyState message="هیچ Assertion با فیلترهای انتخاب‌شده یافت نشد." />
        ) : (
          items.map((item) => {
            const workflowLabel = WORKFLOW_STATUS_LABELS[item.status] ?? item.status;
            const clinicalBadge = resolveClinicalBadge(item.clinicalSummary);
            const aggregateTitle =
              item.aggregateTitleFa || item.aggregateTitleEn || item.aggregateId;

            return (
              <tr
                key={item.id}
                className="hover:bg-[var(--color-surface-warm)]/40 transition-colors"
              >
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text)]">
                  <div className="font-mono font-bold break-all" dir="ltr">
                    {item.assertionKey}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    نسخه {toPersianDigits(item.versionNumber)}
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text)] max-w-[260px]">
                  <p className="line-clamp-2 leading-relaxed" title={item.statementText}>
                    {item.statementText}
                  </p>
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs font-mono text-[var(--color-text-muted)]">
                  {item.assertionType}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text)]">
                  <div className="flex flex-col items-start gap-1">
                    <AggregateTypeBadge type={item.aggregateType} size="sm" />
                    <span className="font-medium truncate max-w-[160px]" title={aggregateTitle}>
                      {aggregateTitle}
                    </span>
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <AdminStatusBadge status={workflowLabel} colorMap={WORKFLOW_STATUS_COLOR_MAP} />
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border ${clinicalBadge.className}`}
                  >
                    {clinicalBadge.label}
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {toPersianDigits(formatPersianExamDateTime(item.updatedAt))}
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <Link
                    to={`/admin/pocket/assertions/${item.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold bg-[#e0f2f2] dark:bg-teal-950/60 hover:bg-[#d0ebeb] dark:hover:bg-teal-900/60 text-[#006666] dark:text-teal-200 border border-[#b3d9d9] dark:border-teal-700/60 transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>مشاهده جزئیات</span>
                  </Link>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      {!isLoading && !isError && totalCount > 0 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
