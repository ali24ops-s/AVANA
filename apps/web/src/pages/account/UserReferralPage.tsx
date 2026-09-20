/**
 * User Referral / Invite Friends Page.
 *
 * Route: `/account/referral`
 *
 * Displays:
 * - User's unique referral code and 1-click copy
 * - Shareable invite link with copy and native share
 * - 15-day subscription reward per valid registration (up to 4 invites / 60 days max)
 * - Quick stats (successful invites: X of 4, total reward days: X of 60 days)
 * - Privacy-safe invitee history ledger
 * - Visual guide explaining registration-based referral mechanics
 */

import { useState } from "react";
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Award,
  RefreshCw,
  Clock,
  UserCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMyReferralSummary, useMyReferralHistory } from "../../hooks/useReferral.js";
import {
  formatPersianDate,
} from "../../components/commerce/userCommerceUtils.js";
import {
  Button,
  Alert,
  Skeleton,
  PageHeader,
} from "../../components/ui/index.js";
import { toPersianDigits } from "@avana/domain";

export function UserReferralPage() {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    error: summaryError,
    refetch: refetchSummary,
  } = useMyReferralSummary();

  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    refetch: refetchHistory,
  } = useMyReferralHistory();

  const referralCode = summary?.code || summary?.referralCode || "";
  const inviteUrl = summary?.invite_url || summary?.inviteUrl || "";
  const totalInvites = summary?.total_invites ?? summary?.totalInvites ?? 0;
  const pendingInvites = summary?.pending_invites ?? summary?.pendingCount ?? 0;
  const successfulInvites = summary?.successful_invites ?? summary?.rewardedCount ?? 0;
  const rewardedDays = summary?.rewarded_days ?? summary?.rewardedDays ?? (successfulInvites * 15);
  const isLimitReached = Boolean(summary?.is_limit_reached ?? summary?.isLimitReached ?? (successfulInvites >= 4));

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleShare = async () => {
    if (!summary) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "دعوت به سامانه یادگیری هوشمند آوانا",
          text: `با کد معرف ${referralCode} در آوانا ثبت‌نام کنید و از امکانات هوشمند یادگیری بهره‌مند شوید:`,
          url: inviteUrl,
        });
      } catch {
        // Share cancelled or failed
      }
    } else {
      handleCopyLink();
    }
  };

  const referrals = historyData?.referrals ?? [];

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <PageHeader
        title="دعوت از دوستان"
        description="با دعوت از دوستانت، برای هر دعوت موفق ۱۵ روز اشتراک رایگان بگیر (تا ۴ دعوت / حداکثر ۶۰ روز اشتراک)."
        badge={{
          text: "۱۵ روز اشتراک هدیه",
          icon: <Gift className="w-3.5 h-3.5" />,
        }}
        actions={
          <Link to="/subscription">
            <Button variant="outline" size="sm" className="gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span>مشاهده وضعیت اشتراک</span>
            </Button>
          </Link>
        }
      />

      {/* Errors */}
      {(isSummaryError || isHistoryError) && (
        <Alert
          variant="error"
          title="خطا در دریافت اطلاعات دعوت"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span>
              {(summaryError as Error)?.message ||
                (historyError as Error)?.message ||
                "برقراری ارتباط با سرور با خطا مواجه شد."}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchSummary();
                refetchHistory();
              }}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تلاش مجدد</span>
            </Button>
          </div>
        </Alert>
      )}

      {/* Share / Referral Code Hero Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Code Box */}
        <div className="lg:col-span-2 bg-gradient-to-br from-primary/10 via-[var(--color-surface)] to-[var(--color-surface)] rounded-card border border-primary/20 p-6 shadow-card relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-primary/15 text-primary">
                  <Sparkles className="w-5 h-5" />
                </span>
                <h2 className="text-lg font-bold text-[var(--color-text)]">
                  کد و لینک دعوت اختصاصی شما
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed max-w-lg">
                لینک یا کد دعوت خود را برای دوستانتان بفرستید. به ازای هر دوستی که با کد شما ثبت‌نام معتبر انجام دهد، ۱۵ روز اشتراک رایگان دریافت می‌کنید.
              </p>
            </div>

            {/* Referral Code Display */}
            {isSummaryLoading ? (
              <Skeleton className="h-16 w-48 rounded-xl" />
            ) : (
              <div className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl bg-[var(--color-surface)] border border-primary/30 shadow-xs">
                <span className="text-[11px] text-[var(--color-text-muted)] font-medium mb-1">
                  کد معرف شما
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-black text-primary tracking-widest" dir="ltr">
                    {referralCode || "---"}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    title="کپی کد معرف"
                    className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-primary transition-colors cursor-pointer"
                  >
                    {copiedCode ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Share Action Row */}
          <div className="mt-6 pt-5 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-input bg-[var(--color-bg-default)] border border-[var(--color-border)] font-mono text-xs text-[var(--color-text-muted)] overflow-hidden" dir="ltr">
              <span className="truncate flex-1">
                {isSummaryLoading ? "در حال بارگذاری لینک..." : inviteUrl || ""}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-2 shrink-0"
              disabled={isSummaryLoading || !inviteUrl}
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>کپی لینک دعوت</span>
                </>
              )}
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleShare}
              className="gap-2 shrink-0"
              disabled={isSummaryLoading || !summary}
            >
              <Share2 className="w-4 h-4" />
              <span>اشتراک‌گذاری</span>
            </Button>
          </div>
        </div>

        {/* Total Subscription Earned Card */}
        <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-6 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                اشتراک رایگان دریافت‌شده
              </span>
              <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Award className="w-4 h-4" />
              </span>
            </div>

            {isSummaryLoading ? (
              <Skeleton className="h-10 w-36 mb-2" />
            ) : (
              <div className="mb-2">
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {rewardedDays}
                </span>
                <span className="text-xs font-medium text-[var(--color-text-muted)] me-1.5">
                  روز از ۶۰ روز سقف کل
                </span>
              </div>
            )}
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              {isLimitReached
                ? "سقف پاداش دعوت (۴ دعوت / ۶۰ روز اشتراک رایگان) برای شما تکمیل شده است."
                : `با ${toPersianDigits(4 - successfulInvites)} دعوت موفق دیگر می‌توانید سقف ۶۰ روز اشتراک رایگان را تکمیل کنید.`}
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <Link
              to="/subscription"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>مشاهده و مدیریت اشتراک</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </Link>
          </div>
        </div>
      </div>

      {/* 3 Stats Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-4 shadow-card flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-[var(--color-text-muted)]">
              کل دوستان دعوت‌شده
            </span>
            <span className="text-lg font-black text-[var(--color-text)]">
              {isSummaryLoading ? "..." : totalInvites} نفر
            </span>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-4 shadow-card flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-[var(--color-text-muted)]">
              در انتظار اعتبارسنجی
            </span>
            <span className="text-lg font-black text-[var(--color-text)]">
              {isSummaryLoading ? "..." : pendingInvites} نفر
            </span>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-4 shadow-card flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-[var(--color-text-muted)]">
              دعوت‌های موفق
            </span>
            <span className="text-lg font-black text-[var(--color-text)]">
              {isSummaryLoading ? "..." : `${successfulInvites} از ۴`}
            </span>
          </div>
        </div>
      </div>

      {/* How It Works Steps */}
      <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-5 sm:p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                راهنمای دریافت پاداش دعوت
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                مسیر ساده ۳ مرحله‌ای برای دریافت تا سقف ۶۰ روز اشتراک رایگان
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start sm:self-auto text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>۱۵ روز هدیه به ازای هر دعوت</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Step 1 */}
          <div className="bg-[var(--color-bg-default)]/60 rounded-xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col justify-between hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary">
                <span>گام</span>
                <span className="font-mono">۱</span>
              </span>
              <div className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-primary">
                <Share2 className="w-4 h-4" />
              </div>
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
              ارسال لینک دعوت به دوستان
            </h4>
          </div>

          {/* Step 2 */}
          <div className="bg-[var(--color-bg-default)]/60 rounded-xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col justify-between hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary">
                <span>گام</span>
                <span className="font-mono">۲</span>
              </span>
              <div className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-primary">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
              ثبت‌نام معتبر دوست شما
            </h4>
          </div>

          {/* Step 3 */}
          <div className="bg-[var(--color-bg-default)]/60 rounded-xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col justify-between hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <span>گام</span>
                <span className="font-mono">۳</span>
              </span>
              <div className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
              دریافت پاداش اشتراک رایگان
            </h4>
          </div>
        </div>
      </div>

      {/* Referral History Section */}
      <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] shadow-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              تاریخچه دعوت‌های شما
            </h3>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">
            {toPersianDigits(referrals.length)} مورد ثبت‌شده
          </span>
        </div>

        {isHistoryLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Gift className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              هنوز دعوتی ثبت نشده است
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto leading-relaxed">
              با اشتراک‌گذاری لینک دعوت بالا با دوستان و آشنایان، اولین دعوت خود را ثبت کنید و ۱۵ روز اشتراک هدیه بگیرید.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-[var(--color-bg-default)] text-[var(--color-text-muted)] border-b border-[var(--color-border)] font-semibold">
                <tr>
                  <th className="px-4 py-3 text-start">کاربر دعوت‌شده</th>
                  <th className="px-4 py-3 text-start">تاریخ دعوت</th>
                  <th className="px-4 py-3 text-start">وضعیت</th>
                  <th className="px-4 py-3 text-start">پاداش اشتراک</th>
                  <th className="px-4 py-3 text-start">تاریخ اعطا</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {referrals.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                    <td className="px-4 py-3.5 font-medium text-[var(--color-text)]">
                      {item.invitee_display_name || "کاربر جدید"}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--color-text-muted)] font-mono">
                      {formatPersianDate(item.created_at || item.createdAt || "")}
                    </td>
                    <td className="px-4 py-3.5">
                      {item.status === "rewarded" || item.reward_status === "completed" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          <Check className="w-3 h-3" />
                          پاداش داده شد
                        </span>
                      ) : item.reward_status === "limit_reached" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20">
                          سقف ۴ دعوت تکمیل
                        </span>
                      ) : item.reward_status === "abuse_rejected" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                          رد شده (دستگاه تکراری)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          در حال بررسی
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-[var(--color-text)]">
                      {(item.reward_amount ?? item.rewardAmount ?? 0) > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                          +{item.reward_amount ?? item.rewardAmount} روز
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">---</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--color-text-muted)] font-mono">
                      {item.rewarded_at || item.rewardedAt
                        ? formatPersianDate(item.rewarded_at || item.rewardedAt || "")
                        : "---"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
export default UserReferralPage;
