/**
 * Avana Wallet & Credits Domain Primitives (Phase 1).
 *
 * Defines the core models and invariants for:
 * 1. User Wallets (Single wallet per user, non-negative integer Toman balance)
 * 2. Immutable Transaction Ledger (Balance before/after tracking, idempotency)
 * 3. Atomic Mutations (Credit, Debit, Refund, Admin Adjustment)
 * 4. Ledger Mathematical Invariant Verification
 */

import {
  type UserId,
  type WalletId,
  type WalletTransactionId,
} from "./ids.js";
import { toPersianDigits } from "./persian-numbers.js";

// ---------------------------------------------------------------------------
// Wallet Constants & Types
// ---------------------------------------------------------------------------

export const DEFAULT_WALLET_CURRENCY = "toman" as const;

export type WalletRecord = {
  id: WalletId;
  userId: UserId;
  balance: number; // Integer in Tomans (>= 0)
  currency: typeof DEFAULT_WALLET_CURRENCY;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Transaction Types & Sources
// ---------------------------------------------------------------------------

export type WalletTransactionType =
  | "credit"
  | "debit"
  | "refund"
  | "admin_adjustment";

export const WALLET_TRANSACTION_TYPES: readonly WalletTransactionType[] = [
  "credit",
  "debit",
  "refund",
  "admin_adjustment",
] as const;

export function isWalletTransactionType(v: string): v is WalletTransactionType {
  return (WALLET_TRANSACTION_TYPES as readonly string[]).includes(v);
}

export type WalletTransactionSource =
  | "subscription_bonus"
  | "wallet_topup"
  | "content_generation"
  | "generation_refund"
  | "special_exam_purchase"
  | "special_exam_refund"
  | "admin_adjustment"
  | "promotion_cashback"
  | "referral_reward";

export const WALLET_TRANSACTION_SOURCES: readonly WalletTransactionSource[] = [
  "subscription_bonus",
  "wallet_topup",
  "content_generation",
  "generation_refund",
  "special_exam_purchase",
  "special_exam_refund",
  "admin_adjustment",
  "promotion_cashback",
  "referral_reward",
] as const;

export function isWalletTransactionSource(
  v: string,
): v is WalletTransactionSource {
  return (WALLET_TRANSACTION_SOURCES as readonly string[]).includes(v);
}

export type WalletReferenceType =
  | "order"
  | "generation_job"
  | "user_subscription"
  | "admin_grant"
  | "document"
  | "system"
  | "promotion"
  | "referral"
  | "special_exam";

export const WALLET_REFERENCE_TYPES: readonly WalletReferenceType[] = [
  "order",
  "generation_job",
  "user_subscription",
  "admin_grant",
  "document",
  "system",
  "promotion",
  "referral",
  "special_exam",
] as const;

export function isWalletReferenceType(v: string): v is WalletReferenceType {
  return (WALLET_REFERENCE_TYPES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Transaction Record (Immutable Ledger)
// ---------------------------------------------------------------------------

export type WalletTransactionRecord = {
  id: WalletTransactionId;
  walletId: WalletId;
  userId: UserId;
  type: WalletTransactionType;
  amount: number; // Strictly positive integer in Tomans (> 0)
  balanceBefore: number; // Non-negative integer in Tomans
  balanceAfter: number; // Non-negative integer in Tomans
  source: WalletTransactionSource;
  referenceType: WalletReferenceType;
  referenceId: string;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Input Interfaces
// ---------------------------------------------------------------------------

export type CreditWalletInput = {
  userId: UserId;
  amount: number;
  source: WalletTransactionSource;
  referenceType: WalletReferenceType;
  referenceId: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type DebitWalletInput = {
  userId: UserId;
  amount: number;
  source: WalletTransactionSource;
  referenceType: WalletReferenceType;
  referenceId: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type RefundWalletInput = {
  userId: UserId;
  amount: number;
  source?: WalletTransactionSource;
  referenceType: WalletReferenceType;
  referenceId: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Pure Validation & Helper Invariant Functions
// ---------------------------------------------------------------------------

/**
 * Validates that an amount is a strictly positive integer in Tomans.
 */
export function validateTransactionAmount(amount: number): boolean {
  return typeof amount === "number" && Number.isInteger(amount) && amount > 0;
}

/**
 * Validates that a balance is a non-negative integer in Tomans.
 */
export function validateWalletBalance(balance: number): boolean {
  return typeof balance === "number" && Number.isInteger(balance) && balance >= 0;
}

/**
 * Calculates the expected next balance given current balance, transaction type, and amount.
 * Throws if balance would become negative or inputs are invalid.
 */
export function calculateNewBalance(
  currentBalance: number,
  type: WalletTransactionType,
  amount: number,
): number {
  if (!validateWalletBalance(currentBalance)) {
    throw new Error(`Invalid current balance: ${currentBalance}`);
  }
  if (!validateTransactionAmount(amount)) {
    throw new Error(`Invalid transaction amount: ${amount}`);
  }

  let nextBalance: number;
  switch (type) {
    case "credit":
    case "refund":
      nextBalance = currentBalance + amount;
      break;
    case "debit":
      nextBalance = currentBalance - amount;
      break;
    case "admin_adjustment":
      nextBalance = currentBalance + amount;
      break;
    default:
      throw new Error(`Unknown transaction type: ${type as string}`);
  }

  if (nextBalance < 0) {
    throw new Error(
      `Transaction would result in negative balance: ${nextBalance}`,
    );
  }

  return nextBalance;
}

/**
 * Verifies that the ledger invariant holds across all transactions:
 * Current Balance == Initial (0) + Sum(Credits + Refunds) - Sum(Debits) +/- AdminAdjustments
 */
export function verifyLedgerInvariant(
  transactions: WalletTransactionRecord[],
  expectedCurrentBalance: number,
): boolean {
  if (!validateWalletBalance(expectedCurrentBalance)) {
    return false;
  }

  if (transactions.length === 0) {
    return expectedCurrentBalance === 0;
  }

  const testAscending = (txs: WalletTransactionRecord[]) => {
    let calculatedBalance = 0;
    for (const tx of txs) {
      if (!validateTransactionAmount(tx.amount)) return false;
      if (tx.balanceBefore !== calculatedBalance) return false;

      switch (tx.type) {
        case "credit":
        case "refund":
          calculatedBalance += tx.amount;
          break;
        case "debit":
          calculatedBalance -= tx.amount;
          break;
        case "admin_adjustment":
          calculatedBalance += tx.amount;
          break;
        default:
          return false;
      }

      if (calculatedBalance !== tx.balanceAfter || calculatedBalance < 0) {
        return false;
      }
    }
    return calculatedBalance === expectedCurrentBalance;
  };

  // 1. Try as-is (chronological ascending)
  if (testAscending(transactions)) {
    return true;
  }

  // 2. Try reversed (API list order: newest first descending -> ascending)
  if (testAscending([...transactions].reverse())) {
    return true;
  }

  // 3. Try timestamp sorted ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  if (testAscending(sorted)) {
    return true;
  }

  return false;
}

/**
 * Formats a Toman credit amount into Persian human-readable format (e.g. "۲۵,۰۰۰ تومان").
 */
export function formatTomanPrice(amount: number): string {
  const safeAmount = Math.max(0, Math.round(amount));
  return `${toPersianDigits(safeAmount.toLocaleString("en-US"))} تومان`;
}

// ---------------------------------------------------------------------------
// Subscription Gift Credits (Phase 2)
// ---------------------------------------------------------------------------

export type SubscriptionPlanType = "monthly" | "quarterly" | "annual";

export const SUBSCRIPTION_PLAN_TYPES: readonly SubscriptionPlanType[] = [
  "monthly",
  "quarterly",
  "annual",
] as const;

export function isSubscriptionPlanType(v: string): v is SubscriptionPlanType {
  return (SUBSCRIPTION_PLAN_TYPES as readonly string[]).includes(v);
}

export interface SubscriptionCreditBonusesConfig {
  /** Gift credit awarded upon activating a monthly subscription (default 40,000 Tomans). */
  monthly: number;
  /** Gift credit awarded upon activating a quarterly subscription (default 100,000 Tomans). */
  quarterly: number;
  /** Gift credit awarded upon activating an annual subscription (default 200,000 Tomans). */
  annual: number;
  /** ISO timestamp when the configuration was last updated. */
  updatedAt?: string;
  /** Admin User ID who last updated the configuration. */
  updatedBy?: string | null;
}

export const SUBSCRIPTION_CREDIT_BONUSES_CONFIG_KEY =
  "subscription_credit_bonuses" as const;

/**
 * Official default gift credit bonuses calibrated per subscription tier.
 */
export const DEFAULT_SUBSCRIPTION_CREDIT_BONUSES: SubscriptionCreditBonusesConfig =
  {
    monthly: 40_000,
    quarterly: 100_000,
    annual: 200_000,
  };

/**
 * Resolves the canonical subscription plan type from a product record or metadata.
 */
export function resolveSubscriptionPlanType(product: {
  type?: string | null;
  durationDays?: number | null;
  code?: string | null;
}): SubscriptionPlanType | null {
  if (product.type && product.type !== "subscription") {
    return null;
  }

  const code = (product.code ?? "").toLowerCase();
  const days = product.durationDays ?? null;

  if (days === 30 || code.includes("monthly") || code.includes("1_month") || code.includes("1month")) {
    return "monthly";
  }
  if (days === 90 || code.includes("quarterly") || code.includes("3_month") || code.includes("3month")) {
    return "quarterly";
  }
  if (
    days === 365 ||
    days === 360 ||
    code.includes("yearly") ||
    code.includes("annual") ||
    code.includes("12_month") ||
    code.includes("12month")
  ) {
    return "annual";
  }

  // Range fallback for custom durationDays
  if (days !== null && !isNaN(days)) {
    if (days >= 25 && days <= 35) {
      return "monthly";
    }
    if (days >= 80 && days <= 100) {
      return "quarterly";
    }
    if (days >= 350 && days <= 370) {
      return "annual";
    }
  }

  return null;
}

/**
 * Resolves the gift credit amount in Tomans for a given plan type using the active configuration.
 */
export function resolveGiftCreditAmount(
  planType: SubscriptionPlanType,
  config: SubscriptionCreditBonusesConfig = DEFAULT_SUBSCRIPTION_CREDIT_BONUSES,
): number {
  const amount = config[planType];
  if (typeof amount === "number" && Number.isInteger(amount) && amount > 0) {
    return amount;
  }
  return DEFAULT_SUBSCRIPTION_CREDIT_BONUSES[planType] ?? 0;
}

/**
 * Validates partial or complete subscription credit bonus input from Admin.
 */
export function validateSubscriptionCreditBonuses(
  input: Partial<SubscriptionCreditBonusesConfig>,
): boolean {
  for (const tier of SUBSCRIPTION_PLAN_TYPES) {
    const val = input[tier];
    if (val !== undefined) {
      if (typeof val !== "number" || isNaN(val) || !Number.isInteger(val) || val < 0) {
        return false;
      }
    }
  }
  return true;
}
