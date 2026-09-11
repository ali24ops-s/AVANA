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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-xs font-bold mb-2">
            <Receipt className="w-3.5 h-3.5" />
            <span>سوابق مالی و مالکیت محتوا</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] tracking-tight">
            خریدهای من و تاریخچه سفارش‌ها
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            مشاهده دوره‌ها و بسته‌های خریداری‌شده دائمی و صورت‌حساب تراکنش‌ها
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/account/subscription"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--color-text)] hover:text-primary bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] transition-colors shadow-xs"
          >
            <Crown className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>مدیریت اشتراک</span>
          </Link>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-4">
        <button
          onClick={() => setActiveTab("entitlements")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "entitlements"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>محتوای خریداری‌شده</span>
          {totalPermanentCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary-light text-primary font-bold">
              {totalPermanentCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "orders"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>سفارش‌ها و فاکتورها</span>
          {orders.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-200 dark:bg-slate-800 text-[var(--color-text-secondary)] font-bold">
              {orders.length}
            </span>
          )}
        </button>
      </div>

      {/* 3. TAB 1: Entitlements (Purchased Courses & Content Packs) */}
      {activeTab === "entitlements" && (
        <div className="space-y-6">
          {isEntLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-xs">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-medium">در حال دریافت دسترسی‌های خریداری‌شده...</span>
            </div>
          ) : totalPermanentCount === 0 ? (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 sm:p-12 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/20 text-primary flex items-center justify-center mx-auto shadow-inner">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                هنوز دوره یا بسته آموزشی مستقلی خریداری نکرده‌اید
              </h3>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                با خرید دائمی هر دوره یا بسته آموزشی، دسترسی مادام‌العمر به آن حتی پس از پایان اشتراک برای شما محفوظ خواهد بود.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <Link
                  to="/courses"
                  className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-md shadow-primary/20"
                >
                  مشاهده دوره‌ها
                </Link>
                <Link
                  to="/library"
                  className="px-6 py-2.5 rounded-xl bg-[var(--color-surface-warm)] hover:bg-slate-200/60 dark:hover:bg-slate-800 text-[var(--color-text)] text-xs font-bold transition-all border border-[var(--color-border)]"
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
                    className="p-5 rounded-2xl bg-[var(--color-surface)] border border-primary/30 hover:border-primary/60 shadow-xs transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/10 text-primary border border-teal-500/20">
                          <BookOpen className="w-3 h-3" />
                          <span>خرید دائمی دوره</span>
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {formatPersianDate(item.starts_at)}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-[var(--color-text)] line-clamp-1">
                        {prod?.title || `دوره آموزشی (${item.resource_id})`}
                      </h4>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">
                        {prod?.description || "دسترسی مادام‌العمر به محتوا و مباحث این دوره"}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-text-muted)]">نوع دسترسی: </span>
                        <span className="font-bold text-primary">مادام‌العمر (Lifetime)</span>
                      </div>

                      <Link
                        to={`/courses/${item.resource_id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-xs"
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
                    className="p-5 rounded-2xl bg-[var(--color-surface)] border border-purple-300 dark:border-purple-800/50 hover:border-purple-500 shadow-xs transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          <Package className="w-3 h-3" />
                          <span>خرید بسته محتوایی</span>
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {formatPersianDate(item.starts_at)}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-[var(--color-text)] line-clamp-1">
                        {prod?.title || `بسته آموزشی (${item.resource_id})`}
                      </h4>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">
                        {prod?.description || "دسترسی مادام‌العمر به جلسات، فلش‌کارت‌ها و آزمون‌های این بسته"}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-text-muted)]">نوع دسترسی: </span>
                        <span className="font-bold text-purple-700 dark:text-purple-300">مادام‌العمر</span>
                      </div>

                      <Link
                        to={`/library?packId=${item.resource_id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-xs"
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
            <div className="py-20 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-xs">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-medium">در حال دریافت تاریخچه سفارش‌ها...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 sm:p-12 text-center space-y-3 shadow-xs">
              <Receipt className="w-12 h-12 text-[var(--color-text-muted)] mx-auto" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">هنوز سفارشی ثبت نشده است</h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
                تاریخچه تمام تراکنش‌ها، پرداخت‌ها و صورت‌حساب‌های شما در این بخش نمایش داده می‌شود.
              </p>
            </div>
          ) : (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                    <tr>
                      <th className="p-4">شماره سفارش</th>
                      <th className="p-4">محصول</th>
                      <th className="p-4">مبلغ</th>
                      <th className="p-4">تاریخ ثبت</th>
                      <th className="p-4">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text-secondary)]">
                    {orders.map((order) => {
                      const prod = getProductById(order.product_id);
                      const badge = getOrderStatusBadge(order.status);
                      return (
                        <tr key={order.id} className="hover:bg-[var(--color-surface-warm)]/50 transition-colors">
                          <td className="p-4 font-mono font-bold text-primary text-xs">
                            {order.order_number}
                          </td>
                          <td className="p-4 font-medium text-[var(--color-text)]">
                            {prod?.title || "محصول آموزشی"}
                          </td>
                          <td className="p-4 font-bold text-[var(--color-text)]">
                            {formatToman(order.amount)}
                          </td>
                          <td className="p-4 text-[var(--color-text-muted)]">
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
