/**
 * User Subscription Management Page.
 *
 * Route: `/account/subscription`
 *
 * Displays:
 * - Active subscription details with real-time remaining days/hours calculation
 * - Dynamic urgency alerts (<7d, <3d, <1d) and lifecycle progress bar
 * - Expired and No-subscription empty states with actionable renewal/upgrade CTAs
 * - Quick navigation to purchases history (/account/purchases) & full pricing (/pricing)
 */

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Crown,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Receipt,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Wallet,
  WalletCards,
} from "lucide-react";
import {
  useMySubscription,
  useCommerceProducts,
  useMyOrders,
  useMyEntitlements,
} from "../../hooks/useCommerce.js";
import { useMyWallet } from "../../hooks/useWallet.js";
import {
  calculateRemainingTime,
  calculateSubscriptionProgress,
  formatPersianDate,
  getUrgencyBadge,
  getSubscriptionStatusBadge,
} from "../../components/commerce/userCommerceUtils.js";
import { PricingModal } from "../../components/commerce/PricingModal.js";
import { Button, PageHeader, Skeleton } from "../../components/ui/index.js";
import { UserWalletPage } from "./UserWalletPage.js";
import { UserPurchasesPage } from "./UserPurchasesPage.js";

export type FinanceTabKey = "subscription" | "wallet" | "purchases";

const VALID_TABS: Record<string, FinanceTabKey> = {
  subscription: "subscription",
  wallet: "wallet",
  purchases: "purchases",
  orders: "purchases",
  invoices: "purchases",
};

export interface UserSubscriptionPageProps {
  initialTab?: FinanceTabKey;
}

