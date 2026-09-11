import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminPagination, AdminFilter, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";
import { FileText } from "lucide-react";

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
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
            <FileText className="w-6 h-6 text-[var(--color-primary-default)]" />
            لاگ‌های سیستم
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">مشاهده رویدادها و خطاهای سیستم (Redacted)</p>
        </div>
        <AdminFilter
          label="سطح رویداد:"
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
            <tr key={log.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
              <td className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)]" dir="ltr">{new Date(log.timestamp).toLocaleString("fa-IR")}</td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  log.level === 'ERROR'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                    : log.level === 'WARNING'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400'
                }`} dir="ltr">
                  {log.level}
                </span>
              </td>
              <td className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)]" dir="ltr">{log.service || "-"}</td>
              <td className="px-6 py-4 text-sm text-[var(--color-text)] truncate max-w-md">{log.message}</td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
