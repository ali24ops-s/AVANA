import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asProductId,
  asUserId,
  asPromotionId,
  asPromotionCodeId,
  asWalletId,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { PromotionService, InMemoryPromotionService } from "../modules/commerce/promotion-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";

describe("Promotions & Coupons Commerce Integration Flow", () => {
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let promotionService: InMemoryPromotionService;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let adminService: AdminService;

  const user1: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  const user2: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  const adminActor: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "admin",
  };

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    adminStore = new InMemoryAdminStore();
    adminStore.setCommerceStore(commerceStore);
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    promotionService = new InMemoryPromotionService(undefined, walletService);
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

    // Create a standard test course product (Price: 100,000 Toman)
    await commerceStore.createProduct({
      id: asProductId("prod_course_100k"),
      code: "course_test_100k",
      type: "course",
      title: "دوره جامع شیمی کنکور",
      description: "آموزش صفر تا صد",
      price: 100_000,
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

    // Create wallet topup product (Price: dynamic / 50,000 Toman)
    await commerceStore.createProduct({
      id: asProductId("wallet_topup"),
      code: "wallet_topup",
      type: "wallet_topup",
      title: "شارژ کیف پول",
      description: "افزایش اعتبار",
      price: 50_000,
      currency: "toman",
      targetType: "wallet",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: { isDynamicPrice: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  it("1. Validates and applies percentage discount with max limit on checkout and payment completion", async () => {
    // 20% discount, max 15,000 Toman
    const promo = await promotionService.createPromotion({
      name: "تخفیف ۲۰ درصدی نوروزی",
      benefitType: "percentage_discount",
      benefitValue: 20,
      maxDiscountAmount: 15_000,
      code: "NOWRUZ20",
      active: true,
    });

    // Validate preview
    const preview = await promotionService.validatePromotion({
      code: "nowruz20",
      userId: user1.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });

    expect(preview.valid).toBe(true);
    // 20% of 100k is 20k, capped at 15k
    expect(preview.benefit?.discountAmount).toBe(15_000);
    expect(preview.benefit?.payableAmount).toBe(85_000);

    // Checkout with coupon
    const checkoutRes = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        couponCode: "NOWRUZ20",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-1",
    );

    const order1 = await commerceStore.findOrderById(checkoutRes.order_id);
    expect(order1?.amount).toBe(85_000);

    // Verify online payment
    const verifyRes = await commerceService.verifyPayment(
      {
        authority: checkoutRes.authority!,
      },
      "req-2",
    );

    expect(verifyRes.success).toBe(true);
    const payment1 = await commerceStore.findPaymentById(verifyRes.payment_id);
    expect(payment1?.status).toBe("paid");

    // Check redemption status
    const redemptions = await promotionService.listRedemptions({ promotionId: promo.id });
    expect(redemptions.items.length).toBe(1);
    expect(redemptions.items[0].status).toBe("completed");
    expect(redemptions.items[0].discountAmount).toBe(15_000);
  });

  it("2. Applies fixed discount and updates order payable amount", async () => {
    // 40,000 Toman fixed discount
    await promotionService.createPromotion({
      name: "تخفیف ۴۰ هزار تومانی",
      benefitType: "fixed_discount",
      benefitValue: 40_000,
      code: "SAVE40K",
      active: true,
    });

    const checkoutRes = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        couponCode: "SAVE40K",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-3",
    );

    const order2 = await commerceStore.findOrderById(checkoutRes.order_id);
    expect(order2?.amount).toBe(60_000);
  });

  it("3. Credits percentage cashback to user wallet when payment is completed", async () => {
    // 25% cashback
    await promotionService.createPromotion({
      name: "کش‌بک ۲۵ درصدی",
      benefitType: "percentage_cashback",
      benefitValue: 25,
      code: "CASHBACK25",
      active: true,
    });

    const checkoutRes = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        couponCode: "CASHBACK25",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-4",
    );

    // Full 100k is paid upfront
    const order3 = await commerceStore.findOrderById(checkoutRes.order_id);
    expect(order3?.amount).toBe(100_000);

    // Verify payment
    await commerceService.verifyPayment(
      {
        authority: checkoutRes.authority!,
      },
      "req-5",
    );

    // Check user's wallet
    const wallet = await walletService.getOrCreateWallet(user1.userId);
    expect(wallet.balance).toBe(25_000); // 25% of 100k
  });

  it("4. Card-to-Card lifecycle: Reserves promotion on submit, finalizes on approve, releases on reject", async () => {
    const promo = await promotionService.createPromotion({
      name: "کارت به کارت با کش‌بک ۱۰ تومانی",
      benefitType: "fixed_cashback",
      benefitValue: 10_000,
      totalUsageLimit: 1,
      code: "C2C10K",
      active: true,
    });

    // 1. Submit Card-to-Card payment
    const c2cRes = await commerceService.submitCardToCardPayment(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        amount: 100_000,
        trackingNumber: "TRK-987654",
        sourceCardLast4: "5432",
        couponCode: "C2C10K",
      },
      "req-c2c-1",
    );

    expect(c2cRes.paymentId).toBeDefined();

    // While pending, second user cannot use this limit=1 coupon
    const secondTry = await promotionService.validatePromotion({
      code: "C2C10K",
      userId: user2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(secondTry.valid).toBe(false);
    expect(secondTry.reason).toContain("سقف");

    // 2. Admin rejects payment
    await adminService.rejectPayment(
      adminActor.userId,
      c2cRes.paymentId,
      "مغایرت فیش واریزی",
      "req-admin-reject",
    );

    // Coupon slot is released
    const thirdTry = await promotionService.validatePromotion({
      code: "C2C10K",
      userId: user2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(thirdTry.valid).toBe(true);

    // 3. User 2 submits and admin approves
    const c2cRes2 = await commerceService.submitCardToCardPayment(
      user2,
      {
        productId: asProductId("prod_course_100k"),
        amount: 100_000,
        trackingNumber: "TRK-112233",
        sourceCardLast4: "9988",
        couponCode: "C2C10K",
      },
      "req-c2c-2",
    );

    await adminService.approvePayment(
      adminActor.userId,
      c2cRes2.paymentId,
    );

    // User 2 gets 10,000 Toman wallet cashback
    const user2Wallet = await walletService.getOrCreateWallet(user2.userId);
    expect(user2Wallet.balance).toBe(10_000);
  });

  it("5. Rejects applying coupon codes to wallet topup products", async () => {
    await promotionService.createPromotion({
      name: "تخفیف عمومی",
      benefitType: "percentage_discount",
      benefitValue: 50,
      code: "HALFPRICE",
      active: true,
    });

    const validation = await promotionService.validatePromotion({
      code: "HALFPRICE",
      userId: user1.userId,
      items: [{ productId: "wallet_topup", productType: "wallet_topup", unitPrice: 50_000, quantity: 1 }],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("شارژ کیف پول");
  });

  it("6. Enforces per-user usage limits", async () => {
    await promotionService.createPromotion({
      name: "تخفیف یک‌بار مصرف برای هر کاربر",
      benefitType: "percentage_discount",
      benefitValue: 10,
      perUserUsageLimit: 1,
      code: "ONCEONLY",
      active: true,
    });

    // User 1 uses it once
    const checkout1 = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        couponCode: "ONCEONLY",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-u1",
    );

    await commerceService.verifyPayment(
      { authority: checkout1.authority! },
      "req-u1-verify",
    );

    // User 1 tries again -> rejected
    const validationUser1Again = await promotionService.validatePromotion({
      code: "ONCEONLY",
      userId: user1.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(validationUser1Again.valid).toBe(false);
    expect(validationUser1Again.reason).toContain("قبلاً");

    // User 2 tries -> valid
    const validationUser2 = await promotionService.validatePromotion({
      code: "ONCEONLY",
      userId: user2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(validationUser2.valid).toBe(true);
  });

  it("7. Idempotency: Double payment confirmation does not double-credit wallet or duplicate redemptions", async () => {
    const promo = await promotionService.createPromotion({
      name: "کش‌بک تکرارنشدنی",
      benefitType: "fixed_cashback",
      benefitValue: 30_000,
      code: "ONETIME30",
      active: true,
    });

    const checkoutRes = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        couponCode: "ONETIME30",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-idem-1",
    );

    // 1st verification
    await commerceService.verifyPayment(
      { authority: checkoutRes.authority! },
      "req-idem-verify-1",
    );

    const walletAfterFirst = await walletService.getOrCreateWallet(user1.userId);
    expect(walletAfterFirst.balance).toBe(30_000);

    // 2nd redundant verification of the same payment
    await commerceService.verifyPayment(
      { authority: checkoutRes.authority! },
      "req-idem-verify-2",
    );

    // Explicit redundant call to finalize promotion
    await promotionService.finalizePromotionForPaidOrder(checkoutRes.order_id, checkoutRes.payment_id);

    // Balance must strictly remain 30,000 (not 60,000)
    const walletAfterSecond = await walletService.getOrCreateWallet(user1.userId);
    expect(walletAfterSecond.balance).toBe(30_000);

    // Only 1 transaction in wallet history
    const { transactions } = await walletStore.listTransactionsByUserId(user1.userId);
    expect(transactions.length).toBe(1);
    expect(transactions[0].source).toBe("promotion_cashback");

    // Redemption record remains exactly 1 and completed
    const redemptions = await promotionService.listRedemptions({ promotionId: promo.id });
    expect(redemptions.items.length).toBe(1);
    expect(redemptions.items[0].status).toBe("completed");
  });

  it("8. Concurrency: Simultaneous reservations on limit=1 promotion allow only 1 winner", async () => {
    await promotionService.createPromotion({
      name: "پروموشن تک‌ظرفیتی همزمان",
      benefitType: "percentage_discount",
      benefitValue: 15,
      totalUsageLimit: 1,
      code: "SOLO15",
      active: true,
    });

    const results = await Promise.allSettled([
      promotionService.evaluateAndReservePromotion({
        userId: user1.userId,
        code: "SOLO15",
        orderAmount: 100_000,
        productId: "prod_course_100k",
      }),
      promotionService.evaluateAndReservePromotion({
        userId: user2.userId,
        code: "SOLO15",
        orderAmount: 100_000,
        productId: "prod_course_100k",
      }),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const rejections = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);
  });

  it("9. Lazy Expiry: Expired pending reservation is lazily released and reclaimed", async () => {
    const promo = await promotionService.createPromotion({
      name: "پروموشن با انقضای رزرو",
      benefitType: "fixed_discount",
      benefitValue: 20_000,
      totalUsageLimit: 1,
      code: "EXPIRE20",
      active: true,
    });

    // 1. User 1 reserves with 0 minute TTL (immediately expired)
    const res1 = await promotionService.evaluateAndReservePromotion({
      userId: user1.userId,
      code: "EXPIRE20",
      orderAmount: 100_000,
      productId: "prod_course_100k",
      reservationTtlMinutes: -5, // 5 minutes in the past
    });

    expect(res1.redemptionId).toBeDefined();

    // 2. User 2 validates the coupon -> Lazy expiry triggers, frees the slot
    const valUser2 = await promotionService.validatePromotion({
      code: "EXPIRE20",
      userId: user2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });

    expect(valUser2.valid).toBe(true);

    // 3. User 2 successfully reserves
    const res2 = await promotionService.evaluateAndReservePromotion({
      userId: user2.userId,
      code: "EXPIRE20",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    expect(res2.redemptionId).toBeDefined();

    // Old redemption is marked cancelled
    const redemptions = await promotionService.listRedemptions({ promotionId: promo.id });
    const oldRed = redemptions.items.find((r) => r.id === res1.redemptionId);
    expect(oldRed?.status).toBe("cancelled");
  });

  it("10. Historical Snapshot Immutability: Editing/Deactivating a promotion preserves past redemption records", async () => {
    const promo = await promotionService.createPromotion({
      name: "تخفیف اولیه ۲۰ درصد",
      benefitType: "percentage_discount",
      benefitValue: 20,
      maxDiscountAmount: 30_000,
      code: "ORIG20",
      active: true,
    });

    const checkout = await commerceService.checkout(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        couponCode: "ORIG20",
        gateway: "mock",
        callbackUrl: "https://avana.app/callback",
      },
      "req-snap-1",
    );

    await commerceService.verifyPayment(
      { authority: checkout.authority! },
      "req-snap-verify",
    );

    const redemptionsBefore = await promotionService.listRedemptions({ promotionId: promo.id });
    expect(redemptionsBefore.items[0].discountAmount).toBe(20_000);
    expect(redemptionsBefore.items[0].status).toBe("completed");

    // Deactivate / edit promotion in store
    const promoRecord = (promotionService as any).memoryPromotions.find((p: any) => p.id === promo.id);
    if (promoRecord) {
      promoRecord.active = false;
      promoRecord.benefitValue = 99; // manipulated
    }

    // Historical redemption remains unmodified
    const redemptionsAfter = await promotionService.listRedemptions({ promotionId: promo.id });
    expect(redemptionsAfter.items[0].discountAmount).toBe(20_000);
    expect(redemptionsAfter.items[0].status).toBe("completed");
    expect(redemptionsAfter.items[0].orderFinalAmount).toBe(80_000);
  });

  it("11. Client Tampering: Server strictly overrides client payable calculation and rejects manipulated c2c amounts", async () => {
    await promotionService.createPromotion({
      name: "تخفیف ۱۰ هزار تومانی",
      benefitType: "fixed_discount",
      benefitValue: 10_000,
      code: "LESS10K",
      active: true,
    });

    // Client tries to submit Card-to-Card with arbitrary amount (e.g. 50,000 instead of 90,000)
    await expect(
      commerceService.submitCardToCardPayment(
        user1,
        {
          productId: asProductId("prod_course_100k"),
          amount: 50_000, // Tampered amount!
          trackingNumber: "TRK-FAKE-1",
          sourceCardLast4: "1234",
          couponCode: "LESS10K",
        },
        "req-tamper-1",
      ),
    ).rejects.toThrow("مطابقت ندارد");

    // Proper amount (100k - 10k = 90k) succeeds
    const legitRes = await commerceService.submitCardToCardPayment(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        amount: 90_000,
        trackingNumber: "TRK-LEGIT-1",
        sourceCardLast4: "1234",
        couponCode: "LESS10K",
      },
      "req-tamper-2",
    );
    expect(legitRes.paymentId).toBeDefined();
  });

  it("12. Wallet Top-Up Protection: End-to-End rejection of coupons across checkout and card-to-card", async () => {
    await promotionService.createPromotion({
      name: "تخفیف ۵۰ درصدی",
      benefitType: "percentage_discount",
      benefitValue: 50,
      code: "NO_TOPUP",
      active: true,
    });

    // 1. Validation fails
    const valRes = await promotionService.validatePromotion({
      code: "NO_TOPUP",
      userId: user1.userId,
      items: [{ productId: "wallet_topup", productType: "wallet_topup", unitPrice: 50_000, quantity: 1 }],
    });
    expect(valRes.valid).toBe(false);
    expect(valRes.reason).toContain("کیف پول");

    // 2. Online checkout fails
    await expect(
      commerceService.checkout(
        user1,
        {
          productId: asProductId("wallet_topup"),
          couponCode: "NO_TOPUP",
          gateway: "mock",
          callbackUrl: "https://avana.app/callback",
        },
        "req-topup-fail",
      ),
    ).rejects.toThrow("کیف پول");

    // 3. Card-to-Card fails
    await expect(
      commerceService.submitCardToCardPayment(
        user1,
        {
          productId: asProductId("wallet_topup"),
          amount: 25_000,
          trackingNumber: "TRK-TOPUP-FAIL",
          sourceCardLast4: "1234",
          couponCode: "NO_TOPUP",
        },
        "req-c2c-topup-fail",
      ),
    ).rejects.toThrow("کیف پول");
  });

  it("13. Card-to-Card with Coupon: Initial reservation has orderId=null, binds to real orderId on success, rejects dummy/invalid orderId", async () => {
    // 30% discount on 100k course -> payable 70k
    await promotionService.createPromotion({
      name: "تخفیف سی درصدی اختصاصی",
      benefitType: "percentage_discount",
      benefitValue: 30,
      totalUsageLimit: 5,
      code: "C2C30PCT",
      active: true,
    });

    // 1. Check evaluateAndReservePromotion directly: initial reservation MUST have orderId = null
    const res = await promotionService.evaluateAndReservePromotion({
      userId: user1.userId,
      code: "C2C30PCT",
      orderAmount: 100_000,
      productId: "prod_course_100k",
    });
    expect(res.redemptionId).toBeDefined();
    expect(res.payableAmount).toBe(70_000);
    expect(res.discountAmount).toBe(30_000);

    const initialRedemption = promotionService.memoryRedemptions.find(
      (r) => r.id === res.redemptionId,
    );
    expect(initialRedemption).toBeDefined();
    expect(initialRedemption?.orderId).toBeNull(); // Must be NULL before order is created
    expect(initialRedemption?.status).toBe("pending");

    // 2. Linking with sentinel all-zeros or empty string MUST fail with DomainError
    await expect(
      promotionService.linkRedemptionToOrder(
        res.redemptionId,
        "00000000-0000-0000-0000-000000000000",
      ),
    ).rejects.toThrow("نامعتبر");

    // 3. Submit real Card-to-Card payment with coupon code
    const validC2c = await commerceService.submitCardToCardPayment(
      user2,
      {
        productId: asProductId("prod_course_100k"),
        amount: 70_000, // Correct discounted amount
        trackingNumber: "TRK-REAL-ORDER-BIND",
        sourceCardLast4: "7766",
        couponCode: "C2C30PCT",
      },
      "req-c2c-order-bind",
    );

    expect(validC2c.orderId).toBeDefined();
    expect(validC2c.paymentId).toBeDefined();

    // Verify redemption is linked to the real orderId (not null, not all-zeros)
    const linkedRedemption = promotionService.memoryRedemptions.find(
      (r) => r.orderId === validC2c.orderId,
    );
    expect(linkedRedemption).toBeDefined();
    expect(linkedRedemption?.orderId).toBe(validC2c.orderId);
    expect(linkedRedemption?.orderId).not.toBe("00000000-0000-0000-0000-000000000000");
    expect(linkedRedemption?.discountAmount).toBe(30_000);
    expect(linkedRedemption?.orderFinalAmount).toBe(70_000);
  });

  it("14. Post-Reservation Failure Rollback: If submission fails after reservation, reservation is cancelled and user quota is not leaked", async () => {
    // 1-use per user limit coupon
    await promotionService.createPromotion({
      name: "کد یکبار مصرف هر کاربر",
      benefitType: "fixed_discount",
      benefitValue: 20_000,
      totalUsageLimit: 10,
      perUserUsageLimit: 1,
      code: "ONCE20K",
      active: true,
    });

    // 1. Submit Card-to-Card with invalid tracking number (< 3 chars)
    // Reservation is evaluated in step 3, but tracking validation throws in step 4
    await expect(
      commerceService.submitCardToCardPayment(
        user1,
        {
          productId: asProductId("prod_course_100k"),
          amount: 80_000, // 100k - 20k
          trackingNumber: "1", // Invalid tracking number!
          sourceCardLast4: "1234",
          couponCode: "ONCE20K",
        },
        "req-fail-tracking",
      ),
    ).rejects.toThrow("نامعتبر");

    // The failed attempt must have cancelled its reservation
    const redemptions = promotionService.memoryRedemptions.filter(
      (r) => r.userId === user1.userId,
    );
    const lastRed = redemptions[redemptions.length - 1];
    expect(lastRed.status).toBe("cancelled");

    // 2. User immediately retries with valid tracking number — MUST succeed (not blocked by quota!)
    const retryRes = await commerceService.submitCardToCardPayment(
      user1,
      {
        productId: asProductId("prod_course_100k"),
        amount: 80_000,
        trackingNumber: "TRK-VALID-RETRY-123",
        sourceCardLast4: "1234",
        couponCode: "ONCE20K",
      },
      "req-retry-success",
    );

    expect(retryRes.orderId).toBeDefined();
    expect(retryRes.paymentId).toBeDefined();

    // 3. User tries a SECOND time after successful submission — MUST be rejected due to per-user limit
    await expect(
      commerceService.submitCardToCardPayment(
        user1,
        {
          productId: asProductId("prod_course_100k"),
          amount: 80_000,
          trackingNumber: "TRK-SECOND-USE-999",
          sourceCardLast4: "1234",
          couponCode: "ONCE20K",
        },
        "req-second-use",
      ),
    ).rejects.toThrow("قبلاً از این کد تخفیف استفاده کرده‌اید");
  });

  it("15. Amount Mismatch with Coupon: Rejects manipulated payment amount and releases reservation", async () => {
    await promotionService.createPromotion({
      name: "تخفیف ۱۰ هزار تومانی",
      benefitType: "fixed_discount",
      benefitValue: 10_000,
      totalUsageLimit: 1,
      code: "FIXED10K",
      active: true,
    });

    // User claims coupon but inputs wrong amount (100k instead of 90k)
    await expect(
      commerceService.submitCardToCardPayment(
        user1,
        {
          productId: asProductId("prod_course_100k"),
          amount: 100_000, // Should be 90,000!
          trackingNumber: "TRK-WRONG-AMOUNT",
          sourceCardLast4: "4321",
          couponCode: "FIXED10K",
        },
        "req-wrong-amt",
      ),
    ).rejects.toThrow("مطابقت ندارد");

    // Coupon slot with totalUsageLimit=1 must be released so user2 can use it
    const valUser2 = await promotionService.validatePromotion({
      code: "FIXED10K",
      userId: user2.userId,
      items: [{ productId: "prod_course_100k", productType: "course", unitPrice: 100_000, quantity: 1 }],
    });
    expect(valUser2.valid).toBe(true);
  });
});
