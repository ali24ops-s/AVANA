import { DomainError } from "./errors.js";
import { isUUID } from "./ids.js";

// ---------------------------------------------------------------------------
// CRM Tags
// ---------------------------------------------------------------------------

export interface CrmTagItem {
  id: string;
  name: string;
  color: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCrmTagInput {
  name: string;
  color?: string;
  description?: string | null;
}

export interface UpdateCrmTagInput {
  name?: string;
  color?: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// CRM Customer Notes
// ---------------------------------------------------------------------------

export interface CrmCustomerNoteItem {
  id: string;
  userId: string;
  authorId: string;
  authorName?: string;
  authorEmail?: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCrmCustomerNoteInput {
  content: string;
  isPinned?: boolean;
}

export interface UpdateCrmCustomerNoteInput {
  content?: string;
  isPinned?: boolean;
}

// ---------------------------------------------------------------------------
// CRM Customer List
// ---------------------------------------------------------------------------

export interface CrmCustomerListItem {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  isVerified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  successfulOrdersCount?: number;
  totalPaidAmount?: number;
  tags: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export interface ListCrmCustomersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  verifiedStatus?: "all" | "verified" | "unverified";
  hasPurchases?: "all" | "true" | "false";
  minSpent?: number;
  maxSpent?: number;
  createdAfter?: string;
  createdBefore?: string;
  tagId?: string;
  sortBy?: "createdAt" | "name" | "totalSpent" | "successfulOrdersCount";
  sortOrder?: "asc" | "desc";
}

export interface ListCrmCustomersResponse {
  customers: CrmCustomerListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// CRM 360-Degree Customer Profile
// ---------------------------------------------------------------------------

export interface CrmCustomerIdentitySummary {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  createdAt: string;
  deletedAt: string | null;
  isVerified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  role: string;
  teacherStatus: string;
  major: string | null;
  university: string | null;
  faculty: string | null;
  department: string | null;
  lastActiveAt: string | null;
  activeDevicesCount: number;
}

export interface CrmCustomerFinancialSummary {
  successfulOrdersCount: number;
  totalPaidAmount: number;
  lastPaymentDate: string | null;
  walletBalance: number;
  totalWalletTopups: number;
  totalAiConsumption: number;
  totalSpecialExamConsumption: number;
  totalGiftCredits: number;
  refundsCount: number;
  totalRefunds: number;
  activeSubscription: {
    id: string;
    productTitle: string;
    expiresAt: string;
    status: string;
  } | null;
}

export interface CrmCustomerEducationalSummary {
  enrolledCoursesCount: number;
  ownedCoursesCount: number;
  uploadedDocumentsCount: number;
  aiGeneratedContentsCount: number;
  quizzesAttemptedCount: number;
  averageQuizScore: number | null;
  totalStudyTimeSeconds: number;
  lastEducationalActivityAt: string | null;
}

export interface CrmCustomer360Profile {
  identity: CrmCustomerIdentitySummary;
  financial?: CrmCustomerFinancialSummary;
  education: CrmCustomerEducationalSummary;
  tags: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  notes: CrmCustomerNoteItem[];
}

// ---------------------------------------------------------------------------
// CRM Dynamic Customer Segmentation (Phase 2)
// ---------------------------------------------------------------------------

export type SegmentMatchOperator = "and" | "or";
export type SegmentTimeWindow = "all_time" | "last_7_days" | "last_30_days" | "last_90_days";

export type SegmentFieldKey =
  // مشخصات کاربر
  | "user.createdAt"
  | "user.emailVerified"
  | "user.phoneVerified"
  | "user.isVerified"
  | "user.major"
  // برچسب
  | "crm.tag"
  // خرید
  | "payment.hasCashPurchase"
  | "payment.totalCashSpent"
  | "payment.successfulOrdersCount"
  | "payment.lastCashPurchaseDate"
  // فعالیت و یادگیری
  | "activity.lastActiveDate"
  | "activity.studySessionsCount"
  | "activity.totalStudyTimeMinutes"
  | "activity.completedQuizzesCount"
  | "activity.enrolledCoursesCount"
  | "activity.uploadedDocumentsCount"
  | "activity.aiGeneratedContentsCount";

export type SegmentRuleOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "between"
  | "in"
  | "not_in"
  | "is_true"
  | "is_false"
  | "days_ago_greater_than"
  | "days_ago_less_than";

export interface UserCreatedAtRule {
  id?: string;
  field: "user.createdAt";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between"
    | "days_ago_greater_than"
    | "days_ago_less_than";
  value: string | [string, string] | number;
}

export interface UserEmailVerifiedRule {
  id?: string;
  field: "user.emailVerified";
  operator: "is_true" | "is_false" | "equals";
  value?: boolean;
}

export interface UserPhoneVerifiedRule {
  id?: string;
  field: "user.phoneVerified";
  operator: "is_true" | "is_false" | "equals";
  value?: boolean;
}

export interface UserIsVerifiedRule {
  id?: string;
  field: "user.isVerified";
  operator: "is_true" | "is_false" | "equals";
  value?: boolean;
}

export interface UserMajorRule {
  id?: string;
  field: "user.major";
  operator: "equals" | "not_equals" | "in" | "not_in";
  value: string | string[];
}

export interface CrmTagRule {
  id?: string;
  field: "crm.tag";
  operator: "equals" | "not_equals" | "in" | "not_in";
  value: string | string[];
}

export interface PaymentHasCashPurchaseRule {
  id?: string;
  field: "payment.hasCashPurchase";
  operator: "is_true" | "is_false" | "equals";
  value?: boolean;
}

export interface PaymentTotalCashSpentRule {
  id?: string;
  field: "payment.totalCashSpent";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
}

export interface PaymentSuccessfulOrdersCountRule {
  id?: string;
  field: "payment.successfulOrdersCount";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
}

export interface PaymentLastCashPurchaseDateRule {
  id?: string;
  field: "payment.lastCashPurchaseDate";
  operator:
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between"
    | "days_ago_greater_than"
    | "days_ago_less_than";
  value: string | [string, string] | number;
}

export interface ActivityLastActiveDateRule {
  id?: string;
  field: "activity.lastActiveDate";
  operator:
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between"
    | "days_ago_greater_than"
    | "days_ago_less_than";
  value: string | [string, string] | number;
}

export interface ActivityStudySessionsCountRule {
  id?: string;
  field: "activity.studySessionsCount";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
  window?: SegmentTimeWindow;
}

export interface ActivityTotalStudyTimeMinutesRule {
  id?: string;
  field: "activity.totalStudyTimeMinutes";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
  window?: SegmentTimeWindow;
}

export interface ActivityCompletedQuizzesCountRule {
  id?: string;
  field: "activity.completedQuizzesCount";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
}

export interface ActivityEnrolledCoursesCountRule {
  id?: string;
  field: "activity.enrolledCoursesCount";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
}

export interface ActivityUploadedDocumentsCountRule {
  id?: string;
  field: "activity.uploadedDocumentsCount";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
}

export interface ActivityAiGeneratedContentsCountRule {
  id?: string;
  field: "activity.aiGeneratedContentsCount";
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "between";
  value: number | [number, number];
}

export type SegmentFilterRule =
  | UserCreatedAtRule
  | UserEmailVerifiedRule
  | UserPhoneVerifiedRule
  | UserIsVerifiedRule
  | UserMajorRule
  | CrmTagRule
  | PaymentHasCashPurchaseRule
  | PaymentTotalCashSpentRule
  | PaymentSuccessfulOrdersCountRule
  | PaymentLastCashPurchaseDateRule
  | ActivityLastActiveDateRule
  | ActivityStudySessionsCountRule
  | ActivityTotalStudyTimeMinutesRule
  | ActivityCompletedQuizzesCountRule
  | ActivityEnrolledCoursesCountRule
  | ActivityUploadedDocumentsCountRule
  | ActivityAiGeneratedContentsCountRule;

export interface CrmSegmentItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  matchOperator: SegmentMatchOperator;
  filterRules: SegmentFilterRule[];
  createdById: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  estimatedCount?: number;
}

export interface CreateCrmSegmentInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
  matchOperator?: SegmentMatchOperator;
  filterRules: SegmentFilterRule[];
}

export interface UpdateCrmSegmentInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  matchOperator?: SegmentMatchOperator;
  filterRules?: SegmentFilterRule[];
}

export interface ListCrmSegmentsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}

