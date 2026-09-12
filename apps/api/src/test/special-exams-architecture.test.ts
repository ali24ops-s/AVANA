import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asOrganizationId,
  asProductId,
  asUserId,
  asQuizAttemptId,
  asUserEntitlementId,
  calculateSpecialExamPrice,
  SPECIAL_EXAM_PRICE_PER_QUESTION,
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
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import { LibraryService } from "../modules/library/library-service.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";

describe("Special Exams Architecture & Monetization Engine", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;

  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let quizStore: InMemoryQuizStore;
  let studyService: StudyService;

  let libraryService: LibraryService;

  const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");
  const testUser: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
  };
  const anotherUser: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
  };

  beforeEach(() => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway({ enabled: true });

    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    quizStore = new InMemoryQuizStore();

    studyService = new StudyService(
      new InMemoryFlashcardStore(),
      new InMemoryFlashcardReviewStore(),
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      new InMemoryModuleStore(),
      new InMemoryLessonStore(),
      new InMemoryProgressStore(),
      new RoleBasedPolicy(),
    );

    entitlementService = new EntitlementService({
      commerceStore,
    });
    studyService.setEntitlementService(entitlementService);

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { onlinePaymentEnabled: true, mockPaymentEnabled: true },
      studyService,
    );

    libraryService = new LibraryService(
      new InMemoryContentPackStore(),
      undefined as any,
      new InMemoryDocumentStore(),
      new InMemoryGeneratedContentStore(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      entitlementService,
      commerceStore,
      orgId,
    );
  });

  // Seed question bank pool helper
  const seedQuestions = async (count: number, topic: string) => {
    for (let i = 0; i < count; i++) {
      quizQuestionStore.insert({
        id: randomUUID() as any,
        quizId: randomUUID() as any,
        sortOrder: i,
        question: `سؤال شماره ${i + 1} از مبحث ${topic}`,
        options: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctOptionIndex: 0,
        correctAnswer: 0,
        explanation: "پاسخ تشریحی کامل",
        topic,
        difficulty: "medium",
        bloomLevel: "knowledge",
      } as any);
    }
  };

  describe("1. Authoritative Pricing Formula", () => {
    it("calculates price correctly with 500 Tomans per question", () => {
      expect(SPECIAL_EXAM_PRICE_PER_QUESTION).toBe(500);
      expect(calculateSpecialExamPrice(20)).toBe(10_000);
      expect(calculateSpecialExamPrice(50)).toBe(25_000);
      expect(calculateSpecialExamPrice(80)).toBe(40_000);
      expect(calculateSpecialExamPrice(100)).toBe(50_000);
    });

    it("rejects checkout when product price does not match questionCount * 500", async () => {
      const productId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: productId,
        code: "tampered-price-exam",
        type: "special_exam",
        title: "آزمون با قیمت دستکاری شده",
        price: 15_000, // Invalid: should be 80 * 500 = 40_000
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          questionCount: 80,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await expect(
        commerceService.checkout(testUser, {
          productId,
        }),
      ).rejects.toThrow("قیمت آزمون ویژه");
    });
  });

  describe("2. Pool Sufficiency Validation", () => {
    it("validates pool sufficiency successfully when enough questions exist", async () => {
      await seedQuestions(30, "فارماکوکینتیک");
      await seedQuestions(30, "فارماکودینامیک");

      const check = await studyService.validateExamBlueprintPool(orgId, {
        questionCount: 40,
        blueprint: [
          { name: "فارماکوکینتیک", topic: "فارماکوکینتیک", count: 20 },
          { name: "فارماکودینامیک", topic: "فارماکودینامیک", count: 20 },
        ],
      });

      expect(check.isValid).toBe(true);
      expect(check.errors.length).toBe(0);
      expect(check.totalRequired).toBe(40);
      expect(check.totalAvailable).toBe(60);
    });

    it("reports errors and fails validation when pool is insufficient without silent fallback", async () => {
      await seedQuestions(5, "سم‌شناسی بالینی");

      const check = await studyService.validateExamBlueprintPool(orgId, {
        questionCount: 20,
        blueprint: [
          { name: "سم‌شناسی بالینی", topic: "سم‌شناسی بالینی", count: 20 },
        ],
      });

      expect(check.isValid).toBe(false);
      expect(check.errors.length).toBeGreaterThan(0);
      expect(check.errors[0]).toContain("سم‌شناسی بالینی");
    });

    it("strictly enforces exact blueprint distribution (8 from A, 7 from B, 5 from C) with no duplicates", async () => {
      await seedQuestions(15, "مبحث الف");
      await seedQuestions(15, "مبحث ب");
      await seedQuestions(15, "مبحث ج");

      const productId = asProductId(randomUUID());
      const product = await commerceStore.createProduct({
        id: productId,
        code: "multi-blueprint-exam",
        type: "special_exam",
        title: "آزمون چند مبحثی",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          questionCount: 20,
          blueprint: [
            { name: "مبحث الف", topic: "مبحث الف", count: 8 },
            { name: "مبحث ب", topic: "مبحث ب", count: 7 },
            { name: "مبحث ج", topic: "مبحث ج", count: 5 },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const { attempt, questions } = await studyService.createSpecialExamAttempt(
        testUser,
        orgId,
        product,
      );

      expect(questions.length).toBe(20);
      expect(attempt.questionSnapshot?.length).toBe(20);

      // Verify exact quotas per topic
      const topicACount = questions.filter((q) => q.topic === "مبحث الف").length;
      const topicBCount = questions.filter((q) => q.topic === "مبحث ب").length;
      const topicCCount = questions.filter((q) => q.topic === "مبحث ج").length;

      expect(topicACount).toBe(8);
      expect(topicBCount).toBe(7);
      expect(topicCCount).toBe(5);

      // Verify no duplicate question IDs
      const uniqueIds = new Set(questions.map((q) => q.id));
      expect(uniqueIds.size).toBe(20);
    });

    it("rejects attempt creation when a topic is deficient without cross-topic borrowing", async () => {
      await seedQuestions(20, "مبحث کافی ۱");
      await seedQuestions(4, "مبحث کسری ۲"); // Only 4, needs 7!
      await seedQuestions(20, "مبحث کافی ۳");

      const productId = asProductId(randomUUID());
      const product = await commerceStore.createProduct({
        id: productId,
        code: "deficient-blueprint-exam",
        type: "special_exam",
        title: "آزمون با مبحث کسری",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          questionCount: 20,
          blueprint: [
            { name: "مبحث کافی ۱", topic: "مبحث کافی ۱", count: 8 },
            { name: "مبحث کسری ۲", topic: "مبحث کسری ۲", count: 7 },
            { name: "مبحث کافی ۳", topic: "مبحث کافی ۳", count: 5 },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Must throw actionable error referencing the deficient topic and NOT borrow from other topics
      await expect(
        studyService.createSpecialExamAttempt(testUser, orgId, product),
      ).rejects.toThrow("مبحث کسری ۲");
    });
  });

  describe("3. Dynamic Randomization, Attempt Creation & Frozen Snapshot", () => {
    it("creates an independent attempt with frozen questionSnapshot upon verified payment", async () => {
      await seedQuestions(50, "بیوشیمی پزشکی");

      const productId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: productId,
        code: "special-exam-biochem-30",
        type: "special_exam",
        title: "آزمون ویژه بیوشیمی پزشکی ۳۰ سؤال",
        price: 15_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          questionCount: 30,
          scope: { topics: ["بیوشیمی پزشکی"] },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const checkoutRes = await commerceService.checkout(testUser, {
        productId,
        callbackUrl: "https://avana.app/callback",
      });
      expect(checkoutRes.order_id).toBeDefined();

      const verifyRes = await commerceService.verifyPayment({
        authority: checkoutRes.authority,
        status: "OK",
      }, "req-verify-1");

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.attempt_id).toBeDefined();

      // Retrieve the generated attempt
      const attempt = await quizAttemptStore.findById(asQuizAttemptId(verifyRes.attempt_id!));
      expect(attempt).toBeDefined();
      expect(attempt?.userId).toBe(testUser.userId);
      expect(attempt?.quizId).toBeNull(); // dynamic exam uses quizId: null
      expect((attempt?.metrics as any)?.isSpecialExam).toBe(true);
      expect((attempt?.metrics as any)?.total).toBe(30);

      // Verify questionSnapshot is frozen with exactly 30 questions
      expect(attempt?.questionSnapshot).toBeDefined();
      expect(attempt?.questionSnapshot?.length).toBe(30);
      const firstQuestion = attempt?.questionSnapshot?.[0];
      expect(firstQuestion.question).toBeDefined();
      expect(firstQuestion.options.length).toBe(4);
    });

    it("ensures repeat purchases generate distinct attempts and preserve historical reviews", async () => {
      await seedQuestions(60, "آناتومی سر و گردن");

      const productId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: productId,
        code: "special-exam-anatomy",
        type: "special_exam",
        title: "آزمون ویژه آناتومی",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          questionCount: 20,
          scope: { topics: ["آناتومی سر و گردن"] },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // 1st purchase
      const c1 = await commerceService.checkout(testUser, {
        productId,
        callbackUrl: "https://avana.app/callback",
      });
      const v1 = await commerceService.verifyPayment({
        authority: c1.authority,
        status: "OK",
      }, "req-verify-repeat-1");
      const attempt1Id = v1.attempt_id!;

      // 2nd purchase of the same product by the same user
      const c2 = await commerceService.checkout(testUser, {
        productId,
        callbackUrl: "https://avana.app/callback",
      });
      const v2 = await commerceService.verifyPayment({
        authority: c2.authority,
        status: "OK",
      }, "req-verify-repeat-2");
      const attempt2Id = v2.attempt_id!;

      expect(attempt1Id).not.toBe(attempt2Id);

      // Verify user has entitlements to both attempts
      const access1 = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "special_exam",
        resourceId: attempt1Id,
      });
      const access2 = await entitlementService.checkAccess(testUser, {
        userId: testUser.userId,
        resourceType: "special_exam",
        resourceId: attempt2Id,
      });

      expect(access1.granted).toBe(true);
      expect(access1.reason).toBe("special_exam_purchase");
      expect(access2.granted).toBe(true);
      expect(access2.reason).toBe("special_exam_purchase");

      // Verify both attempts exist in history
      const history = await studyService.listExamHistory(testUser, orgId);
      expect(history.items.some((item) => item.attemptId === attempt1Id)).toBe(true);
      expect(history.items.some((item) => item.attemptId === attempt2Id)).toBe(true);
      expect(history.items.every((item) => item.isSpecialExam === true)).toBe(true);
    });

    it("denies access (403 Forbidden) to users without valid attempt entitlement", async () => {
      await seedQuestions(30, "ایمونولوژی");

      const productId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: productId,
        code: "special-exam-immuno",
        type: "special_exam",
        title: "آزمون ایمونولوژی",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: { questionCount: 20 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const checkoutRes = await commerceService.checkout(testUser, {
        productId,
        callbackUrl: "https://avana.app/callback",
      });
      const verifyRes = await commerceService.verifyPayment({
        authority: checkoutRes.authority,
        status: "OK",
      }, "req-verify-access-denied");
      const attemptId = asQuizAttemptId(verifyRes.attempt_id!);

      // Owner can access
      const ownerAttempt = await studyService.getExamAttempt(testUser, orgId, attemptId);
      expect(ownerAttempt.attempt.id).toBe(attemptId);

      // Another user without entitlement is blocked
      await expect(
        studyService.getExamAttempt(anotherUser, orgId, attemptId),
      ).rejects.toThrow();
    });

    it("freezes snapshot permanently and remains completely unchanged even if Question Bank is deleted/modified", async () => {
      await seedQuestions(25, "فارماکولوژی قلب");

      const productId = asProductId(randomUUID());
      const product = await commerceStore.createProduct({
        id: productId,
        code: "freeze-snapshot-exam",
        type: "special_exam",
        title: "آزمون فارماکولوژی قلب",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: { questionCount: 20 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const { attempt } = await studyService.createSpecialExamAttempt(
        testUser,
        orgId,
        product,
      );

      expect(attempt.questionSnapshot?.length).toBe(20);
      const originalFirstQuestion = attempt.questionSnapshot?.[0];
      expect(originalFirstQuestion?.question).toBeDefined();

      // Entitle user so getExamAttempt succeeds
      await commerceStore.grantEntitlement({
        id: asUserEntitlementId(randomUUID()),
        userId: testUser.userId,
        resourceType: "special_exam",
        resourceId: attempt.id,
        sourceType: "purchase",
        orderId: null,
        startsAt: new Date().toISOString(),
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Now clear the entire question bank!
      quizQuestionStore.clear();
      expect(quizQuestionStore.getAll().length).toBe(0);

      // Attempt must still retrieve all 20 questions successfully from questionSnapshot
      const retrieved = await studyService.getExamAttempt(testUser, orgId, attempt.id);
      expect(retrieved.questions.length).toBe(20);
      expect(retrieved.questions[0].question).toBe(originalFirstQuestion?.question);
    });

    it("ensures verified payment callback is strictly idempotent and does not create duplicate attempts", async () => {
      await seedQuestions(30, "ژنتیک پزشکی");

      const productId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: productId,
        code: "idempotency-exam",
        type: "special_exam",
        title: "آزمون ژنتیک پزشکی",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: { questionCount: 20 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const checkoutRes = await commerceService.checkout(testUser, {
        productId,
        callbackUrl: "https://avana.app/callback",
      });

      // 1st verifyPayment call
      const verify1 = await commerceService.verifyPayment({
        authority: checkoutRes.authority,
        status: "OK",
      }, "req-idempotency-1");
      expect(verify1.success).toBe(true);
      const attempt1Id = verify1.attempt_id;
      expect(attempt1Id).toBeDefined();

      // 2nd verifyPayment call with the SAME authority and order
      const verify2 = await commerceService.verifyPayment({
        authority: checkoutRes.authority,
        status: "OK",
      }, "req-idempotency-2");
      expect(verify2.success).toBe(true);
      expect(verify2.attempt_id).toBe(attempt1Id);

      // Verify in DB/store that only 1 attempt exists for this user
      const userAttempts = await quizAttemptStore.listByUser(testUser.userId);
      const specialExamAttempts = userAttempts.filter(
        (a) => (a.metrics as any)?.isSpecialExam === true,
      );
      expect(specialExamAttempts.length).toBe(1);
      expect(specialExamAttempts[0].id).toBe(attempt1Id);
    });

    it("supports complete in-progress saving, submitting, scoring, and review after completion", async () => {
      await seedQuestions(20, "فیزیولوژی کلیه");

      const productId = asProductId(randomUUID());
      const product = await commerceStore.createProduct({
        id: productId,
        code: "review-flow-exam",
        type: "special_exam",
        title: "آزمون فیزیولوژی کلیه",
        price: 10_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: { questionCount: 20 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const { attempt, questions } = await studyService.createSpecialExamAttempt(
        testUser,
        orgId,
        product,
      );

      // Entitle user
      await commerceStore.grantEntitlement({
        id: asUserEntitlementId(randomUUID()),
        userId: testUser.userId,
        resourceType: "special_exam",
        resourceId: attempt.id,
        sourceType: "purchase",
        orderId: null,
        startsAt: new Date().toISOString(),
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 1. In-progress check: correctAnswer and explanation MUST be masked
      const inProgressView = await studyService.getExamAttempt(testUser, orgId, attempt.id);
      expect(inProgressView.isCompleted).toBe(false);
      expect((inProgressView.questions[0] as any).correctAnswer).toBeUndefined();
      expect((inProgressView.questions[0] as any).explanation).toBeUndefined();

      // 2. Save partial answers
      const q1 = questions[0];
      const q2 = questions[1];
      await studyService.saveExamAttemptAnswer(testUser, orgId, attempt.id, [
        { questionId: q1.id, answer: 0 },
        { questionId: q2.id, answer: 1 },
      ]);

      // 3. Submit attempt
      const submission = await studyService.submitConfiguredExamAttempt(
        testUser,
        orgId,
        attempt.id,
        questions.map((q, idx) => ({
          questionId: q.id,
          answer: idx % 2 === 0 ? 0 : 3, // alternate answers
        })),
      );

      expect(submission.total).toBe(20);
      expect(submission.score).toBeGreaterThanOrEqual(0);

      // 4. Completed check: full review, unmasked correctAnswer and explanation
      const completedView = await studyService.getExamAttempt(testUser, orgId, attempt.id);
      expect(completedView.isCompleted).toBe(true);
      expect((completedView.questions[0] as any).correctAnswer).toBeDefined();
      expect((completedView.questions[0] as any).explanation).toBeDefined();
      expect(completedView.attempt.status).toBe("completed");
    });
  });

  describe("4. Discovery via Library Service", () => {
    it("returns special_exams with correct pricing and details in listResources", async () => {
      const productId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: productId,
        code: "special-exam-pathology-80",
        type: "special_exam",
        title: "آزمون ویژه پاتولوژی عمومی و اختصاصی",
        description: "۸۰ سؤال استاندارد از سرفصل‌های پاتولوژی",
        price: 40_000,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          questionCount: 80,
          difficulty: "hard",
          scope: {
            topics: ["پاتولوژی سلولی", "التهاب و ترمیم"],
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await libraryService.listResources(
        testUser,
        { type: "special_exams" },
        "req-library-test",
      );

      expect(res.special_exams).toBeDefined();
      expect(res.special_exams?.length).toBe(1);
      const exam = res.special_exams![0];
      expect(exam.title).toBe("آزمون ویژه پاتولوژی عمومی و اختصاصی");
      expect(exam.question_count).toBe(80);
      expect(exam.price).toBe(40_000);
      expect(exam.difficulty).toBe("hard");
      expect(exam.scope?.topics).toContain("پاتولوژی سلولی");
      expect(res.pagination.total_special_exams).toBe(1);
    });
  });
});
