import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAdmin } from "../../hooks/useAdmin.js";
import { ChevronRight, ChevronLeft, Filter, Search, Eye } from "lucide-react";
import { toPersianDigits, formatPersianOf } from "@avana/domain";

export function AdminGenerationPage() {
  const adminApi = useAdmin();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "generation", page, statusFilter, searchTerm],
    queryFn: () => adminApi.listGenerationJobs(page, pageSize, statusFilter, searchTerm),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 1;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20";
      case "failed": return "text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20";
      case "processing": return "text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20";
      default: return "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border border-[var(--color-border)]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">مرکز هوش مصنوعی (Generation Center)</h2>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="جستجو بر اساس ایمیل کاربر یا نام فایل..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl ps-10 pe-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[var(--color-text-muted)] hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
            >
              <option value="">همه وضعیت‌ها</option>
              <option value="queued">در صف (Queued)</option>
              <option value="processing">در حال پردازش (Processing)</option>
              <option value="completed">موفق (Completed)</option>
              <option value="failed">خطا (Failed)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-6 py-4 font-medium">نوع تولید</th>
                <th className="px-6 py-4 font-medium">فایل مبدا</th>
                <th className="px-6 py-4 font-medium">کاربر</th>
                <th className="px-6 py-4 font-medium">وضعیت</th>
                <th className="px-6 py-4 font-medium">تاریخ درخواست</th>
                <th className="px-6 py-4 font-medium text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--color-text-muted)]">
                    در حال جستجو و بارگذاری...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-rose-600 dark:text-rose-400">
                    خطا در دریافت اطلاعات: {(error as Error).message}
                  </td>
                </tr>
              ) : data?.jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--color-text-muted)]">
                    {searchTerm ? "رکوردی با این مشخصات یافت نشد." : "رکوردی یافت نشد."}
                  </td>
                </tr>
              ) : (
                data?.jobs.map((job: import("../../lib/api/admin.js").AdminGenerationJobRecord) => (
                  <tr key={job.id} className="hover:bg-[var(--color-surface-warm)]/50 transition-colors">
                    <td className="px-6 py-4 text-[var(--color-text)]">{job.type}</td>
                    <td className="px-6 py-4 text-[var(--color-text)] truncate max-w-[200px]" title={job.documentName}>
                      {job.documentName || "-"}
                    </td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)]">{job.userEmail || "-"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      {job.errorMessage && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 max-w-[200px] truncate" title={job.errorMessage}>
                          {job.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)]">
                      <div className="flex flex-col">
                        <span>{new Date(job.createdAt).toLocaleDateString("fa-IR")}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{new Date(job.createdAt).toLocaleTimeString("fa-IR")}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        to={`/admin/generation/${job.id}`}
                        className="inline-flex items-center justify-center p-2 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
                        title="مشاهده جزئیات"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <span className="text-sm text-[var(--color-text-muted)]">
            مجموع: {toPersianDigits(data?.totalCount || 0)} رکورد
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1 || isLoading}
              onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm text-[var(--color-text)] px-2 py-1">
              {formatPersianOf(page, totalPages, { prefix: "صفحه" })}
            </span>
            <button
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
