import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asUserId,
  asCourseId,
  asModuleId,
  asLessonId,
  asProductId,
  asContentPackId,
  calculateDefaultContentPrice,
  calculateContentPricingBreakdown,
  type Actor,
} from "@avana/domain";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";

describe("Canonical Content Pricing & Fail-Closed Access Control Suite", () => {
  let commerceStore: InMemoryCommerceStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let contentPackStore: InMemoryContentPackStore;
  let entitlementService: EntitlementService;

  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "platform_admin",
    organizationId: "org-1",
  };

  const studentActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
    organizationId: "org-1",
  };

  beforeEach(() => {
    commerceStore = new InMemoryCommerceStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    contentPackStore = new InMemoryContentPackStore();

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      documentStore,
      flashcardStore,
      quizStore,
      contentPackStore,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Fail-Closed & Explicit Free Policy Tests
  // ---------------------------------------------------------------------------
  it("1.1 Fail-Closed: price=0 without explicitlyFree: true is NOT free (unpriced/accidental zero)", async () => {
    const courseId = asCourseId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const lessonId = asLessonId(randomUUID());

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس فیزیولوژی",
      contentType: "markdown",
      sortOrder: 0,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Product has price=0 and empty metadata (accidental zero)
    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس فیزیولوژی",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
      courseId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  it("1.2 Fail-Closed: adminPriced=true + price=0 without explicitlyFree: true is NOT free", async () => {
    const lessonId = asLessonId(randomUUID());

    await lessonStore.create({
      id: lessonId,
      title: "درس فارماکولوژی",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Admin set price=0 but explicitlyFree is false or missing
    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس فارماکولوژی",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: {
        adminPriced: true,
        adminPricedAt: new Date().toISOString(),
        explicitlyFree: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  it("1.3 Explicit Free: explicitlyFree=true + price=0 grants free access", async () => {
    const lessonId = asLessonId(randomUUID());

    await lessonStore.create({
      id: lessonId,
      title: "درس مقدماتی رایگان",
      contentType: "markdown",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس مقدماتی رایگان",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: {
        adminPriced: true,
        adminPricedAt: new Date().toISOString(),
        explicitlyFree: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("free");
  });

  it("1.4 Fail-Closed: Missing Product is NEVER free (even if first lesson sortOrder=0)", async () => {
    const moduleId = asModuleId(randomUUID());
    const lessonId = asLessonId(randomUUID());

    await moduleStore.create({
      id: moduleId,
      courseId: asCourseId(randomUUID()),
      title: "ماژول ۱",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس اول بدون محصول",
      contentType: "markdown",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  it("1.5 Fail-Closed: price=0 with missing/undefined metadata is NOT free", async () => {
    const lessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonId,
      title: "درس بدون متادیتا",
      contentType: "markdown",
      sortOrder: 2,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس بدون متادیتا",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: {} as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  // ---------------------------------------------------------------------------
  // 2. Admin Actions: Explicit Free vs Explicit Paid
  // ---------------------------------------------------------------------------
  it("2.1 Admin makes lesson explicitly Free -> sets explicitlyFree: true, price: 0", async () => {
    const lessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonId,
      title: "درس ژنتیک",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Admin explicitly sets price=0
    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس ژنتیک",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: {
        adminPriced: true,
        adminPricedAt: new Date().toISOString(),
        explicitlyFree: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });
    expect(access.granted).toBe(true);
    expect(access.reason).toBe("free");
  });

  it("2.2 Admin reverts lesson from Free to Paid -> sets explicitlyFree: false, price: > 0", async () => {
    const lessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonId,
      title: "درس بیوشیمی",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Step 1: Admin makes it Free
    const prod = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس بیوشیمی",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: {
        adminPriced: true,
        adminPricedAt: new Date().toISOString(),
        explicitlyFree: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Step 2: Admin sets it to 25,000 Tomans
    await commerceStore.updateProduct(prod.id, {
      price: 25000,
      metadata: {
        adminPriced: true,
        adminPricedAt: new Date().toISOString(),
        explicitlyFree: false,
      },
    });

    const dbProduct = await commerceStore.findProductByTarget("content", lessonId);
    expect(dbProduct?.price).toBe(25000);
    expect(dbProduct?.metadata?.explicitlyFree).toBe(false);
    expect(dbProduct?.metadata?.adminPriced).toBe(true);

    // Unsubscribed student is now locked
    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });
    expect(access.granted).toBe(false);
    expect(access.reason).toBe("locked");
  });

  // ---------------------------------------------------------------------------
  // 3. Subscription & Purchase Access Integrity
  // ---------------------------------------------------------------------------
  it("3.1 Active Subscription grants full access to paid lessons", async () => {
    const lessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonId,
      title: "درس پولی",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonId}`,
      type: "content",
      title: "درس پولی",
      description: "",
      price: 45000,
      currency: "toman",
      targetType: "content",
      targetId: lessonId,
      durationDays: null,
      active: true,
      metadata: { adminPriced: true, explicitlyFree: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Grant active subscription
    await commerceStore.grantEntitlement({
      id: "ent-sub-1" as any,
      userId: studentActor.userId,
      resourceType: "subscription",
      resourceId: null,
      sourceType: "purchase",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("subscription");
  });

  it("3.2 Direct Lesson Entitlement grants lifetime access", async () => {
    const lessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonId,
      title: "درس خریداری شده",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.grantEntitlement({
      id: "ent-les-1" as any,
      userId: studentActor.userId,
      resourceType: "content",
      resourceId: lessonId,
      sourceType: "purchase",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null, // Lifetime
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("content_purchase");
    expect(access.expiresAt).toBeNull();
  });

  it("3.3 Course Entitlement grants access to all lessons in course", async () => {
    const courseId = asCourseId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    const lessonId = asLessonId(randomUUID());

    await courseStore.create({
      course: {
        id: courseId,
        name: "دوره جامع داروشناسی",
        slug: "pharma-full",
        description: "",
        organizationId: "org-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "published",
        ownerUserId: asUserId(randomUUID()),
        deletedAt: null,
      } as any,
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل ۱",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس وابسته به دوره",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.grantEntitlement({
      id: "ent-crs-1" as any,
      userId: studentActor.userId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "purchase",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null, // Lifetime
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const access = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "lesson",
      resourceId: lessonId,
    });

    expect(access.granted).toBe(true);
    expect(access.reason).toBe("course_purchase");
  });

  // ---------------------------------------------------------------------------
  // 4. Content Pack Fail-Closed Pricing
  // ---------------------------------------------------------------------------
  it("4.1 Content Pack: accessType=free is free, accessType=paid requires purchase", async () => {
    const freePackId = asContentPackId(randomUUID());
    await contentPackStore.create({
      id: freePackId,
      title: "بسته رایگان",
      description: "",
      subject: "پزشکی",
      creatorUserId: asUserId(randomUUID()),
      status: "published",
      usageCount: 0,
      metadata: { accessType: "free" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      deletedAt: null,
      sourceDocumentId: null,
    }, []);

    const freeAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "content_pack",
      resourceId: freePackId,
    });
    expect(freeAccess.granted).toBe(true);
    expect(freeAccess.reason).toBe("free");

    const paidPackId = asContentPackId(randomUUID());
    await contentPackStore.create({
      id: paidPackId,
      title: "بسته پولی",
      description: "",
      subject: "پزشکی",
      creatorUserId: asUserId(randomUUID()),
      status: "published",
      usageCount: 0,
      metadata: { accessType: "paid" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      deletedAt: null,
      sourceDocumentId: null,
    }, []);

    const paidAccess = await entitlementService.checkAccess(studentActor, {
      userId: studentActor.userId,
      resourceType: "content_pack",
      resourceId: paidPackId,
    });
    expect(paidAccess.granted).toBe(false);
    expect(paidAccess.reason).toBe("locked");
  });

  // ---------------------------------------------------------------------------
  // 5. Canonical Pricing Formula & Breakdown Verification
  // ---------------------------------------------------------------------------
  it("5.1 Canonical pricing formula strictly matches business rules", () => {
    // Case 1: 1 lesson, 0 FC, 0 questions, no review summary = 1000
    expect(calculateDefaultContentPrice({ lessonCount: 1, flashcardCount: 0, questionCount: 0, hasReviewSummary: false })).toBe(1000);

    // Case 2: 1 lesson, 150 FC, 220 Questions, with Review Summary:
    // 1000 + ceil(150/100)*500 + ceil(220/100)*300 + 2000 = 1000 + 1000 + 900 + 2000 = 4900
    const breakdown = calculateContentPricingBreakdown({
      lessonCount: 1,
      flashcardCount: 150,
      questionCount: 220,
      hasReviewSummary: true,
    });
    expect(breakdown.lessonBasePrice).toBe(1000);
    expect(breakdown.flashcardPrice).toBe(1000);
    expect(breakdown.questionPrice).toBe(900);
    expect(breakdown.reviewSummaryPrice).toBe(2000);
    expect(breakdown.totalSuggestedPrice).toBe(4900);
  });
});
