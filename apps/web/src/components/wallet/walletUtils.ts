/**
 * User Wallet UI Utilities and Transaction Formatters.
 *
 * Conforming to AVANA Design System and Domain Model.
 */

import React from "react";
import {
  ArrowDownLeft,
  Gift,
  Sparkles,
  RefreshCw,
  Sliders,
  Wallet,
} from "lucide-react";
import type {
  WalletTransactionType,
  WalletTransactionSource,
  WalletReferenceType,
} from "../../lib/api/wallet.js";

export interface TransactionTypeDisplay {
  label: string;
  badgeClassName: string;
  isPositive: boolean;
  signPrefix: string;
}

export interface TransactionSourceDisplay {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgClassName: string;
  iconTextClassName: string;
}

/**
 * Returns human-readable label and styling for a transaction type.
 */
export function getTransactionTypeDisplay(
  type: WalletTransactionType | string,
): TransactionTypeDisplay {
  switch (type) {
    case "credit":
      return {
        label: "واریز / شارژ",
        badgeClassName: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        isPositive: true,
        signPrefix: "+",
      };
    case "refund":
      return {
        label: "بازگشت وجه",
        badgeClassName: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30",
        isPositive: true,
        signPrefix: "+",
      };
    case "debit":
      return {
        label: "کسر / مصرف",
        badgeClassName: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30",
        isPositive: false,
        signPrefix: "-",
      };
    case "admin_adjustment":
      return {
        label: "تنظیم سیستمی",
        badgeClassName: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30",
        isPositive: true,
        signPrefix: "±",
      };
    default:
      return {
        label: type || "تراکنش",
        badgeClassName: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30",
        isPositive: true,
        signPrefix: "",
      };
  }
}

/**
 * Returns title, description and icon for a transaction source.
 */
export function getTransactionSourceDisplay(
  source: WalletTransactionSource | string,
  type?: WalletTransactionType | string,
): TransactionSourceDisplay {
  switch (source) {
    case "subscription_bonus":
      return {
        title: "هدیه اشتراک آوانا",
        description: "اعتبار هدیه اهدایی به کیف پول پس از فعال‌سازی اشتراک",
        icon: Gift,
        iconBgClassName: "bg-amber-500/10 border-amber-500/30",
        iconTextClassName: "text-amber-600 dark:text-amber-400",
      };
    case "referral_reward":
      return {
        title: "پاداش دعوت از دوستان",
        description: "اعتبار هدیه حاصل از خرید کاربر دعوت‌شده با کد معرف شما",
        icon: Gift,
        iconBgClassName: "bg-primary/10 border-primary/30",
        iconTextClassName: "text-primary",
      };
    case "content_generation":
      return {
        title: "تولید هوشمند محتوا",
        description: "هزینه پردازش هوش مصنوعی برای تولید درسنامه، فلش‌کارت و آزمون",
        icon: Sparkles,
        iconBgClassName: "bg-rose-500/10 border-rose-500/30",
        iconTextClassName: "text-rose-600 dark:text-rose-400",
      };
    case "special_exam_purchase":
      return {
        title: "آزمون سفارشی",
        description: "هزینه تولید و برگزاری آزمون سفارشی از کیف پول",
        icon: Sparkles,
        iconBgClassName: "bg-rose-500/10 border-rose-500/30",
        iconTextClassName: "text-rose-600 dark:text-rose-400",
      };
    case "generation_refund":
      return {
        title: "بازگشت وجه تولید محتوا",
        description: "برگشت خودکار هزینه به دلیل لغو یا عدم تکمیل فرآیند تولید",
        icon: RefreshCw,
        iconBgClassName: "bg-teal-500/10 border-teal-500/30",
        iconTextClassName: "text-primary",
      };
    case "special_exam_refund":
      return {
        title: "بازگشت وجه آزمون سفارشی",
        description: "برگشت خودکار هزینه به دلیل عدم تکمیل فرآیند ساخت آزمون",
        icon: RefreshCw,
        iconBgClassName: "bg-teal-500/10 border-teal-500/30",
        iconTextClassName: "text-primary",
      };
    case "wallet_topup":
      return {
        title: "شارژ مستقیم کیف پول",
        description: "افزایش موجودی کیف پول",
        icon: ArrowDownLeft,
        iconBgClassName: "bg-emerald-500/10 border-emerald-500/30",
        iconTextClassName: "text-emerald-600 dark:text-emerald-400",
      };
    case "admin_adjustment":
      return {
        title: "تنظیم مدیریتی حساب",
        description: "اعمال تغییرات دستی یا موازنه‌سازی توسط پشتیبانی آوانا",
        icon: Sliders,
        iconBgClassName: "bg-indigo-500/10 border-indigo-500/30",
        iconTextClassName: "text-indigo-600 dark:text-indigo-400",
      };
    default:
      return {
        title: type === "debit" ? "کسر از کیف پول" : "واریز به کیف پول",
        description: "تراکنش مالی ثبت‌شده در دفتر کل کیف پول",
        icon: Wallet,
        iconBgClassName: "bg-slate-500/10 border-slate-500/30",
        iconTextClassName: "text-slate-600 dark:text-slate-400",
      };
  }
}

/**
 * Returns human-readable Persian label for reference types.
 */
export function getReferenceTypeLabel(
  refType: WalletReferenceType | string,
): string {
  switch (refType) {
    case "special_exam":
      return "آزمون سفارشی";
    case "referral":
      return "دعوت از دوستان";
    case "generation_job":
      return "عملیات تولید محتوا";
    case "user_subscription":
      return "اشتراک کاربری";
    case "order":
      return "سفارش خرید";
    case "admin_grant":
      return "تخصیص پشتیبانی";
    case "document":
      return "سند آموزشی";
    case "system":
      return "سیستم";
    default:
      return refType || "مرجع";
  }
}

export type TopupStateCategory = "approved" | "rejected" | "pending";

export interface TopupStatusDisplayResult {
  label: string;
  badgeClassName: string;
  color: "emerald" | "rose" | "amber";
  state: TopupStateCategory;
  subtext: string;
}

/**
 * Returns human-readable Persian label, status category, and styling for top-up request status.
 * Single unified source of truth for top-up request states across the application.
 */
export function getTopupStatusDisplay(status: string): TopupStatusDisplayResult {
  switch (status) {
    case "admin_approved":
    case "completed":
    case "approved":
    case "paid":
      return {
        label: "تأیید شد",
        badgeClassName:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        color: "emerald",
        state: "approved",
        subtext: "به کیف پول واریز شد",
      };
    case "admin_rejected":
    case "rejected":
    case "failed":
    case "cancelled":
      return {
        label: "رد شده",
        badgeClassName:
          "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30",
        color: "rose",
        state: "rejected",
        subtext: "واریز نشد",
      };
    case "pending":
    case "pending_admin_review":
    default:
      return {
        label: "در انتظار بررسی ادمین",
        badgeClassName:
          "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30",
        color: "amber",
        state: "pending",
        subtext: "پس از تایید ادمین اعمال خواهد شد",
      };
  }
}

