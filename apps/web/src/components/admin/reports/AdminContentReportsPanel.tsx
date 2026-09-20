import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Flag,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  Quote,
  Eye,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  AdminTable,
  AdminPagination,
  AdminFilter,
  AdminLoadingState,
  AdminErrorState,
  AdminEmptyState,
} from "../AdminUI.js";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
} from "@avana/ui";
import { useAdmin } from "../../../hooks/useAdmin.js";
import { toPersianDigits } from "@avana/domain";
import type {
  AdminContentReportItem,
  ContentReportCategory,
  ContentReportStatus,
} from "@avana/contracts";

export interface AdminContentReportsPanelProps {
  courseId?: string;
  lessonId?: string;
  onCountChange?: (count: number) => void;
  title?: string;
  description?: string;
}

const REPORT_STATUS_LABELS: Record<ContentReportStatus, string> = {
  pending: "در انتظار بررسی",
  in_review: "در حال بررسی",
  resolved: "برطرف شده",
  dismissed: "رد شده",
};

const REPORT_STATUS_BADGE_CLASSES: Record<ContentReportStatus, string> = {
  pending: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  in_review: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30",
  resolved: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  dismissed: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
};

const REPORT_CATEGORY_LABELS: Record<ContentReportCategory, string> = {
  scientific_error: "اشتباه علمی / پزشکی",
  typo: "غلط املایی / نگارشی",
  rendering_issue: "مشکل در نمایش / فرمول",
  unclear_content: "اطلاعات ناقص یا مبهم",
  other: "سایر موارد",
};

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "pending", label: "در انتظار بررسی" },
  { value: "in_review", label: "در حال بررسی" },
  { value: "resolved", label: "برطرف شده" },
  { value: "dismissed", label: "رد شده" },
];

const CATEGORY_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه دسته‌بندی‌ها" },
  { value: "scientific_error", label: "اشتباه علمی / پزشکی" },
  { value: "typo", label: "غلط املایی / نگارشی" },
  { value: "rendering_issue", label: "مشکل نمایش / فرمول" },
  { value: "unclear_content", label: "اطلاعات مبهم یا ناقص" },
  { value: "other", label: "سایر موارد" },
];

function formatPersianDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return dateString;
  }
}

