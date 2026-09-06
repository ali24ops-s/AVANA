import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type ProductId,
  type UserId,
  asCourseId,
  asProductId,
  asUserId,
  DomainError,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";

describe("Card-to-Card Payment System (کارت‌به‌کارت با فعال‌سازی فوری و تأیید نهایی ادمین)", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let contentPackStore: InMemoryContentPackStore;
  let adminStore: InMemoryAdminStore;
  let adminService: AdminService;

  const testUser: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  const adminUser: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "platform_admin",
  };

  const c2cConfig = {
    enabled: true,
    destinationCardNumber: "5894631131738239",
    cardholderName: "علی محمدلو",
    instructions: "لطفاً مبلغ را به شماره کارت فوق واریز کرده و اطلاعات را ثبت کنید.",
  };

  let monthlyPlanId: ProductId;

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway();
    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      c2cConfig,
    );

    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    contentPackStore = new InMemoryContentPackStore();

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      contentPackStore,
    });

    adminStore = new InMemoryAdminStore();
    adminService = new AdminService(adminStore);

    const products = await commerceService.listActiveProducts();
    const monthly = products.find((p) => p.code === "sub_monthly");
    expect(monthly).toBeDefined();
    monthlyPlanId = monthly!.id;
  });

  describe("1. Configuration & Destination Info", () => {
    it("returns destination card information when enabled", () => {
      const info = commerceService.getCardToCardInfo();
      expect(info.enabled).toBe(true);
      expect(info.destinationCardNumber).toBe("5894631131738239");
      expect(info.cardholderName).toBe("علی محمدلو");
      expect(info.instructions).toBeDefined();
    });

    it("blocks card-to-card submission when disabled", async () => {
      const disabledService = new CommerceService(
        commerceStore,
        mockGateway,
        undefined,
        undefined,
        undefined,
        { enabled: false },
      );

      await expect(
        disabledService.submitCardToCardPayment(
          testUser,
          {
            productId: monthlyPlanId,
            amount: 99000,
            trackingNumber: "TRK-123456",
            sourceCardLast4: "1234",
          },
          "req-1",
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("2. Initial Validation & Anti-Fraud Protection", () => {
    it("rejects submission if amount does not match product price", async () => {
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: monthlyPlanId,
            amount: 50000, // Invalid amount (product is 99000)
            trackingNumber: "TRK-123456",
            sourceCardLast4: "1234",
          },
          "req-val-1",
        ),
      ).rejects.toThrow("مبلغ واریزی");
    });

    it("rejects invalid source card last 4 digits (must be exactly 4 digits)", async () => {
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: monthlyPlanId,
            amount: 99000,
            trackingNumber: "TRK-123456",
            sourceCardLast4: "123", // 3 digits
          },
          "req-val-2",
        ),
      ).rejects.toThrow("۴ رقم آخر کارت مبدأ");

      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: monthlyPlanId,
            amount: 99000,
            trackingNumber: "TRK-123456",
            sourceCardLast4: "abcd", // non-numeric
          },
          "req-val-3",
        ),
      ).rejects.toThrow("۴ رقم آخر کارت مبدأ");
    });

    it("rejects missing or invalid tracking number", async () => {
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: monthlyPlanId,
            amount: 99000,
            trackingNumber: "",
            sourceCardLast4: "1234",
          },
          "req-val-4",
        ),
      ).rejects.toThrow("شماره پیگیری");
    });

    it("prevents multiple concurrent pending card-to-card payments for the same user (Rule #7)", async () => {
      // 1st submission succeeds
      const sub1 = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: monthlyPlanId,
          amount: 99000,
          trackingNumber: "TRK-111111",
          sourceCardLast4: "1234",
        },
        "req-conc-1",
      );
      expect(sub1.success).toBe(true);

      // 2nd submission for same user while 1st is still pending_admin_review must be blocked
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: monthlyPlanId,
            amount: 99000,
            trackingNumber: "TRK-222222",
            sourceCardLast4: "5678",
          },
          "req-conc-2",
        ),
      ).rejects.toThrow("یک پرداخت کارت‌به‌کارت در حال بررسی دارید");
    });

    it("prevents duplicate payments with composite duplicate check (Rule #6)", async () => {
      const userA: Actor = { userId: asUserId(randomUUID() as any), role: "student" };
      const userB: Actor = { userId: asUserId(randomUUID() as any), role: "student" };

      await commerceService.submitCardToCardPayment(
        userA,
        {
          productId: monthlyPlanId,
          amount: 99000,
          trackingNumber: "TRK-DUP-999",
          sourceCardLast4: "4321",
        },
        "req-dup-1",
      );

      // userB attempts to submit identical tracking number
      await expect(
        commerceService.submitCardToCardPayment(
          userB,
          {
            productId: monthlyPlanId,
            amount: 99000,
            trackingNumber: "TRK-DUP-999",
            sourceCardLast4: "4321",
          },
          "req-dup-2",
        ),
      ).rejects.toThrow("قبلاً");
    });
  });

  describe("3. Instant Activation Flow & Centralized Access Control", () => {
    it("activates subscription immediately upon successful validation and grants full access", async () => {
      // Pre-check: user has no active subscription and no access
      const preSub = await commerceService.getMySubscription(testUser.userId);
      expect(preSub).toBeNull();

      const courseId = asCourseId(randomUUID() as any);
      const preAccess = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      expect(preAccess.granted).toBe(false);

      // Submit Card-to-Card payment
      const result = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: monthlyPlanId,
          amount: 99000,
          trackingNumber: "TRK-INSTANT-001",
          sourceCardLast4: "8888",
          payerName: "علی رضایی",
        },
        "req-instant-1",
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("pending_admin_review");
      expect(result.subscriptionStatus).toBe("active_pending_payment_review");

      // Verify active subscription retrieval returns the active pending subscription
      const activeSub = await commerceService.getMySubscription(testUser.userId);
      expect(activeSub).not.toBeNull();
      expect(activeSub?.status).toBe("active_pending_payment_review");

      // Centralized Entitlement Check: User now has FULL immediate access!
      const postAccess = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      expect(postAccess.granted).toBe(true);
      expect(postAccess.reason).toBe("subscription");
    });
  });

  describe("4. Admin Approval & Idempotency", () => {
    it("approves payment atomically and transitions subscription to active", async () => {
      // Seed memory admin store with a pending payment
      const paymentId = `pay_${Date.now()}`;
      const orderId = `ord_${Date.now()}`;
      const userId = randomUUID();

      adminStore.memoryOrders.push({
        id: orderId,
        orderNumber: "C2C-2026-0001",
        userId,
        userEmail: "student@test.com",
        userName: "Student",
        productId: "prod_sub_monthly",
        productTitle: "اشتراک ۱ ماهه",
        amount: 99000,
        currency: "toman",
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      adminStore.memoryPayments.push({
        id: paymentId,
        orderId,
        orderNumber: "C2C-2026-0001",
        userId,
        userEmail: "student@test.com",
        userName: "Student",
        productTitle: "اشتراک ۱ ماهه",
        amount: 99000,
        currency: "toman",
        gateway: "card_to_card",
        authority: null,
        transactionId: "TRK-ADMIN-APP",
        status: "pending_admin_review",
        trackingNumber: "TRK-ADMIN-APP",
        sourceCardLast4: "1111",
        payerName: "Student Payer",
        receiptUrl: null,
        initialValidationResult: { valid: true },
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      adminStore.memorySubscriptions.push({
        id: `sub_${Date.now()}`,
        userId,
        userEmail: "student@test.com",
        productId: "prod_sub_monthly",
        productTitle: "اشتراک ۱ ماهه",
        plan: "sub_monthly",
        status: "active_pending_payment_review" as any,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        orderId,
        createdAt: new Date().toISOString(),
      });

      // Admin approves
      const approveResult = await adminService.approvePayment(adminUser.userId, paymentId);
      expect(approveResult.success).toBe(true);
      expect(approveResult.payment.status).toBe("admin_approved");

      const order = adminStore.memoryOrders.find((o) => o.id === orderId);
      expect(order?.status).toBe("paid");

      const sub = adminStore.memorySubscriptions.find((s) => s.orderId === orderId);
      expect(sub?.status).toBe("active");

      // Idempotency: Repeating approve returns success
      const repeatApprove = await adminService.approvePayment(adminUser.userId, paymentId);
      expect(repeatApprove.success).toBe(true);
      expect(repeatApprove.message).toContain("قبلاً تأیید شده");
    });
  });

  describe("5. Admin Rejection & Immediate Revocation (Rules #3, #4, #8)", () => {
    it("mandates rejection reason and instantly revokes user access while preserving audit trail", async () => {
      const paymentId = `pay_rej_${Date.now()}`;
      const orderId = `ord_rej_${Date.now()}`;
      const userId = randomUUID();

      adminStore.memoryOrders.push({
        id: orderId,
        orderNumber: "C2C-2026-REJ",
        userId,
        userEmail: "badpayer@test.com",
        userName: "Bad Payer",
        productId: "prod_sub_monthly",
        productTitle: "اشتراک ۱ ماهه",
        amount: 99000,
        currency: "toman",
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      adminStore.memoryPayments.push({
        id: paymentId,
        orderId,
        orderNumber: "C2C-2026-REJ",
        userId,
        userEmail: "badpayer@test.com",
        userName: "Bad Payer",
        productTitle: "اشتراک ۱ ماهه",
        amount: 99000,
        currency: "toman",
        gateway: "card_to_card",
        authority: null,
        transactionId: "TRK-FAKE-999",
        status: "pending_admin_review",
        trackingNumber: "TRK-FAKE-999",
        sourceCardLast4: "9999",
        payerName: "Fake Payer",
        receiptUrl: null,
        initialValidationResult: { valid: true },
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      adminStore.memorySubscriptions.push({
        id: `sub_rej_${Date.now()}`,
        userId,
        userEmail: "badpayer@test.com",
        productId: "prod_sub_monthly",
        productTitle: "اشتراک ۱ ماهه",
        plan: "sub_monthly",
        status: "active_pending_payment_review" as any,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        orderId,
        createdAt: new Date().toISOString(),
      });

      adminStore.memoryEntitlements.push({
        id: `ent_rej_${Date.now()}`,
        userId,
        userEmail: "badpayer@test.com",
        resourceType: "subscription",
        resourceId: null,
        resourceTitle: "اشتراک سراسری آوانا",
        sourceType: "purchase",
        orderId,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        lifetime: false,
        active: true,
        createdAt: new Date().toISOString(),
      });

      // 1. Mandatory rejection reason check
      await expect(
        adminService.rejectPayment(adminUser.userId, paymentId, ""),
      ).rejects.toThrow(DomainError);

      // 2. Reject with reason
      const rejectResult = await adminService.rejectPayment(
        adminUser.userId,
        paymentId,
        "فیش واریزی جعلی است و تراکنش در حساب بانکی یافت نشد.",
      );

      expect(rejectResult.success).toBe(true);
      expect(rejectResult.payment.status).toBe("admin_rejected");
      expect(rejectResult.payment.rejectionReason).toBe(
        "فیش واریزی جعلی است و تراکنش در حساب بانکی یافت نشد.",
      );

      // 3. Verify Order status is cancelled
      const order = adminStore.memoryOrders.find((o) => o.id === orderId);
      expect(order?.status).toBe("cancelled");

      // 4. Verify Subscription status is cancelled_payment_rejected
      const sub = adminStore.memorySubscriptions.find((s) => s.orderId === orderId);
      expect(sub?.status).toBe("cancelled_payment_rejected");

      // 5. Verify Entitlement is expired / inactive (No Hard Delete)
      const ent = adminStore.memoryEntitlements.find((e) => e.orderId === orderId);
      expect(ent?.active).toBe(false);

      // 6. Conflict prevention: Trying to approve an already rejected payment fails
      await expect(
        adminService.approvePayment(adminUser.userId, paymentId),
      ).rejects.toThrow(DomainError);

      // 7. Idempotency: Repeating reject returns success
      const repeatReject = await adminService.rejectPayment(
        adminUser.userId,
        paymentId,
        "تکرار رد",
      );
      expect(repeatReject.success).toBe(true);
    });
  });
});