export interface ListCrmSegmentsResponse {
  segments: CrmSegmentItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GetSegmentMembersParams {
  segmentId: string;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name" | "totalSpent" | "successfulOrdersCount";
  sortOrder?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Segment Rule Schema Validation
// ---------------------------------------------------------------------------

export const ALLOWED_SEGMENT_FIELDS: readonly SegmentFieldKey[] = [
  "user.createdAt",
  "user.emailVerified",
  "user.phoneVerified",
  "user.isVerified",
  "user.major",
  "crm.tag",
  "payment.hasCashPurchase",
  "payment.totalCashSpent",
  "payment.successfulOrdersCount",
  "payment.lastCashPurchaseDate",
  "activity.lastActiveDate",
  "activity.studySessionsCount",
  "activity.totalStudyTimeMinutes",
  "activity.completedQuizzesCount",
  "activity.enrolledCoursesCount",
  "activity.uploadedDocumentsCount",
  "activity.aiGeneratedContentsCount",
] as const;

export const ALLOWED_TIME_WINDOWS: readonly SegmentTimeWindow[] = [
  "all_time",
  "last_7_days",
  "last_30_days",
  "last_90_days",
] as const;

const BOOLEAN_FIELDS = new Set<SegmentFieldKey>([
  "user.emailVerified",
  "user.phoneVerified",
  "user.isVerified",
  "payment.hasCashPurchase",
]);

const NUMERIC_FIELDS = new Set<SegmentFieldKey>([
  "payment.totalCashSpent",
  "payment.successfulOrdersCount",
  "activity.completedQuizzesCount",
  "activity.enrolledCoursesCount",
  "activity.uploadedDocumentsCount",
  "activity.aiGeneratedContentsCount",
  "activity.studySessionsCount",
  "activity.totalStudyTimeMinutes",
]);

const DATE_FIELDS = new Set<SegmentFieldKey>([
  "user.createdAt",
  "payment.lastCashPurchaseDate",
  "activity.lastActiveDate",
]);

const STRING_FIELDS = new Set<SegmentFieldKey>(["user.major"]);
const TAG_FIELDS = new Set<SegmentFieldKey>(["crm.tag"]);

function isValidIsoDate(str: unknown): str is string {
  if (typeof str !== "string") return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

export function validateSegmentRules(rawRules: unknown): SegmentFilterRule[] {
  if (!Array.isArray(rawRules)) {
    throw new DomainError("bad_request", "قواعد سگمنت باید به صورت آرایه ارسال شوند.");
  }

  if (rawRules.length > 20) {
    throw new DomainError("bad_request", "حداکثر ۲۰ شرط برای هر سگمنت مجاز است.");
  }

  const validated: SegmentFilterRule[] = [];

  for (let i = 0; i < rawRules.length; i++) {
    const r = rawRules[i];
    if (!r || typeof r !== "object") {
      throw new DomainError("bad_request", `شرط شماره ${i + 1} نامعتبر است.`);
    }

    const rawObj = r as Record<string, unknown>;
    const field = rawObj.field as SegmentFieldKey;
    const operator = rawObj.operator as SegmentRuleOperator;
    const value = rawObj.value;
    const id = typeof rawObj.id === "string" ? rawObj.id : undefined;

    if (!field || !ALLOWED_SEGMENT_FIELDS.includes(field)) {
      throw new DomainError("bad_request", `فیلد ${String(field)} در شرط شماره ${i + 1} ناشناخته یا غیرمجاز است.`);
    }

    // 1. Boolean Fields
    if (BOOLEAN_FIELDS.has(field)) {
      if (operator !== "is_true" && operator !== "is_false" && operator !== "equals") {
        throw new DomainError(
          "bad_request",
          `عملگر ${operator} برای فیلد بولی ${field} مجاز نیست.`,
        );
      }
      let val = true;
      if (operator === "is_false") val = false;
      else if (operator === "equals") {
        if (typeof value !== "boolean") {
          throw new DomainError("bad_request", `مقدار شرط ${field} باید بولی باشد.`);
        }
        val = value;
      }
      validated.push({
        id,
        field,
        operator,
        value: val,
      } as unknown as SegmentFilterRule);
      continue;
    }

    // 2. Numeric Fields
    if (NUMERIC_FIELDS.has(field)) {
      const allowedOps: SegmentRuleOperator[] = [
        "equals",
        "not_equals",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
        "between",
      ];
      if (!allowedOps.includes(operator)) {
        throw new DomainError("bad_request", `عملگر ${operator} برای فیلد عددی ${field} مجاز نیست.`);
      }

      if (operator === "between") {
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          typeof value[0] !== "number" ||
          typeof value[1] !== "number" ||
          isNaN(value[0]) ||
          isNaN(value[1])
        ) {
          throw new DomainError(
            "bad_request",
            `مقدار عملگر between برای ${field} باید آرایه‌ای شامل دو عدد معتبر باشد.`,
          );
        }
        if (value[0] < 0 || value[1] < 0) {
          throw new DomainError("bad_request", `مقادیر عددی برای ${field} نمی‌توانند منفی باشند.`);
        }
        if (value[0] > value[1]) {
          throw new DomainError(
            "bad_request",
            `محدوده شروع نمی‌تواند بزرگتر از محدوده پایان باشد.`,
          );
        }
      } else {
        if (typeof value !== "number" || isNaN(value)) {
          throw new DomainError("bad_request", `مقدار شرط عددی ${field} باید یک عدد معتبر باشد.`);
        }
        if (value < 0) {
          throw new DomainError("bad_request", `مقدار عددی برای ${field} نمی‌تواند منفی باشد.`);
        }
      }

      let window: SegmentTimeWindow | undefined = undefined;
      if (field === "activity.studySessionsCount" || field === "activity.totalStudyTimeMinutes") {
        const rawWindow = rawObj.window as SegmentTimeWindow | undefined;
        if (rawWindow !== undefined) {
          if (!ALLOWED_TIME_WINDOWS.includes(rawWindow)) {
            throw new DomainError("bad_request", `بازه زمانی ${rawWindow} برای ${field} نامعتبر است.`);
          }
          window = rawWindow;
        } else {
          window = "all_time";
        }
      }

      validated.push({
        id,
        field,
        operator,
        value,
        ...(window ? { window } : {}),
      } as unknown as SegmentFilterRule);
      continue;
    }

    // 3. Date Fields
    if (DATE_FIELDS.has(field)) {
      const allowedOps: SegmentRuleOperator[] = [
        "equals",
        "not_equals",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
        "between",
        "days_ago_greater_than",
        "days_ago_less_than",
      ];
      if (!allowedOps.includes(operator)) {
        throw new DomainError("bad_request", `عملگر ${operator} برای فیلد زمانی ${field} مجاز نیست.`);
      }

      if (operator === "days_ago_greater_than" || operator === "days_ago_less_than") {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
          throw new DomainError(
            "bad_request",
            `مقدار عملگر روز گذشته برای ${field} باید عدد صحیح نامنفی باشد.`,
          );
        }
      } else if (operator === "between") {
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          !isValidIsoDate(value[0]) ||
          !isValidIsoDate(value[1])
        ) {
          throw new DomainError(
            "bad_request",
            `مقدار عملگر between برای تاریخ ${field} باید آرایه‌ای شامل دو تاریخ معتبر باشد.`,
          );
        }
        if (new Date(value[0]).getTime() > new Date(value[1]).getTime()) {
          throw new DomainError("bad_request", `تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.`);
        }
      } else {
        if (!isValidIsoDate(value)) {
          throw new DomainError("bad_request", `مقدار تاریخ برای ${field} نامعتبر است.`);
        }
      }

      validated.push({
        id,
        field,
        operator,
        value,
      } as unknown as SegmentFilterRule);
      continue;
    }

    // 4. String Fields (user.major)
    if (STRING_FIELDS.has(field)) {
      const allowedOps: SegmentRuleOperator[] = ["equals", "not_equals", "in", "not_in"];
      if (!allowedOps.includes(operator)) {
        throw new DomainError("bad_request", `عملگر ${operator} برای فیلد رشته‌ای ${field} مجاز نیست.`);
      }

      if (operator === "in" || operator === "not_in") {
        if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
          throw new DomainError(
            "bad_request",
            `مقدار ${operator} برای ${field} باید آرایه‌ای غیرخالی با حداکثر ۵۰ رشته باشد.`,
          );
        }
        for (const item of value) {
          if (typeof item !== "string" || !item.trim() || item.trim().length > 100) {
            throw new DomainError("bad_request", `آیتم‌های ${field} باید رشته‌های معتبر تا ۱۰۰ کاراکتر باشند.`);
          }
        }
        const stringArr = value as string[];
        validated.push({
          id,
          field,
          operator,
          value: stringArr.map((x) => String(x).trim()),
        } as unknown as SegmentFilterRule);
      } else {
        if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
          throw new DomainError("bad_request", `مقدار ${field} باید رشته‌ای معتبر تا ۱۰۰ کاراکتر باشد.`);
        }
        validated.push({
          id,
          field,
          operator,
          value: value.trim(),
        } as unknown as SegmentFilterRule);
      }
      continue;
    }

    // 5. Tag Fields (crm.tag)
    if (TAG_FIELDS.has(field)) {
      const allowedOps: SegmentRuleOperator[] = ["equals", "not_equals", "in", "not_in"];
      if (!allowedOps.includes(operator)) {
        throw new DomainError("bad_request", `عملگر ${operator} برای برچسب مجاز نیست.`);
      }

      if (operator === "in" || operator === "not_in") {
        if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
          throw new DomainError(
            "bad_request",
            `مقدار ${operator} برای برچسب‌ها باید آرایه‌ای غیرخالی با حداکثر ۵۰ شناسه باشد.`,
          );
        }
        for (const item of value) {
          if (typeof item !== "string" || !isUUID(item)) {
            throw new DomainError("bad_request", `شناسه برچسب "${String(item)}" نامعتبر است.`);
          }
        }
        validated.push({
          id,
          field,
          operator,
          value,
        } as unknown as SegmentFilterRule);
      } else {
        if (typeof value !== "string" || !isUUID(value)) {
          throw new DomainError("bad_request", `شناسه برچسب "${String(value)}" نامعتبر است.`);
        }
        validated.push({
          id,
          field,
          operator,
          value,
        } as unknown as SegmentFilterRule);
      }
      continue;
    }
  }

  return validated;
}

