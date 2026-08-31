import { useEffect, useState } from "react";
import { api, type AdminAuditRecord, type AdminAuditList } from "../../lib/api/admin";
import { AdminTable, AdminPagination, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">گزارش حسابرسی (Audit Log)</h1>
        <p className="text-sm text-slate-400 mt-1">رهگیری عملیات حساس در سیستم</p>
      </div>

      <div className="flex flex-wrap gap-4 glass-panel p-4 rounded-2xl border border-white/5">
        <input 
          type="text" 
          placeholder="جستجوی کلی (متن، جزئیات)..." 
          className="bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-teal-500/50 flex-1 min-w-[200px]"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <input 
          type="text" 
          placeholder="فیلتر ادمین (Email)..." 
          className="bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-teal-500/50 w-full sm:w-auto"
          value={adminEmail}
          onChange={(e) => { setAdminEmail(e.target.value); setPage(1); }}
        />
        <input 
          type="text" 
          placeholder="فیلتر عملیات (Action)..." 
          className="bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-teal-500/50 w-full sm:w-auto"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
        />
        <input 
          type="text" 
          placeholder="فیلتر موجودیت (Entity)..." 
          className="bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-teal-500/50 w-full sm:w-auto"
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
        />
      </div>

      <AdminTable headers={["زمان", "ادمین", "عملیات", "موجودیت", "شناسه", "جزئیات"]}>
        {loading ? <AdminLoadingState colSpan={6} /> : error ? <AdminErrorState message={error} colSpan={6} /> : logs.length === 0 ? <AdminEmptyState message="رکوردی یافت نشد." /> : (
          logs.map(log => (
            <tr key={log.id} className="hover:bg-white/5 text-sm">
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(log.timestamp).toLocaleString("fa-IR")}</td>
              <td className="px-6 py-4">{log.adminEmail}</td>
              <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-800 rounded">{log.action}</span></td>
              <td className="px-6 py-4 text-slate-400">{log.entity}</td>
              <td className="px-6 py-4 text-slate-400">{log.entityId}</td>
              <td className="px-6 py-4 text-slate-400 font-mono text-xs max-w-xs truncate">{JSON.stringify(log.metadata)}</td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
