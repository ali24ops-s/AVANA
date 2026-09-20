/**
 * User Wallet & Credit Balance Page.
 *
 * Route: `/account/wallet`
 *
 * Displays:
 * - Current Avana Credit balance (1 Avana Credit = 1 Toman)
 * - Equivalent value in Tomans
 * - Complete immutable transaction history ledger (Credits, Debits, Refunds, Adjustments)
 * - Loading, Error with Retry, and Empty states
 * - Quick cross-navigation to Subscriptions and Purchases
 */

import { useState } from "react";
import {
  Wallet,
  Crown,
  Receipt,
  RefreshCw,
  Clock,
  Sparkles,
  Info,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CreditCard,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  useMyWallet,
  useMyWalletTransactions,
  useMyWalletTopups,
} from "../../hooks/useWallet.js";
import {
  formatPersianDate,
  formatToman,
} from "../../components/commerce/userCommerceUtils.js";
import { toPersianDigits } from "@avana/domain";
import {
  getTransactionTypeDisplay,
  getTransactionSourceDisplay,
  getReferenceTypeLabel,
  getTopupStatusDisplay,
} from "../../components/wallet/walletUtils.js";
import {
  Button,
  Alert,
  Skeleton,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Input,
  PageHeader,
} from "../../components/ui/index.js";

const PRESET_AMOUNTS = [
  50_000,
  100_000,
  200_000,
  500_000,
  1_000_000,
];

