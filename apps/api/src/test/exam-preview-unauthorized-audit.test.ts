/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
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
import {
  asCourseId,
  asModuleId,
  asLessonId,
  asProductId,
  asQuizId,
  asQuizQuestionId,
  type CourseId,
  type ModuleId,
  type LessonId,
  type OrganizationId,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Exam / Quiz Preview for Unauthorized Users — Comprehensive Audit & Verification", () => {
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

  let phoneCounter = 400000;
  async function registerUser(app: any, email: string, name = "کاربر آزمایشی") {
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

  async function seedCourse(course: {
    id: CourseId;
    organizationId?: OrganizationId;
    name: string;
    description?: string;
    subject?: string;
    publicationStatus?: string;
    createdBy?: string;
  }) {
    const orgId = course.organizationId ?? (config.systemOrganizationId as OrganizationId);
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: course.id,
        organizationId: orgId,
        name: course.name,
        description: course.description ?? "شرح دوره",
        subject: course.subject ?? "پزشکی",
        examDate: null,
        isArchived: false,
        publicationStatus: (course.publicationStatus as any) ?? "published",
        createdBy: (course.createdBy as any) ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    return orgId;
  }

  async function seedModule(mod: {
    id: ModuleId;
    courseId: CourseId;
    title: string;
    sortOrder: number;
    previewLessonId?: string;
  }) {
    const now = new Date().toISOString();
    return moduleStore.create({
      id: mod.id,
      courseId: mod.courseId,
      title: mod.title,
      description: null,
      sortOrder: mod.sortOrder,
      previewLessonId: mod.previewLessonId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  async function seedLesson(lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    contentMarkdown: string;
    sortOrder: number;
  }) {
    const now = new Date().toISOString();
    return lessonStore.create({
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: lesson.title,
      contentType: "markdown",
      contentMarkdown: lesson.contentMarkdown,
      sortOrder: lesson.sortOrder,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  async function seedProduct(prod: {
    title: string;
    code: string;
    price: number;
    courseId: CourseId;
  }) {
    const now = new Date().toISOString();
    return commerceStore.createProduct({
      id: asProductId(randomUUID()),
      type: "course",
      title: prod.title,
      code: prod.code,
      description: prod.title,
      price: prod.price,
      currency: "IRT",
      targetType: "course",
      targetId: prod.courseId,
      active: true,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  it("1. Unauthorized user fetches Preview questions without error and answer keys are never leaked", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student.audit1@avana.test");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({ id: courseId, name: "فارماکولوژی پایه" });
    await seedProduct({ title: "دوره فارماکولوژی", code: "pharma_1", price: 250000, courseId });

    const mod1 = asModuleId(randomUUID());
    await seedModule({ id: mod1, courseId, title: "فصل ۱: کلیات", sortOrder: 1 });
    const previewLesson1 = asLessonId(randomUUID());
    await seedLesson({ id: previewLesson1, moduleId: mod1, title: "درس ۱", contentMarkdown: "محتوا", sortOrder: 1 });

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون فارماکولوژی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // 8 questions: 3 belonging to preview lesson, 5 to locked lessons
    for (let i = 1; i <= 8; i++) {
      await quizQuestionStore.createMany([
        {
          id: asQuizQuestionId(`q-${i}`),
          quizId,
          question: `صورت سؤال ${i}`,
          questionType: "multiple_choice",
          choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
          correctAnswer: "گزینه ۱",
          explanation: `تحلیل تشریحی سؤال ${i}`,
          lessonId: i <= 3 ? previewLesson1 : undefined,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ]);
    }

    // Call GET /v1/courses/:courseId/quizzes/preview
    const previewRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/preview`,
      cookies: student.cookies,
    });
    expect(previewRes.statusCode).toBe(200);
    const previewBody = JSON.parse(previewRes.body);
    expect(previewBody.is_preview).toBe(true);
    expect(previewBody.quiz.questions.length).toBeLessThanOrEqual(5);

    // Verify secret answers & explanations are strictly not exposed
    for (const q of previewBody.quiz.questions) {
      expect((q as any).correctAnswer).toBeUndefined();
      expect((q as any).correct_answer).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
    }
  });

  it("2. Unauthorized user submits Preview answers across non-first module and receives accurate scoring without 403 error", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student.audit2@avana.test");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({ id: courseId, name: "آناتومی عمومی" });
    await seedProduct({ title: "دوره آناتومی", code: "anatomy_1", price: 300000, courseId });

    // Module 1 (First module)
    const mod1 = asModuleId(randomUUID());
    const previewLesson1 = asLessonId(randomUUID());
    await seedModule({ id: mod1, courseId, title: "فصل ۱: اسکلت", sortOrder: 1, previewLessonId: previewLesson1 });
    await seedLesson({ id: previewLesson1, moduleId: mod1, title: "درس استخوان", contentMarkdown: "...", sortOrder: 1 });

    // Module 2 (Second module - Chapter Package Preview context)
    const mod2 = asModuleId(randomUUID());
    const previewLesson2 = asLessonId(randomUUID());
    await seedModule({ id: mod2, courseId, title: "فصل ۲: عضلات", sortOrder: 2, previewLessonId: previewLesson2 });
    await seedLesson({ id: previewLesson2, moduleId: mod2, title: "درس ماهیچه‌ها", contentMarkdown: "...", sortOrder: 1 });

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون آناتومی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // Questions in Module 1
    for (let i = 1; i <= 3; i++) {
      await quizQuestionStore.createMany([
        {
          id: asQuizQuestionId(`q-mod1-${i}`),
          quizId,
          question: `سؤال اسکلت ${i}`,
          questionType: "multiple_choice",
          choices: ["الف", "ب", "ج", "د"],
          correctAnswer: "الف",
          explanation: `تحلیل اسکلت ${i}`,
          lessonId: previewLesson1,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ]);
    }

    // Questions in Module 2 (User previews this module!)
    for (let i = 1; i <= 3; i++) {
      await quizQuestionStore.createMany([
        {
          id: asQuizQuestionId(`q-mod2-${i}`),
          quizId,
          question: `سؤال عضله ${i}`,
          questionType: "multiple_choice",
          choices: ["الف", "ب", "ج", "د"],
          correctAnswer: "الف",
          explanation: `تحلیل عضله ${i}`,
          lessonId: previewLesson2,
          sortOrder: 10 + i,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ]);
    }

    // 1. Fetch preview scoped to Module 2
    const getMod2PreviewRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}?moduleId=${mod2}`,
      cookies: student.cookies,
    });
    expect(getMod2PreviewRes.statusCode).toBe(200);
    const mod2Body = JSON.parse(getMod2PreviewRes.body);
    expect(mod2Body.quiz.questions).toHaveLength(3);
    expect(mod2Body.quiz.questions.map((q: any) => q.id)).toContain("q-mod2-1");

    // 2. Submit answers for Module 2 preview questions
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: [
          { questionId: "q-mod2-1", answer: "الف" }, // Correct
          { questionId: "q-mod2-2", answer: "ب" },    // Incorrect
          { questionId: "q-mod2-3", answer: "الف" }, // Correct
        ],
      },
    });

    expect([200, 201]).toContain(submitRes.statusCode);
    const submitBody = JSON.parse(submitRes.body);

    // Verify accurate scoring
    expect(submitBody.correct_count).toBe(2);
    expect(submitBody.incorrect_count).toBe(1);
    expect(Math.round(submitBody.score_percent)).toBe(67);
    expect(submitBody.questionResults["q-mod2-1"].status).toBe("correct");
    expect(submitBody.questionResults["q-mod2-2"].status).toBe("incorrect");

    // Verify no paid attempt was created in DB
    const allDbAttempts = Array.from(quizAttemptStore.attempts.values());
    expect(allDbAttempts).toHaveLength(0);
  });

  it("3. Anti-leak security: Unauthorized user attempting to submit non-preview/locked questions is blocked with 403", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student.audit3@avana.test");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({ id: courseId, name: "ژنتیک پزشکی" });
    await seedProduct({ title: "دوره ژنتیک", code: "genetics_1", price: 400000, courseId });

    const mod1 = asModuleId(randomUUID());
    const previewLesson1 = asLessonId(randomUUID());
    const lockedLesson = asLessonId(randomUUID());
    await seedModule({ id: mod1, courseId, title: "فصل ۱", sortOrder: 1, previewLessonId: previewLesson1 });
    await seedLesson({ id: previewLesson1, moduleId: mod1, title: "درس رایگان", contentMarkdown: "...", sortOrder: 1 });
    await seedLesson({ id: lockedLesson, moduleId: mod1, title: "درس پولی ویژه", contentMarkdown: "...", sortOrder: 2 });

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون ژنتیک",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    await quizQuestionStore.createMany([
      {
        id: asQuizQuestionId("q-preview"),
        quizId,
        question: "سؤال نمونه رایگان",
        questionType: "multiple_choice",
        choices: ["۱", "۲"],
        correctAnswer: "۱",
        lessonId: previewLesson1,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ]);

    await quizQuestionStore.createMany([
      {
        id: asQuizQuestionId("q-locked-vip"),
        quizId,
        question: "سؤال فوق‌محرمانه پولی",
        questionType: "multiple_choice",
        choices: ["۱", "۲"],
        correctAnswer: "۲",
        lessonId: lockedLesson, // Locked lesson!
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ]);

    // Attempting to submit answer for the locked question must fail closed
    const hackSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: [
          { questionId: "q-locked-vip", answer: "۲" },
        ],
      },
    });

    expect(hackSubmitRes.statusCode).toBe(403);
    const errBody = JSON.parse(hackSubmitRes.body);
    const errMsg = errBody.message || errBody.error?.message || (typeof errBody.error === "string" ? errBody.error : "");
    expect(errMsg).toContain("اشتراک یا خرید دوره");
  });

  it("4. Full access user: Standard full exam flow remains completely unchanged without regression", async () => {
    const app = await buildTestApp();
    const buyer = await registerUser(app, "buyer.audit4@avana.test");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({ id: courseId, name: "پاتولوژی جامع", createdBy: buyer.userId });

    const mod1 = asModuleId(randomUUID());
    const l1 = asLessonId(randomUUID());
    await seedModule({ id: mod1, courseId, title: "فصل پاتولوژی", sortOrder: 1 });
    await seedLesson({ id: l1, moduleId: mod1, title: "درس پاتولوژی", contentMarkdown: "...", sortOrder: 1 });

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();

    // Grant buyer entitlement to the course
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: buyer.userId,
      resourceType: "course",
      resourceId: courseId,
      grantedReason: "course_purchase",
      sourceOrderId: randomUUID() as any,
      status: "active",
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون جامع پاتولوژی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    for (let i = 1; i <= 10; i++) {
      await quizQuestionStore.createMany([
        {
          id: asQuizQuestionId(`q-path-${i}`),
          quizId,
          question: `سؤال پاتولوژی ${i}`,
          questionType: "multiple_choice",
          choices: ["گزینه ۱", "گزینه ۲"],
          correctAnswer: "گزینه ۱",
          explanation: `تحلیل سؤال ${i}`,
          lessonId: l1,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ]);
    }

    // Buyer receives all 10 questions
    const fullQuizRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}`,
      cookies: buyer.cookies,
    });
    expect(fullQuizRes.statusCode).toBe(200);
    const fullBody = JSON.parse(fullQuizRes.body);
    expect(fullBody.quiz.questions).toHaveLength(10);
    expect(fullBody.quiz.is_preview).toBe(false);

    // Buyer submits all 10 questions and attempt is persisted in database
    const fullSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: buyer.cookies,
      payload: {
        answers: fullBody.quiz.questions.map((q: any) => ({
          questionId: q.id,
          answer: "گزینه ۱",
        })),
      },
    });

    expect([200, 201]).toContain(fullSubmitRes.statusCode);
    const fullSubmitBody = JSON.parse(fullSubmitRes.body);
    expect(fullSubmitBody.score).toBe(10);
    expect(fullSubmitBody.attempt.score).toBe(100);

    // Check attempt persisted in DB for buyer
    const allDbAttempts = Array.from(quizAttemptStore.attempts.values());
    expect(allDbAttempts).toHaveLength(1);
    expect(allDbAttempts[0].userId).toBe(buyer.userId);
  });

  it("5. Multi-chapter coverage: Unauthorized user previews and submits Chapter 1, Chapter 2, and Chapter 3 seamlessly", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student.multichapter@avana.test");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({ id: courseId, name: "بیوشیمی پزشکی" });
    await seedProduct({ title: "دوره بیوشیمی", code: "biochem_full", price: 500000, courseId });

    // Seed 3 chapters
    const mod1 = asModuleId(randomUUID());
    const mod2 = asModuleId(randomUUID());
    const mod3 = asModuleId(randomUUID());

    const l1 = asLessonId(randomUUID());
    const l2 = asLessonId(randomUUID());
    const l3 = asLessonId(randomUUID());

    await seedModule({ id: mod1, courseId, title: "فصل ۱: پروتئین‌ها", sortOrder: 1, previewLessonId: l1 });
    await seedLesson({ id: l1, moduleId: mod1, title: "درس ساختار پروتئین", contentMarkdown: "...", sortOrder: 1 });

    await seedModule({ id: mod2, courseId, title: "فصل ۲: آنزیم‌ها", sortOrder: 2, previewLessonId: l2 });
    await seedLesson({ id: l2, moduleId: mod2, title: "درس سینتیک آنزیم", contentMarkdown: "...", sortOrder: 1 });

    await seedModule({ id: mod3, courseId, title: "فصل ۳: متابولیسم", sortOrder: 3, previewLessonId: l3 });
    await seedLesson({ id: l3, moduleId: mod3, title: "درس گلیکولیز", contentMarkdown: "...", sortOrder: 1 });

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون بیوشیمی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // Seed questions for each chapter
    for (const [idx, lessonId, prefix] of [
      [1, l1, "q-c1"],
      [2, l2, "q-c2"],
      [3, l3, "q-c3"],
    ] as const) {
      for (let i = 1; i <= 2; i++) {
        await quizQuestionStore.createMany([
          {
            id: asQuizQuestionId(`${prefix}-${i}`),
            quizId,
            question: `سؤال فصل ${idx} شماره ${i}`,
            questionType: "multiple_choice",
            choices: ["الف", "ب"],
            correctAnswer: "الف",
            explanation: `تحلیل سؤال ${prefix}-${i}`,
            lessonId,
            sortOrder: idx * 10 + i,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
        ]);
      }
    }

    // --- Chapter 1 Test ---
    const c1GetRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}?moduleId=${mod1}`,
      cookies: student.cookies,
    });
    expect(c1GetRes.statusCode).toBe(200);
    const c1SubmitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: [{ questionId: "q-c1-1", answer: "الف" }],
      },
    });
    expect([200, 201]).toContain(c1SubmitRes.statusCode);
    expect(JSON.parse(c1SubmitRes.body).correct_count).toBe(1);

    // --- Chapter 2 Test ---
    const c2GetRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}?moduleId=${mod2}`,
      cookies: student.cookies,
    });
    expect(c2GetRes.statusCode).toBe(200);
    const c2SubmitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: [{ questionId: "q-c2-1", answer: "الف" }],
      },
    });
    expect([200, 201]).toContain(c2SubmitRes.statusCode);
    expect(JSON.parse(c2SubmitRes.body).correct_count).toBe(1);

    // --- Chapter 3 Test ---
    const c3GetRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}?moduleId=${mod3}`,
      cookies: student.cookies,
    });
    expect(c3GetRes.statusCode).toBe(200);
    const c3SubmitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: [{ questionId: "q-c3-1", answer: "الف" }],
      },
    });
    expect([200, 201]).toContain(c3SubmitRes.statusCode);
    expect(JSON.parse(c3SubmitRes.body).correct_count).toBe(1);

    // Verify no DB clutter
    expect(Array.from(quizAttemptStore.attempts.values())).toHaveLength(0);
  });

  it("6. Cross-course isolation: Submitting question belonging to a different course is rejected with 403", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student.crosscourse@avana.test");

    const course1Id = asCourseId(randomUUID());
    const orgId1 = await seedCourse({ id: course1Id, name: "دوره ۱" });
    await seedProduct({ title: "دوره ۱", code: "c1", price: 100000, courseId: course1Id });
    const mod1 = asModuleId(randomUUID());
    const l1 = asLessonId(randomUUID());
    await seedModule({ id: mod1, courseId: course1Id, title: "فصل ۱", sortOrder: 1, previewLessonId: l1 });
    await seedLesson({ id: l1, moduleId: mod1, title: "درس ۱", contentMarkdown: "...", sortOrder: 1 });

    const course2Id = asCourseId(randomUUID());
    await seedCourse({ id: course2Id, name: "دوره ۲" });
    await seedProduct({ title: "دوره ۲", code: "c2", price: 100000, courseId: course2Id });
    const mod2 = asModuleId(randomUUID());
    const l2 = asLessonId(randomUUID());
    await seedModule({ id: mod2, courseId: course2Id, title: "فصل ۲", sortOrder: 1, previewLessonId: l2 });
    await seedLesson({ id: l2, moduleId: mod2, title: "درس ۲", contentMarkdown: "...", sortOrder: 1 });

    const quiz1Id = asQuizId(randomUUID());
    const quiz2Id = asQuizId(randomUUID());
    const now = new Date().toISOString();

    await quizStore.create({ id: quiz1Id, organizationId: orgId1, courseId: course1Id, title: "آزمون ۱", status: "published", createdAt: now, updatedAt: now, deletedAt: null } as any);
    await quizStore.create({ id: quiz2Id, organizationId: orgId1, courseId: course2Id, title: "آزمون ۲", status: "published", createdAt: now, updatedAt: now, deletedAt: null } as any);

    await quizQuestionStore.createMany([
      { id: asQuizQuestionId("q-course1"), quizId: quiz1Id, question: "سؤال ۱", questionType: "multiple_choice", choices: ["الف"], correctAnswer: "الف", lessonId: l1, sortOrder: 1, createdAt: now, updatedAt: now, deletedAt: null },
      { id: asQuizQuestionId("q-course2"), quizId: quiz2Id, question: "سؤال ۲", questionType: "multiple_choice", choices: ["الف"], correctAnswer: "الف", lessonId: l2, sortOrder: 1, createdAt: now, updatedAt: now, deletedAt: null },
    ]);

    // Attempt to submit question from Course 2 to Course 1 quiz
    const tamperedRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${course1Id}/quizzes/${quiz1Id}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: [{ questionId: "q-course2", answer: "الف" }],
      },
    });

    expect(tamperedRes.statusCode).toBe(403);
  });
});