export function AdminContentReportsPanel({
  courseId,
  lessonId,
  onCountChange,
  title = "گزارش‌های مشکل درسنامه‌ها",
  description = "بررسی، پیگیری و اصلاح گزارش‌های ارسالی دانشجویان در متن درسنامه‌ها",
}: AdminContentReportsPanelProps) {
  const adminApi = useAdmin();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<AdminContentReportItem | null>(null);

  // Fetch Reports
  const reportsQuery = useQuery({
    queryKey: [
      "admin",
      "content-reports",
      { page, pageSize, statusFilter, categoryFilter, courseId, lessonId },
    ],
    queryFn: async () => {
      const res = await adminApi.listContentReports({
        page,
        pageSize,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        courseId,
        lessonId,
      });
      if (onCountChange && (!statusFilter || statusFilter === "pending")) {
        const pendingCount = res.items.filter((i) => i.status === "pending").length;
        onCountChange(pendingCount);
      }
      return res;
    },
  });

  // Mutation to update status
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ContentReportStatus;
    }) => {
      return adminApi.updateContentReportStatus(id, status);
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "content-reports"] });
      if (selectedReport && selectedReport.id === updated.id) {
        setSelectedReport({
          ...selectedReport,
          status: updated.status,
        });
      }
    },
  });

  const rawReports = reportsQuery.data?.items ?? [];
  const totalCount = reportsQuery.data?.totalCount ?? 0;
  const totalPages = reportsQuery.data?.totalPages ?? 1;

  // Client-side quick search filter on selectedText/lesson/module
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return rawReports;
    const q = searchQuery.trim().toLowerCase();
    return rawReports.filter(
      (r) =>
        r.selectedText.toLowerCase().includes(q) ||
        (r.lessonTitle && r.lessonTitle.toLowerCase().includes(q)) ||
        (r.moduleTitle && r.moduleTitle.toLowerCase().includes(q)) ||
        (r.courseName && r.courseName.toLowerCase().includes(q)) ||
        (r.comment && r.comment.toLowerCase().includes(q)),
    );
  }, [rawReports, searchQuery]);

  const tableHeaders = [
    "دوره",
    "فصل",
    "درسنامه",
    "نوع مشکل",
    "وضعیت",
    "تاریخ ثبت",
    "عملیات",
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Info */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <span>{title}</span>
                {totalCount > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                    {toPersianDigits(totalCount)} مورد
                  </span>
                )}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void reportsQuery.refetch()}
              disabled={reportsQuery.isFetching}
              className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              title="تازه‌سازی"
              aria-label="تازه‌سازی لیست گزارش‌ها"
            >
              <RefreshCw
                className={`w-4 h-4 ${reportsQuery.isFetching ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <AdminFilter
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            options={STATUS_FILTER_OPTIONS}
            label="وضعیت"
          />

          <AdminFilter
            value={categoryFilter}
            onChange={(val) => {
              setCategoryFilter(val);
              setPage(1);
            }}
            options={CATEGORY_FILTER_OPTIONS}
            label="نوع مشکل"
          />
        </div>

        {/* Text Filter */}
        <div className="relative w-full md:w-72 flex items-center">
          <input
            type="text"
            placeholder="جستجو در متن یا درسنامه..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl ps-4 pe-10 py-2 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] transition-all"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute end-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Reports Table */}
      <AdminTable headers={tableHeaders}>
        {reportsQuery.isLoading ? (
          <AdminLoadingState colSpan={tableHeaders.length} />
        ) : reportsQuery.isError ? (
          <AdminErrorState
            message="خطا در دریافت لیست گزارش‌های مشکل محتوا."
            colSpan={tableHeaders.length}
          />
        ) : filteredReports.length === 0 ? (
          <AdminEmptyState message="هیچ گزارشی با مشخصات انتخاب‌شده یافت نشد." />
        ) : (
          filteredReports.map((report) => {
            const statusLabel =
              REPORT_STATUS_LABELS[report.status] || report.status;
            const statusBadgeClass =
              REPORT_STATUS_BADGE_CLASSES[report.status] ||
              "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]";
            const categoryLabel =
              REPORT_CATEGORY_LABELS[report.category] || report.category;

            return (
              <tr
                key={report.id}
                className="hover:bg-[var(--color-surface-warm)]/50 transition-colors"
              >
                {/* 1. Course */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs text-[var(--color-text)] font-semibold">
                    {report.courseName || "دوره عمومی"}
                  </span>
                </td>

                {/* 2. Chapter / Module */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {report.moduleTitle || "—"}
                  </span>
                </td>

                {/* 3. Lesson */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-bold text-xs text-[var(--color-text)]">
                    {report.lessonTitle || "درسنامه بدون عنوان"}
                  </div>
                </td>

                {/* 4. Category */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400">
                    <Flag className="w-3 h-3 text-rose-500" />
                    <span>{categoryLabel}</span>
                  </span>
                </td>

                {/* 5. Status Badge */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadgeClass}`}
                  >
                    {statusLabel}
                  </span>
                </td>

                {/* 6. Date */}
                <td className="px-6 py-4 whitespace-nowrap text-xs text-[var(--color-text-muted)]">
                  {formatPersianDate(report.createdAt)}
                </td>

                {/* 7. Action Button */}
                <td className="px-6 py-4 whitespace-nowrap text-left">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedReport(report)}
                    leftIcon={<Eye className="w-3.5 h-3.5" />}
                  >
                    بررسی
                  </Button>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      {/* Pagination */}
      {!reportsQuery.isLoading &&
        !reportsQuery.isError &&
        totalPages > 1 && (
          <AdminPagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={(p) => setPage(p)}
          />
        )}

      {/* Detail & Status Change Dialog */}
      {selectedReport && (
        <Dialog
          isOpen={Boolean(selectedReport)}
          onClose={() => setSelectedReport(null)}
          maxWidth="lg"
          ariaLabel="جزئیات و تعیین وضعیت گزارش مشکل"
        >
          <DialogHeader onClose={() => setSelectedReport(null)}>
            <div className="flex items-center gap-2.5" dir="rtl">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Flag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  بررسی گزارش مشکل درسنامه
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  شناسه گزارش: {selectedReport.id}
                </p>
              </div>
            </div>
          </DialogHeader>

          <DialogContent className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Context breadcrumbs */}
            <div className="p-3 bg-[var(--color-surface-subtle)] rounded-xl border border-[var(--color-border)] text-xs flex flex-wrap items-center gap-2 text-[var(--color-text-muted)]">
              <span className="font-bold text-[var(--color-text)]">
                {selectedReport.courseName || "دوره آموزشی"}
              </span>
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{selectedReport.moduleTitle || "فصل"}</span>
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="font-bold text-[var(--color-primary-default)]">
                {selectedReport.lessonTitle || "درسنامه"}
              </span>
            </div>

            {/* Selected Text excerpt */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                <Quote className="w-3.5 h-3.5" />
                <span>متن انتخاب‌شده توسط دانشجو:</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text)] leading-relaxed font-sans select-text">
                «{selectedReport.selectedText}»
              </div>
            </div>

            {/* Category and Student Comment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-1">
                <span className="text-[var(--color-text-muted)] block">نوع اشکال گزارش‌شده:</span>
                <span className="font-bold text-sm text-[var(--color-text)]">
                  {REPORT_CATEGORY_LABELS[selectedReport.category] || selectedReport.category}
                </span>
              </div>

              <div className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-1">
                <span className="text-[var(--color-text-muted)] block">زمان ارسال:</span>
                <span className="font-bold text-xs text-[var(--color-text)]">
                  {formatPersianDate(selectedReport.createdAt)}
                </span>
              </div>
            </div>

            {selectedReport.comment && (
              <div className="space-y-1">
                <span className="text-xs font-bold text-[var(--color-text)]">
                  توضیحات تکمیلی دانشجو:
                </span>
                <div className="p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-xs text-[var(--color-text)] leading-relaxed">
                  {selectedReport.comment}
                </div>
              </div>
            )}

            {/* Status change action buttons */}
            <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
              <span className="text-xs font-bold text-[var(--color-text)] block">
                تغییر وضعیت بررسی:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={selectedReport.status === "in_review" ? "primary" : "secondary"}
                  disabled={updateStatusMutation.isPending}
                  onClick={() =>
                    updateStatusMutation.mutate({
                      id: selectedReport.id,
                      status: "in_review",
                    })
                  }
                  leftIcon={<Clock className="w-3.5 h-3.5" />}
                >
                  در حال بررسی
                </Button>

                <Button
                  size="sm"
                  variant={selectedReport.status === "resolved" ? "primary" : "secondary"}
                  disabled={updateStatusMutation.isPending}
                  onClick={() =>
                    updateStatusMutation.mutate({
                      id: selectedReport.id,
                      status: "resolved",
                    })
                  }
                  leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                >
                  برطرف شد (اصلاح محتوا)
                </Button>

                <Button
                  size="sm"
                  variant={selectedReport.status === "dismissed" ? "primary" : "secondary"}
                  disabled={updateStatusMutation.isPending}
                  onClick={() =>
                    updateStatusMutation.mutate({
                      id: selectedReport.id,
                      status: "dismissed",
                    })
                  }
                  leftIcon={<XCircle className="w-3.5 h-3.5 text-rose-500" />}
                >
                  رد گزارش (فاقد اشکال)
                </Button>

                {selectedReport.status !== "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateStatusMutation.isPending}
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedReport.id,
                        status: "pending",
                      })
                    }
                  >
                    بازگشت به در انتظار
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>

          <DialogFooter className="p-4 sm:p-5 flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">
              وضعیت فعلی:{" "}
              <span className="font-bold text-[var(--color-text)]">
                {REPORT_STATUS_LABELS[selectedReport.status] || selectedReport.status}
              </span>
            </span>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => setSelectedReport(null)}
            >
              بستن پنجره
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
