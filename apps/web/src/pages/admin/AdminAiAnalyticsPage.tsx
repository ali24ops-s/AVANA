import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { Cpu, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { AdminLoadingState, AdminErrorState } from "../../components/admin/AdminUI";

interface AiAnalyticsData {
  overview: {
    totalJobs: number;
    successful: number;
    failed: number;
    processing: number;
    successRate: number;
    averageDurationMs: number;
  };
  byType: Record<string, { total: number; success: number }>;
  tokens: {
    available: boolean;
    input: number;
    output: number;
    total: number;
  };
}

export function AdminAiAnalyticsPage() {
  const [data, setData] = useState<AiAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AiAnalyticsData>("/admin/analytics/ai")
      .then(res => setData(res))
      .catch(err => setError(err.message || "خطا در دریافت آمار هوش مصنوعی"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLoadingState colSpan={1} />;
  if (error) return <AdminErrorState message={error} colSpan={1} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">آمار هوش مصنوعی</h1>
        <p className="text-sm text-slate-400 mt-1">مصرف و عملکرد سیستم‌های پردازشی</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="کل پردازش‌ها" value={data.overview.totalJobs} icon={<Cpu />} color="text-indigo-400" />
        <StatCard title="نرخ موفقیت" value={`${data.overview.successRate.toFixed(1)}%`} icon={<CheckCircle />} color="text-teal-400" />
        <StatCard title="خطاها" value={data.overview.failed} icon={<AlertTriangle />} color="text-red-400" />
        <StatCard title="میانگین زمان پردازش" value={`${(data.overview.averageDurationMs / 1000).toFixed(1)}s`} icon={<Clock />} color="text-amber-400" />
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
        <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2 flex items-center gap-2">آمار توکن‌ها (Token Usage)</h2>
        {data.tokens.available ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <p className="text-sm text-slate-400">توکن‌های ورودی (Input)</p>
              <p className="text-2xl font-bold text-slate-200 mt-1">{data.tokens.input.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <p className="text-sm text-slate-400">توکن‌های خروجی (Output)</p>
              <p className="text-2xl font-bold text-slate-200 mt-1">{data.tokens.output.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <p className="text-sm text-slate-400">کل توکن‌ها (Total)</p>
              <p className="text-2xl font-bold text-teal-400 mt-1">{data.tokens.total.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5 text-center text-slate-400">
            داده مصرف توکن ثبت نشده است (Data not available)
          </div>
        )}
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
        <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">تفکیک بر اساس نوع (Content Type)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm text-slate-300">
            <thead className="text-xs text-slate-400 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium">نوع تولید</th>
                <th className="px-4 py-3 font-medium">تعداد کل</th>
                <th className="px-4 py-3 font-medium">موفق</th>
                <th className="px-4 py-3 font-medium">نرخ موفقیت</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.byType).map(([type, stats]) => (
                <tr key={type} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-slate-200">{type}</td>
                  <td className="px-4 py-3">{stats.total}</td>
                  <td className="px-4 py-3 text-teal-400">{stats.success}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) + "%" : "0%"}
                  </td>
                </tr>
              ))}
              {Object.keys(data.byType).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">داده‌ای یافت نشد.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 flex items-center gap-4">
      <div className={`p-3 rounded-xl bg-slate-800 ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-slate-200 mt-1" dir="ltr">{value}</p>
      </div>
    </div>
  );
}
