import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asProductId,
  asUserId,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryPromotionService } from "../modules/commerce/promotion-service.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";

/**
 * Phase 2 Audit: Complete Promotion Reservation & Payment Lifecycle Suite.
 *
 * Covers the 8 business & technical scenarios for promotion redemptions
 * and validates compatibility with Migration 0083_nullable_promotion_redemption_order:
 *
 * 1. Reservation before order creation (order_id is null in pending state).
 * 2. Order creation and linking reservation to the concrete order_id.
 * 3. Payment failure or cancellation (status transitions to cancelled, slot freed).
 * 4. Repeated checkout request (cleans up stale unlinked reservation to avoid user lockout).
 * 5. Concurrent requests on a limited coupon (atomicity guarantees 1 winner).
 * 6. Failure between reservation and order binding (clean rollback and slot release).
 * 7. Preventing double counting / double cashback (idempotent finalization).
 * 8. Historical records compatibility and migration down risk assessment.
 */
describe("Promotion Reservation & Payment Lifecycle Audit (8 Scenarios)", () => {
  let commerceStore: InMemoryCommerceStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let promotionService: InMemoryPromotionService;

  const studentUser1: Actor = {
    userId: asUserId(randomUUID() as unknown as import("@avana/domain").UUID),
    role: "student",
  };

  const studentUser2: Actor = {
    userId: asUserId(randomUUID() as unknown as import("@avana/domain").UUID),
    role: "student",
  };

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    promotionService = new InMemoryPromotionService(undefined, walletService);

    // Standard course product (100,000 Toman)
    await commerceStore.createProduct({
      id: asProductId("prod_course_100k"),
      code: "course_chem_100k",
      type: "course",
      title: "دوره جامع شیمی کنکور",
      description: "آموزش شیمی",
      price: 100_000,
      currency: "toman",
      targetType: "course",
      targetId: "target_course_chem",
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Reservation before order creation (order_id IS NULL)
  // -------------------------------------------------------------------------
  it("Scenario 1: creates reservation with order_id = null prior to order existence", async () => {
    await promotionService.createPromotion({
      name: "تخفیف اولیه ۲۰ درصدی",
      benefitType: "percentage_discount",
      benefitValue: 20,
      code: "DISC20",
      active: true,
    });

    const reservation = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "DISC20",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    expect(reservation.redemptionId).toBeDefined();
    expect(reservation.discountAmount).toBe(20_000);
    expect(reservation.payableAmount).toBe(80_000);

    const row = promotionService.memoryRedemptions.find((r) => r.id === reservation.redemptionId);
    expect(row).toBeDefined();
    expect(row?.status).toBe("pending");
    expect(row?.orderId).toBeNull(); // Migration 0083 nullable order_id
    expect(new Date(row!.reservationExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Order creation and linking reservation to it
  // -------------------------------------------------------------------------
  it("Scenario 2: binds redemption to concrete order_id upon order creation and rejects sentinel IDs", async () => {
    await promotionService.createPromotion({
      name: "تخفیف ۳۰ درصدی",
      benefitType: "percentage_discount",
      benefitValue: 30,
      code: "DISC30",
      active: true,
    });

    const reservation = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "DISC30",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    // Rejects dummy all-zeros GUID
    await expect(
      promotionService.linkRedemptionToOrder(reservation.redemptionId, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow("شناسه سفارش");

    // Rejects empty string
    await expect(
      promotionService.linkRedemptionToOrder(reservation.redemptionId, "   "),
    ).rejects.toThrow("شناسه سفارش");

    // Successfully binds to valid OrderId
    const realOrderId = randomUUID();
    await promotionService.linkRedemptionToOrder(reservation.redemptionId, realOrderId);

    const row = promotionService.memoryRedemptions.find((r) => r.id === reservation.redemptionId);
    expect(row?.orderId).toBe(realOrderId);
    expect(row?.status).toBe("pending");

    // Idempotent re-linking to the SAME order succeeds
    await promotionService.linkRedemptionToOrder(reservation.redemptionId, realOrderId);
    expect(row?.orderId).toBe(realOrderId);

    // Incompatible re-linking to a DIFFERENT order is strictly rejected
    const differentOrderId = randomUUID();
    await expect(
      promotionService.linkRedemptionToOrder(reservation.redemptionId, differentOrderId),
    ).rejects.toThrow("قبلاً به سفارش دیگری متصل شده است");

    // Linking a cancelled reservation is strictly rejected
    const cancelledRes = await promotionService.evaluateAndReservePromotion({
      userId: studentUser2.userId,
      code: "DISC30",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    await promotionService.cancelPromotionRedemptionById(cancelledRes.redemptionId);
    await expect(
      promotionService.linkRedemptionToOrder(cancelledRes.redemptionId, realOrderId),
    ).rejects.toThrow("تنها رزروهای معلق");
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Payment failure or user cancellation
  // -------------------------------------------------------------------------
  it("Scenario 3: releases redemption and frees quota when payment fails or is rejected", async () => {
    await promotionService.createPromotion({
      name: "تخفیف محدود ۱ نفره",
      benefitType: "fixed_discount",
      benefitValue: 15_000,
      totalUsageLimit: 1,
      code: "SOLO15",
      active: true,
    });

    // User 1 reserves and creates order
    const reservation = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "SOLO15",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    const orderId = randomUUID();
    await promotionService.linkRedemptionToOrder(reservation.redemptionId, orderId);

    // User 2 cannot use coupon while User 1 reservation is pending
    const valBefore = await promotionService.validatePromotion({
      code: "SOLO15",
      userId: studentUser2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(valBefore.valid).toBe(false);

    // Payment fails / order cancelled
    await promotionService.cancelPromotionRedemption(orderId, "Payment failed");

    const row = promotionService.memoryRedemptions.find((r) => r.id === reservation.redemptionId);
    expect(row?.status).toBe("cancelled");

    // Quota is released: User 2 can now validate and reserve
    const valAfter = await promotionService.validatePromotion({
      code: "SOLO15",
      userId: studentUser2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(valAfter.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Repeated checkout requests
  // -------------------------------------------------------------------------
  it("Scenario 4: cancels unlinked stale pending reservation when user retries checkout without locking quota", async () => {
    await promotionService.createPromotion({
      name: "تخفیف اختصاصی ۱ بار مصرف کاربر",
      benefitType: "percentage_discount",
      benefitValue: 25,
      perUserUsageLimit: 1,
      code: "SINGLEUSER",
      active: true,
    });

    // 1st checkout attempt: reserves promotion, but user abandons before order creation
    const res1 = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "SINGLEUSER",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    expect(res1.redemptionId).toBeDefined();

    const row1 = promotionService.memoryRedemptions.find((r) => r.id === res1.redemptionId);
    expect(row1?.status).toBe("pending");
    expect(row1?.orderId).toBeNull();

    // 2nd checkout attempt by same user: must NOT fail with "per-user limit exceeded"
    const res2 = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "SINGLEUSER",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    expect(res2.redemptionId).toBeDefined();
    expect(res2.redemptionId).not.toBe(res1.redemptionId);

    // Old unlinked reservation was cancelled
    expect(row1?.status).toBe("cancelled");
    const row2 = promotionService.memoryRedemptions.find((r) => r.id === res2.redemptionId);
    expect(row2?.status).toBe("pending");
  });

  it("Scenario 4 (Isolation): stale reservation cleanup for user A does not affect user B or user A other promotions", async () => {
    await promotionService.createPromotion({
      name: "تخفیف پروموشن اول",
      benefitType: "percentage_discount",
      benefitValue: 20,
      code: "PROMO_A",
      active: true,
    });
    await promotionService.createPromotion({
      name: "تخفیف پروموشن دوم",
      benefitType: "percentage_discount",
      benefitValue: 10,
      code: "PROMO_B",
      active: true,
    });

    // User 1 reserves PROMO_A (unlinked)
    const user1PromoA_res1 = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "PROMO_A",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    // User 1 also reserves PROMO_B (unlinked)
    const user1PromoB_res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "PROMO_B",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    // User 2 reserves PROMO_A (unlinked)
    const user2PromoA_res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser2.userId,
      code: "PROMO_A",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    // User 1 re-attempts checkout with PROMO_A
    const user1PromoA_res2 = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "PROMO_A",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    const rUser1A_1 = promotionService.memoryRedemptions.find((r) => r.id === user1PromoA_res1.redemptionId);
    const rUser1A_2 = promotionService.memoryRedemptions.find((r) => r.id === user1PromoA_res2.redemptionId);
    const rUser1B = promotionService.memoryRedemptions.find((r) => r.id === user1PromoB_res.redemptionId);
    const rUser2A = promotionService.memoryRedemptions.find((r) => r.id === user2PromoA_res.redemptionId);

    // Only User 1's previous PROMO_A reservation was cancelled
    expect(rUser1A_1?.status).toBe("cancelled");
    expect(rUser1A_2?.status).toBe("pending");

    // User 1's PROMO_B is intact (still pending)
    expect(rUser1B?.status).toBe("pending");

    // User 2's PROMO_A is completely intact (still pending)
    expect(rUser2A?.status).toBe("pending");
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Two concurrent requests on a limited promotion
  // -------------------------------------------------------------------------
  it("Scenario 5: atomic lock permits only 1 reservation under concurrency for single-usage promo", async () => {
    await promotionService.createPromotion({
      name: "تخفیف محدود ۱ عددی مسابقه",
      benefitType: "fixed_discount",
      benefitValue: 50_000,
      totalUsageLimit: 1,
      code: "RACE50",
      active: true,
    });

    const [attempt1, attempt2] = await Promise.allSettled([
      promotionService.evaluateAndReservePromotion({
        userId: studentUser1.userId,
        code: "RACE50",
        orderAmount: 100_000,
        productId: "prod_course_100k",
      }),
      promotionService.evaluateAndReservePromotion({
        userId: studentUser2.userId,
        code: "RACE50",
        orderAmount: 100_000,
        productId: "prod_course_100k",
      }),
    ]);

    const successes = [attempt1, attempt2].filter((r) => r.status === "fulfilled");
    const failures = [attempt1, attempt2].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Failure between reservation and order link
  // -------------------------------------------------------------------------
  it("Scenario 6: cleanly cancels reservation by ID if order creation crashes mid-flight", async () => {
    await promotionService.createPromotion({
      name: "تخفیف تست کرش",
      benefitType: "fixed_discount",
      benefitValue: 10_000,
      totalUsageLimit: 1,
      code: "CRASH10",
      active: true,
    });

    const res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "CRASH10",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    // Simulate service-level crash during order creation: catch block cancels reservation by ID
    const cancelled = await promotionService.cancelPromotionRedemptionById(res.redemptionId, "Crash rollback");
    expect(cancelled).toBe(true);

    const row = promotionService.memoryRedemptions.find((r) => r.id === res.redemptionId);
    expect(row?.status).toBe("cancelled");
    expect(row?.orderId).toBeNull();

    // Slot is immediately free for next user
    const nextVal = await promotionService.validatePromotion({
      code: "CRASH10",
      userId: studentUser2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(nextVal.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Preventing double counting / duplicate redemption
  // -------------------------------------------------------------------------
  it("Scenario 7: guarantees strict idempotency on promotion finalization and wallet cashback", async () => {
    await promotionService.createPromotion({
      name: "تخفیف با کش‌بک ۲۰ درصدی",
      benefitType: "percentage_cashback",
      benefitValue: 20,
      code: "CASH20",
      active: true,
    });

    const res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "CASH20",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    const orderId = randomUUID();
    const paymentId = randomUUID();
    await promotionService.linkRedemptionToOrder(res.redemptionId, orderId);

    // 1st finalization
    const fin1 = await promotionService.finalizePromotionForPaidOrder(orderId, paymentId);
    expect(fin1.finalized).toBe(true);
    expect(fin1.cashbackGranted).toBe(20_000);

    const walletAfter1 = await walletService.getOrCreateWallet(studentUser1.userId);
    expect(walletAfter1.balance).toBe(20_000);

    // 2nd redundant finalization (e.g. duplicate webhook / double click)
    const fin2 = await promotionService.finalizePromotionForPaidOrder(orderId, paymentId);
    expect(fin2.finalized).toBe(true);
    expect(fin2.cashbackGranted).toBe(20_000);

    // Wallet balance MUST NOT double
    const walletAfter2 = await walletService.getOrCreateWallet(studentUser1.userId);
    expect(walletAfter2.balance).toBe(20_000);

    // Status remains completed
    const row = promotionService.memoryRedemptions.find((r) => r.id === res.redemptionId);
    expect(row?.status).toBe("completed");
  });

  // -------------------------------------------------------------------------
  // Scenario 7b: Two concurrent webhook calls for the same redemption
  // -------------------------------------------------------------------------
  it("Scenario 7b: two concurrent webhook calls for the same redemption grant cashback exactly once", async () => {
    await promotionService.createPromotion({
      name: "تخفیف کش‌بک همزمان",
      benefitType: "percentage_cashback",
      benefitValue: 15,
      code: "CASH_CONCUR",
      active: true,
    });

    const res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "CASH_CONCUR",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    const orderId = randomUUID();
    const paymentId = randomUUID();
    await promotionService.linkRedemptionToOrder(res.redemptionId, orderId);

    // Issue two concurrent webhook finalization calls
    const [finA, finB] = await Promise.all([
      promotionService.finalizePromotionForPaidOrder(orderId, paymentId),
      promotionService.finalizePromotionForPaidOrder(orderId, paymentId),
    ]);

    expect(finA.finalized).toBe(true);
    expect(finB.finalized).toBe(true);
    expect(finA.cashbackGranted).toBe(15_000);
    expect(finB.cashbackGranted).toBe(15_000);

    // Wallet balance MUST be exactly 15,000 (credited once)
    const wallet = await walletService.getOrCreateWallet(studentUser1.userId);
    expect(wallet.balance).toBe(15_000);

    // Only 1 transaction in the ledger for this cashback
    const { transactions } = await walletStore.listTransactionsByUserId(studentUser1.userId);
    expect(transactions.length).toBe(1);
    expect(transactions[0].amount).toBe(15_000);
    expect(transactions[0].idempotencyKey).toBe(`cashback:redemption:${res.redemptionId}`);
  });

  // -------------------------------------------------------------------------
  // Scenario 7c: Wallet credit failure prevents marking redemption completed
  // -------------------------------------------------------------------------
  it("Scenario 7c: wallet credit failure throws error and keeps redemption status pending for retry", async () => {
    await promotionService.createPromotion({
      name: "تخفیف کش‌بک با شکست موقت",
      benefitType: "fixed_cashback",
      benefitValue: 25_000,
      code: "CASH_FAIL",
      active: true,
    });

    const res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser2.userId,
      code: "CASH_FAIL",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    const orderId = randomUUID();
    const paymentId = randomUUID();
    await promotionService.linkRedemptionToOrder(res.redemptionId, orderId);

    // Simulate transient wallet service crash / failure
    const creditSpy = vi.spyOn(walletService, "credit").mockRejectedValueOnce(new Error("Simulated wallet network failure"));

    // Finalization MUST throw and fail
    await expect(
      promotionService.finalizePromotionForPaidOrder(orderId, paymentId),
    ).rejects.toThrow("Simulated wallet network failure");

    // Redemption status MUST NOT be set to completed
    const rowPending = promotionService.memoryRedemptions.find((r) => r.id === res.redemptionId);
    expect(rowPending?.status).toBe("pending");

    creditSpy.mockRestore();

    // Retry after failure MUST succeed cleanly
    const retryResult = await promotionService.finalizePromotionForPaidOrder(orderId, paymentId);
    expect(retryResult.finalized).toBe(true);
    expect(retryResult.cashbackGranted).toBe(25_000);

    const rowCompleted = promotionService.memoryRedemptions.find((r) => r.id === res.redemptionId);
    expect(rowCompleted?.status).toBe("completed");

    const wallet = await walletService.getOrCreateWallet(studentUser2.userId);
    expect(wallet.balance).toBe(25_000);
  });

  // -------------------------------------------------------------------------
  // Scenario 7d: Retry after wallet credit success completes redemption without double credit
  // -------------------------------------------------------------------------
  it("Scenario 7d: retry completes redemption without double credit if wallet credit had already succeeded", async () => {
    await promotionService.createPromotion({
      name: "تخفیف کش‌بک قطعی قبلی",
      benefitType: "fixed_cashback",
      benefitValue: 30_000,
      code: "CASH_RETRY",
      active: true,
    });

    const res = await promotionService.evaluateAndReservePromotion({
      userId: studentUser1.userId,
      code: "CASH_RETRY",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    const orderId = randomUUID();
    const paymentId = randomUUID();
    await promotionService.linkRedemptionToOrder(res.redemptionId, orderId);

    // Pre-credit wallet directly with the exact same idempotencyKey (as if 1st attempt credited wallet but timed out before updating DB)
    await walletService.credit({
      userId: studentUser1.userId,
      amount: 30_000,
      source: "promotion_cashback",
      referenceType: "order",
      referenceId: orderId,
      idempotencyKey: `cashback:redemption:${res.redemptionId}`,
    });

    const walletBeforeRetry = await walletService.getOrCreateWallet(studentUser1.userId);
    const balanceBeforeRetry = walletBeforeRetry.balance;

    // Redemption row is still pending
    const rowBefore = promotionService.memoryRedemptions.find((r) => r.id === res.redemptionId);
    expect(rowBefore?.status).toBe("pending");

    // Retry finalization
    const fin = await promotionService.finalizePromotionForPaidOrder(orderId, paymentId);
    expect(fin.finalized).toBe(true);
    expect(fin.cashbackGranted).toBe(30_000);

    // Redemption row is now completed
    const rowAfter = promotionService.memoryRedemptions.find((r) => r.id === res.redemptionId);
    expect(rowAfter?.status).toBe("completed");

    // Wallet balance MUST NOT have changed (no duplicate credit)
    const walletAfterRetry = await walletService.getOrCreateWallet(studentUser1.userId);
    expect(walletAfterRetry.balance).toBe(balanceBeforeRetry);
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Historical records compatibility and migration down evaluation
  // -------------------------------------------------------------------------
  it("Scenario 8: handles historical non-null order_id records seamlessly and tracks migration down risk", async () => {
    const promo = await promotionService.createPromotion({
      name: "پروموشن تاریخی",
      benefitType: "fixed_discount",
      benefitValue: 10_000,
      code: "HIST10",
      active: true,
    });

    // Historical record created under pre-0083 schema (orderId was NOT NULL)
    const historicalId = randomUUID();
    const historicalOrderId = randomUUID();
    promotionService.memoryRedemptions.push({
      id: historicalId,
      promotionId: promo.id,
      codeId: promo.codes[0].id,
      userId: studentUser1.userId,
      orderId: historicalOrderId, // NOT NULL
      paymentId: randomUUID(),
      benefitType: "fixed_discount",
      benefitValue: 10_000,
      discountAmount: 10_000,
      cashbackAmount: 0,
      orderOriginalAmount: 100_000,
      orderFinalAmount: 90_000,
      status: "completed",
      redeemedAt: new Date(Date.now() - 86400000).toISOString(),
      reservationExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      completedAt: new Date(Date.now() - 86400000).toISOString(),
      metadata: {},
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    });

    // New record under 0083 schema (orderId IS NULL while pending)
    const newRes = await promotionService.evaluateAndReservePromotion({
      userId: studentUser2.userId,
      code: "HIST10",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });

    const allRedemptions = await promotionService.listRedemptions({ promotionId: promo.id });
    expect(allRedemptions.items.length).toBe(2);

    const histRow = allRedemptions.items.find((r) => r.id === historicalId);
    expect(histRow?.orderId).toBe(historicalOrderId);

    const newRow = allRedemptions.items.find((r) => r.id === newRes.redemptionId);
    expect(newRow?.orderId).toBeNull();

    // Migration Down Risk Assessment Assertion:
    // If migration down executes `ALTER TABLE promotion_redemptions ALTER COLUMN order_id SET NOT NULL`,
    // it will fail by design if any row has order_id IS NULL (e.g. pending/abandoned/cancelled reservations).
    const unlinkedRows = allRedemptions.items.filter((r) => r.orderId === null);
    expect(unlinkedRows.length).toBeGreaterThan(0);
    // In production, down migration MUST fail and halt if unlinked rows exist.
    // Automated DELETE FROM promotion_redemptions is strictly prohibited.
    // Operator audit and explicit governance decision are required.
  });
});