export function hasFinancialSegmentRules(rawRules: unknown): boolean {
  if (!Array.isArray(rawRules)) return false;
  return rawRules.some((item) => {
    if (!item || typeof item !== "object") return false;
    const ruleObj = item as { field?: unknown; rules?: unknown };
    if (typeof ruleObj.field === "string" && ruleObj.field.startsWith("payment.")) {
      return true;
    }
    if (Array.isArray(ruleObj.rules) && hasFinancialSegmentRules(ruleObj.rules)) {
      return true;
    }
    return false;
  });
}

export function validateCreateCrmSegmentInput(input: CreateCrmSegmentInput): {
  name: string;
  description: string | null;
  isActive: boolean;
  matchOperator: SegmentMatchOperator;
  filterRules: SegmentFilterRule[];
} {
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new DomainError("bad_request", "نام سگمنت الزامی است.");
  }
  if (trimmedName.length > 150) {
    throw new DomainError("bad_request", "نام سگمنت نمی‌تواند بیشتر از ۱۵۰ کاراکتر باشد.");
  }

  const desc = input.description !== undefined ? input.description?.trim() || null : null;
  if (desc && desc.length > 1000) {
    throw new DomainError("bad_request", "توضیحات سگمنت نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.");
  }

  const matchOperator: SegmentMatchOperator =
    input.matchOperator === "or" ? "or" : "and";
  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
  const filterRules = validateSegmentRules(input.filterRules);

  return {
    name: trimmedName,
    description: desc,
    isActive,
    matchOperator,
    filterRules,
  };
}

