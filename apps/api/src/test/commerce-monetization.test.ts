import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type ContentPackId,
  type CourseId,
  type LessonId,
  type ModuleId,
  type ProductId,
  type UserId,
  asContentPackId,
  asCourseId,
  asLessonId,
  asModuleId,
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

describe("AVANA Monetization & Commerce Engine", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let contentPackStore: InMemoryContentPackStore;

  const testUser: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  beforeEach(() => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway({ enabled: true });
    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { onlinePaymentEnabled: true, mockPaymentEnabled: true },
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
  });

  describe("1. Product Catalog & Pricing", () => {
    it("lists default standard subscription products with integer Toman pricing", async () => {
      const products = await commerceService.listActiveProducts();
      expect(products.length).toBe(3);

      const monthly = products.find((p) => p.code === "sub_monthly");
      const quarterly = products.find((p) => p.code === "sub_quarterly");
      const yearly = products.find((p) => p.code === "sub_yearly");

      expect(monthly).toBeDefined();
      expect(monthly!.price).toBe(99000);
      expect(monthly!.currency).toBe("toman");
      expect(monthly!.durationDays).toBe(30);

      expect(quarterly).toBeDefined();
      expect(quarterly!.price).toBe(199000);
      expect(quarterly!.currency).toBe("toman");
      expect(quarterly!.durationDays).toBe(90);

      expect(yearly).toBeDefined();
      expect(yearly!.price).toBe(599000);
      expect(yearly!.currency).toBe("toman");
      expect(yearly!.durationDays).toBe(365);
    });
  });

  describe("2. Checkout & Idempotent Payment Flow", () => {
    it("successfully creates pending order, pending payment, and returns gateway URL", async () => {
      const monthlyProduct = (await commerceService.listActiveProducts())[0];
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: monthlyProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-1",
      );

      expect(checkoutRes.order_id).toBeDefined();
      expect(checkoutRes.payment_id).toBeDefined();
      expect(checkoutRes.authority).toContain("mock_auth_");
      expect(checkoutRes.payment_url).toContain(checkoutRes.authority);

      const order = await commerceStore.findOrderById(checkoutRes.order_id);
      expect(order?.status).toBe("pending");
      expect(order?.amount).toBe(99000);

      const payment = await commerceStore.findPaymentById(checkoutRes.payment_id);
      expect(payment?.status).toBe("pending");
      expect(payment?.authority).toBe(checkoutRes.authority);
    });

    it("verifies payment, provisions subscription, and grants active entitlement", async () => {
      const monthlyProduct = (await commerceService.listActiveProducts())[0];
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: monthlyProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-2",
      );

      const verifyRes = await commerceService.verifyPayment(
        {
          authority: checkoutRes.authority,
          status: "OK",
        },
        "req-2-verify",
      );

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.transaction_id).toBeDefined();
      expect(verifyRes.subscription?.id).toBeDefined();
      expect(verifyRes.entitlement?.resource_type).toBe("subscription");
      expect(verifyRes.entitlement?.resource_id).toBeNull();
      expect(verifyRes.entitlement?.expires_at).toBeDefined();

      // Check DB records
      const order = await commerceStore.findOrderById(checkoutRes.order_id);
      expect(order?.status).toBe("paid");

      const payment = await commerceStore.findPaymentById(checkoutRes.payment_id);
      expect(payment?.status).toBe("paid");
      expect(payment?.transactionId).toBe(verifyRes.transaction_id);

      const sub = await commerceStore.findActiveSubscription(testUser.userId);
      expect(sub).toBeDefined();
      expect(sub?.status).toBe("active");

      const ent = await commerceStore.findActiveEntitlement(
        testUser.userId,
        "subscription",
      );
      expect(ent).toBeDefined();
    });

    it("is strictly idempotent: duplicate verification returns existing state without creating duplicate records", async () => {
      const monthlyProduct = (await commerceService.listActiveProducts())[0];
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: monthlyProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-3",
      );

      const verifyRes1 = await commerceService.verifyPayment(
        {
          authority: checkoutRes.authority,
          status: "OK",
        },
        "req-3-verify-1",
      );

      // Repeat verification (e.g. browser refresh / retry)
      const verifyRes2 = await commerceService.verifyPayment(
        {
          authority: checkoutRes.authority,
          status: "OK",
        },
        "req-3-verify-2",
      );

      expect(verifyRes1.success).toBe(true);
      expect(verifyRes2.success).toBe(true);
      expect(verifyRes2.transaction_id).toBe(verifyRes1.transaction_id);

      // Confirm only 1 subscription and 1 entitlement exist
      const subs = await commerceStore.listSubscriptionsByUser(testUser.userId);
      expect(subs.length).toBe(1);

      const ents = await commerceStore.listActiveEntitlements(testUser.userId);
      expect(ents.length).toBe(1);
    });

    it("handles cancelled / failed gateway callbacks cleanly", async () => {
      const monthlyProduct = (await commerceService.listActiveProducts())[0];
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: monthlyProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-4",
      );

      const verifyRes = await commerceService.verifyPayment(
        {
          authority: checkoutRes.authority,
          status: "NOK",
        },
        "req-4-verify",
      );

      expect(verifyRes.success).toBe(false);
      expect(verifyRes.error_message).toContain("لغو شد");

      const order = await commerceStore.findOrderById(checkoutRes.order_id);
      expect(order?.status).toBe("cancelled");

      const sub = await commerceStore.findActiveSubscription(testUser.userId);
      expect(sub).toBeNull();
    });

    it("rejects checkout and verification when mock gateway is globally disabled (production mode)", async () => {
      const disabledService = new CommerceService(
        commerceStore,
        new MockPaymentGateway({ enabled: false }),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { onlinePaymentEnabled: false, mockPaymentEnabled: false },
      );
      const monthlyProduct = (await commerceService.listActiveProducts())[0];
      await expect(
        disabledService.checkout(
          testUser,
          { productId: monthlyProduct.id, callbackUrl: "https://app.avana.ai/cb" },
          "req-disabled",
        ),
      ).rejects.toThrow("غیرفعال است");

      const order = await commerceStore.createOrder({
        id: `ord-dis-${Date.now()}` as any,
        orderNumber: "ORD-DIS-01",
        userId: testUser.userId,
        productId: monthlyProduct.id,
        amount: monthlyProduct.price,
        currency: "toman",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await commerceStore.createPayment({
        id: `pay-dis-${Date.now()}` as any,
        orderId: order.id,
        amount: monthlyProduct.price,
        currency: "toman",
        gateway: "mock",
        authority: "mock_auth_test",
        status: "pending",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const verifyRes = await disabledService.verifyPayment(
        { authority: "mock_auth_test", status: "OK" },
        "req-verify-disabled",
      );
      expect(verifyRes.success).toBe(false);
      expect(verifyRes.error_message).toContain("غیرفعال است");
    });
  });

  describe("3. Centralized Entitlement & Paywall Engine", () => {
    it("returns locked decision with available purchase options for unentitled user", async () => {
      const courseId = asCourseId(randomUUID() as any);
      const decision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
      expect(decision.availablePurchaseOptions.length).toBeGreaterThanOrEqual(3);
      expect(
        decision.availablePurchaseOptions.some(
          (opt) => opt.code === "sub_monthly",
        ),
      ).toBe(true);
    });

    it("grants access when user has an active subscription", async () => {
      const courseId = asCourseId(randomUUID() as any);

      // Give user active subscription
      const monthlyProduct = (await commerceService.listActiveProducts())[0];
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: monthlyProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-sub-grant",
      );
      await commerceService.verifyPayment(
        { authority: checkoutRes.authority, status: "OK" },
        "req-sub-verify",
      );

      const decision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("subscription");
      expect(decision.expiresAt).toBeDefined();
    });

    it("locks access when subscription is expired", async () => {
      const courseId = asCourseId(randomUUID() as any);

      // Create an expired subscription & entitlement manually
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      await commerceStore.createSubscription({
        id: asUserId(randomUUID() as any) as any,
        userId: testUser.userId,
        productId: asProductId(randomUUID() as any),
        orderId: null,
        status: "active",
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        expiresAt: pastDate,
        createdAt: pastDate,
        updatedAt: pastDate,
      });

      await commerceStore.grantEntitlement({
        id: asUserId(randomUUID() as any) as any,
        userId: testUser.userId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: null,
        startsAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        expiresAt: pastDate,
        createdAt: pastDate,
        updatedAt: pastDate,
      });

      const decision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
    });

    it("grants permanent lifetime access when user buys a Content Pack (expiresAt = null)", async () => {
      const packId = asContentPackId(randomUUID() as any);

      // Create product for Content Pack
      const packProduct = await commerceStore.createProduct({
        id: asProductId(randomUUID() as any),
        code: `pack_${packId}`,
        type: "content_pack",
        title: "بسته فارماکولوژی بالینی",
        description: "بسته جامع ۴ محتوایی",
        price: 49000,
        currency: "toman",
        targetType: "content_pack",
        targetId: packId,
        durationDays: null, // Lifetime
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Buy pack
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: packProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-pack-buy",
      );
      await commerceService.verifyPayment(
        { authority: checkoutRes.authority, status: "OK" },
        "req-pack-verify",
      );

      // Check access for pack directly
      const decision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "content_pack",
        resourceId: packId,
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("content_pack_purchase");
      expect(decision.expiresAt).toBeNull(); // Permanent Lifetime Ownership
    });

    it("dynamic course purchase grants permanent access to all existing and future modules/lessons in that course", async () => {
      const courseId = asCourseId(randomUUID() as any);

      // Create course product
      const courseProduct = await commerceStore.createProduct({
        id: asProductId(randomUUID() as any),
        code: `course_${courseId}`,
        type: "course",
        title: "دوره جامع فیزیولوژی پزشکی",
        description: "دسترسی مادام‌العمر به تمام مباحث",
        price: 350000,
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

      // User buys course
      const checkoutRes = await commerceService.checkout(
        testUser,
        {
          productId: courseProduct.id,
          callbackUrl: "https://app.avana.ai/checkout/callback",
        },
        "req-course-buy",
      );
      await commerceService.verifyPayment(
        { authority: checkoutRes.authority, status: "OK" },
        "req-course-verify",
      );

      // Check course access
      const courseDecision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      expect(courseDecision.granted).toBe(true);
      expect(courseDecision.reason).toBe("course_purchase");
      expect(courseDecision.expiresAt).toBeNull();

      // Setup a Module and Lesson under this course in stores
      const moduleId = asModuleId(randomUUID() as any);
      await moduleStore.create({
        id: moduleId,
        courseId,
        documentId: null,
        title: "مبحث سیستم قلبی-عروقی",
        description: "شرح پودمان",
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const lessonId = asLessonId(randomUUID() as any);
      await lessonStore.create({
        id: lessonId,
        moduleId,
        title: "درس اول: ساختار میوکارد",
        contentType: "markdown",
        contentMarkdown: "# محتوای پرمیوم درس",
        sortOrder: 0,
        estimatedMinutes: 15,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Check lesson access (runtime hierarchy should resolve lesson -> module -> course and grant access)
      const lessonDecision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "lesson",
        resourceId: lessonId,
      });

      expect(lessonDecision.granted).toBe(true);
      expect(lessonDecision.reason).toBe("course_purchase");
      expect(lessonDecision.expiresAt).toBeNull();

      // Later, an instructor adds a brand new lesson to this course
      const newLessonId = asLessonId(randomUUID() as any);
      await lessonStore.create({
        id: newLessonId,
        moduleId,
        title: "درس دوم: هدایت الکتریکی قلب",
        contentType: "markdown",
        contentMarkdown: "# محتوای جدید اضافه شده سال بعد",
        sortOrder: 1,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // User automatically receives access at runtime without backfill!
      const newLessonDecision = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "lesson",
        resourceId: newLessonId,
      });

      expect(newLessonDecision.granted).toBe(true);
      expect(newLessonDecision.reason).toBe("course_purchase");
      expect(newLessonDecision.expiresAt).toBeNull();
    });
  });
});
