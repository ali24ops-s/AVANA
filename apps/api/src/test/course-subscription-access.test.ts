import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asCourseId,
  asOrganizationId,
  asProductId,
  asUserId,
  asUserSubscriptionId,
  asUserEntitlementId,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { PreviewResolver } from "../modules/commerce/preview-resolver.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";

describe("Course Access & Subscription Logic Suite", () => {
  let commerceStore: InMemoryCommerceStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let contentPackStore: InMemoryContentPackStore;
  let entitlementService: EntitlementService;

  const orgId = asOrganizationId(randomUUID());
  const courseId = asCourseId(randomUUID());
  const excludedCourseId = asCourseId(randomUUID());
  const freeCourseId = asCourseId(randomUUID());

  beforeEach(() => {
    commerceStore = new InMemoryCommerceStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    contentPackStore = new InMemoryContentPackStore();

    const previewResolver = new PreviewResolver({
      lessonStore,
      quizStore: new InMemoryQuizStore(),
      flashcardStore: new InMemoryFlashcardStore(),
      documentStore: new InMemoryDocumentStore(),
      commerceStore,
      courseStore,
    });

    entitlementService = new EntitlementService(
      {
        commerceStore,
        courseStore,
        moduleStore,
        lessonStore,
        contentPackStore,
        flashcardStore: new InMemoryFlashcardStore(),
        quizStore: new InMemoryQuizStore(),
        documentStore: new InMemoryDocumentStore(),
      },
      previewResolver,
    );

    // Setup Courses in courseStore
    courseStore.courses.set(courseId, {
      id: courseId,
      organizationId: orgId,
      name: "دوره جامع بیوشیمی",
      subject: "پزشکی",
      targetAcademicFields: ["medicine"],
      examDate: null,
      examScope: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    courseStore.courses.set(excludedCourseId, {
      id: excludedCourseId,
      organizationId: orgId,
      name: "کارگاه تخصصی جراحی پیشرفته",
      subject: "جراحی",
      targetAcademicFields: ["surgery"],
      examDate: null,
      examScope: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    courseStore.courses.set(freeCourseId, {
      id: freeCourseId,
      organizationId: orgId,
      name: "آشنایی با اصول یادگیری",
      subject: "عمومی",
      targetAcademicFields: [],
      examDate: null,
      examScope: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Setup Products in commerceStore
    // 1. Standard Paid Course Product (included in subscription)
    commerceStore.products.push({
      id: asProductId("prod-course-1"),
      type: "course",
      code: "course_biochem",
      title: "دوره بیوشیمی",
      description: "دسترسی کامل",
      price: 150000,
      currency: "toman",
      durationDays: null,
      targetType: "course",
      targetId: courseId,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Subscription-Excluded Course Product (requires direct purchase)
    commerceStore.products.push({
      id: asProductId("prod-course-excluded"),
      type: "course",
      code: "course_surgery",
      title: "کارگاه جراحی پیشرفته",
      description: "دسترسی فقط با خرید مستقل",
      price: 500000,
      currency: "toman",
      durationDays: null,
      targetType: "course",
      targetId: excludedCourseId,
      active: true,
      metadata: { subscriptionExcluded: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 3. Free Course Product (explicitlyFree)
    commerceStore.products.push({
      id: asProductId("prod-course-free"),
      type: "course",
      code: "course_intro",
      title: "آشنایی با یادگیری",
      description: "دوره کاملا رایگان",
      price: 0,
      currency: "toman",
      durationDays: null,
      targetType: "course",
      targetId: freeCourseId,
      active: true,
      metadata: { explicitlyFree: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  it("State 1: Active subscription grants course access with reason='subscription'", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    // Create active subscription
    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: "plan-monthly",
      status: "active",
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      autoRenew: false,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("subscription");
    expect(access.availablePurchaseOptions).toHaveLength(0);
  });

  it("State 2: User previously bought the course directly (lifetime) — granted with reason='course_purchase'", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    // No active subscription, but has direct course entitlement
    commerceStore.entitlements.push({
      id: asUserEntitlementId(randomUUID()),
      userId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "order",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null, // lifetime
      createdAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("course_purchase");
  });

  it("State 3: Unsubscribed & unpurchased paid course — access denied (locked) with purchase options", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
    expect(access.availablePurchaseOptions.some((opt) => opt.productId === asProductId("prod-course-1"))).toBe(true);
  });

  it("State 4: Free course — access granted with reason='free'", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: freeCourseId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("free");
  });

  it("State 5: Expired subscription without direct purchase — locked", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    // Expired subscription
    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: "plan-monthly",
      status: "expired",
      startsAt: new Date(Date.now() - 86400000 * 60).toISOString(),
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
      autoRenew: false,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  it("State 5b: Expired subscription WITH direct course purchase preserves lifetime access", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    // Expired subscription
    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: "plan-monthly",
      status: "expired",
      startsAt: new Date(Date.now() - 86400000 * 60).toISOString(),
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
      autoRenew: false,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Independent course entitlement
    commerceStore.entitlements.push({
      id: asUserEntitlementId(randomUUID()),
      userId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "order",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("course_purchase");
  });

  it("Subscription-Excluded course requires direct purchase even when subscription is active", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    // Active subscription
    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: "plan-monthly",
      status: "active",
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      autoRenew: false,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Access to excludedCourseId should NOT be granted by subscription
    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: excludedCourseId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
    expect(access.availablePurchaseOptions.some((o) => o.productId === asProductId("prod-course-excluded"))).toBe(true);

    // If purchased directly, access is granted
    commerceStore.entitlements.push({
      id: asUserEntitlementId(randomUUID()),
      userId,
      resourceType: "course",
      resourceId: excludedCourseId,
      sourceType: "order",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
    });

    const accessAfterPurchase = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: excludedCourseId,
    });

    expect(accessAfterPurchase.granted).toBe(true);
    expect(accessAfterPurchase.reason).toBe("course_purchase");
  });

  it("State 6: Active pending review card-to-card subscription grants course access before admin approval", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: "plan-monthly",
      status: "active_pending_payment_review",
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      autoRenew: false,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("subscription");
  });

  it("State 7: Admin rejected payment transitions to cancelled_payment_rejected and immediately revokes access", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    // Sub is cancelled_payment_rejected
    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: "plan-monthly",
      status: "cancelled_payment_rejected",
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date().toISOString(),
      autoRenew: false,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  it("State 8: Subscription granted via gift / referral entitlement grants course access without any payment record", async () => {
    const userId = asUserId(randomUUID());
    const actor: Actor = { userId, role: "member" };

    commerceStore.entitlements.push({
      id: asUserEntitlementId(randomUUID()),
      userId,
      resourceType: "subscription",
      resourceId: null,
      sourceType: "gift",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      createdAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(actor, {
      userId,
      resourceType: "course",
      resourceId: courseId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("subscription");
  });
});
