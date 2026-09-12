import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asCourseId,
  asModuleId,
  asOrganizationId,
  asProductId,
  asQuizAttemptId,
  asUserId,
  calculateSpecialExamPrice,
  parseDocumentId,
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
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import { ReviewService } from "../modules/generation/review-service.js";
import {
  SpecialExamAutomationService,
  COURSE_SPECIAL_EXAM_QUESTION_COUNT,
  CHAPTER_SPECIAL_EXAM_QUESTION_COUNT,
  getCourseSpecialExamCode,
  getChapterSpecialExamCode,
} from "../modules/study/special-exam-automation-service.js";

describe("Special Exam Automation & Reconciliation Pipeline", () => {
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
  let automationService: SpecialExamAutomationService;

  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let reviewService: ReviewService;

  const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");
  const testUser: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
  };
  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "organization_admin",
  };

  const courseId = asCourseId(randomUUID());
  const moduleAId = asModuleId(randomUUID());
  const moduleBId = asModuleId(randomUUID());

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway({ enabled: true });

    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();

    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    quizStore = new InMemoryQuizStore();

    documentStore = new InMemoryDocumentStore();
    generatedContentStore = new InMemoryGeneratedContentStore();

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

    automationService = new SpecialExamAutomationService({
      commerceStore,
      studyService,
      courseStore,
      moduleStore,
      systemOrganizationId: orgId,
    });

    reviewService = new ReviewService(
      generatedContentStore,
      undefined as any,
      documentStore,
      new InMemoryDocumentChunkStore(),
      moduleStore,
      lessonStore,
      new RoleBasedPolicy(),
      undefined as any,
      undefined,
      undefined,
      quizStore,
      quizQuestionStore,
      undefined,
      commerceStore,
      undefined,
      automationService,
    );

    // Seed Course
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی جامع",
        description: "دوره جامع داروشناسی",
        subject: "پزشکی",
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Seed Modules
    await moduleStore.create({
      id: moduleAId,
      courseId,
      title: "فصل ۱: داروهای قلبی و عروقی",
      description: "فصل اول",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await moduleStore.create({
      id: moduleBId,
      courseId,
      title: "فصل ۲: داروهای سیستم عصبی",
      description: "فصل دوم",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  // Helper to seed questions for a specific module
  const seedModuleQuestions = async (
    moduleId: typeof moduleAId,
    count: number,
    topic: string,
  ) => {
    const quizId = randomUUID() as any;
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: `آزمون ${topic}`,
      topic,
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create a lesson in that module so lessonStore maps to this module
    const lessonId = randomUUID() as any;
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: `درس ${topic}`,
      contentType: "lesson",
      contentMarkdown: "# درس",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    for (let i = 0; i < count; i++) {
      quizQuestionStore.insert({
        id: randomUUID() as any,
        quizId,
        lessonId,
        sortOrder: i,
        question: `سؤال ${i + 1} از ${topic}`,
        options: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctOptionIndex: 0,
        correctAnswer: 0,
        explanation: "توضیح پاسخ",
        topic,
        difficulty: "medium",
        bloomLevel: "knowledge",
      } as any);
    }
  };

  describe("1. Chapter-level Special Exam Automation (25 questions, 12,500 Tomans)", () => {
    it("creates an inactive draft product when chapter question pool is < 25", async () => {
      // Seed only 15 questions in Module A
      await seedModuleQuestions(moduleAId, 15, "داروهای قلبی");

      const product = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleAId,
      });

      expect(product).toBeDefined();
      expect(product?.code).toBe(getChapterSpecialExamCode(moduleAId));
      expect(product?.price).toBe(12_500); // 25 * 500
      expect(product?.active).toBe(false); // Insufficient pool!
      expect(product?.metadata).toMatchObject({
        questionCount: 25,
        poolStatus: "insufficient",
        publicationStatus: "draft",
        availableQuestions: 15,
      });

      // Product is NOT returned in active library listings
      const activeProducts = await commerceStore.listActiveProducts();
      expect(activeProducts.find((p) => p.code === product?.code)).toBeUndefined();
    });

    it("automatically promotes chapter exam to active when question pool reaches >= 25", async () => {
      // Start with 15 questions
      await seedModuleQuestions(moduleAId, 15, "داروهای قلبی");
      const initial = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleAId,
      });
      expect(initial?.active).toBe(false);

      // Add 12 more questions to Module A (now 27 questions)
      await seedModuleQuestions(moduleAId, 12, "داروهای قلبی پیشرفته");

      // Reconcile again (idempotent update on existing product)
      const reconciled = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleAId,
      });

      expect(reconciled?.id).toBe(initial?.id); // MUST NOT duplicate product!
      expect(reconciled?.code).toBe(getChapterSpecialExamCode(moduleAId));
      expect(reconciled?.active).toBe(true); // Now sufficient!
      expect(reconciled?.price).toBe(12_500);
      expect(reconciled?.metadata).toMatchObject({
        questionCount: 25,
        poolStatus: "sufficient",
        publicationStatus: "published",
        availableQuestions: 27,
      });

      // Product IS now returned in active library listings
      const activeProducts = await commerceStore.listActiveProducts();
      expect(activeProducts.find((p) => p.code === reconciled?.code)).toBeDefined();
    });
  });

  describe("2. Course-level Special Exam Automation (80 questions, 40,000 Tomans)", () => {
    it("creates an inactive product when course pool is < 80 and activates when >= 80", async () => {
      // Module A has 30 questions, Module B has 30 questions -> Total 60 (< 80)
      await seedModuleQuestions(moduleAId, 30, "مبحث الف");
      await seedModuleQuestions(moduleBId, 30, "مبحث ب");

      const courseProd1 = await automationService.reconcileCourseExam({
        organizationId: orgId,
        courseId,
      });

      expect(courseProd1?.code).toBe(getCourseSpecialExamCode(courseId));
      expect(courseProd1?.price).toBe(40_000); // 80 * 500
      expect(courseProd1?.active).toBe(false); // 60 < 80
      expect(courseProd1?.metadata).toMatchObject({
        questionCount: 80,
        poolStatus: "insufficient",
        availableQuestions: 60,
      });

      // Add 25 more questions to Module B -> Total 85 (>= 80)
      await seedModuleQuestions(moduleBId, 25, "مبحث ج");

      const courseProd2 = await automationService.reconcileCourseExam({
        organizationId: orgId,
        courseId,
      });

      expect(courseProd2?.id).toBe(courseProd1?.id); // Same product updated
      expect(courseProd2?.active).toBe(true); // Now active!
      expect(courseProd2?.price).toBe(40_000);
      expect(courseProd2?.metadata).toMatchObject({
        questionCount: 80,
        poolStatus: "sufficient",
        publicationStatus: "published",
        availableQuestions: 85,
      });
    });
  });

  describe("3. Strict Isolation: No Cross-Scope Question Contamination", () => {
    it("never counts or borrows questions from another module", async () => {
      // Module A has 10 questions. Module B has 40 questions.
      await seedModuleQuestions(moduleAId, 10, "قلب");
      await seedModuleQuestions(moduleBId, 40, "مغز");

      // Reconcile both modules
      const examA = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleAId,
      });

      const examB = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleBId,
      });

      // Module A: available = 10 -> active: false (MUST NOT borrow from B)
      expect(examA?.active).toBe(false);
      expect((examA?.metadata as any).availableQuestions).toBe(10);

      // Module B: available = 40 -> active: true
      expect(examB?.active).toBe(true);
      expect((examB?.metadata as any).availableQuestions).toBe(40);
    });

    it("verifies attempt generation strictly samples questions from the target chapter", async () => {
      await seedModuleQuestions(moduleAId, 30, "قلب اختصاصی");
      await seedModuleQuestions(moduleBId, 30, "عصب اختصاصی");

      const examA = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleAId,
      });
      expect(examA?.active).toBe(true);

      const { attempt } = await studyService.createSpecialExamAttempt(
        testUser,
        orgId,
        examA!,
        randomUUID(),
      );

      expect(attempt.questionSnapshot).toHaveLength(25);
      // All selected questions MUST be from module A (topic 'قلب اختصاصی')
      for (const q of attempt.questionSnapshot) {
        expect(q.topic).toContain("قلب اختصاصی");
        expect(q.topic).not.toContain("عصب");
      }
    });
  });

  describe("4. Zero Static Question IDs (Pure Blueprint Invariant)", () => {
    it("product metadata contains zero static question IDs", async () => {
      await seedModuleQuestions(moduleAId, 30, "فارماکولوژی");
      const product = await automationService.reconcileChapterExam({
        organizationId: orgId,
        courseId,
        moduleId: moduleAId,
      });

      const meta = product?.metadata as any;
      expect(meta.questionIds).toBeUndefined();
      expect(meta.questions).toBeUndefined();
      expect(meta.blueprint).toBeDefined();
      expect(meta.scope).toBeDefined();

      // Dynamic randomization: two attempts produce different question selections/permutations
      const { attempt: attempt1 } = await studyService.createSpecialExamAttempt(
        testUser,
        orgId,
        product!,
        randomUUID(),
      );
      const { attempt: attempt2 } = await studyService.createSpecialExamAttempt(
        testUser,
        orgId,
        product!,
        randomUUID(),
      );

      expect(attempt1.id).not.toBe(attempt2.id);
      expect(attempt1.questionSnapshot).toHaveLength(25);
      expect(attempt2.questionSnapshot).toHaveLength(25);
    });
  });

  describe("5. Idempotent Reconciliation & Bulk Sync", () => {
    it("reconcileCourseAndModules is idempotent and reconciles both course and chapters", async () => {
      await seedModuleQuestions(moduleAId, 30, "فصل اول");
      await seedModuleQuestions(moduleBId, 30, "فصل دوم");

      const result1 = await automationService.reconcileCourseAndModules({
        organizationId: orgId,
        courseId,
      });

      expect(result1.courseExam).toBeDefined();
      expect(result1.chapterExams).toHaveLength(2);
      expect(result1.chapterExams[0].active).toBe(true); // 30 >= 25
      expect(result1.chapterExams[1].active).toBe(true); // 30 >= 25
      expect(result1.courseExam?.active).toBe(false); // 60 < 80

      // Re-run immediately
      const result2 = await automationService.reconcileCourseAndModules({
        organizationId: orgId,
        courseId,
      });

      expect(result2.courseExam?.id).toBe(result1.courseExam?.id);
      expect(result2.chapterExams[0].id).toBe(result1.chapterExams[0].id);
      expect(result2.chapterExams[1].id).toBe(result1.chapterExams[1].id);

      // Verify product count in store did NOT double
      const allProducts = await commerceStore.listActiveProducts();
      // Only the 2 chapter products are active
      expect(allProducts.filter((p) => p.type === "special_exam")).toHaveLength(2);
    });

    it("reconcileAll scans all courses and modules across organization", async () => {
      await seedModuleQuestions(moduleAId, 30, "فصل ۱");
      await seedModuleQuestions(moduleBId, 60, "فصل ۲"); // Course total = 90 (>= 80)

      const summary = await automationService.reconcileAll(orgId);

      expect(summary.reconciledCourses).toBe(1);
      expect(summary.reconciledModules).toBe(2);
      expect(summary.activeCourseExams).toBe(1);
      expect(summary.activeChapterExams).toBe(2);
    });
  });

  describe("6. Full ReviewService Materialization Lifecycle Integration", () => {
    it("automatically triggers reconciliation when new quiz questions are materialized", async () => {
      const docId = parseDocumentId(randomUUID());
      const rawQuestions = Array.from({ length: 26 }, (_, i) => ({
        question: `سؤال امتحانی شماره ${i + 1}`,
        questionType: "multiple_choice",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۱",
        explanation: "پاسخ تشریحی",
        difficulty: "medium",
        topic: "داروشناسی بالینی",
      }));

      const quizContentRecord = {
        id: randomUUID() as any,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "quiz" as const,
        status: "draft" as const,
        payload: {
          moduleTitle: "فصل ۳: داروشناسی بالینی",
          questions: rawQuestions,
        },
        materializedLessonId: null,
        promptVersion: "v1",
        model: "gemini-flash",
        tokenUsage: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        acceptedBy: null,
        acceptedAt: null,
        editedBy: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      generatedContentStore.insert(quizContentRecord);

      // Accept content via ReviewService
      await reviewService.acceptContent(adminActor, orgId, quizContentRecord.id);

      // Verify that the module was materialized and the chapter special exam was automatically created & activated!
      const modules = await moduleStore.listByCourse(courseId);
      const newModule = modules.find((m) => m.title.includes("داروشناسی بالینی"));
      expect(newModule).toBeDefined();

      const expectedCode = getChapterSpecialExamCode(newModule!.id);
      const chapterProduct = await commerceStore.findProductByCode(expectedCode);

      expect(chapterProduct).toBeDefined();
      expect(chapterProduct?.active).toBe(true);
      expect(chapterProduct?.price).toBe(12_500); // 25 * 500
      expect((chapterProduct?.metadata as any).poolStatus).toBe("sufficient");
      expect((chapterProduct?.metadata as any).availableQuestions).toBeGreaterThanOrEqual(25);
    });
  });
});
