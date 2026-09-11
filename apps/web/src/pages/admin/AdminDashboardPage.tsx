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
  CircleDollarSign,
  PackageCheck,
} from "lucide-react";
import { AdminStatusBadge } from "../../components/admin/AdminUI.js";
import { formatToman } from "../../components/admin/commerce/commerceUtils.js";

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

  // 4. Commerce Stats Summary
  const {
    data: commerceStats,
    isLoading: isCommerceLoading,
    refetch: refetchCommerce,
  } = useQuery({
    queryKey: ["admin", "commerceStats"],
    queryFn: () => adminApi.getCommerceStats(),
  });

  const handleRefreshAll = () => {
    refetchStats();
    refetchHealth();
    refetchAudit();
    refetchCommerce();
  };

  // Loading State with Skeletons
  if (isStatsLoading) {
    return <DashboardSkeleton />;
  }

  // Error State with Retry
  if (statsError || !stats) {
    return (
      <div className="bg-[var(--color-surface)] p-8 rounded-2xl border border-rose-500/20 text-center space-y-4 max-w-xl mx-auto my-12 shadow-sm" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[var(--color-text)]">خطا در دریافت اطلاعات داشبورد</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            امکان ارتباط با سرور یا دریافت شاخص‌های عملیاتی وجود ندارد.
          </p>
        </div>
        <button
          onClick={handleRefreshAll}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
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
      iconColor: "text-blue-500",
      bgColor: "bg-blue-500/10",
      href: "/admin/users",
    },
    {
      id: "courses",
      title: "دوره‌های آموزشی",
      value: stats.totalCourses.toLocaleString("fa-IR"),
      context: `${stats.totalLessons.toLocaleString("fa-IR")} درس فعال`,
      icon: BookOpen,
      iconColor: "text-purple-500",
      bgColor: "bg-purple-500/10",
      href: "/admin/courses",
    },
    {
      id: "documents",
      title: "اسناد و فایل‌ها",
      value: stats.totalDocuments.toLocaleString("fa-IR"),
      context: "منابع پردازش محتوا",
      icon: FileText,
      iconColor: "text-amber-500",
      bgColor: "bg-amber-500/10",
      href: "/admin/documents",
    },
    {
      id: "generation",
      title: "پردازش‌های AI امروز",
      value: stats.generationsToday.toLocaleString("fa-IR"),
      context: `نرخ موفقیت: ${stats.generationSuccessRate}%`,
      icon: BrainCircuit,
      iconColor: "text-[var(--color-primary-default)]",
      bgColor: "bg-[var(--color-primary-default)]/10",
      href: "/admin/generation",
    },
  ];

  return (
    <div className="space-y-8" dir="rtl">
      {/* 1. Header & Quick Action Shortcuts */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-[var(--color-border)]">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2.5">
            <span>داشبورد مدیریت</span>
            <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-primary-default)] border border-[var(--color-border)]">
              نمای عملیاتی پلتفرم
            </span>
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            وضعیت کلی کاربران، محتوای آموزشی، پردازش‌های هوش مصنوعی و زیرساخت
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshAll}
            disabled={isStatsRefetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-medium border border-[var(--color-border)] transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            aria-label="به‌روزرسانی آمار داشبورد"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isStatsRefetching ? "animate-spin text-[var(--color-primary-default)]" : ""}`} />
            <span>به‌روزرسانی</span>
          </button>
        </div>
      </header>

      {/* 2. Quick Navigation Shortcuts */}
      <section aria-label="دسترسی سریع به بخش‌های مدیریت" className="space-y-2">
        <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          دسترسی سریع
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <QuickNavLink to="/admin/commerce" label="فروش و درآمد" icon={CircleDollarSign} />
          <QuickNavLink to="/admin/community-content" label="بررسی محتوا" icon={PackageCheck} />
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
              className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-border)] hover:shadow-md transition-all duration-200 group block focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]/50"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">{kpi.title}</p>
                  <h3 className="text-2xl font-bold text-[var(--color-text)] mt-1 tracking-tight">
                    {kpi.value}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-primary-default)] transition-colors">
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

      {/* 3.5. Commerce & Revenue Summary Widget */}
      <section aria-label="خلاصه وضعیت مالی و درآمد" className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[var(--color-border)] mb-5 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-primary-default)]">
              <CircleDollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text)]">وضعیت فروش و درآمد پلتفرم</h2>
              <p className="text-xs text-[var(--color-text-muted)]">شاخص‌های تجاری، تراکنش‌های بانکی و اشتراک‌های فعال</p>
            </div>
          </div>
          <Link
            to="/admin/commerce"
            className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 transition-colors self-start sm:self-auto"
          >
            <span>مشاهده داشبورد مالی کامل</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)] block mb-1">درآمد کل واریزی:</span>
            <span className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              {isCommerceLoading ? "..." : formatToman(commerceStats?.totalRevenue ?? 0)}
            </span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)] block mb-1">فروش ماه جاری:</span>
            <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {isCommerceLoading ? "..." : formatToman(commerceStats?.currentMonthRevenue ?? 0)}
            </span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)] block mb-1">اشتراک‌های فعال:</span>
            <span className="text-base sm:text-lg font-bold text-[var(--color-primary-default)]">
              {isCommerceLoading ? "..." : (commerceStats?.activeSubscriptions ?? 0).toLocaleString("fa-IR")}
            </span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)] block mb-1">خریدهای دائمی دوره‌ها:</span>
            <span className="text-base sm:text-lg font-bold text-purple-600 dark:text-purple-400">
              {isCommerceLoading ? "..." : (commerceStats?.lifetimePurchases ?? 0).toLocaleString("fa-IR")}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Middle Section: Content Overview & AI Generation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Hierarchy Overview */}
        <section
          aria-label="خلاصه محتوای آموزشی"
          className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--color-text)]">نمای محتوای آموزشی</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">ساختار و حجم منابع آموزشی فعال در پلتفرم</p>
                </div>
              </div>
              <Link
                to="/admin/content"
                className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 transition-colors"
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
                color="text-purple-500"
              />
              <ContentStatItem
                label="درس‌ها"
                count={stats.totalLessons}
                icon={Layers}
                color="text-[var(--color-primary-default)]"
              />
              <ContentStatItem
                label="فلش‌کارت‌ها"
                count={stats.totalFlashcards}
                icon={Sparkles}
                color="text-amber-500"
              />
              <ContentStatItem
                label="آزمون‌ها"
                count={stats.totalQuizzes}
                icon={CheckCircle}
                color="text-indigo-500"
              />
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>کل اسناد ورودی: <strong className="text-[var(--color-text)]">{stats.totalDocuments.toLocaleString("fa-IR")} سند</strong></span>
            <Link to="/admin/documents" className="text-[var(--color-primary-default)] hover:underline">
              مشاهده اسناد
            </Link>
          </div>
        </section>

        {/* AI Generation Operational Overview */}
        <section
          aria-label="وضعیت تولید هوش مصنوعی"
          className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-primary-default)]">
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--color-text)]">عملکرد تولید هوش مصنوعی</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">وضعیت پایش و نرخ موفقیت پردازش‌های امروز</p>
                </div>
              </div>
              <Link
                to="/admin/generation"
                className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 transition-colors"
              >
                <span>تاریخچه تولیدات</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">نرخ موفقیت پردازش‌ها</span>
                <span className="text-lg font-bold text-[var(--color-text)]" dir="ltr">
                  {stats.generationSuccessRate}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[var(--color-surface-subtle)] rounded-full h-2.5 overflow-hidden border border-[var(--color-border)]" dir="ltr">
                <div
                  className={`h-full transition-all duration-500 ${
                    stats.generationSuccessRate >= 90
                      ? "bg-[var(--color-primary-default)]"
                      : stats.generationSuccessRate >= 70
                      ? "bg-amber-500"
                      : stats.generationsToday === 0
                      ? "bg-[var(--color-text-muted)]"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, stats.generationSuccessRate))}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                  <p className="text-xs text-[var(--color-text-muted)]">درخواست‌های امروز</p>
                  <p className="text-lg font-bold text-[var(--color-text)] mt-0.5">
                    {stats.generationsToday.toLocaleString("fa-IR")}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                  <p className="text-xs text-[var(--color-text-muted)]">وضعیت عملیاتی</p>
                  <div className="mt-1">
                    {stats.generationsToday === 0 ? (
                      <span className="text-xs font-medium text-[var(--color-text-muted)]">بدون درخواست امروز</span>
                    ) : stats.generationSuccessRate >= 90 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-primary-default)]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> عملکرد بهینه
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                        <AlertTriangle className="w-3.5 h-3.5" /> نیازمند بررسی
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>ارائه‌دهندگان و پرامپت‌ها</span>
            <div className="flex gap-3">
              <Link to="/admin/generation/providers" className="text-[var(--color-primary-default)] hover:underline">
                ارائه‌دهنده‌ها
              </Link>
              <Link to="/admin/generation/prompts" className="text-[var(--color-primary-default)] hover:underline">
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
          className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--color-text)]">سلامت سرویس‌های زیرساخت</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">وضعیت پایگاه داده، کش و ارتباطات AI</p>
                </div>
              </div>
              <Link
                to="/admin/system/health"
                className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 transition-colors"
              >
                <span>مشاهده کامل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isHealthLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
                <div className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
                <div className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
              </div>
            ) : healthError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500">
                عدم امکان دریافت وضعیت سلامت سرویس‌ها
              </div>
            ) : health ? (
              <div className="space-y-3">
                <HealthRow
                  title="پایگاه داده (PostgreSQL)"
                  status={health.database}
                  icon={Database}
                  iconColor="text-blue-500"
                />
                <HealthRow
                  title="حافظه پنهان (Redis)"
                  status={health.redis}
                  icon={Server}
                  iconColor="text-amber-500"
                />
                <HealthRow
                  title="سرویس هوش مصنوعی (AI Provider)"
                  status={health.ai}
                  icon={Cpu}
                  iconColor="text-[var(--color-primary-default)]"
                />
              </div>
            ) : null}
          </div>

          {health && (
            <div className="pt-4 mt-5 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
              <span>آخرین پایش زیرساخت:</span>
              <span dir="ltr">{new Date(health.lastCheck).toLocaleTimeString("fa-IR")}</span>
            </div>
          )}
        </section>

        {/* Recent Audit Activity */}
        <section
          aria-label="آخرین فعالیت‌های ثبت‌شده"
          className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--color-text)]">آخرین فعالیت‌های سیستمی</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">رهگیری تغییرات و اقدامات اخیر مدیران پلتفرم</p>
                </div>
              </div>
              <Link
                to="/admin/system/audit"
                className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 transition-colors"
              >
                <span>گزارش حسابرسی</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isAuditLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
                <div className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
                <div className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
              </div>
            ) : auditError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500">
                عدم امکان دریافت گزارش فعالیت‌ها
              </div>
            ) : !auditData || auditData.logs.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--color-text-muted)] rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
                هیچ فعالیت اخیری ثبت نشده است.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {auditData.logs.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--color-text)] truncate">{log.adminEmail}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface-warm)] text-[var(--color-primary-default)] border border-[var(--color-border)] font-mono text-[10px]">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                        {log.entity} {log.entityId ? `(${log.entityId})` : ""}
                      </p>
                    </div>
                    <span className="text-[var(--color-text-muted)] whitespace-nowrap" dir="ltr">
                      {new Date(log.timestamp).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
            <span>مجموع لاگ‌های ثبت‌شده: <strong className="text-[var(--color-text)]">{(auditData?.totalCount || 0).toLocaleString("fa-IR")}</strong></span>
            <Link to="/admin/system/logs" className="text-[var(--color-primary-default)] hover:underline">
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
      className="p-3 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] hover:border-[var(--color-border)] transition-all text-[var(--color-text)] hover:text-[var(--color-primary-default)] shadow-sm flex items-center gap-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-default)]"
    >
      <Icon className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
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
    <div className="p-3.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-xl font-bold text-[var(--color-text)]">{count.toLocaleString("fa-IR")}</p>
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
    <div className="p-3 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-xs font-medium text-[var(--color-text)]">{title}</span>
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
      <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-[var(--color-surface-subtle)] rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-[var(--color-surface-subtle)]/60 rounded-md animate-pulse" />
        </div>
        <div className="h-8 w-24 bg-[var(--color-surface-subtle)] rounded-lg animate-pulse" />
      </div>

      {/* Quick Nav Skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-[var(--color-surface-subtle)] rounded-xl animate-pulse" />
        ))}
      </div>

      {/* KPI Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 animate-pulse" />
        ))}
      </div>

      {/* Middle Grid Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 animate-pulse" />
        <div className="h-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 animate-pulse" />
      </div>

      {/* Bottom Grid Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 animate-pulse" />
        <div className="h-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 animate-pulse" />
      </div>
    </div>
  );
}
