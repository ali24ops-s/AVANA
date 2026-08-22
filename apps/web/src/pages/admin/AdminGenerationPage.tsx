import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { ChevronRight, ChevronLeft, Filter } from "lucide-react";

export function AdminGenerationPage() {
  const adminApi = useAdmin();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "generation", page, statusFilter],
    queryFn: () => adminApi.listGenerationJobs(page, pageSize, statusFilter),
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
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="queued">در صف (Queued)</option>
            <option value="processing">در حال پردازش (Processing)</option>
            <option value="completed">موفق (Completed)</option>
            <option value="failed">خطا (Failed)</option>
          </select>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    در حال بارگذاری...
                  </td>
                </tr>
              ) : data?.jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    رکوردی یافت نشد.
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
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-sm text-slate-300 px-2 py-1">
              صفحه {page} از {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
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