export function validateUpdateCrmSegmentInput(input: UpdateCrmSegmentInput): {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  matchOperator?: SegmentMatchOperator;
  filterRules?: SegmentFilterRule[];
} {
  const result: ReturnType<typeof validateUpdateCrmSegmentInput> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new DomainError("bad_request", "نام سگمنت نمی‌تواند خالی باشد.");
    }
    if (trimmed.length > 150) {
      throw new DomainError("bad_request", "نام سگمنت نمی‌تواند بیشتر از ۱۵۰ کاراکتر باشد.");
    }
    result.name = trimmed;
  }

  if (input.description !== undefined) {
    const desc = input.description?.trim() || null;
    if (desc && desc.length > 1000) {
      throw new DomainError("bad_request", "توضیحات سگمنت نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.");
    }
    result.description = desc;
  }

  if (input.isActive !== undefined) {
    result.isActive = Boolean(input.isActive);
  }

  if (input.matchOperator !== undefined) {
    if (input.matchOperator !== "and" && input.matchOperator !== "or") {
      throw new DomainError("bad_request", "عملگر ترکیب شروط باید and یا or باشد.");
    }
    result.matchOperator = input.matchOperator;
  }

  if (input.filterRules !== undefined) {
    result.filterRules = validateSegmentRules(input.filterRules);
  }

  return result;
}

