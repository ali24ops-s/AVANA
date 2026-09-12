/**
 * Commerce, Monetization, and Entitlement Domain Primitives.
 *
 * Defines the core models for:
 * 1. Products (Subscription Plans, Content Packs, Courses)
 * 2. Orders & Payments (Integer Toman pricing, Pluggable Gateways)
 * 3. User Subscriptions (Business record & historical lifecycle)
 * 4. User Entitlements (Unified runtime access ledger with Lifetime Ownership)
 * 5. Access Decision Types (Centralized access check results & purchase options)
 */

import type {
  ContentPackId,
  CourseId,
  ModuleId,
  OrderId,
  PaymentId,
  ProductId,
  UserId,
  UserSubscriptionId,
  UserEntitlementId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// Course Status & Lifecycle Types
// ---------------------------------------------------------------------------

export type CourseStatus =
  | "draft"
  | "generating"
  | "review"
  | "approved"
  | "published"
  | "archived";

export const COURSE_STATUSES: readonly CourseStatus[] = [
  "draft",
  "generating",
  "review",
  "approved",
  "published",
  "archived",
];

export function isCourseStatus(v: string): v is CourseStatus {
  return (COURSE_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Product Types & Constants
// ---------------------------------------------------------------------------

export type ProductType =
  | "subscription"
  | "content_pack"
  | "course"
  | "content"
  | "special_exam";

export const PRODUCT_TYPES: readonly ProductType[] = [
  "subscription",
  "content_pack",
  "course",
  "content",
  "special_exam",
];

export function isProductType(v: string): v is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(v);
}

export type ProductTargetType =
  | "plan"
  | "content_pack"
  | "course"
  | "content"
  | "special_exam";

export type ProductRecord = {
  id: ProductId;
  code: string;
  type: ProductType;
  title: string;
  description: string | null;
  price: number; // Integer in Tomans
  currency: string; // 'toman'
  targetType: ProductTargetType | null;
  targetId: string | null;
  durationDays: number | null; // e.g. 30, 90, 365 for subscriptions; null for permanent
  active: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// ---------------------------------------------------------------------------
// Order & Payment Types
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
];

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(v);
}

export type OrderRecord = {
  id: OrderId;
  userId: UserId;
  productId: ProductId;
  orderNumber: string;
  amount: number; // Integer in Tomans
  currency: string;
  status: OrderStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PaymentGatewayType = "zarinpal" | "mock" | "card_to_card";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "pending_admin_review"
  | "admin_approved"
  | "admin_rejected";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "pending_admin_review",
  "admin_approved",
  "admin_rejected",
];

export function isPaymentStatus(v: string): v is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(v);
}

