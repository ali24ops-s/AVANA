import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Stethoscope, RefreshCw, ShieldAlert, Eye } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { PageHeader, Button, Alert, LoadingState } from "../../components/ui/index.js";
import {
  AdminTable,
  AdminSearch,
  AdminFilter,
  AdminPagination,
  AdminStatusBadge,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../components/admin/AdminUI.js";
import { AggregateTypeBadge } from "../../components/pocket/AggregateTypeBadge.js";
import { usePocketReviewerAssertions } from "../../hooks/usePocketAssertions.js";
import { usePocketPermissions } from "../../hooks/usePocketPermissions.js";
import type {
  ClinicalAggregateType,
  ScientificAssertionStatus,
} from "../../lib/api/pocket.js";
import { formatPersianExamDateTime } from "../../utils/date.js";

const PAGE_SIZE = 20;

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  reviewed: "بازبینی‌شده (آماده داوری)",
  verified: "تأییدشده بالینی",
  published: "منتشرشده",
};

const WORKFLOW_STATUS_COLOR_MAP: Record<string, string> = {
  "بازبینی‌شده (آماده داوری)": "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
  "تأییدشده بالینی": "text-teal-600 dark:text-teal-300 bg-teal-500/10 border-teal-500/20",
  منتشرشده: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
};

export function PocketReviewerWorkbenchPage() {
  const { canVerify, activeCredential, isLoading: isPermLoading } = usePocketPermissions();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [aggregateTypeFilter, setAggregateTypeFilter] = useState<string>("all");
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
    return {
      status: statusFilter !== "all" ? (statusFilter as ScientificAssertionStatus) : undefined,
      aggregateType:
        aggregateTypeFilter !== "all"
          ? (aggregateTypeFilter as ClinicalAggregateType)
          : undefined,
      q: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
  }, [statusFilter, aggregateTypeFilter, debouncedSearch, page]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = usePocketReviewerAssertions(queryParams, {
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
        <Alert variant="error" title="عدم دسترسی به میز کار داوری بالینی">
          <div className="flex items-start gap-2.5 text-sm leading-relaxed">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              دسترسی به میز کار داوری بالینی AVANA Pocket منوط به داشتن اعتبارنامه (Credential)
              فعال، غیرمعلق و منقضی‌نشده است. داشتن نقش کاربری یا مدیریتی به‌تنهایی مجوز داوری
              بالینی ایجاد نمی‌کند.
            </span>
          </div>
        </Alert>
        <div>
          <Link
            to="/pocket"
            className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
          >
            بازگشت به AVANA Pocket
          </Link>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت صف داوری بالینی";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6" dir="rtl">
      <PageHeader
        title="میز کار داوری بالینی (Clinical Reviewer Workbench)"
        badge={{
          text: activeCredential?.specialty || "داور بالینی فعال",
          icon: <Stethoscope className="w-3.5 h-3.5" />,
        }}
        description="بررسی علمی گزاره‌های آماده داوری، ثبت تأیید یا رد بالینی و گزارش تعارض‌ها"
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
              { value: "all", label: "همه موارد قابل داوری" },
              { value: "reviewed", label: "بازبینی‌شده (آماده داوری)" },
              { value: "verified", label: "تأییدشده بالینی" },
              { value: "published", label: "منتشرشده" },
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
          "متن Assertion",
          "نوع",
          "Aggregate",
          "وضعیت",
          "تأیید / حدنصاب",
          "Conflict / Override",
          "آخرین به‌روزرسانی",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={9} />
        ) : isError ? (
          <AdminErrorState message={errorMessage} colSpan={9} />
        ) : items.length === 0 ? (
          <AdminEmptyState message="در حال حاضر گزاره‌ای در صف داوری بالینی وجود ندارد." />
        ) : (
          items.map((item) => {
            const aggregateTitle =
              item.aggregateTitleFa || item.aggregateTitleEn || item.aggregateId;
            return (
              <tr
                key={item.id}
                className="hover:bg-[var(--color-surface-warm)]/40 transition-colors"
              >
                <td className="px-4 sm:px-6 py-3.5 text-xs font-mono font-bold text-[var(--color-text)]" dir="ltr">
                  {item.assertionKey}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text)] max-w-[240px]">
                  <p className="line-clamp-2 leading-relaxed">{item.statementText}</p>
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs font-mono text-[var(--color-text-muted)]">
                  {item.assertionType}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs">
                  <div className="flex flex-col items-start gap-1">
                    <AggregateTypeBadge type={item.aggregateType} size="sm" />
                    <span className="font-medium truncate max-w-[140px]">{aggregateTitle}</span>
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <AdminStatusBadge
                    status={WORKFLOW_STATUS_LABELS[item.status] ?? item.status}
                    colorMap={WORKFLOW_STATUS_COLOR_MAP}
                  />
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs font-bold text-[var(--color-text)] whitespace-nowrap">
                  {toPersianDigits(item.clinicalSummary.validApprovalCount)} از{" "}
                  {toPersianDigits(item.clinicalSummary.requiredApprovals)}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs space-y-1">
                  {item.clinicalSummary.hasActiveConflict && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20">
                      تعارض فعال
                    </span>
                  )}
                  {item.clinicalSummary.hasActiveSafetyOverride && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20">
                      Safety Override
                    </span>
                  )}
                  {!item.clinicalSummary.hasActiveConflict &&
                    !item.clinicalSummary.hasActiveSafetyOverride && (
                      <span className="text-[var(--color-text-muted)]">بدون مانع</span>
                    )}
                </td>
                <td className="px-4 sm:px-6 py-3.5 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {toPersianDigits(formatPersianExamDateTime(item.updatedAt))}
                </td>
                <td className="px-4 sm:px-6 py-3.5">
                  <Link
                    to={`/pocket/reviewer-workbench/${item.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold bg-[#008080] hover:bg-[#007575] text-white transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>بررسی و داوری</span>
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
