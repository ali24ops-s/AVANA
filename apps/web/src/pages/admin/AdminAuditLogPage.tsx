import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { AdminTable, AdminPagination } from "../../components/admin/AdminUI.js";
import { TableLoadingState, TableErrorState, TableEmptyState } from "@avana/ui";
import { Input } from "../../components/ui/index.js";
import { ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { toPersianDigits } from "@avana/domain";

export function AdminAuditLogPage() {
  const adminApi = useAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const pageSize = 20;

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    queryKey: [
      "admin",
      "auditLogs",
      {
        page,
        pageSize,
        search: search.trim() || undefined,
        action: actionFilter.trim() || undefined,
        entityType: entityFilter.trim() || undefined,
        adminEmail: adminEmail.trim() || undefined,
      },
    ],
    queryFn: ({ signal }) =>
      adminApi.listAuditLogs(
        {
          page,
          pageSize,
          search: search.trim() || undefined,
          action: actionFilter.trim() || undefined,
          entityType: entityFilter.trim() || undefined,
          adminEmail: adminEmail.trim() || undefined,
        },
        pageSize,
        { signal }
      ),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  const logs = data?.logs ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[var(--color-primary-default)]" />
            گزارش حسابرسی (Audit Log)
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            رهگیری و بازرسی عملیات حساس در سیستم
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isPlaceholderData && (
            <div
              role="status"
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-xs text-[var(--color-primary-default)] rounded-xl"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>در حال بارگذاری صفحه {toPersianDigits(page)}...</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="به‌روزرسانی گزارش‌ها"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-[var(--color-primary-default)]" : ""}`}
            />
            <span>به‌روزرسانی</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)] shadow-sm">
        <Input
          type="text"
          placeholder="جستجوی کلی (متن، جزئیات)..."
          aria-label="جستجوی کلی در گزارش حسابرسی"
          containerClassName="flex-1 min-w-[200px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="text"
          placeholder="فیلتر ادمین (Email)..."
          aria-label="فیلتر بر اساس ایمیل ادمین"
          dir="ltr"
          containerClassName="w-full sm:w-auto min-w-[170px]"
          value={adminEmail}
          onChange={(e) => {
            setAdminEmail(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="text"
          placeholder="فیلتر عملیات (Action)..."
          aria-label="فیلتر بر اساس نوع عملیات"
          dir="ltr"
          containerClassName="w-full sm:w-auto min-w-[170px]"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="text"
          placeholder="فیلتر موجودیت (Entity)..."
          aria-label="فیلتر بر اساس نوع موجودیت"
          dir="ltr"
          containerClassName="w-full sm:w-auto min-w-[170px]"
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <AdminTable headers={["زمان", "ادمین", "عملیات", "موجودیت", "شناسه", "جزئیات"]}>
          {isLoading ? (
            <TableLoadingState colSpan={6} />
          ) : isError ? (
            <TableErrorState
              message={error instanceof Error ? error.message : "خطا در بارگذاری لاگ‌ها"}
              colSpan={6}
            />
          ) : logs.length === 0 ? (
            <TableEmptyState message="رکوردی یافت نشد." colSpan={6} />
          ) : (
            logs.map((log) => (
              <tr
                key={log.id}
                className="hover:bg-[var(--color-surface-subtle)] transition-colors text-sm"
              >
                <td
                  className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap"
                  dir="ltr"
                >
                  {toPersianDigits(new Date(log.timestamp).toLocaleString("fa-IR"))}
                </td>
                <td
                  className="px-6 py-4 font-mono text-xs text-[var(--color-text)]"
                  dir="ltr"
                >
                  {log.adminEmail}
                </td>
                <td className="px-6 py-4">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-primary-default)]"
                    dir="ltr"
                  >
                    {log.action}
                  </span>
                </td>
                <td
                  className="px-6 py-4 text-xs font-medium text-[var(--color-text-muted)]"
                  dir="ltr"
                >
                  {log.entity}
                </td>
                <td
                  className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)]"
                  dir="ltr"
                >
                  {log.entityId}
                </td>
                <td
                  className="px-6 py-4 text-[var(--color-text-muted)] font-mono text-xs max-w-xs truncate"
                  dir="ltr"
                  title={JSON.stringify(log.metadata)}
                >
                  {JSON.stringify(log.metadata)}
                </td>
              </tr>
            ))
          )}
        </AdminTable>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
      />
    </div>
  );
}
