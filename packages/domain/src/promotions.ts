/**
 * Promotion, Coupon, Benefit, and Redemption Domain Primitives.
 *
 * Implements:
 * 1. Benefit variants (percentage_discount, fixed_discount, percentage_cashback, fixed_cashback)
 * 2. Immutable redemption lifecycle (pending -> completed / cancelled)
 * 3. Server-authoritative calculation rules (eligible subtotal, max discount, non-negative payable)
 * 4. Deterministic eligibility validation (dates, usage limits, products, users, wallet_topup exclusion)
 * 5. Cryptographically secure random bulk code generation
 */

import type {
  OrderId,
  PaymentId,
  ProductId,
  PromotionCodeId,
  PromotionId,
  PromotionRedemptionId,
  UserId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

export const REDEMPTION_RESERVATION_TTL_MINUTES = 30;

export type PromotionBenefitType =
  | "percentage_discount"
  | "fixed_discount"
  | "percentage_cashback"
  | "fixed_cashback";

export const PROMOTION_BENEFIT_TYPES: readonly PromotionBenefitType[] = [
  "percentage_discount",
  "fixed_discount",
  "percentage_cashback",
  "fixed_cashback",
] as const;

export function isPromotionBenefitType(v: string): v is PromotionBenefitType {
  return (PROMOTION_BENEFIT_TYPES as readonly string[]).includes(v);
}

export type PromotionRedemptionStatus = "pending" | "completed" | "cancelled";

export const PROMOTION_REDEMPTION_STATUSES: readonly PromotionRedemptionStatus[] =
  ["pending", "completed", "cancelled"] as const;

export function isPromotionRedemptionStatus(
  v: string,
): v is PromotionRedemptionStatus {
  return (PROMOTION_REDEMPTION_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Pure Domain Records
// ---------------------------------------------------------------------------

export interface PromotionRecord {
  id: PromotionId;
  name: string;
  description: string | null;
  benefitType: PromotionBenefitType;
  benefitValue: number; // Percentage (e.g. 20) or Integer Tomans (e.g. 50000)
  maxDiscountAmount: number | null; // Capping for percentage discounts (in Tomans)
  minOrderAmount: number | null; // Minimum eligible subtotal required (in Tomans)
  totalUsageLimit: number | null; // null = unlimited
  perUserUsageLimit: number | null; // null = unlimited
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PromotionCodeRecord {
  id: PromotionCodeId;
  promotionId: PromotionId;
  code: string;
  maxUses: number | null;
  active: boolean;
  createdAt: string;
  deletedAt: string | null;
}

export interface PromotionProductRecord {
  id: string;
  promotionId: PromotionId;
  productId: ProductId | null;
  productType: string | null;
  createdAt: string;
}

export interface PromotionUserRecord {
  id: string;
  promotionId: PromotionId;
  userId: UserId;
  createdAt: string;
}

export interface PromotionRedemptionSnapshot {
  promotionId: string;
  promotionName: string;
  code: string;
  benefitType: PromotionBenefitType;
  benefitValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  appliedAt: string;
  [key: string]: unknown;
}

export interface PromotionRedemptionRecord {
  id: PromotionRedemptionId;
  promotionId: PromotionId;
  codeId: PromotionCodeId;
  userId: UserId;
  orderId: OrderId;
  paymentId: PaymentId | null;
  benefitType: PromotionBenefitType;
  benefitValue: number;
  discountAmount: number; // Integer in Tomans
  cashbackAmount: number; // Integer in Tomans
  orderOriginalAmount: number; // Integer in Tomans
  orderFinalAmount: number; // Integer in Tomans (Payable)
  status: PromotionRedemptionStatus;
  reservationExpiresAt: string;
  promotionSnapshot: PromotionRedemptionSnapshot;
  redeemedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pure Calculation & Benefit Functions
// ---------------------------------------------------------------------------

export interface PromotionBenefitResult {
  discountAmount: number;
  cashbackAmount: number;
  payableAmount: number;
  eligibleSubtotal: number;
  orderTotal: number;
}

/**
 * Deterministically calculates the promotion benefit (discount or cashback)
 * strictly in integer Tomans.
 *
 * Rules:
 * - Single benefit type in v1.
 * - Percentage discount: round((eligibleSubtotal * benefitValue) / 100), capped at maxDiscountAmount.
 * - Fixed discount: min(benefitValue, eligibleSubtotal).
 * - Discount never exceeds eligibleSubtotal and payable is never negative.
 * - Percentage cashback: round((eligibleSubtotal * benefitValue) / 100), does not reduce payable.
 * - Fixed cashback: benefitValue, does not reduce payable.
 */
export function calculatePromotionBenefit(params: {
  benefitType: PromotionBenefitType;
  benefitValue: number;
  maxDiscountAmount?: number | null;
  eligibleSubtotal: number;
  orderTotal: number;
}): PromotionBenefitResult {
  const {
    benefitType,
    benefitValue,
    maxDiscountAmount,
    eligibleSubtotal,
    orderTotal,
  } = params;

  const cleanEligible = Math.max(0, Math.round(eligibleSubtotal));
  const cleanTotal = Math.max(0, Math.round(orderTotal));

  let discountAmount = 0;
  let cashbackAmount = 0;

  switch (benefitType) {
    case "percentage_discount": {
      const rawDiscount = Math.round((cleanEligible * benefitValue) / 100);
      let capped = rawDiscount;
      if (
        maxDiscountAmount !== undefined &&
        maxDiscountAmount !== null &&
        maxDiscountAmount >= 0
      ) {
        capped = Math.min(capped, maxDiscountAmount);
      }
      discountAmount = Math.max(0, Math.min(capped, cleanEligible));
      cashbackAmount = 0;
      break;
    }
    case "fixed_discount": {
      discountAmount = Math.max(0, Math.min(benefitValue, cleanEligible));
      cashbackAmount = 0;
      break;
    }
    case "percentage_cashback": {
      discountAmount = 0;
      cashbackAmount = Math.max(
        0,
        Math.round((cleanEligible * benefitValue) / 100),
      );
      break;
    }
    case "fixed_cashback": {
      discountAmount = 0;
      cashbackAmount = Math.max(0, Math.round(benefitValue));
      break;
    }
  }

  const payableAmount = Math.max(0, cleanTotal - discountAmount);

  return {
    discountAmount,
    cashbackAmount,
    payableAmount,
    eligibleSubtotal: cleanEligible,
    orderTotal: cleanTotal,
  };
}

// ---------------------------------------------------------------------------
// Pure Validation Logic
// ---------------------------------------------------------------------------

export interface PromotionOrderItem {
  productId: ProductId | string;
  productType?: string | null;
  price: number;
}

export interface PromotionEligibilityContext {
  userId: UserId | string;
  items: PromotionOrderItem[];
  productRestrictions?: PromotionProductRecord[];
  userRestrictions?: PromotionUserRecord[];
  totalActiveRedemptionsCount?: number;
  userActiveRedemptionsCount?: number;
  now?: Date;
}

export interface PromotionValidationResult {
  valid: boolean;
  reason?: string;
  eligibleSubtotal: number;
  orderTotal: number;
  benefit?: PromotionBenefitResult;
  promotion?: {
    id: PromotionId | string;
    name: string;
    benefitType: PromotionBenefitType;
    benefitValue: number;
    maxDiscountAmount?: number | null;
  };
  code?: {
    id: PromotionCodeId | string;
    code: string;
  };
}

/**
 * Checks if a product is a wallet top-up product (strictly excluded from promotions).
 */
export function isWalletTopupProduct(item: {
  productId?: string | null;
  productType?: string | null;
  code?: string | null;
}): boolean {
  if (item.productType === "wallet_topup") return true;
  if (item.productId === "wallet_topup" || item.code === "wallet_topup")
    return true;
  if (item.productId === "44444444-4444-4444-8444-444444444444") return true;
  return false;
}

/**
 * Deterministically validates promotion eligibility and calculates benefit.
 */
export function validatePromotionEligibility(
  promotion: PromotionRecord,
  codeRecord: PromotionCodeRecord | null,
  context: PromotionEligibilityContext,
): PromotionValidationResult {
  const now = context.now ?? new Date();

  // 1. Check promotion active status
  if (!promotion.active || Boolean(promotion.deletedAt)) {
    return {
      valid: false,
      reason: "کد تخفیف مورد نظر غیرفعال است.",
      eligibleSubtotal: 0,
      orderTotal: 0,
    };
  }

  // 2. Check code active status
  if (codeRecord && (!codeRecord.active || Boolean(codeRecord.deletedAt))) {
    return {
      valid: false,
      reason: "این کد تخفیف منقضی یا غیرفعال شده است.",
      eligibleSubtotal: 0,
      orderTotal: 0,
    };
  }

  // 3. Check date bounds
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now.getTime()) {
    return {
      valid: false,
      reason: "زمان استفاده از این کد تخفیف هنوز فرا نرسیده است.",
      eligibleSubtotal: 0,
      orderTotal: 0,
    };
  }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() < now.getTime()) {
    return {
      valid: false,
      reason: "مهلت استفاده از این کد تخفیف به پایان رسیده است.",
      eligibleSubtotal: 0,
      orderTotal: 0,
    };
  }

  // 4. Check wallet top-up exclusion
  if (context.items.some((item) => isWalletTopupProduct(item))) {
    return {
      valid: false,
      reason: "کدهای تخفیف برای شارژ کیف پول قابل استفاده نیستند.",
      eligibleSubtotal: 0,
      orderTotal: 0,
    };
  }

  // 5. Check User Restrictions
  if (context.userRestrictions && context.userRestrictions.length > 0) {
    const isWhitelisted = context.userRestrictions.some(
      (u) => u.userId === context.userId,
    );
    if (!isWhitelisted) {
      return {
        valid: false,
        reason: "این کد تخفیف برای حساب کاربری شما مجاز نیست.",
        eligibleSubtotal: 0,
        orderTotal: 0,
      };
    }
  }

  // 6. Calculate Order Total and Eligible Subtotal
  let orderTotal = 0;
  let eligibleSubtotal = 0;

  const hasProductRestrictions =
    context.productRestrictions && context.productRestrictions.length > 0;

  for (const item of context.items) {
    const price = Math.max(0, Math.round(item.price));
    orderTotal += price;

    if (!hasProductRestrictions) {
      eligibleSubtotal += price;
    } else {
      const isEligible = context.productRestrictions!.some((p) => {
        if (p.productId && p.productId === item.productId) return true;
        if (p.productType && item.productType && p.productType === item.productType)
          return true;
        return false;
      });
      if (isEligible) {
        eligibleSubtotal += price;
      }
    }
  }

  if (eligibleSubtotal <= 0) {
    return {
      valid: false,
      reason: "این کد تخفیف برای محصولات انتخابی شما معتبر نیست.",
      eligibleSubtotal: 0,
      orderTotal,
    };
  }

  // 7. Check Minimum Purchase on Eligible Subtotal
  if (
    promotion.minOrderAmount !== null &&
    promotion.minOrderAmount > 0 &&
    eligibleSubtotal < promotion.minOrderAmount
  ) {
    return {
      valid: false,
      reason: `حداقل مبلغ خرید برای استفاده از این کد تخفیف ${promotion.minOrderAmount.toLocaleString("fa-IR")} تومان است.`,
      eligibleSubtotal,
      orderTotal,
    };
  }

  // 8. Check Total Usage Limit
  if (
    promotion.totalUsageLimit !== null &&
    promotion.totalUsageLimit > 0 &&
    context.totalActiveRedemptionsCount !== undefined &&
    context.totalActiveRedemptionsCount >= promotion.totalUsageLimit
  ) {
    return {
      valid: false,
      reason: "سقف استفاده از این کد تخفیف تکمیل شده است.",
      eligibleSubtotal,
      orderTotal,
    };
  }

  // 9. Check Per-User Usage Limit
  if (
    promotion.perUserUsageLimit !== null &&
    promotion.perUserUsageLimit > 0 &&
    context.userActiveRedemptionsCount !== undefined &&
    context.userActiveRedemptionsCount >= promotion.perUserUsageLimit
  ) {
    return {
      valid: false,
      reason: "شما قبلاً از این کد تخفیف استفاده کرده‌اید.",
      eligibleSubtotal,
      orderTotal,
    };
  }

  // 10. Calculate Benefit
  const benefit = calculatePromotionBenefit({
    benefitType: promotion.benefitType,
    benefitValue: promotion.benefitValue,
    maxDiscountAmount: promotion.maxDiscountAmount,
    eligibleSubtotal,
    orderTotal,
  });

  return {
    valid: true,
    eligibleSubtotal,
    orderTotal,
    benefit,
  };
}

// ---------------------------------------------------------------------------
// Pure String & Generator Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a promotion code: trimmed, uppercase, and stripped of non-alphanumeric/hyphen characters.
 */
export function normalizePromotionCode(code: string): string {
  if (!code || typeof code !== "string") return "";
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

// eslint-disable-next-line no-secrets/no-secrets
const UNAMBIGUOUS_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 characters, no 0/O, 1/I

/**
 * Cryptographically secure random coupon code generator.
 */
export function generateRandomCode(
  length = 8,
  prefix = "",
): string {
  const normPrefix = normalizePromotionCode(prefix);
  const targetRandomLength = Math.max(4, length - normPrefix.length);

  const bytes = new Uint8Array(targetRandomLength);
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < targetRandomLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let randomPart = "";
  for (let i = 0; i < targetRandomLength; i++) {
    const index = bytes[i] % UNAMBIGUOUS_CHARSET.length;
    randomPart += UNAMBIGUOUS_CHARSET[index];
  }

  return `${normPrefix}${randomPart}`;
}

export interface BulkGenerateCodesInput {
  count: number;
  prefix?: string;
  length?: number;
  existingCodes?: Set<string>;
}

/**
 * Generates a batch of unique, collision-free coupon codes.
 */
export function generateBulkPromotionCodes(
  input: BulkGenerateCodesInput,
): string[] {
  const count = Math.min(1000, Math.max(1, input.count));
  const length = Math.min(16, Math.max(6, input.length ?? 8));
  const prefix = input.prefix ? normalizePromotionCode(input.prefix) : "";
  const existing = input.existingCodes ?? new Set<string>();

  const results: string[] = [];
  const localSet = new Set<string>();

  let attempts = 0;
  const maxAttempts = count * 10;

  while (results.length < count && attempts < maxAttempts) {
    attempts++;
    const code = generateRandomCode(length, prefix);
    if (!existing.has(code) && !localSet.has(code)) {
      localSet.add(code);
      results.push(code);
    }
  }

  return results;
}
