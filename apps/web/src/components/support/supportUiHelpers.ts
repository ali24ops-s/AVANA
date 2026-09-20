import type {
  FeedbackCategory,
  FeedbackStatus,
  FeedbackType,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@avana/domain";

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  suggestion: "پیشنهاد",
  complaint: "انتقاد",
  bug_report: "گزارش مشکل",
  feature_request: "درخواست قابلیت",
  appreciation: "تشکر و بازخورد",
};

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  library: "کتابخانه",
  courses: "دوره‌ها و محتوای آموزشی",
  exams: "آزمون‌ها",
  flashcards: "فلش‌کارت‌ها",
  study_planner: "برنامه مطالعه",
  payment: "پرداخت و اشتراک",
  account: "حساب کاربری",
  website: "سایت و رابط کاربری",
  other: "سایر موضوعات",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "جدید",
  in_review: "در حال بررسی",
  answered: "پاسخ داده شده",
  closed: "بسته شده",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  courses: "دوره‌ها و محتوای آموزشی",
  exams: "آزمون‌ها و سوالات",
  flashcards: "فلش‌کارت‌ها و مرور",
  study_planner: "برنامه مطالعه هوشمند",
  payment: "امور مالی و اشتراک",
  account: "حساب کاربری و ورود",
  technical: "مشکلات فنی و سامانه‌ای",
  other: "سایر موارد",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "کم",
  medium: "متوسط",
  high: "بالا",
  urgent: "فوری",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "در انتظار بررسی",
  in_progress: "در حال بررسی",
  waiting_for_user: "منتظر پاسخ شما",
  answered: "پاسخ داده شده",
  closed: "بسته شده",
};

export function getFeedbackStatusBadgeVariant(
  status: FeedbackStatus | string,
): "primary" | "warning" | "success" | "neutral" | "error" {
  switch (status) {
    case "new":
      return "primary";
    case "in_review":
      return "warning";
    case "answered":
      return "success";
    case "closed":
      return "neutral";
    default:
      return "neutral";
  }
}

export function getTicketStatusBadgeVariant(
  status: TicketStatus | string,
): "primary" | "warning" | "success" | "neutral" | "error" {
  switch (status) {
    case "open":
      return "primary";
    case "in_progress":
      return "warning";
    case "waiting_for_user":
      return "warning";
    case "answered":
      return "success";
    case "closed":
      return "neutral";
    default:
      return "neutral";
  }
}

export function getPriorityBadgeVariant(
  priority: TicketPriority | string,
): "primary" | "warning" | "success" | "neutral" | "error" {
  switch (priority) {
    case "urgent":
      return "error";
    case "high":
      return "warning";
    case "medium":
      return "primary";
    case "low":
      return "neutral";
    default:
      return "neutral";
  }
}

import { toPersianDigits } from "@avana/domain";

export function formatPersianDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return toPersianDigits(
      new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d)
    );
  } catch {
    return isoString;
  }
}
