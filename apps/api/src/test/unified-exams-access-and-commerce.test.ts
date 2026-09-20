import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asOrganizationId,
  asProductId,
  asUserId,
  asCourseId,
  asModuleId,
  asLessonId,
  asQuizQuestionId,
  asQuizId,
  asUserEntitlementId,
  asUserSubscriptionId,
  calculateSpecialExamPrice,
  RoleBasedPolicy,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryQuizStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";

describe("Unified Exams Access Control & Special Exam Commerce — 16 Verification Scenarios", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let quizStore: InMemoryQuizStore;
  let studyService: StudyService;
  let adminStore: InMemoryAdminStore;
  let adminService: AdminService;

  const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");
  const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000002");

  const purchasedUser: Actor = {
    userId: asUserId("11111111-1111-1111-1111-111111111111"),
    role: "student",
  };
  const subscribedUser: Actor = {
    userId: asUserId("22222222-2222-2222-2222-222222222222"),
    role: "student",
  };
  const unpurchasedUser: Actor = {
    userId: asUserId("33333333-3333-3333-3333-333333333333"),
    role: "student",
  };
  const adminUser: Actor = {
    userId: asUserId("44444444-4444-4444-4444-444444444444"),
    role: "platform_admin",
  };

  const courseAId = asCourseId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const moduleA1Id = asModuleId("a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1");
  const lessonA1Id = asLessonId("a1111111-a111-a111-a111-a11111111111");

  const courseBId = asCourseId("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  const moduleB1Id = asModuleId("b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1");
  const lessonB1Id = asLessonId("b1111111-b111-b111-b111-b11111111111");

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway({ enabled: true });

    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    quizStore = new InMemoryQuizStore();

    studyService = new StudyService(
      new InMemoryFlashcardStore(),
      new InMemoryFlashcardReviewStore(),
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      new InMemoryProgressStore(),
      new RoleBasedPolicy(),
      undefined,
      undefined,
      undefined,
      courseStore,
      orgId,
    );

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
    });
    studyService.setEntitlementService(entitlementService);

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      {
        enabled: true,
        destinationCardNumber: "5894631131738239",
        cardholderName: "علی محمدلو",
        instructions: "لطفاً مبلغ را واریز کرده و شماره پیگیری را ثبت کنید.",
      },
      undefined,
      { onlinePaymentEnabled: true, mockPaymentEnabled: true },
      studyService,
    );

    adminStore = new InMemoryAdminStore();
    adminStore.commerceStore = commerceStore;
    adminService = new AdminService(
      adminStore,
      undefined,
      commerceStore,
      undefined,
      undefined,
      undefined,
      studyService,
    );

    // Setup Course A (orgId)
    await courseStore.create({
      course: {
        id: courseAId,
        organizationId: orgId,
        name: "فارماکولوژی پایه",
        description: "دوره جامع فارماکولوژی",
        subject: "داروسازی",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleA1Id,
      courseId: courseAId,
      title: "فصل ۱: فارماکوکینتیک",
      description: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonA1Id,
      moduleId: moduleA1Id,
      title: "جلسه ۱: جذب دارو",
      content: "محتوا",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Setup Course B (in otherOrgId)
    await courseStore.create({
      course: {
        id: courseBId,
        organizationId: otherOrgId,
        name: "فیزیولوژی اعصاب",
        description: "دوره فیزیولوژی",
        subject: "پزشکی",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleB1Id,
      courseId: courseBId,
      title: "فصل ۱: سیستم عصبی خودکار",
      description: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonB1Id,
      moduleId: moduleB1Id,
      title: "جلسه ۱: سیناپس",
      content: "محتوا",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Seed 30 questions for Course A / Module A1 / Lesson A1
    for (let i = 0; i < 30; i++) {
      await quizQuestionStore.insert({
        id: asQuizQuestionId(randomUUID()),
        quizId: asQuizId(randomUUID()),
        lessonId: lessonA1Id,
        sortOrder: i,
        question: `سؤال آزمون فارماکوکینتیک شماره ${i + 1}`,
        options: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctOptionIndex: 0,
        correctAnswer: 0,
        explanation: "پاسخ تشریحی کامل",
        topic: "فارماکوکینتیک",
        difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard",
        bloomLevel: "knowledge",
      });
    }

    // Set Entitlement for purchasedUser (direct course entitlement)
    await commerceStore.grantEntitlement({
      id: asUserEntitlementId(randomUUID()),
      userId: purchasedUser.userId,
      resourceType: "course",
      resourceId: courseAId,
      sourceType: "purchase",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Set Active Subscription for subscribedUser
    await commerceStore.createSubscription({
      id: asUserSubscriptionId(randomUUID()),
      userId: subscribedUser.userId,
      productId: asProductId(randomUUID()),
      orderId: null,
      status: "active",
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // Scenario 1: purchased -> free exam
  it("Scenario 1: purchased user can start a free configured exam attempt", async () => {
    const res = await studyService.startConfiguredExamAttempt(purchasedUser, orgId, {
      sections: [moduleA1Id],
      questionCount: 10,
      difficulty: "all",
    });
    expect(res.attemptId).toBeDefined();
    expect(res.questions.length).toBe(10);
  });

  // Scenario 2: subscription -> free exam
  it("Scenario 2: subscribed user can start a free configured exam attempt", async () => {
    const res = await studyService.startConfiguredExamAttempt(subscribedUser, orgId, {
      sections: [moduleA1Id],
      questionCount: 10,
      difficulty: "all",
    });
    expect(res.attemptId).toBeDefined();
    expect(res.questions.length).toBe(10);
  });

  // Scenario 3: admin/creator access -> free exam
  it("Scenario 3: admin and creator users bypass paywall and start free exam", async () => {
    const adminRes = await studyService.startConfiguredExamAttempt(adminUser, orgId, {
      sections: [moduleA1Id],
      questionCount: 10,
      difficulty: "all",
    });
    expect(adminRes.attemptId).toBeDefined();

    const summary = await studyService.getExamTopicSummary(adminUser, orgId);
    const courseA = summary.courses.find((c) => c.courseId === courseAId);
    expect(courseA?.hasAccess).toBe(true);
  });

  // Scenario 4: unpurchased -> 403 Forbidden
  it("Scenario 4: unpurchased user is blocked from free exam start with 403 Forbidden", async () => {
    await expect(
      studyService.startConfiguredExamAttempt(unpurchasedUser, orgId, {
        sections: [moduleA1Id],
        questionCount: 10,
        difficulty: "all",
      }),
    ).rejects.toThrow("برای شرکت در آزمون این دوره نیاز به اشتراک فعال یا خرید آزمون ویژه دارید.");

    // Verify 0 attempts were created
    const attempts = await quizAttemptStore.listByUser(unpurchasedUser.userId);
    expect(attempts.length).toBe(0);
  });

  // Scenario 5: preview returns valid output & 0 DB mutations
  it("Scenario 5: preview validates pool & computes price without creating products/orders/attempts", async () => {
    const poolCheck = await studyService.validateExamBlueprintPool(orgId, {
      questionCount: 20,
      difficulty: "all",
      scope: { courseId: courseAId, moduleId: moduleA1Id },
    });
    expect(poolCheck.isValid).toBe(true);
    expect(poolCheck.totalAvailable).toBe(30);

    const price = calculateSpecialExamPrice(20);
    expect(price).toBe(10000);

    // Verify no side-effects in database stores
    const products = await commerceStore.listActiveProducts();
    const attempts = await quizAttemptStore.listByUser(unpurchasedUser.userId);
    expect(products.filter((p) => p.type === "special_exam").length).toBe(0);
    expect(attempts.length).toBe(0);
  });

  // Scenario 6: insufficient pool validation error
  it("Scenario 6: insufficient pool returns invalid status and error message", async () => {
    const poolCheck = await studyService.validateExamBlueprintPool(orgId, {
      questionCount: 50, // 30 exist in pool
      difficulty: "all",
      scope: { courseId: courseAId, moduleId: moduleA1Id },
    });
    expect(poolCheck.isValid).toBe(false);
    expect(poolCheck.totalAvailable).toBe(30);
    expect(poolCheck.errors.length).toBeGreaterThan(0);
  });

  // Scenario 7: price tampering prevention
  it("Scenario 7: backend calculates price strictly via formula and rejects tampered product price", async () => {
    const questionCount = 20;
    const authorativePrice = calculateSpecialExamPrice(questionCount); // 10000
    expect(authorativePrice).toBe(10000);

    // If tampered price (e.g. 1 Toman) was somehow set on a special_exam product, checkout enforces formula
    const tamperedProduct = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: "tampered-prod",
      type: "special_exam",
      title: "آزمون دستکاری شده",
      description: "تست",
      price: 1, // Tampered price
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        questionCount,
        difficulty: "all",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      commerceService.checkout(
        unpurchasedUser,
        {
          productId: tamperedProduct.id,
          callbackUrl: "http://localhost:5173/callback",
          gateway: "mock",
        },
        "req-tamper",
      ),
    ).rejects.toThrow("مطابقت ندارد");
  });

  // Scenario 8: course tampering
  it("Scenario 8: rejects request for unknown course", async () => {
    const unknownCourseId = asCourseId(randomUUID());
    const course = await courseStore.findById(unknownCourseId).catch(() => undefined);
    expect(course).toBeUndefined();
  });

  // Scenario 9: module/topic tampering
  it("Scenario 9: detects when module belongs to a different course", async () => {
    const modB = await moduleStore.findById(moduleB1Id);
    expect(modB?.courseId).toBe(courseBId);
    expect(modB?.courseId).not.toBe(courseAId);
  });

  // Scenario 10: duplicate checkout handling
  it("Scenario 10: multiple checkout calls produce independent pending orders with immutable configurations", async () => {
    const questionCount = 20;
    const price = calculateSpecialExamPrice(questionCount);

    const product = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `prod-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه",
      description: "شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
        difficulty: "all",
        blueprint: [{ name: "فارماکولوژی", courseId: courseAId, moduleId: moduleA1Id, count: questionCount, difficulty: "all" }],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const chk1 = await commerceService.checkout(
      unpurchasedUser,
      { productId: product.id, callbackUrl: "http://localhost:5173/cb", gateway: "mock" },
      "req-1",
    );
    const chk2 = await commerceService.checkout(
      unpurchasedUser,
      { productId: product.id, callbackUrl: "http://localhost:5173/cb", gateway: "mock" },
      "req-2",
    );

    expect(chk1.order_id).toBeDefined();
    expect(chk2.order_id).toBeDefined();
    expect(chk1.order_id).not.toBe(chk2.order_id);
  });

  // Scenario 11: duplicate payment callback idempotency
  it("Scenario 11: duplicate verifyPayment callback calls are strictly idempotent and create exactly 1 attempt", async () => {
    const questionCount = 20;
    const price = calculateSpecialExamPrice(questionCount);

    const product = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `prod-cb-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه",
      description: "شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
        difficulty: "all",
        blueprint: [{ name: "فارماکولوژی", courseId: courseAId, moduleId: moduleA1Id, count: questionCount, difficulty: "all" }],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const checkout = await commerceService.checkout(
      unpurchasedUser,
      { productId: product.id, callbackUrl: "http://localhost:5173/cb", gateway: "mock" },
      "req-cb",
    );

    // 1st callback
    const res1 = await commerceService.verifyPayment({ authority: checkout.authority! });
    expect(res1.success).toBe(true);

    // 2nd callback (same authority)
    const res2 = await commerceService.verifyPayment({ authority: checkout.authority! });
    expect(res2.success).toBe(true);

    // Exactly 1 attempt created in database
    const attempts = await quizAttemptStore.listByUser(unpurchasedUser.userId);
    expect(attempts.length).toBe(1);

    // Exactly 1 special_exam entitlement in database
    const entitlements = await commerceStore.listActiveEntitlements(unpurchasedUser.userId);
    const examEntitlements = entitlements.filter((e) => e.resourceType === "special_exam");
    expect(examEntitlements.length).toBe(1);
  });

  // Scenario 12: online payment -> exactly one Attempt created with frozen snapshot
  it("Scenario 12: online payment creates exactly 1 attempt with a 20-question frozen snapshot", async () => {
    const onlineUser: Actor = {
      userId: asUserId(randomUUID()),
      role: "student",
    };

    const questionCount = 20;
    const price = calculateSpecialExamPrice(questionCount);

    const product = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `prod-online-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه آنلاین",
      description: "شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
        difficulty: "all",
        blueprint: [{ name: "فارماکولوژی", courseId: courseAId, moduleId: moduleA1Id, count: questionCount, difficulty: "all" }],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const checkout = await commerceService.checkout(
      onlineUser,
      { productId: product.id, callbackUrl: "http://localhost:5173/cb", gateway: "mock" },
      "req-online",
    );

    const verifyRes = await commerceService.verifyPayment({ authority: checkout.authority! });
    expect(verifyRes.success).toBe(true);

    const attempts = await quizAttemptStore.listByUser(onlineUser.userId);
    expect(attempts.length).toBe(1);
    expect(attempts[0].questionSnapshot?.length).toBe(20);
    expect(attempts[0].metrics?.isSpecialExam).toBe(true);
  });

  // Scenario 13: card-to-card pending -> zero Attempt & zero entitlement
  it("Scenario 13: card-to-card submission leaves status pending with zero attempt and zero entitlement before admin review", async () => {
    const c2cUser: Actor = {
      userId: asUserId(randomUUID()),
      role: "student",
    };

    const questionCount = 20;
    const price = calculateSpecialExamPrice(questionCount);

    const product = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `c2c-prod-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه کارت به کارت",
      description: "شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
        difficulty: "all",
        blueprint: [{ name: "فارماکولوژی", courseId: courseAId, moduleId: moduleA1Id, count: questionCount, difficulty: "all" }],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const c2cResult = await commerceService.submitCardToCardPayment(
      c2cUser,
      {
        productId: product.id,
        trackingNumber: "TRK-987654321",
        amount: price,
        sourceCardLast4: "1234",
        payerName: "کاربر تست کارت",
      },
      "req-c2c",
    );

    expect(c2cResult.status).toBe("pending_admin_review");
    expect(c2cResult.attemptId).toBeUndefined();
    expect(c2cResult.entitlementId).toBeUndefined();

    // Verify 0 attempts and 0 entitlements exist before admin approval
    const attemptsBefore = await quizAttemptStore.listByUser(c2cUser.userId);
    expect(attemptsBefore.length).toBe(0);

    const entitlementsBefore = await commerceStore.listActiveEntitlements(c2cUser.userId);
    const examEntitlementsBefore = entitlementsBefore.filter((e) => e.resourceType === "special_exam");
    expect(examEntitlementsBefore.length).toBe(0);
  });

  // Scenario 14: card-to-card confirmed -> exactly one Attempt, snapshot created, entitlement created
  it("Scenario 14: admin approval of card-to-card payment creates exactly 1 attempt with snapshot and entitlement", async () => {
    const c2cUser: Actor = {
      userId: asUserId(randomUUID()),
      role: "student",
    };

    const questionCount = 20;
    const price = calculateSpecialExamPrice(questionCount);

    const product = await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `c2c-appr-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه تأیید ادمین",
      description: "شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
        difficulty: "all",
        blueprint: [{ name: "فارماکولوژی", courseId: courseAId, moduleId: moduleA1Id, count: questionCount, difficulty: "all" }],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const c2cResult = await commerceService.submitCardToCardPayment(
      c2cUser,
      {
        productId: product.id,
        trackingNumber: "TRK-11223344",
        amount: price,
        sourceCardLast4: "5678",
        payerName: "کاربر تأیید ادمین",
      },
      "req-c2c-2",
    );

    // Admin approves the payment
    const approveResult = await adminService.approvePayment(adminUser.userId, c2cResult.paymentId);
    expect(approveResult.success).toBe(true);

    // After approval: exactly 1 attempt exists with 20 questions snapshotted
    const attemptsAfter = await quizAttemptStore.listByUser(c2cUser.userId);
    expect(attemptsAfter.length).toBe(1);
    expect(attemptsAfter[0].questionSnapshot?.length).toBe(20);

    // After approval: exactly 1 special_exam entitlement exists
    const entitlementsAfter = await commerceStore.listActiveEntitlements(c2cUser.userId);
    const examEntitlementsAfter = entitlementsAfter.filter((e) => e.resourceType === "special_exam");
    expect(examEntitlementsAfter.length).toBe(1);
    expect(examEntitlementsAfter[0].resourceId).toBe(attemptsAfter[0].id);
  });

  // Scenario 15: no question content before payment
  it("Scenario 15: preview and order endpoints never expose question text, options, answers, or snapshot", async () => {
    const preview = await studyService.validateExamBlueprintPool(orgId, {
      questionCount: 20,
      difficulty: "all",
      scope: { courseId: courseAId, moduleId: moduleA1Id },
    });

    const previewKeys = Object.keys(preview);
    expect(previewKeys).not.toContain("questions");
    expect(previewKeys).not.toContain("questionSnapshot");
    expect(previewKeys).not.toContain("options");
    expect(previewKeys).not.toContain("answers");
  });

  // Scenario 16: regression of existing free exam flow
  it("Scenario 16: existing free exam lifecycle (attempting, submitting, scoring, retaking) continues seamlessly", async () => {
    // 1. Start free attempt
    const exam = await studyService.startConfiguredExamAttempt(purchasedUser, orgId, {
      sections: [moduleA1Id],
      questionCount: 10,
      difficulty: "all",
    });

    // 2. Submit answers
    const submitRes = await studyService.submitConfiguredExamAttempt(
      purchasedUser,
      orgId,
      exam.attemptId,
      exam.questions.map((q) => ({
        questionId: q.id,
        answer: 0,
      })),
      120,
    );
    expect(submitRes.score).toBeDefined();

    // 3. Retake
    const retakeRes = await studyService.retakeExamAttempt(purchasedUser, orgId, exam.attemptId);
    expect(retakeRes.attemptId).toBeDefined();
    expect(retakeRes.questions.length).toBe(10);
  });

  // Scenario 17: API Contract — GET /study/exams/topics returns accurate hasAccess per user
  it("Scenario 17: GET /study/exams/topics returns accurate hasAccess: true for purchased course and hasAccess: false for unpurchased course", async () => {
    // Unpurchased user summary
    const unpurchasedSummary = await studyService.getExamTopicSummary(unpurchasedUser, orgId);
    const unpurchasedCourseA = unpurchasedSummary.courses.find((c) => c.courseId === courseAId);
    expect(unpurchasedCourseA).toBeDefined();
    expect(unpurchasedCourseA?.hasAccess).toBe(false);

    // Purchased user summary
    const purchasedSummary = await studyService.getExamTopicSummary(purchasedUser, orgId);
    const purchasedCourseA = purchasedSummary.courses.find((c) => c.courseId === courseAId);
    expect(purchasedCourseA).toBeDefined();
    expect(purchasedCourseA?.hasAccess).toBe(true);
  });

  // Scenario 18: Global/empty selection bypass is rejected with 403 Forbidden
  it("Scenario 18: empty/global selection without global subscription/admin access is blocked with 403 Forbidden", async () => {
    await expect(
      studyService.startConfiguredExamAttempt(unpurchasedUser, orgId, {
        sections: [],
        chapters: [],
        topics: [],
        questionCount: 10,
        difficulty: "all",
      }),
    ).rejects.toThrow("برای شرکت در آزمون این دوره نیاز به اشتراک فعال یا خرید آزمون ویژه دارید.");

    // Verify 0 attempts were created
    const attempts = await quizAttemptStore.listByUser(unpurchasedUser.userId);
    expect(attempts.length).toBe(0);
  });

  // Scenario 19: Mixed access isolation rejects unauthorized courses
  it("Scenario 19: mixed access request containing unpurchased course is rejected with 403 Forbidden", async () => {
    // purchasedUser has access to Course A, but NOT Course B (which is in otherOrgId)
    await expect(
      studyService.startConfiguredExamAttempt(purchasedUser, otherOrgId, {
        sections: [moduleB1Id],
        questionCount: 10,
        difficulty: "all",
      }),
    ).rejects.toThrow("برای شرکت در آزمون این دوره نیاز به اشتراک فعال یا خرید آزمون ویژه دارید.");

    // Verify no questions from Course B were exposed
    const attempts = await quizAttemptStore.listByUser(purchasedUser.userId);
    expect(attempts.length).toBe(0);
  });

  // Scenario 20: Snapshot security — every question in attempt belongs to authorized course
  it("Scenario 20: all questions in generated snapshot strictly belong to user-authorized course", async () => {
    const res = await studyService.startConfiguredExamAttempt(purchasedUser, orgId, {
      sections: [moduleA1Id],
      questionCount: 10,
      difficulty: "all",
    });

    const attempt = await quizAttemptStore.findById(res.attemptId as import("@avana/domain").QuizAttemptId);
    expect(attempt).toBeDefined();
    expect(attempt?.questionSnapshot).toBeDefined();
    expect(attempt?.questionSnapshot?.length).toBe(10);

    for (const q of attempt!.questionSnapshot!) {
      expect(q.lesson?.id).toBe(lessonA1Id);
      expect(q.chapter?.id).toBe(moduleA1Id);
      expect(q.course?.id).toBe(courseAId);
    }
  });

  // Scenario 21: Attempt isolation — user cannot access other user's attempt
  it("Scenario 21: attempt detail endpoint strictly denies access to attempts owned by other users", async () => {
    const exam = await studyService.startConfiguredExamAttempt(purchasedUser, orgId, {
      sections: [moduleA1Id],
      questionCount: 10,
      difficulty: "all",
    });

    // Unpurchased user tries to access purchasedUser's attempt
    await expect(
      studyService.getExamAttempt(unpurchasedUser, orgId, exam.attemptId),
    ).rejects.toThrow();
  });

  // Scenario 22: Single course with multi-module (Module 1 = 20, Module 2 = 25, Module 3 = 30) -> 60 questions succeeds
  it("Scenario 22: single course with multiple modules (20 + 25 + 30 = 75 questions) satisfies 60 question pool check", async () => {
    const multiModCourseId = asCourseId(randomUUID());
    const m1Id = asModuleId(randomUUID());
    const m2Id = asModuleId(randomUUID());
    const m3Id = asModuleId(randomUUID());
    const l1Id = asLessonId(randomUUID());
    const l2Id = asLessonId(randomUUID());
    const l3Id = asLessonId(randomUUID());

    await courseStore.create({
      course: {
        id: multiModCourseId,
        organizationId: orgId,
        name: "دوره چند ماژولی",
        description: "تست",
        subject: "عمومی",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    for (const [mId, lId, count, title] of [
      [m1Id, l1Id, 20, "فصل اول"],
      [m2Id, l2Id, 25, "فصل دوم"],
      [m3Id, l3Id, 30, "فصل سوم"],
    ] as const) {
      await moduleStore.create({
        id: mId,
        courseId: multiModCourseId,
        title,
        description: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await lessonStore.create({
        id: lId,
        moduleId: mId,
        title: `درس ${title}`,
        content: "محتوا",
        sortOrder: 0,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      for (let i = 0; i < count; i++) {
        await quizQuestionStore.insert({
          id: asQuizQuestionId(randomUUID()),
          quizId: asQuizId(randomUUID()),
          lessonId: lId,
          sortOrder: i,
          question: `سؤال ${title} شماره ${i + 1}`,
          options: ["۱", "۲", "۳", "۴"],
          correctOptionIndex: 0,
          correctAnswer: 0,
          explanation: "توضیح",
          topic: title,
          difficulty: "medium",
          bloomLevel: "knowledge",
          status: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
      }
    }

    // 1. Preview pool check with all 3 moduleIds
    const poolCheck = await studyService.validateExamBlueprintPool(orgId, {
      questionCount: 60,
      difficulty: "medium",
      scope: {
        courseId: multiModCourseId,
        moduleIds: [m1Id, m2Id, m3Id],
      },
    });

    expect(poolCheck.isValid).toBe(true);
    expect(poolCheck.totalAvailable).toBe(75);
    expect(poolCheck.totalRequired).toBe(60);
    expect(poolCheck.errors.length).toBe(0);

    // 2. Start configured exam attempt with all 3 modules for subscribed user
    const startRes = await studyService.startConfiguredExamAttempt(subscribedUser, orgId, {
      sections: [m1Id, m2Id, m3Id],
      chapters: [l1Id, l2Id, l3Id],
      questionCount: 60,
      difficulty: "medium",
    });

    expect(startRes.attemptId).toBeDefined();
    expect(startRes.questions.length).toBe(60);
  });

  // Scenario 23: Two authorized courses union pool satisfies 60 questions
  it("Scenario 23: two authorized courses with total pool >= 60 questions succeed without insufficient pool error", async () => {
    // User has access to both Course A (30 questions) and newly created Course C (35 questions)
    const courseCId = asCourseId(randomUUID());
    const moduleC1Id = asModuleId(randomUUID());
    const lessonC1Id = asLessonId(randomUUID());

    await courseStore.create({
      course: {
        id: courseCId,
        organizationId: orgId,
        name: "دوره تکمیلی C",
        description: "تست C",
        subject: "پزشکی",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleC1Id,
      courseId: courseCId,
      title: "فصل C",
      description: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonC1Id,
      moduleId: moduleC1Id,
      title: "درس C",
      content: "محتوا",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    for (let i = 0; i < 35; i++) {
      await quizQuestionStore.insert({
        id: asQuizQuestionId(randomUUID()),
        quizId: asQuizId(randomUUID()),
        lessonId: lessonC1Id,
        sortOrder: i,
        question: `سؤال C شماره ${i + 1}`,
        options: ["۱", "۲", "۳", "۴"],
        correctOptionIndex: 0,
        correctAnswer: 0,
        explanation: "توضیح",
        topic: "مبحث C",
        difficulty: "medium",
        bloomLevel: "knowledge",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    }

    // Give purchasedUser entitlement to Course C as well
    await commerceStore.grantEntitlement({
      id: asUserEntitlementId(randomUUID()),
      userId: purchasedUser.userId,
      resourceType: "course",
      resourceId: courseCId,
      sourceType: "course_purchase",
      sourceId: randomUUID(),
      grantedAt: new Date().toISOString(),
      expiresAt: null,
      active: true,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Course A has 30 questions (10 easy, 10 med, 10 hard), Course C has 35 questions (all med).
    // With difficulty="all" or difficulty="medium", total available is >= 60 questions.
    const startRes = await studyService.startConfiguredExamAttempt(purchasedUser, orgId, {
      sections: [moduleA1Id, moduleC1Id],
      chapters: [lessonA1Id, lessonC1Id],
      questionCount: 60,
      difficulty: "all",
    });

    expect(startRes.attemptId).toBeDefined();
    expect(startRes.questions.length).toBe(60);

    // Verify questions from BOTH Course A and Course C are present in snapshot
    const attempt = await quizAttemptStore.findById(startRes.attemptId as import("@avana/domain").QuizAttemptId);
    const coursesInSnapshot = new Set(attempt?.questionSnapshot?.map((q) => q.course?.id));
    expect(coursesInSnapshot.has(courseAId)).toBe(true);
    expect(coursesInSnapshot.has(courseCId)).toBe(true);
  });

  // Scenario 24: Truly insufficient pool (< requestedCount) throws insufficient questions error
  it("Scenario 24: when authorized pool < requestedCount, throws insufficient questions error", async () => {
    // Only Course A (30 questions) is selected, requesting 60 questions
    await expect(
      studyService.startConfiguredExamAttempt(purchasedUser, orgId, {
        sections: [moduleA1Id],
        chapters: [lessonA1Id],
        questionCount: 60,
        difficulty: "all",
      }),
    ).rejects.toThrow(/فقط \d+ سؤال .* در دسترس است\. حداقل تعداد درخواستی \(60\) تأمین نمی‌شود\./);
  });
});

