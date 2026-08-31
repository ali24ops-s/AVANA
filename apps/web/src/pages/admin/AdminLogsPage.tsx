import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminPagination, AdminFilter, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";

interface SystemLogRecord {
  id: string;
  timestamp: string;
  level: string;
  service?: string;
  message: string;
}

export function AdminLogsPage() {
  const [logs, setLogs] = useState<SystemLogRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ logs: SystemLogRecord[]; totalCount: number }>(`/admin/system/logs`, {
          params: { page, pageSize: 20, level: level || undefined }
        });
        if (active) {
          setLogs(res.logs);
          setTotalCount(res.totalCount);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "خطا");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetch();
    return () => { active = false; };
  }, [page, level]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">لاگ سیستم</h1>
          <p className="text-sm text-slate-400 mt-1">مشاهده خطاهای سیستم (Redacted)</p>
        </div>
        <AdminFilter
          value={level}
          onChange={(v) => { setLevel(v); setPage(1); }}
          options={[
            { value: "", label: "همه سطوح" },
            { value: "INFO", label: "INFO" },
            { value: "WARNING", label: "WARNING" },
            { value: "ERROR", label: "ERROR" }
          ]}
        />
      </div>

      <AdminTable headers={["زمان", "سطح", "سرویس", "پیام"]}>
        {loading ? <AdminLoadingState colSpan={4} /> : error ? <AdminErrorState message={error} colSpan={4} /> : logs.length === 0 ? <AdminEmptyState message="لاگی یافت نشد (سیستم فعلاً Logs روی DB ذخیره نمی‌کند)." /> : (
          logs.map(log => (
            <tr key={log.id} className="hover:bg-white/5">
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(log.timestamp).toLocaleString("fa-IR")}</td>
              <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs ${log.level === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300'}`}>{log.level}</span></td>
              <td className="px-6 py-4 text-slate-400">{log.service}</td>
              <td className="px-6 py-4 truncate max-w-md">{log.message}</td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
