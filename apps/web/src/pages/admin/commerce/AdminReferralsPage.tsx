/**
 * Admin Referral & Invites Management Page.
 *
 * Route: `/admin/commerce/referrals`
 */

import { useState } from "react";
import {
  Gift,
  Filter,
  RefreshCw,
  Settings,
  Save,
  Check,
} from "lucide-react";
import {
  useAdminReferrals,
  useRetryReferralRewards,
  useReferralConfig,
  useUpdateReferralConfig,
} from "../../../hooks/useReferral.js";
import {
  formatPersianDate,
} from "../../../components/commerce/userCommerceUtils.js";
import { toPersianDigits } from "@avana/domain";
import {
  AdminCommerceNavigation,
} from "../../../components/admin/commerce/AdminCommerceNavigation.js";
import {
  AdminPagination,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { PageHeader, Button, Alert } from "../../../components/ui/index.js";

export function AdminReferralsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const {
    data: referralsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminReferrals({
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const { data: configData, refetch: refetchConfig } = useReferralConfig();
  const updateConfigMutation = useUpdateReferralConfig();
  const retryRewardsMutation = useRetryReferralRewards();

  // Config local form state
  const [configRewardDays, setConfigRewardDays] = useState<number | null>(null);
  const [configMaxReferrals, setConfigMaxReferrals] = useState<number | null>(null);
  const [configEnabled, setConfigEnabled] = useState<boolean | null>(null);
  const [configSavedSuccess, setConfigSavedSuccess] = useState(false);
  const [retryResultMsg, setRetryResultMsg] = useState<string | null>(null);

  const activeRewardDays =
    configRewardDays !== null
      ? configRewardDays
      : configData?.config?.rewardDays ?? configData?.config?.reward_days ?? configData?.config?.reward_amount ?? 15;

  const activeMaxReferrals =
    configMaxReferrals !== null
      ? configMaxReferrals
      : configData?.config?.maxRewardedReferrals ?? configData?.config?.max_referrals ?? 4;

  const activeEnabled =
    configEnabled !== null
      ? configEnabled
      : configData?.config?.enabled ?? true;

  const handleSaveConfig = async () => {
    try {
      await updateConfigMutation.mutateAsync({
        enabled: activeEnabled,
        rewardDays: activeRewardDays,
        maxRewardedReferrals: activeMaxReferrals,
      });
      setConfigSavedSuccess(true);
      setTimeout(() => setConfigSavedSuccess(false), 3000);
      refetchConfig();
    } catch {
      // Error handled by mutation
    }
  };

  const handleRetryRewards = async () => {
    try {
      const res = await retryRewardsMutation.mutateAsync();
      setRetryResultMsg(
        `عملیات بازیابی انجام شد: ${toPersianDigits(res.succeeded)} پاداش با موفقیت اعمال شد (${toPersianDigits(res.failed)} خطا).`,
      );
      setTimeout(() => setRetryResultMsg(null), 5000);
      refetch();
    } catch {
      // Handled
    }
  };

  const referrals = referralsData?.referrals ?? [];
  const totalCount = referralsData?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="مدیریت سیستم دعوت و معرف‌ها"
        badge={{
          text: "امور اشتراک و معرف‌ها",
          icon: <Gift className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مشاهده، پایش و تنظیمات سیستم دعوت از دوستان و اعطای ۱۵ روز اشتراک رایگان"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetryRewards}
            isLoading={retryRewardsMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4 text-primary" />
            <span>پردازش مجدد پاداش‌های معلق</span>
          </Button>
        }
      />

      {/* Navigation */}
      <AdminCommerceNavigation />

      {/* Retry Result Alert */}
      {retryResultMsg && (
        <Alert
          variant="success"
          title="پردازش مجدد پاداش‌ها"
        >
          {retryResultMsg}
        </Alert>
      )}

      {/* Referral System Config Card */}
      <div className="border border-[var(--color-border)] rounded-2xl p-6 bg-[var(--color-surface)] shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-sm text-[var(--color-text)]">
            تنظیمات عمومی پاداش دعوت (Referral V1)
          </h3>
        </div>

        {configSavedSuccess && (
          <Alert variant="success" className="mb-4">
            تنظیمات با موفقیت ذخیره شد.
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* Enable/Disable Toggle */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-2">
              وضعیت کلی سیستم دعوت
            </label>
            <div className="flex items-center gap-3 h-[42px]">
              <button
                type="button"
                onClick={() => setConfigEnabled(!activeEnabled)}
                disabled={updateConfigMutation.isPending}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeEnabled ? "bg-primary" : "bg-[var(--color-border)]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    activeEnabled ? "translate-x-0" : "-translate-x-5"
                  }`}
                />
              </button>
              <span className="text-xs font-medium text-[var(--color-text)]">
                {activeEnabled ? "فعال" : "غیرفعال"}
              </span>
            </div>
          </div>

          {/* Reward Days Input */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-2">
              مدت اشتراک رایگان به ازای هر دعوت (روز)
            </label>
            <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 overflow-hidden transition-colors shadow-2xs">
              <input
                type="number"
                min="1"
                max="365"
                value={activeRewardDays}
                onChange={(e) => setConfigRewardDays(parseInt(e.target.value, 10) || 0)}
                disabled={updateConfigMutation.isPending}
                className="w-full bg-transparent px-3 py-2.5 text-xs font-mono text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                dir="ltr"
                aria-label="مدت اشتراک رایگان به ازای هر دعوت (روز)"
              />
              <span className="px-3 py-2.5 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                روز
              </span>
            </div>
          </div>

          {/* Max Referrals Input */}
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-2">
              حداکثر تعداد دعوت‌های پاداش‌دار (سقف)
            </label>
            <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 overflow-hidden transition-colors shadow-2xs">
              <input
                type="number"
                min="1"
                max="50"
                value={activeMaxReferrals}
                onChange={(e) => setConfigMaxReferrals(parseInt(e.target.value, 10) || 0)}
                disabled={updateConfigMutation.isPending}
                className="w-full bg-transparent px-3 py-2.5 text-xs font-mono text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                dir="ltr"
                aria-label="حداکثر تعداد دعوت‌های پاداش‌دار (سقف)"
              />
              <span className="px-3 py-2.5 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                دعوت
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveConfig}
            isLoading={updateConfigMutation.isPending}
            className="gap-2"
          >
            {configSavedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>ذخیره شد</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره تنظیمات</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-xs font-bold text-[var(--color-text)]">
            فیلتر وضعیت:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-[var(--color-text)] focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="rewarded">پاداش داده شده (Rewarded)</option>
            <option value="qualified">واجد شرایط / تکمیل سقف (Qualified)</option>
            <option value="pending">در انتظار / رد شده (Pending)</option>
            <option value="cancelled">لغو شده (Cancelled)</option>
          </select>
        </div>

        <div className="text-xs text-[var(--color-text-muted)]">
          مجموع ارجاعات: <span className="font-bold text-[var(--color-text)]">{toPersianDigits(totalCount)}</span>
        </div>
      </div>

      {/* Table Content */}
      <div className="space-y-4">
        <div className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-[var(--color-bg-default)] text-[var(--color-text-muted)] border-b border-[var(--color-border)] font-semibold">
                <tr>
                  <th className="px-4 py-3 text-start">کد معرف</th>
                  <th className="px-4 py-3 text-start">کاربر معرف (Inviter)</th>
                  <th className="px-4 py-3 text-start">کاربر دعوت‌شده (Invitee)</th>
                  <th className="px-4 py-3 text-start">وضعیت ارجاع</th>
                  <th className="px-4 py-3 text-start">وضعیت پاداش</th>
                  <th className="px-4 py-3 text-start">پاداش اشتراک</th>
                  <th className="px-4 py-3 text-start">تاریخ ثبت‌نام</th>
                  <th className="px-4 py-3 text-start">تاریخ پاداش</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {isLoading ? (
                  <AdminLoadingState colSpan={8} />
                ) : isError ? (
                  <AdminErrorState
                    message={error instanceof Error ? error.message : "خطا در دریافت لیست ارجاعات"}
                    colSpan={8}
                  />
                ) : referrals.length === 0 ? (
                  <AdminEmptyState message="با فیلتر انتخابی شما رکوردی از دعوت کاربران ثبت نشده است." />
                ) : (
                  referrals.map((r) => {
                    const code = r.code || r.referralCode;
                    const inviterName = r.inviterName || r.inviter_name;
                    const inviterEmail = r.inviterEmail || r.inviter_email;
                    const inviterId = r.inviterUserId || r.inviter_user_id;
                    const inviteeName = r.inviteeName || r.invitee_name || r.invitedName;
                    const inviteeEmail = r.inviteeEmail || r.invitee_email || r.invitedEmail;
                    const inviteeId = r.inviteeUserId || r.invitedUserId;
                    const rewardStatus = r.rewardStatus || r.reward_status;
                    const rewardAmount = r.rewardAmount ?? r.reward_amount ?? 0;
                    const createdAt = r.createdAt || r.created_at;
                    const rewardedAt = r.rewardedAt || r.rewarded_at;

                    return (
                      <tr key={r.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-primary">
                          {code}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-[var(--color-text)]">
                            {inviterName || "کاربر آوانا"}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] font-mono" dir="ltr">
                            {inviterEmail || inviterId}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-[var(--color-text)]">
                            {inviteeName || "کاربر جدید"}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] font-mono" dir="ltr">
                            {inviteeEmail || inviteeId}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {r.status === "rewarded" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              پاداش داده شد
                            </span>
                          ) : rewardStatus === "limit_reached" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20">
                              سقف ۴ دعوت
                            </span>
                          ) : rewardStatus === "abuse_rejected" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                              رد سوءاستفاده
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              معلق
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {rewardStatus === "completed" || rewardStatus === "granted" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              اعطا شد
                            </span>
                          ) : rewardStatus === "limit_reached" ? (
                            <span className="text-slate-500 font-medium">سقف تکمیل</span>
                          ) : rewardStatus === "abuse_rejected" ? (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              رد دستگاه تکراری
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">معلق</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-[var(--color-text)]">
                          {rewardAmount > 0 ? (
                            <span className="font-mono text-emerald-600 dark:text-emerald-400">
                              +{toPersianDigits(rewardAmount)} روز اشتراک
                            </span>
                          ) : (
                            "---"
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                          {createdAt ? formatPersianDate(createdAt) : "---"}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                          {rewardedAt ? formatPersianDate(rewardedAt) : "---"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
export default AdminReferralsPage;