// ---------------------------------------------------------------------------
// CRM Customer Campaign Management (Phase 3)
// ---------------------------------------------------------------------------

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export type CampaignChannel = "sms" | "email" | "telegram" | "in_app";

export const ALLOWED_CAMPAIGN_CHANNELS: readonly CampaignChannel[] = [
  "sms",
  "email",
  "telegram",
  "in_app",
] as const;

export const ALLOWED_CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const;

export type CampaignExecutionStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type CampaignRecipientStatus =
  | "pending"
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped";

export interface CrmCampaignExecutionSummary {
  id: string;
  status: CampaignExecutionStatus;
  totalRecipients: number;
  processedRecipients: number;
  successfulRecipients: number;
  failedRecipients: number;
  startedAt: string;
  completedAt: string | null;
}

export interface CrmCampaignItem {
  id: string;
  name: string;
  description: string | null;
  targetSegmentId: string;
  targetSegmentName?: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  messageContent: string | null;
  scheduledAt: string | null;
  createdById: string;
  createdByName?: string;
  estimatedRecipientsCount?: number;
  lastExecution?: CrmCampaignExecutionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCrmCampaignInput {
  name: string;
  description?: string | null;
  targetSegmentId: string;
  channel: CampaignChannel;
  messageContent?: string | null;
  scheduledAt?: string | null;
}

export interface UpdateCrmCampaignInput {
  name?: string;
  description?: string | null;
  targetSegmentId?: string;
  channel?: CampaignChannel;
  messageContent?: string | null;
  scheduledAt?: string | null;
  status?: CampaignStatus;
}

export interface ListCrmCampaignsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CampaignStatus;
  channel?: CampaignChannel;
  targetSegmentId?: string;
}

