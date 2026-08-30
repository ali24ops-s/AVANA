import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAdmin } from "../../hooks/useAdmin.js";
import { ChevronRight, ChevronLeft, Filter, Search, Eye } from "lucide-react";

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
      case "completed": return "text-green-400 bg-green-400/10";
      case "failed": return "text-red-400 bg-red-400/10";
      case "processing": return "text-blue-400 bg-blue-400/10";
      default: return "text-slate-400 bg-slate-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-200">مرکز هوش مصنوعی (Generation Center)</h2>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="جستجو بر اساس ایمیل کاربر یا نام فایل..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pr-10 pl-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-auto bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
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

      <div className="glass-panel border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-800/50 text-slate-400 border-b border-white/5">
              <tr>
                <th className="px-6 py-4 font-medium">نوع تولید</th>
                <th className="px-6 py-4 font-medium">فایل مبدا</th>
                <th className="px-6 py-4 font-medium">کاربر</th>
                <th className="px-6 py-4 font-medium">وضعیت</th>
                <th className="px-6 py-4 font-medium">تاریخ درخواست</th>
                <th className="px-6 py-4 font-medium text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    در حال جستجو و بارگذاری...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-red-400">
                    خطا در دریافت اطلاعات: {(error as Error).message}
                  </td>
                </tr>
              ) : data?.jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    {searchTerm ? "رکوردی با این مشخصات یافت نشد." : "رکوردی یافت نشد."}
                  </td>
                </tr>
              ) : (
                data?.jobs.map((job: import("../../lib/api/admin.js").AdminGenerationJobRecord) => (
                  <tr key={job.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-slate-200">{job.type}</td>
                    <td className="px-6 py-4 text-slate-300 truncate max-w-[200px]" title={job.documentName}>
                      {job.documentName || "-"}
                    </td>
                    <td className="px-6 py-4 text-slate-400">{job.userEmail || "-"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      {job.errorMessage && (
                        <p className="text-[10px] text-red-400 mt-1 max-w-[200px] truncate" title={job.errorMessage}>
                          {job.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      <div className="flex flex-col">
                        <span>{new Date(job.createdAt).toLocaleDateString("fa-IR")}</span>
                        <span className="text-xs text-slate-500">{new Date(job.createdAt).toLocaleTimeString("fa-IR")}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        to={`/admin/generation/${job.id}`}
                        className="inline-flex items-center justify-center p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-slate-800/30">
          <span className="text-sm text-slate-400">
            مجموع: {data?.totalCount || 0} رکورد
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1 || isLoading}
              onClick={() => setPage(p => p - 1)}
              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-sm text-slate-300 px-2 py-1">
              صفحه {page} از {totalPages}
            </span>
            <button
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(p => p + 1)}
              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
