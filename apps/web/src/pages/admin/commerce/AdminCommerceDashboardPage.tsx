import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  CircleDollarSign,
  TrendingUp,
  CreditCard,
  Receipt,
  Sparkles,
  PlusCircle,
  Infinity as InfinityIcon,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  FolderTree,
  ShoppingBag,
} from "lucide-react";
import type {
  AdminCommerceStats,
  AdminOrderRecord,
  AdminPaymentRecord,
} from "../../../lib/api/admin.js";
import {
  formatToman,
  getOrderStatusBadge,
  getPaymentStatusBadge,
} from "../../../components/admin/commerce/commerceUtils.js";
import { AdminGrantModal } from "../../../components/admin/commerce/AdminGrantModal.js";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";

export function AdminCommerceDashboardPage() {
  const adminApi = useAdmin();

  const [stats, setStats] = useState<AdminCommerceStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrderRecord[]>([]);
  const [recentPayments, setRecentPayments] = useState<AdminPaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [statsRes, ordersRes, paymentsRes] = await Promise.all([
        adminApi.getCommerceStats(),
        adminApi.listCommerceOrders({ page: 1, pageSize: 6 }),
        adminApi.listCommercePayments({ page: 1, pageSize: 6 }),
      ]);
      setStats(statsRes);
      setRecentOrders(ordersRes.orders);
      setRecentPayments(paymentsRes.payments);
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در دریافت اطلاعات مالی و درآمد");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <CircleDollarSign className="w-7 h-7 text-teal-400" />
            داشبورد فروش و درآمد آوانا
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مشاهده شاخص‌های کلیدی مالی، حجم فروش اشتراک‌ها، دوره‌ها و مدیریت دسترسی‌ها
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/commerce/products"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 rounded-xl text-sm font-medium transition-colors"
          >
            <ShoppingBag className="w-4 h-4 text-teal-400" />
            <span>مدیریت محصولات و قیمت‌ها</span>
          </Link>

          <button
            onClick={() => setIsGrantModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-teal-900/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>اعطای دسترسی مستقیم</span>
          </button>
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {errorMsg && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/20">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>درآمد کل واریزی (تراکنش‌های موفق)</span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
              <CircleDollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white">
              {isLoading ? "..." : formatToman(stats?.totalRevenue ?? 0)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="text-teal-400 font-medium">سفارش‌های موفق:</span>
            <span>{isLoading ? "..." : stats?.successfulOrders?.toLocaleString("fa-IR")}</span>
          </div>
        </div>

        {/* Current Month Revenue */}
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>درآمد ماه جاری</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white">
              {isLoading ? "..." : formatToman(stats?.currentMonthRevenue ?? 0)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">فروش امروز:</span>
            <span>{isLoading ? "..." : formatToman(stats?.todayRevenue ?? 0)}</span>
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/20">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>اشتراک‌های فعال</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white">
              {isLoading ? "..." : (stats?.activeSubscriptions ?? 0).toLocaleString("fa-IR")}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
            <span>کاربران با دسترسی ویژه فعال</span>
          </div>
        </div>

        {/* Lifetime Purchases */}
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/20">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>خریدهای دائمی دوره‌ها و بسته‌ها</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <InfinityIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white">
              {isLoading ? "..." : (stats?.lifetimePurchases ?? 0).toLocaleString("fa-IR")}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
            <span>دسترسی‌های مادام‌العمر صادر شده</span>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown by Stream */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>درآمد اشتراک‌ها</span>
            </div>
            <span className="text-xs text-slate-400">ماهانه/سه‌ماهه/سالانه</span>
          </div>
          <span className="text-xl font-bold text-teal-400 block">
            {isLoading ? "..." : formatToman(stats?.subscriptionRevenue ?? 0)}
          </span>
        </div>

        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <BookOpen className="w-4 h-4 text-blue-400" />
              <span>درآمد فروش دوره‌ها</span>
            </div>
            <span className="text-xs text-slate-400">خرید مستقیم دوره‌ها</span>
          </div>
          <span className="text-xl font-bold text-blue-400 block">
            {isLoading ? "..." : formatToman(stats?.courseRevenue ?? 0)}
          </span>
        </div>

        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <FolderTree className="w-4 h-4 text-purple-400" />
              <span>درآمد بسته‌های آموزشی</span>
            </div>
            <span className="text-xs text-slate-400">Content Packs</span>
          </div>
          <span className="text-xl font-bold text-purple-400 block">
            {isLoading ? "..." : formatToman(stats?.contentPackRevenue ?? 0)}
          </span>
        </div>
      </div>

      {/* Two Column Section: Recent Orders & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/20 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
            <div className="flex items-center gap-2 font-bold text-slate-100 text-sm">
              <Receipt className="w-4 h-4 text-blue-400" />
              <span>آخرین سفارش‌های کاربران</span>
            </div>
            <Link
              to="/admin/commerce/orders"
              className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
            >
              <span>مشاهده همه</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 space-y-3">
            {isLoading ? (
              <p className="text-xs text-slate-400 py-6 text-center">در حال بارگذاری...</p>
            ) : recentOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">سفارشی ثبت نشده است.</p>
            ) : (
              recentOrders.map((o) => {
                const statusBadge = getOrderStatusBadge(o.status);
                return (
                  <div
                    key={o.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/40 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-200 block text-sm">
                        {o.productTitle}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono mt-0.5 block">
                        {o.userEmail} • {o.orderNumber}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-teal-400 text-sm">
                        {formatToman(o.amount)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${statusBadge.className}`}>
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="glass-panel border border-white/5 rounded-2xl p-5 bg-slate-800/20 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
            <div className="flex items-center gap-2 font-bold text-slate-100 text-sm">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span>آخرین تراکنش‌های درگاه پرداخت</span>
            </div>
            <Link
              to="/admin/commerce/payments"
              className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
            >
              <span>مشاهده همه</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 space-y-3">
            {isLoading ? (
              <p className="text-xs text-slate-400 py-6 text-center">در حال بارگذاری...</p>
            ) : recentPayments.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">تراکنشی ثبت نشده است.</p>
            ) : (
              recentPayments.map((p) => {
                const payBadge = getPaymentStatusBadge(p.status);
                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/40 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-200 block text-sm">
                        {p.productTitle || `سفارش ${p.orderNumber}`}
                      </span>
                      <span className="text-slate-400 text-[11px] mt-0.5 block">
                        درگاه {p.gateway} • {p.userEmail}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-emerald-400 text-sm">
                        {formatToman(p.amount)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${payBadge.className}`}>
                        {payBadge.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Grant Modal */}
      <AdminGrantModal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        onSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
}
