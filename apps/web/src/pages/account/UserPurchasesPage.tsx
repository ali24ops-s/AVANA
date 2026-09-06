/**
 * User Purchases & Orders History Page.
 *
 * Route: `/account/purchases`
 *
 * Displays:
 * - Permanent Lifetime Entitlements (Courses & Content Packs owned by user)
 * - Complete Order History with Order Numbers, Amounts in Tomans, Persian Dates, and Statuses
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Receipt,
  BookOpen,
  Package,
  Crown,
  ArrowLeft,
  ShoppingBag,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  useMyEntitlements,
  useMyOrders,
  useCommerceProducts,
} from "../../hooks/useCommerce.js";
import {
  formatToman,
  formatPersianDate,
  getOrderStatusBadge,
} from "../../components/commerce/userCommerceUtils.js";

type PurchasesTab = "entitlements" | "orders";

export function UserPurchasesPage() {
  const [activeTab, setActiveTab] = useState<PurchasesTab>("entitlements");

  const { data: entitlementsData, isLoading: isEntLoading } = useMyEntitlements();
  const { data: ordersData, isLoading: isOrdersLoading } = useMyOrders();
  const { data: productsData } = useCommerceProducts();

  const entitlements = entitlementsData?.items ?? [];
  const orders = ordersData?.items ?? [];
  const products = productsData?.items ?? [];

  // Filter permanent items (course & content pack purchases)
  const courseEntitlements = entitlements.filter(
    (e) => e.resource_type === "course" && e.resource_id,
  );
  const packEntitlements = entitlements.filter(
    (e) => e.resource_type === "content_pack" && e.resource_id,
  );

  // Helper to resolve product for an order or entitlement
  const getProductById = (productId: string) =>
    products.find((p) => p.id === productId);

  const getProductForResource = (resourceType: string, resourceId: string | null) =>
    products.find(
      (p) => p.target_type === resourceType && p.target_id === resourceId,
    );

  const totalPermanentCount = courseEntitlements.length + packEntitlements.length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" dir="rtl">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30 text-xs font-bold mb-2">
            <Receipt className="w-3.5 h-3.5" />
            <span>سوابق مالی و مالکیت محتوا</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            خریدهای من و تاریخچه سفارش‌ها
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            مشاهده دوره‌ها و بسته‌های خریداری‌شده دائمی و صورت‌حساب تراکنش‌ها
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/account/subscription"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <Crown className="w-4 h-4 text-amber-400" />
            <span>مدیریت اشتراک</span>
          </Link>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab("entitlements")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "entitlements"
              ? "bg-teal-600 text-white shadow-lg shadow-teal-900/40"
              : "text-slate-400 hover:text-slate-200 bg-white/[0.03] hover:bg-white/[0.06]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>محتوای خریداری‌شده</span>
          {totalPermanentCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-teal-900/60 border border-teal-400/30 text-teal-200">
              {totalPermanentCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "orders"
              ? "bg-teal-600 text-white shadow-lg shadow-teal-900/40"
              : "text-slate-400 hover:text-slate-200 bg-white/[0.03] hover:bg-white/[0.06]"
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>سفارش‌ها و فاکتورها</span>
          {orders.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-300">
              {orders.length}
            </span>
          )}
        </button>
      </div>

      {/* 3. TAB 1: Entitlements (Purchased Courses & Content Packs) */}
      {activeTab === "entitlements" && (
        <div className="space-y-6">
          {isEntLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3 glass-panel rounded-3xl border border-white/10">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <span className="text-xs font-medium">در حال دریافت دسترسی‌های خریداری‌شده...</span>
            </div>
          ) : totalPermanentCount === 0 ? (
            <div className="rounded-3xl glass-panel border border-white/10 bg-slate-900/60 p-8 sm:p-12 text-center space-y-4 shadow-ambient">
              <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto shadow-inner">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">
                هنوز دوره یا بسته آموزشی مستقلی خریداری نکرده‌اید
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                با خرید دائمی هر دوره یا بسته آموزشی، دسترسی مادام‌العمر به آن حتی پس از پایان اشتراک برای شما محفوظ خواهد بود.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <Link
                  to="/courses"
                  className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  مشاهده دوره‌ها
                </Link>
                <Link
                  to="/library"
                  className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all border border-white/10"
                >
                  کتابخانه بسته‌ها
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Courses */}
              {courseEntitlements.map((item) => {
                const prod = getProductForResource("course", item.resource_id);
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl glass-panel border border-teal-500/30 bg-slate-900/70 hover:border-teal-500/60 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                          <BookOpen className="w-3 h-3" />
                          <span>خرید دائمی دوره</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatPersianDate(item.starts_at)}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-white line-clamp-1">
                        {prod?.title || `دوره آموزشی (${item.resource_id})`}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {prod?.description || "دسترسی مادام‌العمر به محتوا و مباحث این دوره"}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">نوع دسترسی: </span>
                        <span className="font-bold text-teal-300">مادام‌العمر (Lifetime)</span>
                      </div>

                      <Link
                        to={`/courses/${item.resource_id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all"
                      >
                        <span>ورود به دوره</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}

              {/* Content Packs */}
              {packEntitlements.map((item) => {
                const prod = getProductForResource("content_pack", item.resource_id);
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl glass-panel border border-purple-500/30 bg-slate-900/70 hover:border-purple-500/60 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <Package className="w-3 h-3" />
                          <span>خرید بسته محتوایی</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatPersianDate(item.starts_at)}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-white line-clamp-1">
                        {prod?.title || `بسته آموزشی (${item.resource_id})`}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {prod?.description || "دسترسی مادام‌العمر به جلسات، فلش‌کارت‌ها و آزمون‌های این بسته"}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <div className="text-xs text-slate-300">
                        <span className="text-slate-500">نوع دسترسی: </span>
                        <span className="font-bold text-purple-300">مادام‌العمر</span>
                      </div>

                      <Link
                        to={`/library?packId=${item.resource_id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all"
                      >
                        <span>مشاهده بسته</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB 2: Orders History */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {isOrdersLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3 glass-panel rounded-3xl border border-white/10">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <span className="text-xs font-medium">در حال دریافت تاریخچه سفارش‌ها...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-3xl glass-panel border border-white/10 bg-slate-900/60 p-8 sm:p-12 text-center space-y-3 shadow-ambient">
              <Receipt className="w-12 h-12 text-slate-500 mx-auto" />
              <h3 className="text-lg font-bold text-white">هنوز سفارشی ثبت نشده است</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                تاریخچه تمام تراکنش‌ها، پرداخت‌ها و صورت‌حساب‌های شما در این بخش نمایش داده می‌شود.
              </p>
            </div>
          ) : (
            <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden bg-slate-900/60">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-white/[0.03] border-b border-white/10 text-slate-400 font-bold">
                    <tr>
                      <th className="p-4">شماره سفارش</th>
                      <th className="p-4">محصول</th>
                      <th className="p-4">مبلغ</th>
                      <th className="p-4">تاریخ ثبت</th>
                      <th className="p-4">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {orders.map((order) => {
                      const prod = getProductById(order.product_id);
                      const badge = getOrderStatusBadge(order.status);
                      return (
                        <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-4 font-mono font-bold text-teal-300 text-xs">
                            {order.order_number}
                          </td>
                          <td className="p-4 font-medium text-white">
                            {prod?.title || "محصول آموزشی"}
                          </td>
                          <td className="p-4 font-bold text-slate-100">
                            {formatToman(order.amount)}
                          </td>
                          <td className="p-4 text-slate-400">
                            {formatPersianDate(order.created_at, true)}
                          </td>
                          <td className="p-4">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
