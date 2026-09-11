import { useEffect, useState } from "react";
import { api, type AdminAuditRecord, type AdminAuditList } from "../../lib/api/admin";
import { AdminTable, AdminPagination } from "../../components/admin/AdminUI";
import { TableLoadingState, TableErrorState, TableEmptyState } from "@avana/ui";
import { Input } from "../../components/ui/index.js";
import { ShieldCheck } from "lucide-react";

export function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AdminAuditRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { page, pageSize: 20 };
      if (search) params.search = search;
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entityType = entityFilter;
      if (adminEmail) params.adminEmail = adminEmail;
      
      const res = await api.get<AdminAuditList>(`/admin/system/audit`, { params });
      setLogs(res.logs);
      setTotalCount(res.totalCount);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, search, actionFilter, entityFilter, adminEmail]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-[var(--color-primary-default)]" />
          گزارش حسابرسی (Audit Log)
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">رهگیری و بازرسی عملیات حساس در سیستم</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)] shadow-sm">
        <Input 
          type="text" 
          placeholder="جستجوی کلی (متن، جزئیات)..." 
          aria-label="جستجوی کلی در گزارش حسابرسی"
          containerClassName="flex-1 min-w-[200px]"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Input 
          type="text" 
          placeholder="فیلتر ادمین (Email)..." 
          aria-label="فیلتر بر اساس ایمیل ادمین"
          dir="ltr"
          containerClassName="w-full sm:w-auto min-w-[170px]"
          value={adminEmail}
          onChange={(e) => { setAdminEmail(e.target.value); setPage(1); }}
        />
        <Input 
          type="text" 
          placeholder="فیلتر عملیات (Action)..." 
          aria-label="فیلتر بر اساس نوع عملیات"
          dir="ltr"
          containerClassName="w-full sm:w-auto min-w-[170px]"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
        />
        <Input 
          type="text" 
          placeholder="فیلتر موجودیت (Entity)..." 
          aria-label="فیلتر بر اساس نوع موجودیت"
          dir="ltr"
          containerClassName="w-full sm:w-auto min-w-[170px]"
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
        />
      </div>

      <AdminTable headers={["زمان", "ادمین", "عملیات", "موجودیت", "شناسه", "جزئیات"]}>
        {loading ? <TableLoadingState colSpan={6} /> : error ? <TableErrorState message={error} colSpan={6} /> : logs.length === 0 ? <TableEmptyState message="رکوردی یافت نشد." colSpan={6} /> : (
          logs.map(log => (
            <tr key={log.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors text-sm">
              <td className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap" dir="ltr">{new Date(log.timestamp).toLocaleString("fa-IR")}</td>
              <td className="px-6 py-4 font-mono text-xs text-[var(--color-text)]" dir="ltr">{log.adminEmail}</td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-primary-default)]" dir="ltr">
                  {log.action}
                </span>
              </td>
              <td className="px-6 py-4 text-xs font-medium text-[var(--color-text-muted)]" dir="ltr">{log.entity}</td>
              <td className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)]" dir="ltr">{log.entityId}</td>
              <td className="px-6 py-4 text-[var(--color-text-muted)] font-mono text-xs max-w-xs truncate" dir="ltr" title={JSON.stringify(log.metadata)}>
                {JSON.stringify(log.metadata)}
              </td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