export function UserSubscriptionPage(props: UserSubscriptionPageProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");

  const activeTab: FinanceTabKey =
    rawTab && VALID_TABS[rawTab]
      ? VALID_TABS[rawTab]
      : (props.initialTab ?? "subscription");

  // Sanitize invalid query parameter if present
  useEffect(() => {
    if (rawTab && !VALID_TABS[rawTab]) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tab");
          return next;
        },
        { replace: true },
      );
    }
  }, [rawTab, setSearchParams]);

  const handleTabChange = (newTab: FinanceTabKey) => {
    if (newTab === activeTab) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newTab === "subscription") {
          next.set("tab", "subscription");
        } else {
          next.set("tab", newTab);
        }
        return next;
      },
      { replace: false },
    );
  };

  const {
    data: subData,
    isLoading: isSubLoading,
    refetch: refetchSub,
  } = useMySubscription();

  const { data: productsData } = useCommerceProducts();

  const {
    data: walletData,
    isLoading: isWalletLoading,
    refetch: refetchWallet,
  } = useMyWallet();

  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    refetch: refetchOrders,
  } = useMyOrders();

  const {
    data: entitlementsData,
    isLoading: isEntLoading,
    refetch: refetchEnt,
  } = useMyEntitlements();

  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isWalletTopupOpen, setIsWalletTopupOpen] = useState(false);

  const isRefreshing =
    isSubLoading || isWalletLoading || isOrdersLoading || isEntLoading;

  const handleRefreshAll = () => {
    void refetchSub();
    void refetchWallet();
    void refetchOrders();
    void refetchEnt();
  };

  const subscription = subData?.subscription;
  const products = productsData?.items ?? [];

  // Match subscription to product details
  const currentProduct = products.find((p) => p.id === subscription?.product_id);

  const remainingInfo = calculateRemainingTime(subscription?.expires_at);
  const progressPercent = calculateSubscriptionProgress(
    subscription?.started_at,
    subscription?.expires_at,
  );
  const urgencyStyle = getUrgencyBadge(remainingInfo.urgency);
  const statusBadge = getSubscriptionStatusBadge(subscription?.status || "");

  const isActive =
    (subscription?.status === "active" ||
      subscription?.status === "active_pending_payment_review") &&
    !remainingInfo.isExpired;
  const isExpired =
    subscription?.status === "expired" ||
    ((subscription?.status === "active" ||
      subscription?.status === "active_pending_payment_review") &&
      remainingInfo.isExpired);

  const walletBalance = walletData?.balance ?? 0;
  const orders = ordersData?.items ?? [];
  const entitlements = entitlementsData?.items ?? [];
  const totalPermanentCount = entitlements.filter(
    (e) =>
      (e.resource_type === "course" || e.resource_type === "content_pack") &&
      e.resource_id,
  ).length;

  const features = [
    "دسترسی کامل و نامحدود به متن تمام درسنامه‌ها",
    "مرور هوشمند و بدون محدودیت فلش‌کارت‌ها با الگوریتم FSRS",
    "آزمون‌های جامع با پاسخ تشریحی و تحلیل تسلط مباحث",
    "گفتگوی نامحدود با دستیار هوشمند آموزشی آوانا (AI Tutor)",
    "نصب تمام بسته‌های آموزشی کتابخانه عمومی آوانا",
  ];

  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8"
      dir="rtl"
    >
      {/* 1. Header Banner */}
      <PageHeader
        title="اشتراک و امور مالی"
        badge={{
          text: "مرکز یکپارچه حساب کاربری",
          icon: <WalletCards className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مدیریت یکپارچه اشتراک، موجودی کیف پول و سوابق سفارش‌ها و فاکتورها"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            title="بروزرسانی اطلاعات"
            aria-label="بروزرسانی اطلاعات"
            leftIcon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
            }
            className="!p-2.5 !h-auto shadow-xs"
          />
        }
      />

      {/* 2. Top Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Subscription Summary */}
        <div className="p-5 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500" />
                <span>وضعیت اشتراک</span>
              </span>
              {!isSubLoading && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isActive
                      ? statusBadge.className
                      : isExpired
                      ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
                      : "bg-slate-100 dark:bg-slate-800 text-[var(--color-text-muted)] border border-[var(--color-border)]"
                  }`}
                >
                  {isActive
                    ? statusBadge.label
                    : isExpired
                    ? "منقضی شده"
                    : "بدون اشتراک"}
                </span>
              )}
            </div>

            {isSubLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton width={140} height={20} />
                <Skeleton width={180} height={14} />
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[var(--color-text)] truncate">
                  {isActive
                    ? currentProduct?.title || "اشتراک ویژه آوانا پلاس"
                    : isExpired
                    ? "اشتراک شما منقضی شده است"
                    : "شما اشتراک فعال ندارید"}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {isActive && subscription?.expires_at ? (
                    <>
                      <span>اعتبار تا: {formatPersianDate(subscription.expires_at)}</span>{" "}
                      <span className="font-semibold text-teal-800 dark:text-teal-200">({remainingInfo.text})</span>
                    </>
                  ) : isExpired && subscription?.expires_at ? (
                    `تاریخ انقضا: ${formatPersianDate(subscription.expires_at)}`
                  ) : (
                    "با آوانا پلاس به تمام دوره‌ها و آزمون‌ها دسترسی پیدا کنید"
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
            <Button
              type="button"
              variant={isActive ? "outline" : "primary"}
              size="sm"
              onClick={() => setIsPricingModalOpen(true)}
              leftIcon={
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
              }
              className="w-full justify-center text-xs"
            >
              {isActive ? "تمدید یا ارتقای اشتراک" : "خرید اشتراک آوانا پلاس"}
            </Button>
          </div>
        </div>

        {/* Card 2: Wallet Summary */}
        <div className="p-5 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-primary" />
                <span>موجودی کیف پول</span>
              </span>
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                اعتبار هوشمند
              </span>
            </div>

            {isWalletLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton width={120} height={24} />
                <Skeleton width={160} height={14} />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-[var(--color-text)] font-mono">
                    {walletBalance.toLocaleString("fa-IR")}
                  </span>
                  <span className="text-xs font-bold text-primary">تومان</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                handleTabChange("wallet");
                setIsWalletTopupOpen(true);
              }}
              leftIcon={<Wallet className="w-3.5 h-3.5 text-primary" />}
              className="w-full justify-center text-xs"
            >
              شارژ و افزایش موجودی
            </Button>
          </div>
        </div>

        {/* Card 3: Purchases & Invoices Summary */}
        <div className="p-5 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-primary" />
                <span>فاکتورها و خریدها</span>
              </span>
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                سوابق مالی
              </span>
            </div>

            {isOrdersLoading || isEntLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton width={130} height={20} />
                <Skeleton width={170} height={14} />
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  {orders.length.toLocaleString("fa-IR")} سفارش ثبت‌شده
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {totalPermanentCount > 0
                    ? `${totalPermanentCount.toLocaleString("fa-IR")} دوره و بسته مادام‌العمر فعال`
                    : "مشاهده تمام فاکتورها و صورت‌حساب‌های پرداخت"}
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTabChange("purchases")}
              leftIcon={<Receipt className="w-3.5 h-3.5 text-primary" />}
              className="w-full justify-center text-xs"
            >
              مشاهده سوابق و فاکتورها
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Internal Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-4 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => handleTabChange("subscription")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === "subscription"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>اشتراک</span>
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("wallet")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === "wallet"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>کیف پول</span>
          {walletBalance > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === "wallet"
                  ? "bg-white/20 text-white"
                  : "bg-teal-500/10 text-primary"
              }`}
            >
              {walletBalance.toLocaleString("fa-IR")}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("purchases")}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === "purchases"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>فاکتورها و خریدها</span>
          {orders.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === "purchases"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 dark:bg-slate-800 text-[var(--color-text-secondary)]"
              }`}
            >
              {orders.length.toLocaleString("fa-IR")}
            </span>
          )}
        </button>
      </div>

      {/* 4. Tab Contents */}

      {/* TAB 1: Subscription */}
      {activeTab === "subscription" && (
        <div className="space-y-8">
          {/* Loading State */}
          {isSubLoading && (
            <div className="py-20 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-xs">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-medium">
                در حال دریافت وضعیت اشتراک کاربر...
              </span>
            </div>
          )}

      {/* 2. Active Subscription Card */}
      {!isSubLoading && isActive && (
        <div className="relative overflow-hidden rounded-3xl bg-[var(--color-surface)] border border-primary/30 p-6 sm:p-8 shadow-xs space-y-6">
          {/* Top Row: Plan Title & Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--color-border)]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-[var(--color-text)]">
                    {currentProduct?.title || "اشتراک ویژه آوانا پلاس"}
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {currentProduct?.description || "دسترسی کامل به تمام دوره‌ها، آزمون‌ها و دستیار هوشمند آموزشی"}
                </p>
              </div>
            </div>

            {/* Remaining time pill */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold ${urgencyStyle.className} self-start sm:self-auto`}>
              <span className={`w-2 h-2 rounded-full ${urgencyStyle.dotClassName}`} />
              <Clock className="w-3.5 h-3.5" />
              <span>{remainingInfo.text}</span>
            </div>
          </div>

          {/* Urgency Alert if less than 7 days */}
          {remainingInfo.urgency !== "normal" && (
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 flex-wrap ${
              remainingInfo.urgency === "critical"
                ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300"
                : remainingInfo.urgency === "serious"
                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300"
                : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300"
            }`}>
              <div className="flex items-center gap-2 text-xs font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {remainingInfo.urgency === "critical"
                    ? "کمتر از ۲۴ ساعت تا پایان اعتبار اشتراک شما باقی مانده است! برای جلوگیری از قطع دسترسی به دوره‌ها، اشتراک خود را تمدید کنید."
                    : remainingInfo.urgency === "serious"
                    ? `تنها ${remainingInfo.days.toLocaleString("fa-IR")} روز از اشتراک شما باقی مانده است. پیشنهاد می‌کنیم نسبت به تمدید اقدام فرمایید.`
                    : `اشتراک شما تا ${remainingInfo.days.toLocaleString("fa-IR")} روز دیگر به پایان می‌رسد.`}
                </span>
              </div>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsPricingModalOpen(true)}
                className="shrink-0 shadow-xs"
              >
                تمدید آنی
              </Button>
            </div>
          )}

          {/* Dates & Timeline Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
              <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>تاریخ شروع اشتراک</span>
              </span>
              <p className="text-sm font-bold text-[var(--color-text)]">
                {formatPersianDate(subscription?.started_at)}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
              <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-rose-500" />
                <span>تاریخ انقضای اشتراک</span>
              </span>
              <p className="text-sm font-bold text-[var(--color-text)]">
                {formatPersianDate(subscription?.expires_at)}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1 sm:col-span-2 lg:col-span-1">
              <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>مدت زمان پلن</span>
              </span>
              <p className="text-sm font-bold text-[var(--color-text)]">
                {currentProduct?.duration_days
                  ? `${currentProduct.duration_days.toLocaleString("fa-IR")} روزه`
                  : "دسترسی فعال"}
              </p>
            </div>
          </div>

          {/* Lifecycle Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>میزان استفاده از دوره اعتبار</span>
              <span className="font-mono text-primary font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-[var(--color-border)]">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Action CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>تمدید اشتراک از تاریخ انقضای فعلی محاسبه شده و هیچ روزی از دست نمی‌رود.</span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setIsPricingModalOpen(true)}
                leftIcon={<Zap className="w-4 h-4 text-amber-300 fill-current" />}
                className="flex-1 sm:flex-none shadow-md shadow-primary/20"
              >
                تمدید یا ارتقای اشتراک
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Expired State Card */}
      {!isSubLoading && isExpired && (
        <div className="rounded-3xl bg-[var(--color-surface)] border border-rose-200 dark:border-rose-900/50 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--color-text)]">
                  اشتراک شما منقضی شده است
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                  منقضی شده
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                تاریخ انقضا: {formatPersianDate(subscription?.expires_at)} — برای دسترسی مجدد به درس‌ها، آزمون‌ها و دستیار هوشمند، اشتراک خود را تمدید فرمایید.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">
              تمامی یادداشت‌ها، پیشرفت دوره‌ها و فلش‌کارت‌های شما حفظ شده و با تمدید فعال می‌شوند.
            </span>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => setIsPricingModalOpen(true)}
              leftIcon={<Zap className="w-4 h-4 text-amber-300 fill-current" />}
              className="w-full sm:w-auto shadow-md shadow-primary/20"
            >
              تمدید مجدد اشتراک
            </Button>
          </div>
        </div>
      )}

      {/* 4. Empty State (No Subscription) */}
      {!isSubLoading && !subscription && (
        <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 sm:p-12 text-center space-y-6 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <Crown className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
              شما در حال حاضر اشتراک فعالی ندارید
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              با فعال‌سازی اشتراک آوانا پلاس، قفل تمام دروس، فلش‌کارت‌های هوشمند، آزمون‌های شبیه‌ساز و دستیار هوشمند باز خواهد شد.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={() => setIsPricingModalOpen(true)}
              leftIcon={<Zap className="w-4 h-4 text-amber-300 fill-current" />}
              className="w-full sm:w-auto shadow-md shadow-primary/20"
            >
              مشاهده و انتخاب پلن اشتراک
            </Button>

            <Link
              to="/pricing"
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[var(--color-surface-warm)] hover:bg-slate-200/60 dark:hover:bg-slate-800 text-[var(--color-text)] border border-[var(--color-border)] text-sm font-bold transition-all text-center"
            >
              مشاهده جدول مقایسه تعرفه‌ها
            </Link>
          </div>
        </div>
      )}

      {/* 5. Features Grid Included in Plus */}
      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-8 space-y-4 shadow-xs">
        <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>امکانات و مزایای اشتراک ویژه آوانا پلاس</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {features.map((feature, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]"
            >
              <div className="w-5 h-5 rounded-full bg-teal-500/10 text-primary flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}

  {/* TAB 2: Wallet */}
  {activeTab === "wallet" && (
    <UserWalletPage
      isEmbedded
      isTopupModalOpen={isWalletTopupOpen}
      onTopupModalChange={setIsWalletTopupOpen}
    />
  )}

  {/* TAB 3: Purchases & Orders */}
  {activeTab === "purchases" && <UserPurchasesPage isEmbedded />}

  {/* Pricing Modal */}
  <PricingModal
    isOpen={isPricingModalOpen}
    onClose={() => setIsPricingModalOpen(false)}
  />
</div>
);
}