export interface ListCrmCampaignsResponse {
  campaigns: CrmCampaignItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CrmCampaignExecutionItem {
  id: string;
  campaignId: string;
  jobId?: string | null;
  status: CampaignExecutionStatus;
  totalRecipients: number;
  processedRecipients: number;
  successfulRecipients: number;
  failedRecipients: number;
  startedAt: string;
  completedAt: string | null;
  triggeredById: string;
  triggeredByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmCampaignRecipientItem {
  id: string;
  campaignId: string;
  executionId: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  userPhoneNumber?: string | null;
  channel: CampaignChannel;
  status: CampaignRecipientStatus;
  attempts?: number;
  lastAttemptAt?: string | null;
  errorCode?: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface SendMessagePayload {
  recipientId: string;
  userId: string;
  campaignId: string;
  executionId: string;
  channel: CampaignChannel;
  recipientContact: string;
  messageContent: string;
}

export interface SendMessageResult {
  success: boolean;
  providerMessageId?: string;
  error?: {
    code: string;
    message: string;
    isTransient: boolean;
  };
}

export interface CrmChannelAdapter {
  readonly channel: CampaignChannel;
  send(payload: SendMessagePayload): Promise<SendMessageResult>;
}

export interface ListCrmCampaignExecutionsResponse {
  executions: CrmCampaignExecutionItem[];
}

export interface ListCrmCampaignRecipientsParams {
  page?: number;
  pageSize?: number;
  status?: CampaignRecipientStatus;
  executionId?: string;
}

export interface ListCrmCampaignRecipientsResponse {
  recipients: CrmCampaignRecipientItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const VALID_CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["scheduled", "running", "cancelled"],
  scheduled: ["draft", "running", "cancelled"],
  running: ["paused", "completed", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionCampaignStatus(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  if (from === to) return true;
  const allowed = VALID_CAMPAIGN_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function validateCampaignStatusTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): void {
  if (!canTransitionCampaignStatus(from, to)) {
    throw new DomainError(
      "bad_request",
      `انتقال وضعیت کمپین از "${from}" به "${to}" مجاز نیست.`,
    );
  }
}

export function validateCreateCrmCampaignInput(input: CreateCrmCampaignInput): {
  name: string;
  description: string | null;
  targetSegmentId: string;
  channel: CampaignChannel;
  messageContent: string | null;
  scheduledAt: string | null;
} {
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new DomainError("bad_request", "عنوان کمپین الزامی است.");
  }
  if (trimmedName.length > 150) {
    throw new DomainError("bad_request", "عنوان کمپین نمی‌تواند بیشتر از ۱۵۰ کاراکتر باشد.");
  }

  const desc = input.description !== undefined ? input.description?.trim() || null : null;
  if (desc && desc.length > 1000) {
    throw new DomainError("bad_request", "توضیحات کمپین نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.");
  }

  if (!input.targetSegmentId || !isUUID(input.targetSegmentId)) {
    throw new DomainError("bad_request", "سگمنت مخاطبان نامعتبر یا ثبت‌نشده است.");
  }

  if (!ALLOWED_CAMPAIGN_CHANNELS.includes(input.channel)) {
    throw new DomainError(
      "bad_request",
      `کانال کمپین باید یکی از موارد ${ALLOWED_CAMPAIGN_CHANNELS.join(", ")} باشد.`,
    );
  }

  const messageContent =
    input.messageContent !== undefined ? input.messageContent?.trim() || null : null;
  if (messageContent && messageContent.length > 5000) {
    throw new DomainError("bad_request", "متن پیام کمپین نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.");
  }

  let scheduledAt: string | null = null;
  if (input.scheduledAt) {
    if (!isValidIsoDate(input.scheduledAt)) {
      throw new DomainError("bad_request", "تاریخ زمان‌بندی نامعتبر است.");
    }
    scheduledAt = new Date(input.scheduledAt).toISOString();
  }

  return {
    name: trimmedName,
    description: desc,
    targetSegmentId: input.targetSegmentId,
    channel: input.channel,
    messageContent,
    scheduledAt,
  };
}

export function validateUpdateCrmCampaignInput(input: UpdateCrmCampaignInput): {
  name?: string;
  description?: string | null;
  targetSegmentId?: string;
  channel?: CampaignChannel;
  messageContent?: string | null;
  scheduledAt?: string | null;
  status?: CampaignStatus;
} {
  const result: ReturnType<typeof validateUpdateCrmCampaignInput> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new DomainError("bad_request", "عنوان کمپین نمی‌تواند خالی باشد.");
    }
    if (trimmed.length > 150) {
      throw new DomainError("bad_request", "عنوان کمپین نمی‌تواند بیشتر از ۱۵۰ کاراکتر باشد.");
    }
    result.name = trimmed;
  }

  if (input.description !== undefined) {
    const desc = input.description?.trim() || null;
    if (desc && desc.length > 1000) {
      throw new DomainError("bad_request", "توضیحات کمپین نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد.");
    }
    result.description = desc;
  }

  if (input.targetSegmentId !== undefined) {
    if (!input.targetSegmentId || !isUUID(input.targetSegmentId)) {
      throw new DomainError("bad_request", "سگمنت مخاطبان نامعتبر است.");
    }
    result.targetSegmentId = input.targetSegmentId;
  }

  if (input.channel !== undefined) {
    if (!ALLOWED_CAMPAIGN_CHANNELS.includes(input.channel)) {
      throw new DomainError(
        "bad_request",
        `کانال کمپین باید یکی از موارد ${ALLOWED_CAMPAIGN_CHANNELS.join(", ")} باشد.`,
      );
    }
    result.channel = input.channel;
  }

  if (input.messageContent !== undefined) {
    const msg = input.messageContent?.trim() || null;
    if (msg && msg.length > 5000) {
      throw new DomainError("bad_request", "متن پیام کمپین نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد.");
    }
    result.messageContent = msg;
  }

  if (input.scheduledAt !== undefined) {
    if (input.scheduledAt === null || input.scheduledAt === "") {
      result.scheduledAt = null;
    } else {
      if (!isValidIsoDate(input.scheduledAt)) {
        throw new DomainError("bad_request", "تاریخ زمان‌بندی نامعتبر است.");
      }
      result.scheduledAt = new Date(input.scheduledAt).toISOString();
    }
  }

  if (input.status !== undefined) {
    if (!ALLOWED_CAMPAIGN_STATUSES.includes(input.status)) {
      throw new DomainError("bad_request", `وضعیت کمپین "${String(input.status)}" نامعتبر است.`);
    }
    result.status = input.status;
  }

  return result;
}

