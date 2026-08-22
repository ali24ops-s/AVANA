import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { Users, BookOpen, Layers, CheckCircle, Cpu, AlertTriangle } from "lucide-react";
import { AdminLoadingState, AdminErrorState } from "../../components/admin/AdminUI";

interface AnalyticsData {
  total: { totalUsers: number; totalLessons: number };
  today: any;
  last7Days: any;
  last30Days: any;
}

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AnalyticsData>("/admin/analytics")
      .then(res => setData(res))
      .catch(err => setError(err.message || "خطا در دریافت آمار"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLoadingState colSpan={1} />;
  if (error) return <AdminErrorState message={error} colSpan={1} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">آمار و تحلیل‌ها (Analytics)</h1>
        <p className="text-sm text-slate-400 mt-1">بررسی رشد کاربران و محتوای پلتفرم</p>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="کل کاربران" value={data.total.totalUsers} icon={<Users />} color="text-blue-400" />
        <StatCard title="کاربران جدید (۳۰ روز)" value={data.last30Days.newUsers} icon={<Users />} color="text-teal-400" />
        <StatCard title="کل درس‌ها" value={data.total.totalLessons} icon={<BookOpen />} color="text-purple-400" />
        <StatCard title="درس‌های جدید (۳۰ روز)" value={data.last30Days.lessons} icon={<Layers />} color="text-indigo-400" />
      </div>

      {/* Details by Date Range */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PeriodCard title="امروز" stats={data.today} />
        <PeriodCard title="هفت روز گذشته" stats={data.last7Days} />
        <PeriodCard title="سی روز گذشته" stats={data.last30Days} />
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
        <p className="text-2xl font-bold text-slate-200 mt-1">{value}</p>
      </div>
    </div>
  );
}

function PeriodCard({ title, stats }: any) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
      <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">{title}</h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">کاربران جدید</span>
          <span className="text-slate-200">{stats.newUsers}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">دوره‌های ایجاد شده</span>
          <span className="text-slate-200">{stats.courses}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">فلش‌کارت‌ها</span>
          <span className="text-slate-200">{stats.flashcards}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">آزمون‌ها</span>
          <span className="text-slate-200">{stats.quizzes}</span>
        </div>
        <div className="pt-2 border-t border-white/5">
          <div className="flex justify-between mb-2">
            <span className="text-slate-400 flex items-center gap-2"><Cpu className="w-4 h-4"/> پردازش‌های AI</span>
            <span className="text-slate-200">{stats.aiJobs}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-teal-400 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> موفق</span>
            <span className="text-teal-300">{stats.aiSuccess}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> خطا</span>
            <span className="text-red-300">{stats.aiFailed}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
