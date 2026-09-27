/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  asCourseId,
  asModuleId,
  asLessonId,
  asQuizId,
  asQuizQuestionId,
  asProductId,
  asDocumentId,
  type OrganizationId,
} from "@avana/domain";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryCommerceStore,
  MockPaymentGateway,
  EntitlementService,
} from "../modules/commerce/index.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardReviewStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

function makeTestConfig() {
  const c = loadApiConfig();
  return {
    ...c,
    cookieSecret: "test-cookie-secret-at-least-32-chars-long!",
    systemOrganizationId: "00000000-0000-0000-0000-000000000001",
  };
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Quiz Preview Module Alignment & Anti-Leakage Invariants", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let commerceStore: InMemoryCommerceStore;
  let paymentGateway: MockPaymentGateway;
  let entitlementService: EntitlementService;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let auditService: AuditService;

  let phoneCounter = 500000;
  async function registerUser(app: any, email: string, name = "دانشجو تستی") {
    phoneCounter++;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "Password123!",
        name,
        phoneNumber: `0912${String(phoneCounter).padStart(7, "0")}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const sessionToken = extractSessionToken(res)!;
    const body = JSON.parse(res.body);
    return {
      sessionToken,
      userId: body.user.id,
      cookies: { avana_session: sessionToken },
    };
  }

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(orgStore);
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    paymentGateway = new MockPaymentGateway();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizAttemptStore = new InMemoryQuizAttemptStore();
    auditService = new AuditService(new InMemoryAuditStore());
    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
    });
  });

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      paymentGateway,
      entitlementService,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditService,
    });
    await app.ready();
    return app;
  }

  /**
   * Seed a multi-module course:
   * - Module 0: sort_order = 0, document_id = doc-0, createdAt = 2026-09-20 (LATER)
   *   Lesson 0: sort_order = 0, preview lesson
   *   Quiz 0: document_id = doc-0, createdAt = 2026-09-20 (LATER)
   * - Module 1: sort_order = 1, document_id = doc-1, createdAt = 2026-09-01 (EARLIER)
   *   Lesson 1: sort_order = 0
   *   Quiz 1: document_id = doc-1, createdAt = 2026-09-01 (EARLIER)
   * - Module 2: sort_order = 2, document_id = doc-2, no quiz at all
   */
  async function seedMultiModuleCourse() {
    const courseId = asCourseId(randomUUID());
    const orgId = config.systemOrganizationId as OrganizationId;
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فیزیولوژی ۲ تخصصی",
        description: "دوره فیزیولوژی ۲",
        subject: "فیزیولوژی",
        examDate: null,
        isArchived: false,
        publicationStatus: "published",
        createdBy: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    await commerceStore.createProduct({
      id: asProductId("prod-physio-2"),
      type: "course",
      title: "فیزیولوژی ۲",
      code: "course_physio_2",
      targetType: "course",
      targetId: courseId,
      name: "فیزیولوژی ۲",
      price: 600000,
      currency: "IRR",
      billingType: "one_time",
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // Module 0 (sort_order = 0, LATER createdAt)
    const mod0Id = asModuleId(randomUUID());
    const doc0Id = asDocumentId(randomUUID());
    await moduleStore.create({
      id: mod0Id,
      courseId,
      title: "فصل اول: الکترولیت‌ها",
      sortOrder: 0,
      documentId: doc0Id,
      previewLessonId: null,
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-20T10:00:00.000Z",
      deletedAt: null,
    });

    const les0Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: les0Id,
      moduleId: mod0Id,
      title: "درس ۱ فصل ۰: هموستاز پتاسیم",
      contentMarkdown: "محتوای هموستاز پتاسیم",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-20T10:00:00.000Z",
      deletedAt: null,
    });
    await moduleStore.updatePreviewLessonId(mod0Id, les0Id);

    // Quiz 0 for Module 0 (created LATER)
    const quiz0Id = asQuizId(randomUUID());
    await quizStore.create({
      id: quiz0Id,
      organizationId: orgId,
      courseId,
      title: "آزمون فصل اول: الکترولیت‌ها",
      documentId: doc0Id,
      status: "published",
      createdAt: "2026-09-20T12:00:00.000Z",
      updatedAt: "2026-09-20T12:00:00.000Z",
      deletedAt: null,
    });

    // 8 questions for Quiz 0 attached to les0Id
    const q0List: any[] = [];
    for (let i = 1; i <= 8; i++) {
      q0List.push({
        id: asQuizQuestionId(randomUUID()),
        quizId: quiz0Id,
        question: `سوال آزمون فصل اول شماره ${i}`,
        questionType: "multiple_choice",
        choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctAnswer: "گزینه الف",
        explanation: `پاسخ تشریحی سوال فصل اول ${i}`,
        sortOrder: i,
        lessonId: les0Id,
        createdAt: "2026-09-20T12:00:00.000Z",
        updatedAt: "2026-09-20T12:00:00.000Z",
        deletedAt: null,
      });
    }
    await quizQuestionStore.createMany(q0List);

    // Module 1 (sort_order = 1, EARLIER createdAt)
    const mod1Id = asModuleId(randomUUID());
    const doc1Id = asDocumentId(randomUUID());
    await moduleStore.create({
      id: mod1Id,
      courseId,
      title: "فصل دوم: اسید و باز",
      sortOrder: 1,
      documentId: doc1Id,
      previewLessonId: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      deletedAt: null,
    });

    const les1Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: les1Id,
      moduleId: mod1Id,
      title: "درس ۱ فصل ۱: تنظیم تعادل اسید و باز",
      contentMarkdown: "محتوای تعادل اسید و باز",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      deletedAt: null,
    });
    await moduleStore.updatePreviewLessonId(mod1Id, les1Id);

    // Quiz 1 for Module 1 (created EARLIER)
    const quiz1Id = asQuizId(randomUUID());
    await quizStore.create({
      id: quiz1Id,
      organizationId: orgId,
      courseId,
      title: "آزمون فصل دوم: اسید و باز",
      documentId: doc1Id,
      status: "published",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      deletedAt: null,
    });

    // 6 questions for Quiz 1 attached to les1Id
    const q1List: any[] = [];
    for (let i = 1; i <= 6; i++) {
      q1List.push({
        id: asQuizQuestionId(randomUUID()),
        quizId: quiz1Id,
        question: `سوال آزمون فصل دوم شماره ${i}`,
        questionType: "multiple_choice",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۱",
        explanation: `پاسخ تشریحی سوال فصل دوم ${i}`,
        sortOrder: i,
        lessonId: les1Id,
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
        deletedAt: null,
      });
    }
    await quizQuestionStore.createMany(q1List);

    // Module 2 (sort_order = 2, NO QUIZ)
    const mod2Id = asModuleId(randomUUID());
    const doc2Id = asDocumentId(randomUUID());
    await moduleStore.create({
      id: mod2Id,
      courseId,
      title: "فصل سوم: بدون آزمون",
      sortOrder: 2,
      documentId: doc2Id,
      previewLessonId: null,
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:00:00.000Z",
      deletedAt: null,
    });
    const les2Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: les2Id,
      moduleId: mod2Id,
      title: "درس ۱ فصل ۲: فقط متن",
      contentMarkdown: "محتوای فصل بدون آزمون",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:00:00.000Z",
      deletedAt: null,
    });
    await moduleStore.updatePreviewLessonId(mod2Id, les2Id);

    return {
      courseId,
      orgId,
      mod0Id,
      les0Id,
      quiz0Id,
      mod1Id,
      les1Id,
      quiz1Id,
      mod2Id,
      les2Id,
    };
  }

  it("1. Course-level preview strictly selects Quiz from Module 0 (sort_order = 0) despite Module 1 Quiz having earlier createdAt", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-align1@avana.test");
    const { courseId, les0Id, quiz0Id, quiz1Id } = await seedMultiModuleCourse();

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/preview`,
      cookies: student.cookies,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.is_preview).toBe(true);
    expect(body.preview_lesson_id).toBe(les0Id);
    expect(body.quiz).not.toBeNull();
    // CRITICAL: Must pick Quiz 0 (Module 0's quiz), NOT Quiz 1 (even though Quiz 1 was created earlier)
    expect(body.quiz.id).toBe(quiz0Id);
    expect(body.quiz.id).not.toBe(quiz1Id);
    expect(body.quiz.title).toContain("فصل اول: الکترولیت‌ها");

    // Must have questions (capped at 5)
    expect(body.quiz.questions.length).toBeGreaterThan(0);
    expect(body.quiz.questions.length).toBeLessThanOrEqual(5);

    // All questions belong strictly to les0Id of Module 0
    for (const q of body.quiz.questions) {
      expect(q.lessonId).toBe(les0Id);
      expect(q.question).toContain("فصل اول");
      expect(q.question).not.toContain("فصل دوم");

      // Critical Security: correctAnswer and explanation MUST NEVER leak
      expect((q as any).correctAnswer).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
    }
  });

  it("2. Chapter Package Preview for Module 0 resolves Quiz 0, and Module 1 resolves Quiz 1", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-align2@avana.test");
    const { courseId, orgId, mod0Id, les0Id, quiz0Id, mod1Id, les1Id, quiz1Id } =
      await seedMultiModuleCourse();

    // Resolver metadata check
    const resolver = entitlementService.getPreviewResolver();

    const meta0 = await resolver.resolvePackagePreviewMetadata({
      courseId,
      organizationId: orgId,
      moduleId: mod0Id,
    });
    expect(meta0.quiz?.id).toBe(quiz0Id);
    expect(meta0.previewLessonId).toBe(les0Id);

    const meta1 = await resolver.resolvePackagePreviewMetadata({
      courseId,
      organizationId: orgId,
      moduleId: mod1Id,
    });
    expect(meta1.quiz?.id).toBe(quiz1Id);
    expect(meta1.previewLessonId).toBe(les1Id);

    // HTTP Endpoint preview with moduleId query
    const res0 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/preview?moduleId=${mod0Id}`,
      cookies: student.cookies,
    });
    expect(res0.statusCode).toBe(200);
    const body0 = JSON.parse(res0.body);
    expect(body0.quiz.id).toBe(quiz0Id);
    for (const q of body0.quiz.questions) {
      expect(q.lessonId).toBe(les0Id);
    }

    const res1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/preview?moduleId=${mod1Id}`,
      cookies: student.cookies,
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.quiz.id).toBe(quiz1Id);
    for (const q of body1.quiz.questions) {
      expect(q.lessonId).toBe(les1Id);
    }
  });

  it("3. Module with NO quiz returns empty preview (quiz: null, total_questions: 0) and NEVER leaks questions from another module", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-align3@avana.test");
    const { courseId, orgId, mod2Id } = await seedMultiModuleCourse();

    const resolver = entitlementService.getPreviewResolver();
    const meta2 = await resolver.resolvePackagePreviewMetadata({
      courseId,
      organizationId: orgId,
      moduleId: mod2Id,
    });
    // No quiz preview metadata when module has no quiz
    expect(meta2.quiz).toBeUndefined();

    // HTTP Preview endpoint for Module 2
    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/preview?moduleId=${mod2Id}`,
      cookies: student.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.is_preview).toBe(true);
    expect(body.quiz).toBeNull();
  });

  it("4. Quiz attempt preview endpoint (getQuizForAttempt) does not fall back to leaking questions when preview is empty", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-align4@avana.test");
    const { courseId, mod2Id, quiz0Id } = await seedMultiModuleCourse();

    // Student attempts to request Quiz 0 with Module 2 scope (alien module spoofing attempt)
    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quiz0Id}?moduleId=${mod2Id}`,
      cookies: student.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.quiz.is_preview).toBe(true);
    // Security: Must NOT leak questions via questions.slice(0, 5)
    expect(body.quiz.questions).toHaveLength(0);
  });

  it("5. Zero leakage of correctAnswer and explanation across all preview responses", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-align5@avana.test");
    const { courseId, quiz0Id } = await seedMultiModuleCourse();

    // 1. Course-level preview
    const resPrev = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/preview`,
      cookies: student.cookies,
    });
    const bodyPrev = JSON.parse(resPrev.body);
    for (const q of bodyPrev.quiz.questions) {
      expect((q as any).correctAnswer).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
    }

    // 2. Quiz attempt preview
    const resAttempt = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quiz0Id}`,
      cookies: student.cookies,
    });
    const bodyAttempt = JSON.parse(resAttempt.body);
    expect(bodyAttempt.quiz.is_preview).toBe(true);
    for (const q of bodyAttempt.quiz.questions) {
      expect((q as any).correctAnswer).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
    }
  });

  it("6. Preview is accessible without entitlement, but full quiz access remains entitlement-protected", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student-align6@avana.test");
    const { courseId, quiz0Id } = await seedMultiModuleCourse();

    // Unauthorized attempt: preview only (max 5 questions, sanitized)
    const resPrev = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quiz0Id}`,
      cookies: student.cookies,
    });
    expect(resPrev.statusCode).toBe(200);
    const bodyPrev = JSON.parse(resPrev.body);
    expect(bodyPrev.quiz.is_preview).toBe(true);
    expect(bodyPrev.quiz.questions.length).toBeLessThanOrEqual(5);

    // Grant course entitlement to student
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: student.userId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "course_purchase",
      orderId: null,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Authorized attempt: full access (all 8 questions, is_preview is false/undefined)
    const resFull = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quiz0Id}`,
      cookies: student.cookies,
    });
    expect(resFull.statusCode).toBe(200);
    const bodyFull = JSON.parse(resFull.body);
    expect(bodyFull.quiz.is_preview).toBe(false);
    expect(bodyFull.quiz.questions).toHaveLength(8);
  });
});
