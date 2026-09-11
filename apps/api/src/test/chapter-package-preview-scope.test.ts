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
  type CourseId,
  type ModuleId,
  type LessonId,
  type QuizId,
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

describe("Chapter Package Preview Scope & Session Isolation (Library Preview)", () => {
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
  async function registerUser(app: any, email: string, name = "دانشجو آزمایشی") {
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

  async function seedCardiologyCourse() {
    const courseId = asCourseId(randomUUID());
    const orgId = config.systemOrganizationId as OrganizationId;
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره جامع فیزیولوژی قلب",
        description: "دوره جامع",
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
      id: asProductId("prod-course-cardio"),
      type: "course",
      title: "دوره جامع فیزیولوژی قلب",
      code: "course_cardio",
      targetType: "course",
      targetId: courseId,
      name: "دوره جامع فیزیولوژی قلب",
      description: "دسترسی کامل",
      price: 500000,
      currency: "IRR",
      billingType: "one_time",
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    const mod31Id = asModuleId(randomUUID());
    const mod32Id = asModuleId(randomUUID());
    const mod33Id = asModuleId(randomUUID());

    for (const [mId, title, order] of [
      [mod31Id, "فصل ۳۱: مقدمات همودینامیک", 1],
      [mod32Id, "فصل ۳۲: الکتروفیزیولوژی تخصصی بطن", 2],
      [mod33Id, "فصل ۳۳: تنظیم فشار خون و رفلکس‌ها", 3],
    ] as const) {
      await moduleStore.create({
        id: mId,
        courseId,
        title,
        description: `شرح ${title}`,
        sortOrder: order,
        documentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    const mod31Lessons: LessonId[] = [];
    for (let i = 1; i <= 3; i++) {
      const lId = asLessonId(randomUUID());
      mod31Lessons.push(lId);
      await lessonStore.create({
        id: lId,
        moduleId: mod31Id,
        title: `درس ۳۱-${i}`,
        contentMarkdown: `متن واقعی درس ۳۱-${i}`,
        sortOrder: i,
        contentType: "reading",
        estimatedMinutes: 10,
        publicationStatus: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    const mod32Lessons: LessonId[] = [];
    for (let i = 1; i <= 5; i++) {
      const lId = asLessonId(randomUUID());
      mod32Lessons.push(lId);
      await lessonStore.create({
        id: lId,
        moduleId: mod32Id,
        title: `فصل ۳۲ - جلسه ${i}`,
        contentMarkdown: `متن کامل و تخصصی فصل ۳۲ جلسه ${i}`,
        sortOrder: i,
        contentType: "reading",
        estimatedMinutes: 15,
        publicationStatus: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    const mod33Lessons: LessonId[] = [];
    for (let i = 1; i <= 2; i++) {
      const lId = asLessonId(randomUUID());
      mod33Lessons.push(lId);
      await lessonStore.create({
        id: lId,
        moduleId: mod33Id,
        title: `درس ۳۳-${i}`,
        contentMarkdown: `متن واقعی درس ۳۳-${i}`,
        sortOrder: i,
        contentType: "reading",
        estimatedMinutes: 10,
        publicationStatus: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    return { courseId, orgId, mod31Id, mod32Id, mod33Id, mod31Lessons, mod32Lessons, mod33Lessons };
  }

  // ---------------------------------------------------------------------------
  // Test 1: preview_lesson_id determined initially and persisted to moduleStore
  // ---------------------------------------------------------------------------
  it("1. preview_lesson_id is determined initially and persisted to moduleStore", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test1@avana.test");
    const { courseId, mod32Id, mod32Lessons } = await seedCardiologyCourse();

    const beforeMod = await moduleStore.findById(mod32Id);
    expect(beforeMod?.previewLessonId).toBeFalsy();

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: student.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const previewLessons = body.modules[0].lessons.filter((l: any) => l.is_preview === true);
    expect(previewLessons).toHaveLength(1);
    const selectedLessonId = previewLessons[0].id;
    expect(mod32Lessons).toContain(selectedLessonId);

    // Assert that preview_lesson_id has been persisted in moduleStore
    const afterMod = await moduleStore.findById(mod32Id);
    expect(afterMod?.previewLessonId).toBe(selectedLessonId);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Subsequent requests return the exact same canonical lesson
  // ---------------------------------------------------------------------------
  it("2. Subsequent requests return the exact same canonical lesson", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test2@avana.test");
    const { courseId, mod32Id } = await seedCardiologyCourse();

    const res1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: student.cookies,
    });
    const body1 = JSON.parse(res1.body);
    const preview1 = body1.modules[0].lessons.find((l: any) => l.is_preview === true);

    const res2 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: student.cookies,
    });
    const body2 = JSON.parse(res2.body);
    const preview2 = body2.modules[0].lessons.find((l: any) => l.is_preview === true);

    expect(preview1.id).toBe(preview2.id);
  });

  // ---------------------------------------------------------------------------
  // Test 3: New session (previewSessionId changes) returns the exact same canonical lesson
  // ---------------------------------------------------------------------------
  it("3. New session (previewSessionId changes) returns the exact same canonical lesson", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test3@avana.test");
    const { courseId, mod32Id } = await seedCardiologyCourse();

    const res1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=sess-alpha`,
      cookies: student.cookies,
    });
    const body1 = JSON.parse(res1.body);
    const preview1 = body1.modules[0].lessons.find((l: any) => l.is_preview === true);

    const res2 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=sess-beta`,
      cookies: student.cookies,
    });
    const body2 = JSON.parse(res2.body);
    const preview2 = body2.modules[0].lessons.find((l: any) => l.is_preview === true);

    const res3 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=sess-gamma`,
      cookies: student.cookies,
    });
    const body3 = JSON.parse(res3.body);
    const preview3 = body3.modules[0].lessons.find((l: any) => l.is_preview === true);

    expect(preview1.id).toBe(preview2.id);
    expect(preview2.id).toBe(preview3.id);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Modal consistency (open, close, reopen returns same lesson)
  // ---------------------------------------------------------------------------
  it("4. Modal consistency: open, close, reopen simulation returns the exact same lesson across users", async () => {
    const app = await buildTestApp();
    const student1 = await registerUser(app, "student1@avana.test", "دانشجو یک");
    const student2 = await registerUser(app, "student2@avana.test", "دانشجو دو");
    const { courseId, mod32Id } = await seedCardiologyCourse();

    // Step 1: User 1 opens modal (first preview session)
    const open1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=${randomUUID()}`,
      cookies: student1.cookies,
    });
    const bodyOpen1 = JSON.parse(open1.body);
    const previewId1 = bodyOpen1.modules[0].lessons.find((l: any) => l.is_preview === true).id;

    // Step 2: User 1 closes modal, reopens (new preview session UUID generated)
    const open2 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=${randomUUID()}`,
      cookies: student1.cookies,
    });
    const bodyOpen2 = JSON.parse(open2.body);
    const previewId2 = bodyOpen2.modules[0].lessons.find((l: any) => l.is_preview === true).id;
    expect(previewId2).toBe(previewId1);

    // Step 3: Page refresh (new session, same user)
    const refresh = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=${randomUUID()}`,
      cookies: student1.cookies,
    });
    const bodyRefresh = JSON.parse(refresh.body);
    const previewRefresh = bodyRefresh.modules[0].lessons.find((l: any) => l.is_preview === true).id;
    expect(previewRefresh).toBe(previewId1);

    // Step 4: User 2 opens the modal for the same module
    const user2Open = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=${randomUUID()}`,
      cookies: student2.cookies,
    });
    const bodyUser2 = JSON.parse(user2Open.body);
    const previewUser2 = bodyUser2.modules[0].lessons.find((l: any) => l.is_preview === true).id;
    expect(previewUser2).toBe(previewId1);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Section «درسنامه‌ها و محتواها» marks the exact same lesson as is_preview
  // ---------------------------------------------------------------------------
  it("5. Section «درسنامه‌ها و محتواها» marks the exact same lesson as is_preview", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test5@avana.test");
    const { courseId, mod32Id, mod32Lessons } = await seedCardiologyCourse();

    // 1. Trigger preview resolution via learning endpoint (or package view)
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: student.cookies,
    });
    const learnBody = JSON.parse(learnRes.body);
    const canonicalPreview = learnBody.modules[0].lessons.find((l: any) => l.is_preview === true);

    // 2. Check each lesson via EntitlementService checkAccess (simulating resources list)
    const studentActor = {
      userId: student.userId,
      organizationId: config.systemOrganizationId as OrganizationId,
      roles: ["student"] as any,
    };

    for (const lId of mod32Lessons) {
      const access = await entitlementService.checkAccess(studentActor, {
        userId: student.userId,
        resourceType: "lesson",
        resourceId: lId,
        moduleId: mod32Id,
        courseId,
      });

      if (lId === canonicalPreview.id) {
        expect(access.granted).toBe(true);
        expect(access.reason).toBe("free_preview");
      } else {
        expect(access.granted).toBe(false);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Flashcards strictly from the canonical preview lesson (10-15 sizing rule, all if < 10)
  // ---------------------------------------------------------------------------
  it("6. Flashcards strictly from the canonical preview lesson with 10-15 sizing rule or all if < 10", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test6@avana.test");
    const { courseId, orgId, mod31Id, mod32Id, mod31Lessons, mod32Lessons } = await seedCardiologyCourse();

    // Set canonical preview for mod32 to mod32Lessons[0]
    await moduleStore.updatePreviewLessonId(mod32Id, mod32Lessons[0]);
    // Set canonical preview for mod31 to mod31Lessons[0]
    await moduleStore.updatePreviewLessonId(mod31Id, mod31Lessons[0]);

    const now = new Date().toISOString();

    // Mod 32 has 20 cards on preview lesson, and 10 cards on non-preview lesson
    for (let i = 1; i <= 20; i++) {
      await flashcardStore.create({
        id: randomUUID(),
        organizationId: orgId,
        courseId,
        lessonId: mod32Lessons[0],
        front: `فصل ۳۲ کارت رویی ${i}`,
        back: `فصل ۳۲ کارت پشتی ${i}`,
        source: "manual",
        status: "active",
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    for (let i = 1; i <= 10; i++) {
      await flashcardStore.create({
        id: randomUUID(),
        organizationId: orgId,
        courseId,
        lessonId: mod32Lessons[1], // Non-preview lesson
        front: `غیرمجاز ۳۲ کارت رویی ${i}`,
        back: `غیرمجاز ۳۲ کارت پشتی ${i}`,
        source: "manual",
        status: "active",
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    // Mod 31 preview lesson has only 4 cards (< 10 rule)
    for (let i = 1; i <= 4; i++) {
      await flashcardStore.create({
        id: randomUUID(),
        organizationId: orgId,
        courseId,
        lessonId: mod31Lessons[0],
        front: `فصل ۳۱ کارت رویی ${i}`,
        back: `فصل ۳۱ کارت پشتی ${i}`,
        source: "manual",
        status: "active",
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    // Request flashcards for mod32 (>= 10 cards exist -> capped at 15)
    const res32 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards?moduleId=${mod32Id}&previewSessionId=sess-1`,
      cookies: student.cookies,
    });
    expect(res32.statusCode).toBe(200);
    const body32 = JSON.parse(res32.body);
    expect(body32.is_preview).toBe(true);
    expect(body32.flashcards).toHaveLength(15);
    for (const fc of body32.flashcards) {
      expect(fc.lessonId).toBe(mod32Lessons[0]);
      expect(fc.front).toContain("فصل ۳۲ کارت رویی");
      expect(fc.front).not.toContain("غیرمجاز");
    }

    // Request flashcards for mod31 (< 10 cards exist -> all 4 returned)
    const res31 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards?moduleId=${mod31Id}&previewSessionId=sess-2`,
      cookies: student.cookies,
    });
    expect(res31.statusCode).toBe(200);
    const body31 = JSON.parse(res31.body);
    expect(body31.is_preview).toBe(true);
    expect(body31.flashcards).toHaveLength(4);
    for (const fc of body31.flashcards) {
      expect(fc.lessonId).toBe(mod31Lessons[0]);
      expect(fc.front).toContain("فصل ۳۱ کارت رویی");
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7: Quiz strictly from the canonical preview lesson (max 5, zero answer leak)
  // ---------------------------------------------------------------------------
  it("7. Quiz strictly from the canonical preview lesson (max 5, zero answer leak before submission)", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test7@avana.test");
    const { courseId, orgId, mod32Id, mod32Lessons } = await seedCardiologyCourse();

    const canonicalPreviewLesson = mod32Lessons[1];
    await moduleStore.updatePreviewLessonId(mod32Id, canonicalPreviewLesson);

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون تخصصی الکتروفیزیولوژی",
      description: "تست آزمون",
      status: "published",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 8 questions on canonical preview lesson
    const questions: any[] = [];
    for (let i = 1; i <= 8; i++) {
      questions.push({
        id: asQuizQuestionId(randomUUID()),
        quizId,
        question: `سوال درس پیش‌نمایش شماره ${i}`,
        questionType: "multiple_choice",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۱",
        explanation: `توضیح کامل سوال ${i}`,
        sortOrder: i,
        lessonId: canonicalPreviewLesson,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    // 5 questions on non-preview lesson
    for (let i = 1; i <= 5; i++) {
      questions.push({
        id: asQuizQuestionId(randomUUID()),
        quizId,
        question: `سوال درس قفل‌شده شماره ${i}`,
        questionType: "multiple_choice",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۱",
        explanation: `توضیح غیرمجاز ${i}`,
        sortOrder: 10 + i,
        lessonId: mod32Lessons[0],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    await quizQuestionStore.createMany(questions);

    const quizRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}?moduleId=${mod32Id}&previewSessionId=sess-quiz-xyz`,
      cookies: student.cookies,
    });
    expect(quizRes.statusCode).toBe(200);
    const qzBody = JSON.parse(quizRes.body);

    expect(qzBody.quiz.is_preview).toBe(true);
    // Strict cap of 5 questions
    expect(qzBody.quiz.questions).toHaveLength(5);

    // All questions belong strictly to the canonical preview lesson
    for (const q of qzBody.quiz.questions) {
      expect(q.lessonId).toBe(canonicalPreviewLesson);
      expect(q.question).toContain("سوال درس پیش‌نمایش");
      expect(q.question).not.toContain("سوال درس قفل‌شده");

      // Critical Security: correctAnswer and explanation MUST NEVER leak before submission
      expect((q as any).correctAnswer).toBeUndefined();
      expect((q as any).explanation).toBeUndefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 8: Concurrent initialization (Promise.all race condition) safely resolves to single canonical lesson
  // ---------------------------------------------------------------------------
  it("8. Concurrent initialization (Promise.all race condition) safely resolves to a single canonical lesson", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test8@avana.test");
    const { courseId, mod32Id } = await seedCardiologyCourse();

    // Ensure previewLessonId is null initially
    const modBefore = await moduleStore.findById(mod32Id);
    expect(modBefore?.previewLessonId).toBeFalsy();

    // Launch 10 concurrent requests to simulate simultaneous users opening the modal
    const concurrentRequests = Array.from({ length: 10 }).map((_, idx) =>
      app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}&previewSessionId=race-sess-${idx}`,
        cookies: student.cookies,
      }),
    );

    const responses = await Promise.all(concurrentRequests);
    const previewLessonIds: string[] = [];

    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const preview = body.modules[0].lessons.find((l: any) => l.is_preview === true);
      expect(preview).toBeDefined();
      previewLessonIds.push(preview.id);
    }

    // All 10 requests MUST resolve to the exact same single canonical preview lesson
    const uniqueIds = new Set(previewLessonIds);
    expect(uniqueIds.size).toBe(1);

    // And moduleStore must have that exact lesson persisted
    const modAfter = await moduleStore.findById(mod32Id);
    expect(modAfter?.previewLessonId).toBe(previewLessonIds[0]);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Package isolation (Chapter 32 does not leak Chapter 31 or 33)
  // ---------------------------------------------------------------------------
  it("9. Package isolation: Chapter 32 does not leak content from Chapter 31 or 33", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test9@avana.test");
    const { courseId, mod31Id, mod32Id, mod33Id } = await seedCardiologyCourse();

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: student.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.modules).toHaveLength(1);
    expect(body.modules[0].id).toBe(mod32Id);
    expect(body.modules[0].title).toBe("فصل ۳۲: الکتروفیزیولوژی تخصصی بطن");

    // Must not contain any lesson from Mod 31 or Mod 33
    const lessonTitles = body.modules[0].lessons.map((l: any) => l.title);
    for (const title of lessonTitles) {
      expect(title).toContain("فصل ۳۲");
      expect(title).not.toContain("درس ۳۱");
      expect(title).not.toContain("درس ۳۳");
    }

    // Also verify Mod 31 and Mod 32 have independent preview lessons
    const resMod31 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod31Id}`,
      cookies: student.cookies,
    });
    const bodyMod31 = JSON.parse(resMod31.body);
    const mod31Preview = bodyMod31.modules[0].lessons.find((l: any) => l.is_preview === true);
    const mod32Preview = body.modules[0].lessons.find((l: any) => l.is_preview === true);

    expect(mod31Preview.id).not.toBe(mod32Preview.id);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Security and tampering (alien moduleId and locked completion rejection)
  // ---------------------------------------------------------------------------
  it("10. Security and tampering: alien moduleId returns 404 and locked lessons cannot be completed", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "test10@avana.test");
    const { courseId, mod32Id } = await seedCardiologyCourse();

    // 1. Alien moduleId returns 404
    const fakeModuleId = asModuleId(randomUUID());
    const alienRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${fakeModuleId}`,
      cookies: student.cookies,
    });
    expect(alienRes.statusCode).toBe(404);

    // 2. Identify the preview lesson and a locked lesson
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: student.cookies,
    });
    const body = JSON.parse(learnRes.body);
    const previewLesson = body.modules[0].lessons.find((l: any) => l.is_preview === true);
    const lockedLesson = body.modules[0].lessons.find((l: any) => l.locked === true);

    // 3. Unentitled user cannot complete the locked lesson
    const lockedProgressRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lockedLesson.id}/progress`,
      cookies: student.cookies,
      payload: { completed: true },
    });
    expect(lockedProgressRes.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Test 11: Buyer full access preserved
  // ---------------------------------------------------------------------------
  it("11. Buyer full access preserved: purchasing course unlocks all lessons without redaction", async () => {
    const app = await buildTestApp();
    const buyer = await registerUser(app, "buyer@avana.test", "خریدار محترم");
    const { courseId, mod32Id } = await seedCardiologyCourse();

    // Grant course purchase entitlement to buyer
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: buyer.userId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "course_purchase",
      orderId: null,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Buyer accesses the module
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn?moduleId=${mod32Id}`,
      cookies: buyer.cookies,
    });
    expect(learnRes.statusCode).toBe(200);
    const body = JSON.parse(learnRes.body);

    const lessons = body.modules[0].lessons;
    expect(lessons).toHaveLength(5);

    // ALL lessons must be unlocked and unredacted
    for (const l of lessons) {
      expect(l.locked).toBe(false);
      expect(l.content_markdown).toContain("متن کامل و تخصصی فصل ۳۲");
      expect(l.content_markdown).not.toContain("🔒 این محتوا مخصوص اعضای ویژه آوانا است");
    }

    // Buyer can complete any lesson
    const progressRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lessons[4].id}/progress`,
      cookies: buyer.cookies,
      payload: { completed: true },
    });
    expect(progressRes.statusCode).toBe(200);
  });
});