export function UserWalletPage() {
  const navigate = useNavigate();

  const {
    data: walletData,
    isLoading: isWalletLoading,
    isError: isWalletError,
    error: walletError,
    refetch: refetchWallet,
  } = useMyWallet();

  const {
    data: transactionsData,
    isLoading: isTransactionsLoading,
    isError: isTransactionsError,
    error: transactionsError,
    refetch: refetchTransactions,
  } = useMyWalletTransactions();

  const {
    data: topupsData,
    isError: isTopupsError,
    error: topupsError,
    refetch: refetchTopups,
  } = useMyWalletTopups();

  // Top-up Modal State
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number>(100_000);
  const [customAmountText, setCustomAmountText] = useState<string>("100,000");
  const [topupError, setTopupError] = useState<string | null>(null);

  const balance = walletData?.balance ?? 0;
  const transactions = transactionsData?.transactions ?? [];
  const totalTransactions = transactionsData?.total ?? transactions.length;
  const topups = topupsData?.topups ?? [];

  const isLoading = isWalletLoading || isTransactionsLoading;
  const hasError = isWalletError || isTransactionsError || isTopupsError;
  const errorMessage =
    (walletError instanceof Error ? walletError.message : null) ||
    (transactionsError instanceof Error ? transactionsError.message : null) ||
    (topupsError instanceof Error ? topupsError.message : null) ||
    "خطا در دریافت اطلاعات کیف پول و تراکنش‌ها";

  const handleRetry = () => {
    void refetchWallet();
    void refetchTransactions();
    void refetchTopups();
  };

  const handleSelectPreset = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmountText(amount.toLocaleString("en-US"));
    setTopupError(null);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, "");
    if (!rawVal) {
      setSelectedAmount(0);
      setCustomAmountText("");
      setTopupError("لطفاً مبلغ مورد نظر را وارد نمایید");
      return;
    }
    const num = parseInt(rawVal, 10);
    setSelectedAmount(num);
    setCustomAmountText(num.toLocaleString("en-US"));

    if (num < 10_000) {
      setTopupError("حداقل مبلغ شارژ ۱۰,۰۰۰ تومان می‌باشد");
    } else {
      setTopupError(null);
    }
  };

  const handleProceedToTopup = () => {
    if (selectedAmount < 10_000) {
      setTopupError("حداقل مبلغ شارژ ۱۰,۰۰۰ تومان می‌باشد");
      return;
    }
    setIsTopupModalOpen(false);
    navigate(`/checkout/card-to-card?productId=wallet_topup&amount=${selectedAmount}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" dir="rtl">
      {/* 1. Header Banner & Sub-Navigation */}
      <PageHeader
        title="کیف پول"
        badge={{
          text: "مدیریت مالی و اعتبار",
          icon: <Wallet className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="موجودی شما برای استفاده از خدمات و تولید محتوای هوشمند"
        actions={
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsTopupModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
              className="shadow-xs"
            >
              افزایش موجودی
            </Button>

            <Link
              to="/account/subscription"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[var(--color-text)] hover:text-primary bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] transition-colors shadow-xs"
            >
              <Crown className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>مدیریت اشتراک</span>
            </Link>

            <Link
              to="/account/purchases"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[var(--color-text)] hover:text-primary bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] transition-colors shadow-xs"
            >
              <Receipt className="w-4 h-4 text-primary" />
              <span>فاکتورها و خریدهای من</span>
            </Link>
          </>
        }
      />

      {/* 2. Error State with Retry Button */}
      {hasError && !isLoading && (
        <Alert variant="error" title="خطا در برقراری ارتباط با سرویس کیف پول">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <p className="text-xs sm:text-sm">{errorMessage}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              className="self-start sm:self-auto shrink-0"
            >
              تلاش مجدد
            </Button>
          </div>
        </Alert>
      )}

      {/* 3. Main Balance Card */}
      {isLoading ? (
        <div className="p-6 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton width={140} height={20} />
            <Skeleton width={40} height={40} borderRadius="16px" />
          </div>
          <Skeleton width={220} height={42} />
          <Skeleton width={180} height={18} />
        </div>
      ) : (
        <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          {/* Subtle Accent Background Deco */}
          <div className="absolute top-0 end-0 -translate-y-6 translate-x-6 w-40 h-40 bg-teal-500/5 dark:bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[var(--color-text-muted)]">
                <Wallet className="w-4 h-4 text-primary" />
                <span>موجودی کیف پول</span>
              </div>

              {/* Primary Balance Display in Credits */}
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-[var(--color-text)] tracking-tight font-mono">
                  {balance.toLocaleString("fa-IR")}
                </span>
                <span className="text-sm sm:text-base font-bold text-primary">
                  Credit
                </span>
              </div>

              {/* Equivalent in Tomans */}
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[var(--color-text-muted)]">
                <span>معادل</span>
                <span className="font-bold text-[var(--color-text)]">
                  {formatToman(balance)}
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)] font-normal">
                  (هر ۱ Credit برابر با ۱ تومان است)
                </span>
              </div>

              {/* Topup CTA */}
              <div className="pt-2">
                <Button
                  size="md"
                  variant="primary"
                  onClick={() => setIsTopupModalOpen(true)}
                  leftIcon={<Plus className="w-4 h-4" />}
                  className="w-full sm:w-auto"
                >
                  شارژ و افزایش اعتبار کیف پول
                </Button>
              </div>
            </div>

            {/* Info Badge */}
            <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] max-w-sm space-y-1.5 self-stretch md:self-auto">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text)]">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>تولید محتوای هوشمند</span>
              </div>
              <p className="text-[11px] sm:text-xs text-[var(--color-text-muted)] leading-relaxed">
                موجودی شما به‌طور مستقیم هنگام تولید هوشمند درسنامه‌ها، آزمون‌ها و فلش‌کارت‌های دوره‌ها استفاده می‌شود.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Recent Top-up Requests (Card-to-Card submissions) */}
      {topups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                درخواست‌های افزایش موجودی کارت‌به‌کارت
              </h2>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
              {topups.length.toLocaleString("fa-IR")} درخواست
            </span>
          </div>

          <div className="space-y-3">
            {topups.map((topup) => {
              const statusDisplay = getTopupStatusDisplay(topup.status);
              const isApproved = statusDisplay.state === "approved";
              const isRejected = statusDisplay.state === "rejected";

              return (
                <div
                  key={topup.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl border shrink-0 flex items-center justify-center ${
                          isApproved
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                            : isRejected
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
                            : "bg-amber-500/10 border-amber-500/30 text-amber-600"
                        }`}
                      >
                        {isApproved ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isRejected ? (
                          <XCircle className="w-5 h-5" />
                        ) : (
                          <Clock className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                            شارژ کیف پول ({formatToman(topup.amount)})
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusDisplay.badgeClassName}`}
                          >
                            {statusDisplay.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)] mt-1 flex-wrap">
                          <span>{formatPersianDate(topup.created_at, true)}</span>
                          {topup.tracking_number && (
                            <span>کد رهگیری: {topup.tracking_number}</span>
                          )}
                          {topup.source_card_last4 && (
                            <span>کارت: {topup.source_card_last4}****</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-start sm:text-end">
                      <div className="text-sm sm:text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                        +{topup.amount.toLocaleString("fa-IR")} Credit
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)]">
                        {statusDisplay.subtext}
                      </div>
                    </div>
                  </div>

                  {/* Show Rejection Reason if any */}
                  {isRejected && topup.rejection_reason && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">علت رد درخواست: </span>
                        <span>{topup.rejection_reason}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Transactions Ledger History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              تاریخچه تراکنش‌ها
            </h2>
          </div>
          {!isLoading && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
              {totalTransactions.toLocaleString("fa-IR")} تراکنش
            </span>
          )}
        </div>

        {/* Transactions Loading State */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton width={40} height={40} borderRadius="12px" />
                  <div className="space-y-2">
                    <Skeleton width={140} height={16} />
                    <Skeleton width={100} height={12} />
                  </div>
                </div>
                <div className="space-y-2 flex flex-col items-end">
                  <Skeleton width={90} height={18} />
                  <Skeleton width={60} height={12} />
                </div>
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          /* Empty State */
          <div className="py-12 px-4 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-primary flex items-center justify-center mx-auto">
              <Info className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[var(--color-text)]">
                هنوز تراکنشی ثبت نشده است
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                تراکنش‌های حاصل از هدیه فعال‌سازی اشتراک، شارژ یا کسر بابت تولید محتوای هوشمند در این بخش نمایش داده می‌شوند.
              </p>
            </div>
          </div>
        ) : (
          /* Transactions List */
          <div className="space-y-3">
            {transactions.map((tx) => {
              const typeDisplay = getTransactionTypeDisplay(tx.type);
              const sourceDisplay = getTransactionSourceDisplay(tx.source, tx.type);
              const SourceIcon = sourceDisplay.icon;
              const refLabel = getReferenceTypeLabel(tx.reference_type);

              return (
                <div
                  key={tx.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)]/50 border border-[var(--color-border)] transition-colors shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Right side: Icon, Title, Description, Reference & Date */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border shrink-0 flex items-center justify-center ${sourceDisplay.iconBgClassName}`}
                    >
                      <SourceIcon
                        className={`w-5 h-5 ${sourceDisplay.iconTextClassName}`}
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-[var(--color-text)] truncate">
                          {sourceDisplay.title}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${typeDisplay.badgeClassName}`}
                        >
                          {typeDisplay.label}
                        </span>
                      </div>

                      <p className="text-[11px] sm:text-xs text-[var(--color-text-muted)] line-clamp-1">
                        {sourceDisplay.description}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] sm:text-[11px] text-[var(--color-text-muted)] pt-0.5 flex-wrap">
                        <span>{formatPersianDate(tx.created_at, true)}</span>
                        {tx.reference_id && (
                          <span className="truncate max-w-[180px]">
                            {refLabel}: {tx.reference_id.slice(0, 10)}...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Left side: Amount & Post-Balance */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-[var(--color-border)] pt-2 sm:pt-0 shrink-0">
                    <div
                      className={`text-sm sm:text-base font-extrabold font-mono flex items-center gap-1 ${
                        typeDisplay.isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      <span>{typeDisplay.signPrefix}</span>
                      <span>{tx.amount.toLocaleString("fa-IR")}</span>
                      <span className="text-xs font-sans font-bold">Credit</span>
                    </div>

                    <div className="text-[10px] sm:text-[11px] text-[var(--color-text-muted)] font-medium">
                      معادل {typeDisplay.signPrefix}
                      {formatToman(tx.amount)}
                    </div>

                    <div className="text-[10px] text-[var(--color-text-muted)] pt-0.5 hidden sm:block">
                      مانده: {tx.balance_after.toLocaleString("fa-IR")} Credit
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Top-up Amount Selection Modal */}
      <Dialog
        isOpen={isTopupModalOpen}
        onClose={() => setIsTopupModalOpen(false)}
        maxWidth="md"
        usePortal={false}
      >
        <DialogHeader onClose={() => setIsTopupModalOpen(false)}>
          <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)] leading-snug">
            افزایش اعتبار کیف پول
          </h3>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">
            مبلغ مورد نظر خود را برای شارژ کیف پول انتخاب یا وارد نمایید
          </p>
        </DialogHeader>

        <DialogContent className="space-y-6 pt-2">
          {/* Preset Chips */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text)]">
              مبالغ پیشنهادی:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((amt) => {
                const isSelected = selectedAmount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleSelectPreset(amt)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] border-[var(--color-border)]"
                    }`}
                  >
                    {formatToman(amt)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Amount Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--color-text)]">
              یا مبلغ دلخواه (تومان):
            </label>
            <Input
              type="text"
              value={customAmountText}
              onChange={handleCustomAmountChange}
              placeholder="مثلاً ۱۰۰,۰۰۰"
              dir="ltr"
              className="font-mono text-end text-base font-bold"
            />
            {topupError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                {topupError}
              </p>
            )}
            <p className="text-[11px] text-[var(--color-text-muted)]">
              حداقل مبلغ قابل پرداخت ۱۰,۰۰۰ تومان می‌باشد. (۱ تومان = ۱ Credit)
            </p>
          </div>

          {/* Flow Notice */}
          <div className="p-3.5 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-[var(--color-text)]">
              <Info className="w-4 h-4 text-primary" />
              <span>فرآیند شارژ کارت‌به‌کارت:</span>
            </div>
            <p>
              پس از فشردن دکمه ادامه، به صفحه انتقال کارت‌به‌کارت هدایت می‌شوید تا اطلاعات واریز و تصویر فیش را ارسال کنید. پس از تأیید تیم پشتیبانی، موجودی کیف پول بلافاصله شارژ خواهد شد.
            </p>
          </div>
        </DialogContent>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setIsTopupModalOpen(false)}
            className="w-full sm:w-auto"
          >
            انصراف
          </Button>
          <Button
            variant="primary"
            onClick={handleProceedToTopup}
            disabled={selectedAmount < 10_000}
            rightIcon={<ArrowUpRight className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            ادامه و ثبت فیش واریز
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}


