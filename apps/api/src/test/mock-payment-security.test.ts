import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asCourseId,
  asOrderId,
  asPaymentId,
  asProductId,
  asUserId,
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

describe("Security & Payment Enforcement: Mock Gateway Disabled & Card-to-Card Sole Flow", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;
  let adminStore: InMemoryAdminStore;
  let adminService: AdminService;

  const testStudent: Actor = {
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
    instructions: "واریز به کارت و ثبت ۴ رقم آخر و شماره پیگیری.",
  };

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    // Default MockPaymentGateway has enabled = false
    mockGateway = new MockPaymentGateway();

    // Default CommerceService has onlinePaymentEnabled = false, mockPaymentEnabled = false
    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      c2cConfig,
      { onlinePaymentEnabled: false, mockPaymentEnabled: false },
    );

    const courseStore = new InMemoryCourseStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const contentPackStore = new InMemoryContentPackStore();

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      contentPackStore,
    });

    adminStore = new InMemoryAdminStore();
    adminService = new AdminService(adminStore);
  });

  describe("1. Mock Payment Gateway Hard Disablement", () => {
    it("MockPaymentGateway defaults to disabled and rejects requestPayment", async () => {
      expect(mockGateway.enabled).toBe(false);

      await expect(
        mockGateway.requestPayment({
          amount: 100000,
          orderId: "ord-test",
          orderNumber: "ORD-001",
          callbackUrl: "https://avana.ir/cb",
        }),
      ).rejects.toThrow("درگاه پرداخت آزمایشی (Mock) غیرفعال است.");
    });

    it("MockPaymentGateway returns failure on verifyPayment when disabled", async () => {
      const verifyResult = await mockGateway.verifyPayment({
        authority: "mock_auth_test_123",
        amount: 100000,
      });

      expect(verifyResult.success).toBe(false);
      expect(verifyResult.errorMessage).toContain("درگاه پرداخت آزمایشی (Mock) غیرفعال است.");
    });
  });

  describe("2. CommerceService Backend Fail-Closed Security", () => {
    it("blocks checkout API attempts directly with DomainError bad_request", async () => {
      const products = await commerceService.listActiveProducts();
      const monthlyProduct = products.find((p) => p.code === "sub_monthly")!;

      await expect(
        commerceService.checkout(
          testStudent,
          {
            productId: monthlyProduct.id,
            gateway: "mock",
            callbackUrl: "https://avana.ir/cb",
          },
          "req-sec-1",
        ),
      ).rejects.toThrow("درگاه پرداخت آزمایشی (Mock) غیرفعال است.");

      // Check that NO order or payment was created
      const myOrders = await commerceStore.listOrdersByUser(testStudent.userId);
      expect(myOrders).toHaveLength(0);
    });

    it("blocks online gateway checkout attempts when online payments are coming soon", async () => {
      const products = await commerceService.listActiveProducts();
      const monthlyProduct = products.find((p) => p.code === "sub_monthly")!;

      await expect(
        commerceService.checkout(
          testStudent,
          {
            productId: monthlyProduct.id,
            gateway: "zarinpal",
            callbackUrl: "https://avana.ir/cb",
          },
          "req-sec-2",
        ),
      ).rejects.toThrow("درگاه پرداخت آنلاین در حال حاضر در دسترس نیست (به‌زودی)");
    });

    it("blocks direct verifyPayment calls with mock authority and issues NO entitlements", async () => {
      const products = await commerceService.listActiveProducts();
      const monthlyProduct = products.find((p) => p.code === "sub_monthly")!;

      const orderId = asOrderId(randomUUID() as any);
      const paymentId = asPaymentId(randomUUID() as any);

      await commerceStore.createOrder({
        id: orderId,
        orderNumber: "ORD-SEC-01",
        userId: testStudent.userId,
        productId: monthlyProduct.id,
        amount: monthlyProduct.price,
        currency: "toman",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await commerceStore.createPayment({
        id: paymentId,
        orderId,
        amount: monthlyProduct.price,
        currency: "toman",
        gateway: "mock",
        authority: "mock_auth_fake_bypass",
        status: "pending",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await commerceService.verifyPayment(
        {
          authority: "mock_auth_fake_bypass",
          status: "OK",
        },
        "req-sec-3",
      );

      expect(result.success).toBe(false);
      expect(result.error_message).toContain("غیرفعال");

      // Verify order remains NOT paid
      const order = await commerceStore.findOrderById(orderId);
      expect(order?.status).not.toBe("paid");

      // Verify NO entitlement was issued to the user
      const entitlements = await commerceStore.listActiveEntitlements(testStudent.userId);
      expect(entitlements).toHaveLength(0);

      // Verify NO active subscription exists
      const sub = await commerceStore.findActiveSubscription(testStudent.userId);
      expect(sub).toBeNull();
    });
  });

  describe("3. Card-to-Card is the Exclusive Active Purchase Path", () => {
    it("successfully purchases Course via Card-to-Card and grants lifetime access", async () => {
      const courseId = asCourseId(randomUUID() as any);
      const courseProductId = asProductId(randomUUID() as any);

      await commerceStore.createProduct({
        id: courseProductId,
        code: "course-cardio-101",
        type: "course",
        title: "دوره جامع قلب و عروق",
        description: "",
        price: 250000,
        currency: "toman",
        targetType: "course",
        targetId: courseId,
        durationDays: null,
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Submit Card-to-Card
      const c2cResult = await commerceService.submitCardToCardPayment(
        testStudent,
        {
          productId: courseProductId,
          amount: 250000,
          trackingNumber: "TRK-SEC-COURSE-01",
          sourceCardLast4: "6037",
        },
        "req-sec-c2c-1",
      );

      expect(c2cResult.success).toBe(true);
      expect(c2cResult.status).toBe("pending_admin_review");
      expect(c2cResult.entitlementId).toBeDefined();

      // Entitlement Service immediately grants access!
      const access = await entitlementService.checkAccess(testStudent, {
        userId: testStudent.userId,
        resourceType: "course",
        resourceId: courseId,
      });

      expect(access.granted).toBe(true);
      expect(access.reason).toBe("course_purchase");
    });
  });
});
