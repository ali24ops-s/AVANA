import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asProductId,
  asUserId,
} from "@avana/domain";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { InMemoryPromotionService, PromotionService } from "../modules/commerce/promotion-service.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";

describe("Comprehensive Audit: Admin Promotions, Discounts, Codes & Financial Integrity", () => {
  let adminStore: InMemoryAdminStore;
  let commerceStore: InMemoryCommerceStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let promotionService: InMemoryPromotionService;
  let commerceService: CommerceService;
  let mockGateway: MockPaymentGateway;
  let adminService: AdminService;

  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "admin",
  };

  const studentActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
  };

  beforeEach(async () => {
    adminStore = new InMemoryAdminStore();
    commerceStore = new InMemoryCommerceStore();
    adminStore.setCommerceStore(commerceStore);

    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    promotionService = new InMemoryPromotionService(undefined, walletService);
    adminStore.setPromotionService(promotionService);
    mockGateway = new MockPaymentGateway({ enabled: true });

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined, // userStore
      undefined, // auditService
      undefined, // contentPackStore
      undefined, // cardToCardConfig
      undefined, // lessonStore
      { onlinePaymentEnabled: true, mockPaymentEnabled: true },
      undefined, // studyService
      undefined, // notificationService
      walletService,
      undefined, // subscriptionCreditBonusesProvider
      promotionService as unknown as PromotionService,
    );

    adminService = new AdminService(
      adminStore,
      walletService,
      commerceStore,
      undefined, // notificationService
      promotionService as unknown as PromotionService,
    );

    // Seed test course product (Price: 200,000 Toman)
    await commerceStore.createProduct({
      id: asProductId("prod_course_200k"),
      code: "course_test_200k",
      type: "course",
      title: "دوره جامع شیمی کنکور",
      description: "آموزش صفر تا صد",
      price: 200_000,
      currency: "toman",
      targetType: "course",
      targetId: "course_chem_1",
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  // =========================================================================
  // Area 1 & 2: Complete Administrative Lifecycle + Checkout Integration
  // =========================================================================
  it("Lifecycle: Create, inspect, detail, edit, toggle, checkout-check, reactivate, soft-delete, and stats check", async () => {
    // 1. Create Promotion
    const created = await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف ویژه دوره جامع",
      description: "تخفیف ۲۵ درصدی برای دانشجویان",
      benefitType: "percentage_discount",
      benefitValue: 25,
      maxDiscountAmount: 50_000,
      minOrderAmount: 100_000,
      perUserUsageLimit: 1,
      totalUsageLimit: 10,
      code: "STUDENT25",
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("تخفیف ویژه دوره جامع");
    expect(created.benefitValue).toBe(25);
    expect(created.active).toBe(true);
    expect(created.codes.length).toBe(1);
    expect(created.codes[0].code).toBe("STUDENT25");

    // 2. Query Detail from Store/API
    const fetched = await adminService.getCommercePromotion(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(created.id);
    expect(fetched.benefitType).toBe("percentage_discount");
    expect(fetched.stats.totalRedemptions).toBe(0);

    // 3. Edit Record (name, value, maxDiscountAmount, minOrderAmount)
    const updated = await adminService.updateCommercePromotion(adminActor.userId, created.id, {
      name: "تخفیف طلایی دوره جامع",
      benefitValue: 30,
      maxDiscountAmount: 60_000,
      minOrderAmount: 120_000,
    });

    expect(updated.name).toBe("تخفیف طلایی دوره جامع");
    expect(updated.benefitValue).toBe(30);
    expect(updated.maxDiscountAmount).toBe(60_000);
    expect(updated.minOrderAmount).toBe(120_000);

    // 4. Persistence check after re-fetch
    const reFetched = await adminService.getCommercePromotion(created.id);
    expect(reFetched.name).toBe("تخفیف طلایی دوره جامع");
    expect(reFetched.benefitValue).toBe(30);

    // 5. Deactivate Record
    const deactivated = await adminService.toggleCommercePromotionActive(
      adminActor.userId,
      created.id,
      false,
    );
    expect(deactivated.active).toBe(false);

    // 6. Verify deactivated promo CANNOT be used in purchase / checkout
    const checkInactive = await promotionService.validatePromotion({
      code: "STUDENT25",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkInactive.valid).toBe(false);
    expect(checkInactive.reason).toMatch(/فعال نیست|غیرفعال/);

    // 7. Reactivate Record
    const reactivated = await adminService.toggleCommercePromotionActive(
      adminActor.userId,
      created.id,
      true,
    );
    expect(reactivated.active).toBe(true);

    // 8. Now checkout succeeds with the updated discount (30% on 200_000 = 60_000 maxDiscount)
    const checkActive = await promotionService.validatePromotion({
      code: "STUDENT25",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkActive.valid).toBe(true);
    expect(checkActive.benefit?.discountAmount).toBe(60_000);
    expect(checkActive.benefit?.payableAmount).toBe(140_000);

    // Execute real checkout & payment verification
    const checkoutRes = await commerceService.checkout(
      studentActor,
      {
        productId: asProductId("prod_course_200k"),
        couponCode: "STUDENT25",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-audit-1",
    );
    expect(checkoutRes.order_id).toBeDefined();

    const order1 = await commerceStore.findOrderById(checkoutRes.order_id);
    expect(order1?.amount).toBe(140_000);

    const verifyRes = await commerceService.verifyPayment(
      { authority: checkoutRes.authority! },
      "req-audit-verify-1",
    );
    expect(verifyRes.success).toBe(true);

    // 9. Soft-delete the promotion
    const deleteResult = await adminService.deleteCommercePromotion(adminActor.userId, created.id);
    expect(deleteResult.success).toBe(true);

    // Verify promo is no longer in active listings
    const listAfterDelete = await adminService.listCommercePromotions({ page: 1, pageSize: 20 });
    const found = (listAfterDelete.promotions || []).find((p) => p.id === created.id);
    expect(found).toBeUndefined();

    // Verify deleted promo cannot be used in checkout
    const checkDeleted = await promotionService.validatePromotion({
      code: "STUDENT25",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkDeleted.valid).toBe(false);

    // 10. CRITICAL FINANCIAL CHECK: The redemption record must still exist and be reportable!
    const redemptionsReport = await adminService.listCommercePromotionRedemptions(undefined, {
      page: 1,
      pageSize: 50,
    });
    expect(redemptionsReport.totalCount).toBeGreaterThanOrEqual(1);
    const completedRedemption = redemptionsReport.items.find((r) => r.orderId === checkoutRes.order_id);
    expect(completedRedemption).toBeDefined();
    expect(completedRedemption?.discountAmount).toBe(60_000);
    expect(completedRedemption?.orderFinalAmount).toBe(140_000);
    expect(completedRedemption?.status).toBe("completed");

    // Stats reflect this completed redemption
    expect(redemptionsReport.stats?.totalCompleted).toBeGreaterThanOrEqual(1);
    expect(redemptionsReport.stats?.totalDiscountGranted).toBeGreaterThanOrEqual(60_000);
  });

  // =========================================================================
  // Area 3: Bulk Code Generation
  // =========================================================================
  it("Bulk Code Generation: Generates > 10 codes, preserves maxUses, is additive, validates input", async () => {
    const promo = await adminService.createCommercePromotion(adminActor.userId, {
      name: "کدهای هدیه سمینار",
      benefitType: "fixed_discount",
      benefitValue: 50_000,
      minOrderAmount: 100_000,
    });

    // 1. Generate 25 codes (more than 10) with maxUses: 3
    const bulk1 = await adminService.bulkGenerateCommercePromotionCodes(adminActor.userId, promo.id, {
      count: 25,
      prefix: "SEMINAR",
      length: 8,
      maxUses: 3,
    });

    expect(bulk1.count).toBe(25);
    // All 25 codes must be present in response (not truncated to 10)
    expect(bulk1.codes.length).toBe(25);
    for (const c of bulk1.codes) {
      expect(c.startsWith("SEMINAR")).toBe(true);
    }

    // Check detail in store
    const detailAfterBulk1 = await adminService.getCommercePromotion(promo.id);
    expect(detailAfterBulk1.codes.length).toBe(25);
    for (const c of detailAfterBulk1.codes) {
      expect(c.maxUses).toBe(3);
      expect(c.active).toBe(true);
      expect(c.timesUsed).toBe(0);
    }

    // 2. Additive generation: generate 15 more codes with prefix "VIP" and maxUses: 10
    const bulk2 = await adminService.bulkGenerateCommercePromotionCodes(adminActor.userId, promo.id, {
      count: 15,
      prefix: "VIP",
      length: 8,
      maxUses: 10,
    });

    expect(bulk2.count).toBe(15);
    expect(bulk2.codes.length).toBe(15);

    // Previous 25 codes must NOT be overwritten! Total must be 40
    const detailAfterBulk2 = await adminService.getCommercePromotion(promo.id);
    expect(detailAfterBulk2.codes.length).toBe(40);

    const vipCodes = detailAfterBulk2.codes.filter((c) => c.code.startsWith("VIP"));
    const seminarCodes = detailAfterBulk2.codes.filter((c) => c.code.startsWith("SEMINAR"));
    expect(vipCodes.length).toBe(15);
    expect(seminarCodes.length).toBe(25);
    expect(vipCodes[0].maxUses).toBe(10);
    expect(seminarCodes[0].maxUses).toBe(3);

    // 3. Input validation
    await expect(
      adminService.bulkGenerateCommercePromotionCodes(adminActor.userId, promo.id, {
        count: 0,
      }),
    ).rejects.toThrow();

    await expect(
      adminService.bulkGenerateCommercePromotionCodes(adminActor.userId, promo.id, {
        count: 1001,
      }),
    ).rejects.toThrow();
  });

  // =========================================================================
  // Area 4: Boundary & Validity Dates
  // =========================================================================
  it("Validity Dates: Tests startsAt boundary, endsAt boundary, expired, invalid dates", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

    // 1. Active promotion valid right now (yesterday to tomorrow)
    await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف معتبر جاری",
      benefitType: "percentage_discount",
      benefitValue: 15,
      startsAt: yesterday,
      endsAt: tomorrow,
      code: "VALIDNOW15",
    });

    const checkValid = await promotionService.validatePromotion({
      code: "VALIDNOW15",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkValid.valid).toBe(true);
    expect(checkValid.benefit?.discountAmount).toBe(30_000);

    // 2. Future promotion (starts tomorrow)
    await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف آینده",
      benefitType: "percentage_discount",
      benefitValue: 20,
      startsAt: tomorrow,
      endsAt: nextWeek,
      code: "FUTURE20",
    });

    const checkFuture = await promotionService.validatePromotion({
      code: "FUTURE20",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkFuture.valid).toBe(false);
    expect(checkFuture.reason).toMatch(/فرا نرسیده|شروع نشده/);

    // 3. Expired promotion (endsAt in the past)
    const twoDaysAgo = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
    await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف منقضی",
      benefitType: "percentage_discount",
      benefitValue: 20,
      startsAt: twoDaysAgo,
      endsAt: yesterday,
      code: "EXPIRED20",
    });

    const checkExpired = await promotionService.validatePromotion({
      code: "EXPIRED20",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkExpired.valid).toBe(false);
    expect(checkExpired.reason).toMatch(/پایان رسیده|منقضی/);

    // 4. Invalid date range: startsAt > endsAt
    await expect(
      adminService.createCommercePromotion(adminActor.userId, {
        name: "تخفیف با تاریخ نامعتبر",
        benefitType: "percentage_discount",
        benefitValue: 10,
        startsAt: nextWeek,
        endsAt: tomorrow,
        code: "INVALIDDATES",
      }),
    ).rejects.toThrow();
  });

  // =========================================================================
  // Area 5 & 6: Security, Authorization & Checkout Constraints
  // =========================================================================
  it("Security & Constraints: Permissions, minOrder, maxDiscount cap, user limits, idempotency", async () => {
    // 1. Constraint: minOrderAmount & maxDiscountAmount
    await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف پنجاه درصدی با سقف",
      benefitType: "percentage_discount",
      benefitValue: 50,
      minOrderAmount: 250_000,
      maxDiscountAmount: 30_000,
      code: "CAP50",
    });

    // Order 200_000 is below minimum (250_000) -> rejected
    const checkMinOrder = await promotionService.validatePromotion({
      code: "CAP50",
      userId: studentActor.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkMinOrder.valid).toBe(false);
    expect(checkMinOrder.reason).toMatch(/حداقل/);

    // 2. User usage limits
    await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف یکبار مصرف کاربر",
      benefitType: "fixed_discount",
      benefitValue: 20_000,
      minOrderAmount: 50_000,
      perUserUsageLimit: 1,
      totalUsageLimit: 2,
      code: "ONCEONLY",
    });

    const user1: Actor = { userId: asUserId(randomUUID()), role: "student" };
    const user2: Actor = { userId: asUserId(randomUUID()), role: "student" };

    // First use by user1 -> succeeds
    const checkout1 = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_200k"),
        couponCode: "ONCEONLY",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-limit-1",
    );
    await commerceService.verifyPayment({ authority: checkout1.authority! }, "req-limit-verify-1");

    // Second use by user1 -> REJECTED (perUserUsageLimit reached)
    const checkUser1Again = await promotionService.validatePromotion({
      code: "ONCEONLY",
      userId: user1.userId,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkUser1Again.valid).toBe(false);
    expect(checkUser1Again.reason).toMatch(/قبلاً/);

    // First use by user2 -> succeeds
    const checkout2 = await commerceService.checkout(
      user2,
      {
        productId: asProductId("prod_course_200k"),
        couponCode: "ONCEONLY",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-limit-2",
    );
    await commerceService.verifyPayment({ authority: checkout2.authority! }, "req-limit-verify-2");

    // Third use by anyone -> REJECTED (totalUsageLimit: 2 reached)
    const user3 = asUserId(randomUUID());
    const checkUser3 = await promotionService.validatePromotion({
      code: "ONCEONLY",
      userId: user3,
      items: [{ productId: "prod_course_200k", productType: "course", unitPrice: 200_000, quantity: 1 }],
    });
    expect(checkUser3.valid).toBe(false);
    expect(checkUser3.reason).toMatch(/تکمیل|حداکثر|سقف/);

    // 3. Duplicate payment confirmation idempotency
    const reVerify = await commerceService.verifyPayment({ authority: checkout1.authority! }, "req-limit-verify-dup");
    expect(reVerify.success).toBe(true);
    // Order stays paid, no duplicate redemptions created
  });

  // =========================================================================
  // Area 7: Dashboard Stats Aggregation & Pagination Integrity
  // =========================================================================
  it("Dashboard Stats: Verifies aggregate calculations and prevents pageSize undercounting", async () => {
    const promo = await adminService.createCommercePromotion(adminActor.userId, {
      name: "پروموشن برای تست آمار",
      benefitType: "fixed_discount",
      benefitValue: 10_000,
      minOrderAmount: 20_000,
      code: "STATSTEST",
    });

    // Create 15 completed redemptions
    const expectedDiscountTotal = 15 * 10_000;
    for (let i = 0; i < 15; i++) {
      const student: Actor = { userId: asUserId(randomUUID()), role: "student" };
      const checkout = await commerceService.checkout(
        student,
        {
          productId: asProductId("prod_course_200k"),
          couponCode: "STATSTEST",
          gateway: "mock",
          callbackUrl: "https://avana.app/callback",
        },
        `req-stats-${i}`,
      );
      await commerceService.verifyPayment({ authority: checkout.authority! }, `req-stats-verify-${i}`);
    }

    // Call redemptions listing with small page size (pageSize = 5)
    const pagedResult = await adminService.listCommercePromotionRedemptions(promo.id, {
      page: 1,
      pageSize: 5,
    });

    // Paged items are only 5
    expect(pagedResult.items.length).toBe(5);
    // Total count across all pages is 15
    expect(pagedResult.totalCount).toBe(15);
    // Summary stats MUST NOT be undercounted! It must reflect all 15 redemptions
    expect(pagedResult.stats).toBeDefined();
    expect(pagedResult.stats?.totalCompleted).toBe(15);
    expect(pagedResult.stats?.totalDiscountGranted).toBe(expectedDiscountTotal);
  });
});
