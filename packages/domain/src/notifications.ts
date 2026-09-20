/**
 * Notification domain models and constants for AVANA.
 */

import type { NotificationId, UserId } from "./ids.js";

export const NotificationTypes = {
  LOGIN_SUCCESS: "login_success",
  REGISTRATION_SUCCESS: "registration_success",
  EMAIL_VERIFIED: "email_verified",
  PURCHASE_COMPLETED: "purchase_completed",
  PAYMENT_FAILED: "payment_failed",
  WALLET_TOPUP_APPROVED: "wallet_topup_approved",
  WALLET_TOPUP_REJECTED: "wallet_topup_rejected",
  GENERATION_COMPLETED: "generation_completed",
  GENERATION_FAILED: "generation_failed",
  CONTENT_REPORT_STATUS_CHANGED: "content_report_status_changed",
  COURSE_PUBLISHED: "course_published",
  COURSE_REJECTED: "course_rejected",
  REFERRAL_REWARD_EARNED: "referral_reward_earned",
  SUPPORT_TICKET_REPLIED: "support_ticket_replied",
  SUPPORT_TICKET_STATUS_CHANGED: "support_ticket_status_changed",
  FEEDBACK_ANSWERED: "feedback_answered",
  SYSTEM: "system",
} as const;

export type NotificationType =
  (typeof NotificationTypes)[keyof typeof NotificationTypes];

export function isNotificationType(value: string): value is NotificationType {
  return Object.values(NotificationTypes).includes(value as NotificationType);
}

export interface NotificationAction {
  type: "navigate";
  url: string;
}

export interface NotificationItem {
  id: NotificationId;
  userId: UserId;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  action: NotificationAction | null;
  createdAt: string;
}
