import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { Users, BookOpen, Layers, CheckCircle, Cpu, AlertTriangle, BarChart3, Sparkles } from "lucide-react";
import { AdminLoadingState, AdminErrorState } from "../../components/admin/AdminUI";

interface PeriodStats {
  newUsers: number;
  courses: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
  aiJobs: number;
  aiSuccess: number;
  aiFailed: number;
}

interface AnalyticsData {
  total: { totalUsers: number; totalLessons: number };
  today: PeriodStats;
  last7Days: PeriodStats;
  last30Days: PeriodStats;
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
    <div className="space-y-8 text-[var(--color-text)]" dir="rtl">
      {/* Top Header & Analytics Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">آمار و تحلیل‌ها (Analytics)</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">بررسی رشد کاربران و محتوای پلتفرم</p>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl self-start sm:self-auto text-xs font-semibold">
          <Link
            to="/admin/analytics"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm transition-all"
          >
            <BarChart3 className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
            <span>آمار کلی پلتفرم</span>
          </Link>
          <Link
            to="/admin/analytics/ai"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>آمار هوش مصنوعی</span>
          </Link>
        </div>
      </div>

      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="کل کاربران" value={data.total.totalUsers} icon={<Users className="w-5 h-5 text-[var(--color-primary-default)]" />} />
        <StatCard title="کاربران جدید (۳۰ روز)" value={data.last30Days.newUsers} icon={<Users className="w-5 h-5 text-[var(--color-primary-default)]" />} />
        <StatCard title="کل درس‌ها" value={data.total.totalLessons} icon={<BookOpen className="w-5 h-5 text-[var(--color-primary-default)]" />} />
        <StatCard title="درس‌های جدید (۳۰ روز)" value={data.last30Days.lessons} icon={<Layers className="w-5 h-5 text-[var(--color-primary-default)]" />} />
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

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm flex items-center gap-4">
      <div className="p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] shrink-0 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-xs font-medium text-[var(--color-text-muted)]">{title}</p>
        <p className="text-2xl font-bold text-[var(--color-text)] mt-1" dir="ltr">{value.toLocaleString("fa-IR")}</p>
      </div>
    </div>
  );
}

function PeriodCard({ title, stats }: { title: string; stats: PeriodStats }) {
  return (
    <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
      <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">{title}</h2>
      <div className="space-y-3 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-[var(--color-text-muted)]">کاربران جدید</span>
          <span className="font-bold text-[var(--color-text)]" dir="ltr">{stats.newUsers.toLocaleString("fa-IR")}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--color-text-muted)]">دوره‌های ایجاد شده</span>
          <span className="font-bold text-[var(--color-text)]" dir="ltr">{stats.courses.toLocaleString("fa-IR")}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--color-text-muted)]">فلش‌کارت‌ها</span>
          <span className="font-bold text-[var(--color-text)]" dir="ltr">{stats.flashcards.toLocaleString("fa-IR")}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--color-text-muted)]">آزمون‌ها</span>
          <span className="font-bold text-[var(--color-text)]" dir="ltr">{stats.quizzes.toLocaleString("fa-IR")}</span>
        </div>
        <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
              <span>پردازش‌های AI</span>
            </span>
            <span className="font-bold text-[var(--color-text)]" dir="ltr">{stats.aiJobs.toLocaleString("fa-IR")}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>موفق</span>
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">{stats.aiSuccess.toLocaleString("fa-IR")}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-rose-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>خطا</span>
            </span>
            <span className="font-bold text-rose-500" dir="ltr">{stats.aiFailed.toLocaleString("fa-IR")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

