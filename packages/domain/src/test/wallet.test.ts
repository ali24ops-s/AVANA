import { describe, it, expect } from "vitest";
import {
  asUserId,
  asWalletId,
  asWalletTransactionId,
  calculateNewBalance,
  formatTomanPrice,
  validateTransactionAmount,
  validateWalletBalance,
  verifyLedgerInvariant,
  resolveSubscriptionPlanType,
  resolveGiftCreditAmount,
  validateSubscriptionCreditBonuses,
  type UUID,
  type WalletTransactionRecord,
} from "../index.js";

describe("Wallet Domain Primitives & Invariants", () => {
  it("1. validates transaction amounts correctly (positive integer only)", () => {
    expect(validateTransactionAmount(1000)).toBe(true);
    expect(validateTransactionAmount(1)).toBe(true);
    expect(validateTransactionAmount(50_000)).toBe(true);

    expect(validateTransactionAmount(0)).toBe(false);
    expect(validateTransactionAmount(-100)).toBe(false);
    expect(validateTransactionAmount(10.5)).toBe(false);
    expect(validateTransactionAmount(NaN)).toBe(false);
    expect(validateTransactionAmount(Infinity)).toBe(false);
  });

  it("2. validates wallet balance correctly (non-negative integer only)", () => {
    expect(validateWalletBalance(0)).toBe(true);
    expect(validateWalletBalance(1000)).toBe(true);
    expect(validateWalletBalance(100_000)).toBe(true);

    expect(validateWalletBalance(-1)).toBe(false);
    expect(validateWalletBalance(-500)).toBe(false);
    expect(validateWalletBalance(12.34)).toBe(false);
    expect(validateWalletBalance(NaN)).toBe(false);
  });

  it("3. calculates next balance for credit and refund correctly", () => {
    expect(calculateNewBalance(0, "credit", 15_000)).toBe(15_000);
    expect(calculateNewBalance(15_000, "credit", 5_000)).toBe(20_000);
    expect(calculateNewBalance(20_000, "refund", 10_000)).toBe(30_000);
  });

  it("4. calculates next balance for debit correctly and throws on insufficient balance", () => {
    expect(calculateNewBalance(50_000, "debit", 20_000)).toBe(30_000);
    expect(calculateNewBalance(30_000, "debit", 30_000)).toBe(0);

    expect(() => calculateNewBalance(10_000, "debit", 15_000)).toThrow(
      /negative balance/,
    );
    expect(() => calculateNewBalance(0, "debit", 1000)).toThrow(
      /negative balance/,
    );
  });

  it("5. formats Toman price into Persian digits", () => {
    expect(formatTomanPrice(15_000)).toBe("۱۵,۰۰۰ تومان");
    expect(formatTomanPrice(0)).toBe("۰ تومان");
  });

  it("6. verifies ledger mathematical invariant across series of transactions", () => {
    const userId = asUserId("00000000-0000-0000-0000-000000000001" as UUID);
    const walletId = asWalletId("11111111-1111-1111-1111-111111111111" as UUID);

    const tx1: WalletTransactionRecord = {
      id: asWalletTransactionId("aaaaaaaa-1111-1111-1111-111111111111" as UUID),
      walletId,
      userId,
      type: "credit",
      amount: 50_000,
      balanceBefore: 0,
      balanceAfter: 50_000,
      source: "subscription_bonus",
      referenceType: "user_subscription",
      referenceId: "sub-1",
      idempotencyKey: "key-1",
      metadata: {},
      createdAt: "2026-09-16T10:00:00.000Z",
    };

    const tx2: WalletTransactionRecord = {
      id: asWalletTransactionId("bbbbbbbb-2222-2222-2222-222222222222" as UUID),
      walletId,
      userId,
      type: "debit",
      amount: 15_000,
      balanceBefore: 50_000,
      balanceAfter: 35_000,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: "job-1",
      idempotencyKey: "key-2",
      metadata: {},
      createdAt: "2026-09-16T10:05:00.000Z",
    };

    const tx3: WalletTransactionRecord = {
      id: asWalletTransactionId("cccccccc-3333-3333-3333-333333333333" as UUID),
      walletId,
      userId,
      type: "refund",
      amount: 15_000,
      balanceBefore: 35_000,
      balanceAfter: 50_000,
      source: "generation_refund",
      referenceType: "generation_job",
      referenceId: "job-1",
      idempotencyKey: "key-3",
      metadata: {},
      createdAt: "2026-09-16T10:10:00.000Z",
    };

    expect(verifyLedgerInvariant([tx1, tx2, tx3], 50_000)).toBe(true);
    expect(verifyLedgerInvariant([tx1, tx2], 35_000)).toBe(true);
    expect(verifyLedgerInvariant([tx1], 50_000)).toBe(true);

    // Tampered balance should return false
    expect(verifyLedgerInvariant([tx1, tx2, tx3], 49_000)).toBe(false);

    // Broken balanceBefore/After chain should return false
    const brokenTx = { ...tx2, balanceBefore: 40_000 };
    expect(verifyLedgerInvariant([tx1, brokenTx, tx3], 50_000)).toBe(false);
  });

  it("7. resolves subscription plan types correctly from product properties", () => {
    expect(
      resolveSubscriptionPlanType({
        type: "subscription",
        durationDays: 30,
        code: "sub_monthly",
      }),
    ).toBe("monthly");

    expect(
      resolveSubscriptionPlanType({
        type: "subscription",
        durationDays: 90,
        code: "sub_quarterly",
      }),
    ).toBe("quarterly");

    expect(
      resolveSubscriptionPlanType({
        type: "subscription",
        durationDays: 365,
        code: "sub_yearly",
      }),
    ).toBe("annual");

    expect(
      resolveSubscriptionPlanType({
        type: "subscription",
        durationDays: 360,
        code: "sub_annual",
      }),
    ).toBe("annual");

    // Non-subscription products should return null
    expect(
      resolveSubscriptionPlanType({
        type: "course",
        durationDays: null,
        code: "course_1",
      }),
    ).toBeNull();

    expect(
      resolveSubscriptionPlanType({
        type: "content_pack",
        durationDays: null,
        code: "pack_1",
      }),
    ).toBeNull();

    // Unknown duration returns null
    expect(
      resolveSubscriptionPlanType({
        type: "subscription",
        durationDays: 15,
        code: "sub_trial",
      }),
    ).toBeNull();
  });

  it("8. resolves default and customized gift credit amounts correctly", () => {
    expect(resolveGiftCreditAmount("monthly")).toBe(40_000);
    expect(resolveGiftCreditAmount("quarterly")).toBe(100_000);
    expect(resolveGiftCreditAmount("annual")).toBe(200_000);

    const customConfig = {
      monthly: 50_000,
      quarterly: 120_000,
      annual: 250_000,
    };
    expect(resolveGiftCreditAmount("monthly", customConfig)).toBe(50_000);
    expect(resolveGiftCreditAmount("quarterly", customConfig)).toBe(120_000);
    expect(resolveGiftCreditAmount("annual", customConfig)).toBe(250_000);
  });

  it("9. validates subscription credit bonus inputs correctly", () => {
    expect(
      validateSubscriptionCreditBonuses({
        monthly: 40_000,
        quarterly: 100_000,
        annual: 200_000,
      }),
    ).toBe(true);

    expect(
      validateSubscriptionCreditBonuses({
        monthly: 0,
      }),
    ).toBe(true);

    // Negative values
    expect(
      validateSubscriptionCreditBonuses({
        monthly: -1000,
      }),
    ).toBe(false);

    // Float values
    expect(
      validateSubscriptionCreditBonuses({
        quarterly: 50_000.5,
      }),
    ).toBe(false);

    // NaN
    expect(
      validateSubscriptionCreditBonuses({
        annual: NaN,
      }),
    ).toBe(false);
  });
});
