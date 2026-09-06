/**
 * User Commerce & Subscription Utilities.
 *
 * Provides helpers for:
 * - Real-time Remaining Subscription Time & Urgency Thresholds (<7d, <3d, <1d)
 * - Subscription Lifecycle Progress Calculation
 * - Persian Toman Currency & Date Formatting
 * - Status Badge Definitions conforming to AVANA Design System
 */

export interface RemainingTimeInfo {
  totalHours: number;
  days: number;
  hours: number;
  isExpired: boolean;
  text: string;
  shortText: string;
  urgency: "normal" | "warning" | "serious" | "critical" | "expired";
}

/**
 * Calculates remaining time until subscription expiration.
 *
 * Thresholds:
 * - > 7 days: normal (Teal/Emerald)
 * - 3 to 7 days: warning (Amber)
 * - 1 to 3 days: serious warning (Orange)
 * - < 1 day: critical (Rose/Red)
 * - <= 0: expired (Slate/Zinc)
 */
export function calculateRemainingTime(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): RemainingTimeInfo {
  if (!expiresAt) {
    return {
      totalHours: 0,
      days: 0,
      hours: 0,
      isExpired: true,
      text: "بدون اشتراک فعال",
      shortText: "بدون اشتراک",
      urgency: "expired",
    };
  }

  const expiryMs = new Date(expiresAt).getTime();
  const nowMs = now.getTime();
  const diffMs = expiryMs - nowMs;

  if (isNaN(expiryMs) || diffMs <= 0) {
    return {
      totalHours: 0,
      days: 0,
      hours: 0,
      isExpired: true,
      text: "اشتراک منقضی شده است",
      shortText: "منقضی شده",
      urgency: "expired",
    };
  }

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  let text = "";
  let shortText = "";

  if (days > 0) {
    text = `${days.toLocaleString("fa-IR")} روز و ${hours.toLocaleString("fa-IR")} ساعت باقی‌مانده`;
    shortText = `${days.toLocaleString("fa-IR")} روز باقی‌مانده`;
  } else {
    text = `${hours.toLocaleString("fa-IR")} ساعت باقی‌مانده`;
    shortText = `${hours.toLocaleString("fa-IR")} ساعت باقی‌مانده`;
  }

  let urgency: RemainingTimeInfo["urgency"] = "normal";
  if (days < 1) {
    urgency = "critical";
  } else if (days < 3) {
    urgency = "serious";
  } else if (days < 7) {
    urgency = "warning";
  }

  return {
    totalHours,
    days,
    hours,
    isExpired: false,
    text,
    shortText,
    urgency,
  };
}

/**
 * Calculates percentage of subscription validity elapsed (0% to 100%).
 */
export function calculateSubscriptionProgress(
  startedAt: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!startedAt || !expiresAt) return 0;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(expiresAt).getTime();
  const nowMs = now.getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 0;
  if (nowMs >= endMs) return 100;
  if (nowMs <= startMs) return 0;

  const totalDuration = endMs - startMs;
  const elapsed = nowMs - startMs;
  return Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
}

/**
 * Formats a number in Tomans with Persian numerals.
 */
export function formatToman(amount: number | null | undefined): string {
  if (amount === undefined || amount === null) return "۰ تومان";
  return `${amount.toLocaleString("fa-IR")} تومان`;
}

/**
 * Formats ISO date string into Persian locale with optional time.
 */
export function formatPersianDate(
  dateStr: string | null | undefined,
  includeTime = false,
): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(includeTime
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : {}),
    };
    return d.toLocaleDateString("fa-IR", options);
  } catch {
    return dateStr;
  }
}

/**
 * Resolves standard badge styling for order statuses.
 */
export function getOrderStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return {
        label: "پرداخت شده",
        className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      };
    case "pending":
      return {
        label: "در انتظار پرداخت",
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      };
    case "failed":
      return {
        label: "ناموفق",
        className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      };
    case "cancelled":
      return {
        label: "لغو شده",
        className: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
      };
    case "expired":
      return {
        label: "منقضی شده",
        className: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
      };
    default:
      return {
        label: status || "نامشخص",
        className: "bg-slate-800 text-slate-400 border border-slate-700",
      };
  }
}

/**
 * Resolves standard badge styling for subscription status.
 */
export function getSubscriptionStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "active":
      return {
        label: "اشتراک فعال",
        className: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
      };
    case "active_pending_payment_review":
      return {
        label: "فعال (در انتظار بررسی نهایی)",
        className: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
      };
    case "expired":
      return {
        label: "منقضی شده",
        className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      };
    case "cancelled":
      return {
        label: "لغو شده",
        className: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
      };
    case "cancelled_payment_rejected":
      return {
        label: "لغو شده (عدم تأیید پرداخت)",
        className: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
      };
    default:
      return {
        label: status || "نامشخص",
        className: "bg-slate-800 text-slate-400 border border-slate-700",
      };
  }
}

