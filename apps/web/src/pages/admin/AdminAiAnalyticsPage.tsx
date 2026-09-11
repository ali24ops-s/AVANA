import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { Cpu, Clock, CheckCircle, AlertTriangle, BarChart3, Sparkles } from "lucide-react";
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
    <div className="space-y-8 text-[var(--color-text)]" dir="rtl">
      {/* Top Header & Analytics Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">آمار هوش مصنوعی</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">مصرف و عملکرد سیستم‌های پردازشی</p>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl self-start sm:self-auto text-xs font-semibold">
          <Link
            to="/admin/analytics"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>آمار کلی پلتفرم</span>
          </Link>
          <Link
            to="/admin/analytics/ai"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
            <span>آمار هوش مصنوعی</span>
          </Link>
        </div>
      </div>

      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="کل پردازش‌ها"
          value={data.overview.totalJobs.toLocaleString("fa-IR")}
          icon={<Cpu className="w-5 h-5 text-[var(--color-primary-default)]" />}
        />
        <StatCard
          title="نرخ موفقیت"
          value={`${data.overview.successRate.toFixed(1)}%`}
          icon={<CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          highlightColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="خطاها"
          value={data.overview.failed.toLocaleString("fa-IR")}
          icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
          highlightColor={data.overview.failed > 0 ? "text-rose-500" : undefined}
        />
        <StatCard
          title="میانگین زمان پردازش"
          value={`${(data.overview.averageDurationMs / 1000).toFixed(1)}s`}
          icon={<Clock className="w-5 h-5 text-amber-500" />}
        />
      </div>

      {/* Token Usage Section */}
      <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
        <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3 flex items-center gap-2">
          <span>آمار توکن‌ها (Token Usage)</span>
        </h2>
        {data.tokens.available ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">توکن‌های ورودی (Input)</p>
              <p className="text-xl font-bold text-[var(--color-text)] mt-1.5" dir="ltr">
                {data.tokens.input.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">توکن‌های خروجی (Output)</p>
              <p className="text-xl font-bold text-[var(--color-text)] mt-1.5" dir="ltr">
                {data.tokens.output.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">کل توکن‌ها (Total)</p>
              <p className="text-xl font-bold text-[var(--color-primary-default)] mt-1.5" dir="ltr">
                {data.tokens.total.toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-center text-xs text-[var(--color-text-muted)]">
            داده مصرف توکن ثبت نشده است (Data not available)
          </div>
        )}
      </div>

      {/* Content Type Breakdown Table */}
      <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
        <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">
          تفکیک بر اساس نوع (Content Type)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs text-[var(--color-text)]" aria-label="تفکیک بر اساس نوع محتوا">
            <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold text-start">نوع تولید</th>
                <th scope="col" className="px-4 py-3 font-bold text-start">تعداد کل</th>
                <th scope="col" className="px-4 py-3 font-bold text-start">موفق</th>
                <th scope="col" className="px-4 py-3 font-bold text-start">نرخ موفقیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {Object.entries(data.byType).map(([type, stats]) => (
                <tr key={type} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{type}</td>
                  <td className="px-4 py-3" dir="ltr">{stats.total.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold" dir="ltr">{stats.success.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] font-medium" dir="ltr">
                    {stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) + "%" : "0%"}
                  </td>
                </tr>
              ))}
              {Object.keys(data.byType).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                    داده‌ای یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  highlightColor,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  highlightColor?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm flex items-center gap-4">
      <div className="p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] shrink-0 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-xs font-medium text-[var(--color-text-muted)]">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${highlightColor || "text-[var(--color-text)]"}`} dir="ltr">
          {value}
        </p>
      </div>
    </div>
  );
}