export type PaymentRecord = {
  id: PaymentId;
  orderId: OrderId;
  userId: UserId;
  amount: number;
  currency: string;
  gateway: string;
  authority: string | null;
  transactionId: string | null;
  status: PaymentStatus;
  idempotencyKey: string | null;
  rawCallbackMetadata: Record<string, unknown> | null;
  paidAt: string | null;
  trackingNumber?: string | null;
  sourceCardLast4?: string | null;
  payerName?: string | null;
  receiptUrl?: string | null;
  initialValidationResult?: Record<string, unknown> | null;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export * from "./payment-extraction.js";

// ---------------------------------------------------------------------------
// Card-to-Card (کارت‌به‌کارت) Types
// ---------------------------------------------------------------------------

export type CardToCardPaymentInput = {
  productId: ProductId;
  amount: number; // Integer in Tomans, must match product price
  trackingNumber: string; // Bank tracking / reference number
  sourceCardLast4: string; // Exactly 4 digits
  paymentDate?: string; // Optional user-reported date
  paymentTime?: string; // Optional user-reported time
  payerName?: string; // Optional cardholder name
  receiptUrl?: string; // Optional private storage URL/key
  rawPaymentText?: string; // Optional user-pasted text (sanitized before storage)
  extractionMethod?: "rule" | "ai" | "hybrid" | "manual"; // Extraction technique used
};

export type CardToCardInfoResponse = {
  enabled: boolean;
  destinationCardNumber?: string;
  cardholderName?: string;
  instructions?: string;
};

export type PaymentMethodStatus = "ACTIVE" | "COMING_SOON" | "DISABLED";

export const PAYMENT_METHODS_CONFIG = {
  CARD_TO_CARD: "ACTIVE",
  ONLINE_PAYMENT: "COMING_SOON",
  MOCK_PAYMENT: "DISABLED",
} as const;

export type CardToCardSubmissionResult = {
  success: boolean;
  orderId: OrderId;
  paymentId: PaymentId;
  subscriptionId?: UserSubscriptionId;
  status: PaymentStatus;
  subscriptionStatus?: UserSubscriptionStatus;
  message: string;
  expiresAt?: string | null;
  entitlementId?: UserEntitlementId;
  attemptId?: string;
};

// ---------------------------------------------------------------------------
// Subscription Types (Business Record & History)
// ---------------------------------------------------------------------------

export type UserSubscriptionStatus =
  | "active"
  | "active_pending_payment_review"
  | "expired"
  | "cancelled"
  | "cancelled_payment_rejected";

export const USER_SUBSCRIPTION_STATUSES: readonly UserSubscriptionStatus[] = [
  "active",
  "active_pending_payment_review",
  "expired",
  "cancelled",
  "cancelled_payment_rejected",
];

export function isUserSubscriptionStatus(v: string): v is UserSubscriptionStatus {
  return (USER_SUBSCRIPTION_STATUSES as readonly string[]).includes(v);
}

export type UserSubscriptionRecord = {
  id: UserSubscriptionId;
  userId: UserId;
  productId: ProductId;
  orderId: OrderId | null;
  status: UserSubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Entitlement Types (Unified Runtime Access Ledger)
// ---------------------------------------------------------------------------

export type EntitlementResourceType =
  | "subscription"
  | "content_pack"
  | "course"
  | "content"
  | "special_exam";

export const ENTITLEMENT_RESOURCE_TYPES: readonly EntitlementResourceType[] = [
  "subscription",
  "content_pack",
  "course",
  "content",
  "special_exam",
];

export function isEntitlementResourceType(
  v: string,
): v is EntitlementResourceType {
  return (ENTITLEMENT_RESOURCE_TYPES as readonly string[]).includes(v);
}

export type EntitlementSourceType =
  | "purchase"
  | "admin_grant"
  | "promotion"
  | "gift";

export const ENTITLEMENT_SOURCE_TYPES: readonly EntitlementSourceType[] = [
  "purchase",
  "admin_grant",
  "promotion",
  "gift",
];

export function isEntitlementSourceType(v: string): v is EntitlementSourceType {
  return (ENTITLEMENT_SOURCE_TYPES as readonly string[]).includes(v);
}

export type UserEntitlementRecord = {
  id: UserEntitlementId;
  userId: UserId;
  resourceType: EntitlementResourceType;
  resourceId: string | null; // null for subscription, contentPackId/courseId/contentId/attemptId for permanent
  sourceType: EntitlementSourceType;
  orderId: OrderId | null;
  startsAt: string;
  expiresAt: string | null; // null = Lifetime Ownership
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Centralized Access Decision Types
// ---------------------------------------------------------------------------

export type AccessReason =
  | "free"
  | "free_preview"
  | "admin_grant"
  | "creator_access"
  | "subscription"
  | "content_pack_purchase"
  | "course_purchase"
  | "content_purchase"
  | "special_exam_purchase"
  | "locked";

export type AvailablePurchaseOption = {
  type: "subscription" | "content_pack" | "course" | "content" | "special_exam";
  productId: ProductId;
  code: string;
  title: string;
  price: number;
  currency: string;
  durationDays: number | null;
};

// ---------------------------------------------------------------------------
// Special Exam Pricing & Blueprint Primitives
// ---------------------------------------------------------------------------

export const SPECIAL_EXAM_PRICE_PER_QUESTION = 500;

export function calculateSpecialExamPrice(questionCount: number): number {
  if (!questionCount || questionCount <= 0 || !Number.isInteger(questionCount)) {
    return 0;
  }
  return questionCount * SPECIAL_EXAM_PRICE_PER_QUESTION;
}

export type ExamBlueprintItem = {
  name?: string;
  topic?: string;
  moduleId?: string;
  lessonId?: string;
  courseId?: string;
  difficulty?: string;
  count: number;
};

export type SpecialExamScope = {
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  topics?: string[];
};

export type SpecialExamMetadata = {
  questionCount: number;
  scope?: SpecialExamScope;
  blueprint?: ExamBlueprintItem[];
  difficulty?: string;
  publicationStatus?: "draft" | "published" | "archived";
  [key: string]: unknown;
};

export type ResourceAccessResult = {
  granted: boolean;
  reason: AccessReason;
  accessSource?:
    | "free"
    | "free_preview"
    | "content_purchase"
    | "course_purchase"
    | "special_exam_purchase"
    | "subscription"
    | "admin_grant"
    | "creator_access"
    | null;
  expiresAt: string | null; // null for permanent ownership or free
  availablePurchaseOptions: AvailablePurchaseOption[];
};

export type ResourceAccessSummary = {
  isFree: boolean;
  isPurchased: boolean;
  hasAccess: boolean;
  accessSource:
    | "free"
    | "free_preview"
    | "content_purchase"
    | "course_purchase"
    | "special_exam_purchase"
    | "subscription"
    | "admin_grant"
    | "creator_access"
    | null;
};

export type ResourcePurchaseSummary = {
  price: number;
  currency: string;
  canPurchase: boolean;
  productId?: string | null;
  code?: string | null;
};

export type CheckAccessInput = {
  userId: UserId;
  resourceType:
    | "course"
    | "content_pack"
    | "content"
    | "module"
    | "lesson"
    | "flashcard"
    | "quiz"
    | "ai_assistant"
    | "document"
    | "special_exam";
  resourceId: string;
  courseId?: CourseId;
  contentPackId?: ContentPackId;
  moduleId?: ModuleId;
  previewSessionId?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a subscription record is actively valid at reference date.
 * Both 'active' and 'active_pending_payment_review' grant full active access.
 */
export function isSubscriptionActive(
  sub: UserSubscriptionRecord,
  referenceDate: Date = new Date(),
): boolean {
  if (
    sub.status !== "active" &&
    sub.status !== "active_pending_payment_review"
  ) {
    return false;
  }
  const expiry = new Date(sub.expiresAt);
  return expiry.getTime() > referenceDate.getTime();
}

/**
 * Checks if an entitlement is active at reference date (permanent if expiresAt is null).
 */
export function isEntitlementActive(
  entitlement: UserEntitlementRecord,
  referenceDate: Date = new Date(),
): boolean {
  if (entitlement.expiresAt === null) {
    return true; // Lifetime Ownership
  }
  const expiry = new Date(entitlement.expiresAt);
  return expiry.getTime() > referenceDate.getTime();
}

/**
 * Computes an expiration timestamp from a given start date and duration days.
 */
export function calculateSubscriptionExpiry(
  startDate: Date = new Date(),
  durationDays: number,
): Date {
  const expiry = new Date(startDate.getTime());
  expiry.setDate(expiry.getDate() + durationDays);
  return expiry;
}

/**
 * Generates a human-friendly unique order number (e.g., ORD-YYYYMMDD-XXXX).
 */
export function generateOrderNumber(prefix = "ORD"): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${dateStr}-${randomSuffix}`;
}

// ---------------------------------------------------------------------------
// Content Default Suggested Pricing
// ---------------------------------------------------------------------------

/**
 * Authoritative constants for volume-based suggested content pricing (in integer Tomans).
 */
export const CONTENT_PRICING_DEFAULTS = {
  lessonBase: 1000,
  flashcardPer100: 500,
  questionPer100: 300,
  reviewSummary: 2000,
} as const;

export type ContentPricingInput = {
  lessonCount?: number;
  flashcardCount?: number;
  questionCount?: number;
  hasReviewSummary?: boolean;
};

export type ContentPricingBreakdown = {
  lessonBasePrice: number;
  flashcardPrice: number;
  questionPrice: number;
  reviewSummaryPrice: number;
  totalSuggestedPrice: number;
  lessonCount: number;
  flashcardCount: number;
  questionCount: number;
  hasReviewSummary: boolean;
};

/**
 * Calculates the default suggested price for a content/lesson based on content volume.
 *
 * Formula:
 * defaultPrice = lessonCount * 1000 + ceil(flashcardCount / 100) * 500 + ceil(questionCount / 100) * 300 + (hasReviewSummary ? 2000 : 0)
 *
 * Invariants:
 * - Integer Tomans only (no floating point arithmetic)
 * - Math.ceil applies strictly to item counts divided by 100 (e.g. 0 -> 0, 1-100 -> 1, 101-200 -> 2)
 * - Safe against negative numbers
 */
export function calculateDefaultContentPrice(input: ContentPricingInput): number {
  const lessonCount = Math.max(1, input.lessonCount ?? 1);
  const flashcardCount = Math.max(0, input.flashcardCount ?? 0);
  const questionCount = Math.max(0, input.questionCount ?? 0);
  const hasReviewSummary = Boolean(input.hasReviewSummary);

  const flashcardUnits = Math.ceil(flashcardCount / 100);
  const questionUnits = Math.ceil(questionCount / 100);

  const price =
    lessonCount * CONTENT_PRICING_DEFAULTS.lessonBase +
    flashcardUnits * CONTENT_PRICING_DEFAULTS.flashcardPer100 +
    questionUnits * CONTENT_PRICING_DEFAULTS.questionPer100 +
    (hasReviewSummary ? CONTENT_PRICING_DEFAULTS.reviewSummary : 0);

  return Math.round(price);
}

/**
 * Returns a comprehensive pricing breakdown for reporting, studio preview, and metadata.
 */
export function calculateContentPricingBreakdown(
  input: ContentPricingInput,
): ContentPricingBreakdown {
  const lessonCount = Math.max(1, input.lessonCount ?? 1);
  const flashcardCount = Math.max(0, input.flashcardCount ?? 0);
  const questionCount = Math.max(0, input.questionCount ?? 0);
  const hasReviewSummary = Boolean(input.hasReviewSummary);

  const flashcardUnits = Math.ceil(flashcardCount / 100);
  const questionUnits = Math.ceil(questionCount / 100);

  const lessonBasePrice = lessonCount * CONTENT_PRICING_DEFAULTS.lessonBase;
  const flashcardPrice = flashcardUnits * CONTENT_PRICING_DEFAULTS.flashcardPer100;
  const questionPrice = questionUnits * CONTENT_PRICING_DEFAULTS.questionPer100;
  const reviewSummaryPrice = hasReviewSummary
    ? CONTENT_PRICING_DEFAULTS.reviewSummary
    : 0;
  const totalSuggestedPrice = Math.round(
    lessonBasePrice + flashcardPrice + questionPrice + reviewSummaryPrice,
  );

  return {
    lessonBasePrice,
    flashcardPrice,
    questionPrice,
    reviewSummaryPrice,
    totalSuggestedPrice,
    lessonCount,
    flashcardCount,
    questionCount,
    hasReviewSummary,
  };
}

/**
 * Validates whether a given payload is a complete, valid Review Summary.
 * Incomplete summaries (e.g. missing overview, empty sections, or sections without keyPoints) return false.
 */
export function isCompleteReviewSummary(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  if (candidate.kind !== "review_summary") {
    return false;
  }
  if (
    typeof candidate.title !== "string" ||
    candidate.title.trim().length === 0
  ) {
    return false;
  }
  if (
    typeof candidate.overview !== "string" ||
    candidate.overview.trim().length === 0
  ) {
    return false;
  }
  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    return false;
  }
  for (const sec of candidate.sections) {
    if (!sec || typeof sec !== "object" || Array.isArray(sec)) {
      return false;
    }
    const secRecord = sec as Record<string, unknown>;
    if (
      typeof secRecord.title !== "string" ||
      secRecord.title.trim().length === 0
    ) {
      return false;
    }
    if (
      !Array.isArray(secRecord.keyPoints) ||
      secRecord.keyPoints.length === 0 ||
      secRecord.keyPoints.every(
        (kp: unknown) => typeof kp !== "string" || kp.trim().length === 0,
      )
    ) {
      return false;
    }
  }
  return true;
}