/**
 * Urgency badge style provider.
 */
export function getUrgencyBadge(urgency: RemainingTimeInfo["urgency"]) {
  switch (urgency) {
    case "critical":
      return {
        className: "bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse",
        dotClassName: "bg-rose-500",
      };
    case "serious":
      return {
        className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
        dotClassName: "bg-orange-500",
      };
    case "warning":
      return {
        className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        dotClassName: "bg-amber-400",
      };
    case "expired":
      return {
        className: "bg-slate-700/50 text-slate-400 border-slate-600/50",
        dotClassName: "bg-slate-500",
      };
    case "normal":
    default:
      return {
        className: "bg-teal-500/10 text-teal-300 border-teal-500/20",
        dotClassName: "bg-teal-400",
      };
  }
}

export type UserChipSubscriptionState =
  | {
      status: "none";
      badgeLabel: null;
      badgeClassName?: string;
      tooltip: string;
      chipClassName: string;
    }
  | {
      status: "active";
      badgeLabel: string;
      badgeClassName: string;
      tooltip: string;
      chipClassName: string;
      days: number;
    }
  | {
      status: "expiring_soon";
      badgeLabel: string;
      badgeClassName: string;
      tooltip: string;
      chipClassName: string;
      days: number;
      hours: number;
    }
  | {
      status: "expired";
      badgeLabel: string;
      badgeClassName: string;
      tooltip: string;
      chipClassName: string;
    };

/**
 * Computes presentation details for the Header User Account Chip
 * based on the user's current subscription lifecycle status.
 */
export function getUserChipSubscriptionInfo(
  subscription: { status?: string | null; expires_at?: string | null } | null | undefined,
  now: Date = new Date(),
): UserChipSubscriptionState {
  if (!subscription) {
    return {
      status: "none",
      badgeLabel: null,
      tooltip: "مشاهده و خرید اشتراک",
      chipClassName: "text-slate-300 hover:text-teal-300 hover:border-teal-500/40 hover:bg-white/10",
    };
  }

  const normalizedStatus = subscription.status?.toLowerCase();

  // Non-active explicit status
  if (normalizedStatus && normalizedStatus !== "active") {
    return {
      status: "expired",
      badgeLabel: "منقضی شده",
      badgeClassName: "bg-rose-500/10 text-rose-300/90 border border-rose-500/30",
      tooltip: "اشتراک منقضی شده است — جهت تمدید کلیک کنید",
      chipClassName: "text-slate-300 hover:text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/5",
    };
  }

  // Missing expiration date on active record
  if (!subscription.expires_at) {
    return {
      status: "expired",
      badgeLabel: "منقضی شده",
      badgeClassName: "bg-rose-500/10 text-rose-300/90 border border-rose-500/30",
      tooltip: "اشتراک منقضی شده است — جهت تمدید کلیک کنید",
      chipClassName: "text-slate-300 hover:text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/5",
    };
  }

  const remaining = calculateRemainingTime(subscription.expires_at, now);

  if (remaining.isExpired) {
    return {
      status: "expired",
      badgeLabel: "منقضی شده",
      badgeClassName: "bg-rose-500/10 text-rose-300/90 border border-rose-500/30",
      tooltip: "اشتراک منقضی شده است — جهت تمدید کلیک کنید",
      chipClassName: "text-slate-300 hover:text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/5",
    };
  }

  // Active with more than 5 days remaining (> 5 days)
  if (remaining.days > 5) {
    return {
      status: "active",
      badgeLabel: "فعال",
      badgeClassName: "bg-teal-500/15 text-teal-300 border border-teal-500/30",
      tooltip: `اشتراک فعال (${remaining.text})`,
      chipClassName: "text-slate-200 hover:text-teal-200 hover:border-teal-500/40 hover:bg-teal-500/5",
      days: remaining.days,
    };
  }

  // Expiring soon: 5 days or fewer (5, 4, 3, 2, 1, <1 day)
  let badgeLabel: string;
  if (remaining.days >= 1) {
    badgeLabel = `${remaining.days.toLocaleString("fa-IR")} روز باقیمانده`;
  } else {
    badgeLabel = "کمتر از ۱ روز";
  }

  return {
    status: "expiring_soon",
    badgeLabel,
    badgeClassName: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    tooltip: `اشتراک رو به پایان (${remaining.text}) — جهت تمدید کلیک کنید`,
    chipClassName: "text-slate-200 hover:text-amber-200 hover:border-amber-500/40 hover:bg-amber-500/5",
    days: remaining.days,
    hours: remaining.hours,
  };
}
