/**
 * Domain models, enums, status transitions, and types for Support and Feedback.
 */

import type { UserId } from "./ids.js";

// ============================================================================
// Feedback Domain Models
// ============================================================================

export const FeedbackTypes = {
  SUGGESTION: "suggestion",
  COMPLAINT: "complaint",
  BUG_REPORT: "bug_report",
  FEATURE_REQUEST: "feature_request",
  APPRECIATION: "appreciation",
} as const;

export type FeedbackType = (typeof FeedbackTypes)[keyof typeof FeedbackTypes];

export function isFeedbackType(val: string): val is FeedbackType {
  return Object.values(FeedbackTypes).includes(val as FeedbackType);
}

export const FeedbackCategories = {
  LIBRARY: "library",
  COURSES: "courses",
  EXAMS: "exams",
  FLASHCARDS: "flashcards",
  STUDY_PLANNER: "study_planner",
  PAYMENT: "payment",
  ACCOUNT: "account",
  WEBSITE: "website",
  OTHER: "other",
} as const;

export type FeedbackCategory =
  (typeof FeedbackCategories)[keyof typeof FeedbackCategories];

export function isFeedbackCategory(val: string): val is FeedbackCategory {
  return Object.values(FeedbackCategories).includes(val as FeedbackCategory);
}

export const FeedbackStatuses = {
  NEW: "new",
  IN_REVIEW: "in_review",
  ANSWERED: "answered",
  CLOSED: "closed",
} as const;

export type FeedbackStatus =
  (typeof FeedbackStatuses)[keyof typeof FeedbackStatuses];

export function isFeedbackStatus(val: string): val is FeedbackStatus {
  return Object.values(FeedbackStatuses).includes(val as FeedbackStatus);
}

export interface FeedbackItem {
  id: string;
  userId: UserId;
  userName?: string;
  userEmail?: string;
  type: FeedbackType;
  category: FeedbackCategory;
  title: string;
  description: string;
  attachmentUrl: string | null;
  status: FeedbackStatus;
  adminResponse: string | null;
  respondedAt: string | null;
  respondedBy: UserId | null;
  responderName?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Support Ticket Domain Models
// ============================================================================

export const TicketCategories = {
  COURSES: "courses",
  EXAMS: "exams",
  FLASHCARDS: "flashcards",
  STUDY_PLANNER: "study_planner",
  PAYMENT: "payment",
  ACCOUNT: "account",
  TECHNICAL: "technical",
  OTHER: "other",
} as const;

export type TicketCategory =
  (typeof TicketCategories)[keyof typeof TicketCategories];

export function isTicketCategory(val: string): val is TicketCategory {
  return Object.values(TicketCategories).includes(val as TicketCategory);
}

export const TicketPriorities = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type TicketPriority =
  (typeof TicketPriorities)[keyof typeof TicketPriorities];

export function isTicketPriority(val: string): val is TicketPriority {
  return Object.values(TicketPriorities).includes(val as TicketPriority);
}

export const TicketStatuses = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  WAITING_FOR_USER: "waiting_for_user",
  ANSWERED: "answered",
  CLOSED: "closed",
} as const;

export type TicketStatus = (typeof TicketStatuses)[keyof typeof TicketStatuses];

export function isTicketStatus(val: string): val is TicketStatus {
  return Object.values(TicketStatuses).includes(val as TicketStatus);
}

export interface SupportMessageItem {
  id: string;
  ticketId: string;
  senderId: UserId;
  senderRole: "user" | "admin";
  senderName?: string;
  senderEmail?: string;
  body: string;
  attachmentUrl: string | null;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicketItem {
  id: string;
  userId: UserId;
  userName?: string;
  userEmail?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  description: string;
  attachmentUrl: string | null;
  lastActivityAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  messages?: SupportMessageItem[];
}

// ============================================================================
// Status Transition Rules
// ============================================================================

/**
 * Valid transitions for support tickets.
 */
export const ALLOWED_TICKET_STATUS_TRANSITIONS: Record<
  TicketStatus,
  readonly TicketStatus[]
> = {
  [TicketStatuses.OPEN]: [
    TicketStatuses.IN_PROGRESS,
    TicketStatuses.WAITING_FOR_USER,
    TicketStatuses.ANSWERED,
    TicketStatuses.CLOSED,
  ],
  [TicketStatuses.IN_PROGRESS]: [
    TicketStatuses.WAITING_FOR_USER,
    TicketStatuses.ANSWERED,
    TicketStatuses.CLOSED,
  ],
  [TicketStatuses.WAITING_FOR_USER]: [
    TicketStatuses.IN_PROGRESS,
    TicketStatuses.ANSWERED,
    TicketStatuses.CLOSED,
  ],
  [TicketStatuses.ANSWERED]: [
    TicketStatuses.IN_PROGRESS,
    TicketStatuses.WAITING_FOR_USER,
    TicketStatuses.CLOSED,
  ],
  [TicketStatuses.CLOSED]: [
    TicketStatuses.OPEN,
    TicketStatuses.IN_PROGRESS,
  ],
};

export function canTransitionTicketStatus(
  current: TicketStatus,
  target: TicketStatus,
): boolean {
  if (current === target) return true;
  const allowed = ALLOWED_TICKET_STATUS_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}

/**
 * Valid transitions for feedback status.
 */
export const ALLOWED_FEEDBACK_STATUS_TRANSITIONS: Record<
  FeedbackStatus,
  readonly FeedbackStatus[]
> = {
  [FeedbackStatuses.NEW]: [
    FeedbackStatuses.IN_REVIEW,
    FeedbackStatuses.ANSWERED,
    FeedbackStatuses.CLOSED,
  ],
  [FeedbackStatuses.IN_REVIEW]: [
    FeedbackStatuses.ANSWERED,
    FeedbackStatuses.CLOSED,
  ],
  [FeedbackStatuses.ANSWERED]: [
    FeedbackStatuses.CLOSED,
  ],
  [FeedbackStatuses.CLOSED]: [
    FeedbackStatuses.NEW,
    FeedbackStatuses.IN_REVIEW,
  ],
};

export function canTransitionFeedbackStatus(
  current: FeedbackStatus,
  target: FeedbackStatus,
): boolean {
  if (current === target) return true;
  const allowed = ALLOWED_FEEDBACK_STATUS_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}
