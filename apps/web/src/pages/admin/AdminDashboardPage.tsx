import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAdmin } from "../../hooks/useAdmin.js";
import {
  Users,
  BookOpen,
  Layers,
  FileText,
  BrainCircuit,
  Activity,
  Database,
  Server,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  FolderTree,
  FileCheck2,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { AdminStatusBadge } from "../../components/admin/AdminUI.js";

export function AdminDashboardPage() {
  const adminApi = useAdmin();

  // 1. Primary Dashboard Stats
  const {
    data: stats,
    isLoading: isStatsLoading,
    error: statsError,
    refetch: refetchStats,
    isRefetching: isStatsRefetching,
  } = useQuery({
    queryKey: ["admin", "dashboardStats"],
    queryFn: () => adminApi.getDashboardStats(),
  });

  // 2. System Health Status Summary
  const {
    data: health,
    isLoading: isHealthLoading,
    error: healthError,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["admin", "systemHealth"],
    queryFn: () => adminApi.getSystemHealth(),
  });

  // 3. Recent Audit Activity Summary
  const {
    data: auditData,
    isLoading: isAuditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ["admin", "recentAuditLogs"],
    queryFn: () => adminApi.listAuditLogs(1, 5),
  });

  const handleRefreshAll = () => {
    refetchStats();
    refetchHealth();
    refetchAudit();
  };

  // Loading State with Skeletons
  if (isStatsLoading) {
    return <DashboardSkeleton />;
  }

  // Error State with Retry
  if (statsError || !stats) {
    return (
      <div className="glass-panel p-8 rounded-2xl border border-red-500/20 text-center space-y-4 max-w-xl mx-auto my-12" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-100">خطا در دریافت اطلاعات داشبورد</h2>
          <p className="text-sm text-slate-400">
            امکان ارتباط با سرور یا دریافت شاخص‌های عملیاتی وجود ندارد.
          </p>
        </div>
        <button
          onClick={handleRefreshAll}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          تلاش مجدد
        </button>
      </div>
    );
  }

  const primaryKpis = [
    {
      id: "users",
      title: "کل کاربران",
      value: stats.totalUsers.toLocaleString("fa-IR"),
      context: `+${stats.newUsersToday.toLocaleString("fa-IR")} کاربر جدید امروز`,
      icon: Users,
      iconColor: "text-blue-400",
      bgColor: "bg-blue-500/10",
      href: "/admin/users",
    },
    {
      id: "courses",
      title: "دوره‌های آموزشی",
      value: stats.totalCourses.toLocaleString("fa-IR"),
      context: `${stats.totalLessons.toLocaleString("fa-IR")} درس فعال`,
      icon: BookOpen,
      iconColor: "text-purple-400",
      bgColor: "bg-purple-500/10",
      href: "/admin/courses",
    },
    {
      id: "documents",
      title: "اسناد و فایل‌ها",
      value: stats.totalDocuments.toLocaleString("fa-IR"),
      context: "منابع پردازش محتوا",
      icon: FileText,
      iconColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
      href: "/admin/documents",
    },
    {
      id: "generation",
      title: "پردازش‌های AI امروز",
      value: stats.generationsToday.toLocaleString("fa-IR"),
      context: `نرخ موفقیت: ${stats.generationSuccessRate}%`,
      icon: BrainCircuit,
      iconColor: "text-teal-400",
      bgColor: "bg-teal-500/10",
      href: "/admin/generation",
    },
  ];

  return (
    <div className="space-y-8" dir="rtl">
      {/* 1. Header & Quick Action Shortcuts */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <span>داشبورد مدیریت</span>
            <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
              نمای عملیاتی پلتفرم
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            وضعیت کلی کاربران، محتوای آموزشی، پردازش‌های هوش مصنوعی و زیرساخت
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshAll}
            disabled={isStatsRefetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-white/5 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="به‌روزرسانی آمار داشبورد"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isStatsRefetching ? "animate-spin text-teal-400" : ""}`} />
            <span>به‌روزرسانی</span>
          </button>
        </div>
      </header>

      {/* 2. Quick Navigation Shortcuts */}
      <section aria-label="دسترسی سریع به بخش‌های مدیریت" className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          دسترسی سریع
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <QuickNavLink to="/admin/users" label="مدیریت کاربران" icon={Users} />
          <QuickNavLink to="/admin/courses" label="دوره‌ها" icon={BookOpen} />
          <QuickNavLink to="/admin/content" label="مدیریت محتوا" icon={FolderTree} />
          <QuickNavLink to="/admin/documents" label="اسناد و فایل‌ها" icon={FileText} />
          <QuickNavLink to="/admin/generation" label="تاریخچه تولیدات AI" icon={BrainCircuit} />
          <QuickNavLink to="/admin/system/health" label="سلامت سیستم" icon={Activity} />
        </div>
      </section>

      {/* 3. Primary KPI Row */}
      <section aria-label="شاخص‌های کلیدی عملکرد">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {primaryKpis.map((kpi) => (
            <Link
              key={kpi.id}
              to={kpi.href}
              className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/15 transition-all duration-200 group block focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400">{kpi.title}</p>
                  <h3 className="text-2xl font-bold text-slate-100 mt-1 tracking-tight">
                    {kpi.value}
                  </h3>
                  <p className="text-xs text-slate-400 group-hover:text-teal-400 transition-colors">
                    {kpi.context}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${kpi.bgColor} ${kpi.iconColor} group-hover:scale-105 transition-transform`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Middle Section: Content Overview & AI Generation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Hierarchy Overview */}
        <section
          aria-label="خلاصه محتوای آموزشی"
          className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">نمای محتوای آموزشی</h2>
                  <p className="text-xs text-slate-400">ساختار و حجم منابع آموزشی فعال در پلتفرم</p>
                </div>
              </div>
              <Link
                to="/admin/content"
                className="text-xs font-medium text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
              >
                <span>مدیریت محتوا</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ContentStatItem
                label="دوره‌ها"
                count={stats.totalCourses}
                icon={BookOpen}
                color="text-purple-400"
              />
              <ContentStatItem
                label="درس‌ها"
                count={stats.totalLessons}
                icon={Layers}
                color="text-teal-400"
              />
              <ContentStatItem
                label="فلش‌کارت‌ها"
                count={stats.totalFlashcards}
                icon={Sparkles}
                color="text-amber-400"
              />
              <ContentStatItem
                label="آزمون‌ها"
                count={stats.totalQuizzes}
                icon={CheckCircle}
                color="text-indigo-400"
              />
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>کل اسناد ورودی: <strong className="text-slate-200">{stats.totalDocuments.toLocaleString("fa-IR")} سند</strong></span>
            <Link to="/admin/documents" className="text-teal-400 hover:underline">
              مشاهده اسناد
            </Link>
          </div>
        </section>

        {/* AI Generation Operational Overview */}
        <section
          aria-label="وضعیت تولید هوش مصنوعی"
          className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">عملکرد تولید هوش مصنوعی</h2>
                  <p className="text-xs text-slate-400">وضعیت پایش و نرخ موفقیت پردازش‌های امروز</p>
                </div>
              </div>
              <Link
                to="/admin/generation"
                className="text-xs font-medium text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
              >
                <span>تاریخچه تولیدات</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">نرخ موفقیت پردازش‌ها</span>
                <span className="text-lg font-bold text-slate-100" dir="ltr">
                  {stats.generationSuccessRate}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-white/5" dir="ltr">
                <div
                  className={`h-full transition-all duration-500 ${
                    stats.generationSuccessRate >= 90
                      ? "bg-teal-500"
                      : stats.generationSuccessRate >= 70
                      ? "bg-amber-500"
                      : stats.generationsToday === 0
                      ? "bg-slate-600"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, stats.generationSuccessRate))}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5">
                  <p className="text-xs text-slate-400">درخواست‌های امروز</p>
                  <p className="text-lg font-bold text-slate-200 mt-0.5">
                    {stats.generationsToday.toLocaleString("fa-IR")}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5">
                  <p className="text-xs text-slate-400">وضعیت عملیاتی</p>
                  <div className="mt-1">
                    {stats.generationsToday === 0 ? (
                      <span className="text-xs font-medium text-slate-400">بدون درخواست امروز</span>
                    ) : stats.generationSuccessRate >= 90 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> عملکرد بهینه
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" /> نیازمند بررسی
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>ارائه‌دهندگان و پرامپت‌ها</span>
            <div className="flex gap-3">
              <Link to="/admin/generation/providers" className="text-teal-400 hover:underline">
                ارائه‌دهنده‌ها
              </Link>
              <Link to="/admin/generation/prompts" className="text-teal-400 hover:underline">
                پرامپت‌ها
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* 5. Bottom Section: System Status & Recent Operational Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health Summary */}
        <section
          aria-label="سلامت سرویس‌های سیستم"
          className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">سلامت سرویس‌های زیرساخت</h2>
                  <p className="text-xs text-slate-400">وضعیت پایگاه داده، کش و ارتباطات AI</p>
                </div>
              </div>
              <Link
                to="/admin/system/health"
                className="text-xs font-medium text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
              >
                <span>مشاهده کامل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isHealthLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
              </div>
            ) : healthError ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                عدم امکان دریافت وضعیت سلامت سرویس‌ها
              </div>
            ) : health ? (
              <div className="space-y-3">
                <HealthRow
                  title="پایگاه داده (PostgreSQL)"
                  status={health.database}
                  icon={Database}
                  iconColor="text-blue-400"
                />
                <HealthRow
                  title="حافظه پنهان (Redis)"
                  status={health.redis}
                  icon={Server}
                  iconColor="text-amber-400"
                />
                <HealthRow
                  title="سرویس هوش مصنوعی (AI Provider)"
                  status={health.ai}
                  icon={Cpu}
                  iconColor="text-teal-400"
                />
              </div>
            ) : null}
          </div>

          {health && (
            <div className="pt-4 mt-5 border-t border-white/5 text-xs text-slate-500 flex items-center justify-between">
              <span>آخرین پایش زیرساخت:</span>
              <span dir="ltr">{new Date(health.lastCheck).toLocaleTimeString("fa-IR")}</span>
            </div>
          )}
        </section>

        {/* Recent Audit Activity */}
        <section
          aria-label="آخرین فعالیت‌های ثبت‌شده"
          className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">آخرین فعالیت‌های سیستمی</h2>
                  <p className="text-xs text-slate-400">رهگیری تغییرات و اقدامات اخیر مدیران پلتفرم</p>
                </div>
              </div>
              <Link
                to="/admin/system/audit"
                className="text-xs font-medium text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
              >
                <span>گزارش حسابرسی</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isAuditLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
              </div>
            ) : auditError ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                عدم امکان دریافت گزارش فعالیت‌ها
              </div>
            ) : !auditData || auditData.logs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 rounded-xl bg-slate-800/20 border border-white/5">
                هیچ فعالیت اخیری ثبت نشده است.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {auditData.logs.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200 truncate">{log.adminEmail}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {log.entity} {log.entityId ? `(${log.entityId})` : ""}
                      </p>
                    </div>
                    <span className="text-slate-500 whitespace-nowrap" dir="ltr">
                      {new Date(log.timestamp).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-white/5 text-xs text-slate-400 flex items-center justify-between">
            <span>مجموع لاگ‌های ثبت‌شده: <strong className="text-slate-200">{(auditData?.totalCount || 0).toLocaleString("fa-IR")}</strong></span>
            <Link to="/admin/system/logs" className="text-teal-400 hover:underline">
              لاگ‌های سرور
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Quick Navigation Shortcut Button Component
 */
function QuickNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to}
      className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-white/5 hover:border-white/15 transition-all text-slate-300 hover:text-white flex items-center gap-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-teal-500"
    >
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Content Stat Item Component
 */
function ContentStatItem({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="p-3.5 rounded-xl bg-slate-800/30 border border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-xl font-bold text-slate-100">{count.toLocaleString("fa-IR")}</p>
    </div>
  );
}

/**
 * Health Status Row Component
 */
function HealthRow({
  title,
  status,
  icon: Icon,
  iconColor,
}: {
  title: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-slate-800/30 border border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-xs font-medium text-slate-300">{title}</span>
      </div>
      <AdminStatusBadge status={status} />
    </div>
  );
}

/**
 * Layout-Preserving Skeleton Loading Component
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-8" dir="rtl">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-slate-800/60 rounded-md animate-pulse" />
        </div>
        <div className="h-8 w-24 bg-slate-800 rounded-lg animate-pulse" />
      </div>

      {/* Quick Nav Skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-800/40 rounded-xl animate-pulse" />
        ))}
      </div>

      {/* KPI Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-800/40 border border-white/5 rounded-2xl p-5 animate-pulse" />
        ))}
      </div>

      {/* Middle Grid Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-56 bg-slate-800/40 border border-white/5 rounded-2xl p-6 animate-pulse" />
        <div className="h-56 bg-slate-800/40 border border-white/5 rounded-2xl p-6 animate-pulse" />
      </div>

      {/* Bottom Grid Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-56 bg-slate-800/40 border border-white/5 rounded-2xl p-6 animate-pulse" />
        <div className="h-56 bg-slate-800/40 border border-white/5 rounded-2xl p-6 animate-pulse" />
      </div>
    </div>
  );
}
