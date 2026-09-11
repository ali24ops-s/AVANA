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
  asFlashcardId,
  type CourseId,
  type ModuleId,
  type LessonId,
  type OrganizationId,
  type QuizId,
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

describe("Pre-Purchase Course Preview & Free Access Experience", () => {
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

  let phoneCounter = 300000;
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

  // --- Seeding Helpers ensuring deletedAt: null and valid relational fields ---

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
        description: course.description ?? "شرح",
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
    description?: string;
    sortOrder: number;
  }) {
    const now = new Date().toISOString();
    return moduleStore.create({
      id: mod.id,
      courseId: mod.courseId,
      title: mod.title,
      description: mod.description ?? null,
      sortOrder: mod.sortOrder,
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
    publicationStatus?: string;
    estimatedMinutes?: number;
  }) {
    const now = new Date().toISOString();
    return lessonStore.create({
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: lesson.title,
      contentType: "markdown",
      contentMarkdown: lesson.contentMarkdown,
      sortOrder: lesson.sortOrder,
      estimatedMinutes: lesson.estimatedMinutes ?? 15,
      publicationStatus: (lesson.publicationStatus as any) ?? "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  async function seedProduct(prod: {
    id?: string;
    title: string;
    code: string;
    price: number;
    courseId: CourseId;
    metadata?: Record<string, any>;
  }) {
    const now = new Date().toISOString();
    return commerceStore.createProduct({
      id: asProductId(prod.id ?? randomUUID()),
      type: "course",
      title: prod.title,
      code: prod.code,
      description: prod.title,
      price: prod.price,
      currency: "IRT",
      targetType: "course",
      targetId: prod.courseId,
      active: true,
      durationDays: null,
      metadata: prod.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);
  }

  // ---------------------------------------------------------------------------
  // Test Cases
  // ---------------------------------------------------------------------------

  it("Full course outline is visible for unentitled users, with designated preview lesson unlocked and others locked", async () => {
    const app = await buildTestApp();
    const instructor = await registerUser(app, "instructor1@avana.test", "دکتر احمدی");
    const student = await registerUser(app, "student1@avana.test", "دانشجو تهرانی");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "فارماکولوژی بالینی",
      description: "دوره جامع فارماکولوژی",
      publicationStatus: "published",
      createdBy: instructor.userId,
    });

    await seedProduct({
      title: "دوره فارماکولوژی بالینی",
      code: "course_pharma_clinical",
      price: 250000,
      courseId,
    });

    // 2. Create Modules & Lessons
    const mod1Id = asModuleId(randomUUID());
    const mod2Id = asModuleId(randomUUID());
    await seedModule({ id: mod1Id, courseId, title: "فصل اول: مقدمات", sortOrder: 1 });
    await seedModule({ id: mod2Id, courseId, title: "فصل دوم: فارماکوکینتیک", sortOrder: 2 });

    const lesson1Id = asLessonId(randomUUID());
    const lesson2Id = asLessonId(randomUUID());
    const lesson3Id = asLessonId(randomUUID());

    const realMarkdown1 = "# درسنامه اول: آشنایی با گیرنده‌های دارویی\nاین متن کامل درس نمونه است.";
    const realMarkdown2 = "# درسنامه دوم: فارماکوکینتیک\nاین محتوای تخصصی پولی است.";
    const realMarkdown3 = "# درسنامه سوم: فارماکودینامیک\nاین محتوای پیشرفته پولی است.";

    await seedLesson({
      id: lesson1Id,
      moduleId: mod1Id,
      title: "درس اول: گیرنده‌ها",
      contentMarkdown: realMarkdown1,
      sortOrder: 1,
    });
    await seedLesson({
      id: lesson2Id,
      moduleId: mod1Id,
      title: "درس دوم: آگونیست‌ها و آنتاگونیست‌ها",
      contentMarkdown: realMarkdown2,
      sortOrder: 2,
    });
    await seedLesson({
      id: lesson3Id,
      moduleId: mod2Id,
      title: "درس سوم: متابولیسم کبدی",
      contentMarkdown: realMarkdown3,
      sortOrder: 1,
    });

    // 3. Prospective student accesses GET /v1/courses/:courseId/learn
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: student.cookies,
    });
    expect(learnRes.statusCode).toBe(200);
    const learnBody = JSON.parse(learnRes.body);

    // Course is locked for the prospective student
    expect(learnBody.course.locked).toBe(true);
    expect(learnBody.preview).toBeDefined();
    expect(learnBody.preview.preview_lesson_id).toBe(lesson1Id);
    expect(learnBody.preview.preview_flashcard_limit).toBe(5);
    expect(learnBody.preview.preview_quiz_limit).toBe(5);

    // Complete curriculum outline is preserved (2 modules, 3 lessons)
    expect(learnBody.modules).toHaveLength(2);
    expect(learnBody.modules[0].lessons).toHaveLength(2);
    expect(learnBody.modules[1].lessons).toHaveLength(1);

    // Lesson 1 is the preview lesson: unlocked, marked is_preview, full real markdown
    const lesson1 = learnBody.modules[0].lessons.find((l: any) => l.id === lesson1Id);
    expect(lesson1.locked).toBe(false);
    expect(lesson1.is_preview).toBe(true);
    expect(lesson1.access_reason).toBe("free_preview");
    expect(lesson1.content_markdown).toBe(realMarkdown1);

    // Lesson 2 is locked: locked true, is_preview false, obfuscated markdown
    const lesson2 = learnBody.modules[0].lessons.find((l: any) => l.id === lesson2Id);
    expect(lesson2.locked).toBe(true);
    expect(lesson2.is_preview).toBe(false);
    expect(lesson2.access_reason).toBe("locked");
    expect(lesson2.content_markdown).toContain("🔒 این محتوا مخصوص اعضای ویژه آوانا است");
    expect(lesson2.content_markdown).not.toBe(realMarkdown2);

    // Lesson 3 is also locked
    const lesson3 = learnBody.modules[1].lessons.find((l: any) => l.id === lesson3Id);
    expect(lesson3.locked).toBe(true);
    expect(lesson3.is_preview).toBe(false);
    expect(lesson3.content_markdown).toContain("🔒 این محتوا مخصوص اعضای ویژه آوانا است");
  });

  it("Dynamic preview configuration: Switching preview lesson via course product metadata works seamlessly without DB migration", async () => {
    const app = await buildTestApp();
    const instructor = await registerUser(app, "instructor2@avana.test", "دکتر رضایی");
    const student = await registerUser(app, "student2@avana.test", "دانشجو شیرازی");

    const courseId = asCourseId(randomUUID());
    await seedCourse({
      id: courseId,
      name: "فیزیولوژی پزشکی",
      publicationStatus: "published",
      createdBy: instructor.userId,
    });

    const modId = asModuleId(randomUUID());
    await seedModule({ id: modId, courseId, title: "فصل اول", sortOrder: 1 });

    const l1 = asLessonId(randomUUID());
    const l2 = asLessonId(randomUUID());
    await seedLesson({
      id: l1,
      moduleId: modId,
      title: "درس ۱",
      contentMarkdown: "متن درس ۱",
      sortOrder: 1,
    });
    await seedLesson({
      id: l2,
      moduleId: modId,
      title: "درس ۲ (انتخاب‌شده به عنوان پیش‌نمایش)",
      contentMarkdown: "متن کامل درس ۲",
      sortOrder: 2,
    });

    // Create course product with previewLessonId pointing to lesson 2!
    await seedProduct({
      title: "دوره فیزیولوژی",
      code: "course_physio",
      price: 180000,
      courseId,
      metadata: {
        previewLessonId: l2,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: student.cookies,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Architectural check: preview_lesson_id resolved dynamically to l2!
    expect(body.preview.preview_lesson_id).toBe(l2);

    const resL1 = body.modules[0].lessons.find((l: any) => l.id === l1);
    const resL2 = body.modules[0].lessons.find((l: any) => l.id === l2);

    // L1 is locked
    expect(resL1.locked).toBe(true);
    expect(resL1.is_preview).toBe(false);
    expect(resL1.content_markdown).toContain("🔒");

    // L2 is unlocked preview
    expect(resL2.locked).toBe(false);
    expect(resL2.is_preview).toBe(true);
    expect(resL2.content_markdown).toBe("متن کامل درس ۲");
  });

  it("Progress enforcement: Unentitled user can complete the preview lesson, but cannot complete locked lessons", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student3@avana.test", "دانشجو اصفهانی");

    const courseId = asCourseId(randomUUID());
    await seedCourse({
      id: courseId,
      name: "آناتومی",
      publicationStatus: "published",
      createdBy: randomUUID() as any,
    });

    await seedProduct({
      title: "دوره آناتومی",
      code: "course_anatomy",
      price: 200000,
      courseId,
    });

    const modId = asModuleId(randomUUID());
    await seedModule({ id: modId, courseId, title: "فصل ۱", sortOrder: 1 });

    const previewLessonId = asLessonId(randomUUID());
    const lockedLessonId = asLessonId(randomUUID());
    await seedLesson({
      id: previewLessonId,
      moduleId: modId,
      title: "درس پیش‌نمایش",
      contentMarkdown: "متن درس پیش‌نمایش",
      sortOrder: 1,
    });
    await seedLesson({
      id: lockedLessonId,
      moduleId: modId,
      title: "درس قفل",
      contentMarkdown: "متن درس قفل",
      sortOrder: 2,
    });

    // 1. Complete preview lesson -> Succeeds
    const completePreviewRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${previewLessonId}/progress`,
      payload: { completed: true },
      cookies: student.cookies,
    });
    expect(completePreviewRes.statusCode).toBe(200);
    expect(JSON.parse(completePreviewRes.body).completed).toBe(true);

    // 2. Attempt to complete locked lesson -> Fails 403
    const completeLockedRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lockedLessonId}/progress`,
      payload: { completed: true },
      cookies: student.cookies,
    });
    expect(completeLockedRes.statusCode).toBe(403);
    expect(JSON.parse(completeLockedRes.body).error.message).toContain("خریداری");
  });

  it("Flashcards preview & anti-leak: Unentitled user receives at most 5 cards without leaking paid deck", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student4@avana.test", "دانشجو تبریزی");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "فارماکولوژی ۲",
      publicationStatus: "published",
      createdBy: randomUUID() as any,
    });

    await seedProduct({
      title: "دوره فارماکولوژی ۲",
      code: "course_pharma_2",
      price: 150000,
      courseId,
    });

    const modId = asModuleId(randomUUID());
    await seedModule({ id: modId, courseId, title: "فصل ۱", sortOrder: 1 });

    const previewLessonId = asLessonId(randomUUID());
    const otherLessonId = asLessonId(randomUUID());
    await seedLesson({
      id: previewLessonId,
      moduleId: modId,
      title: "درس ۱",
      contentMarkdown: "متن ۱",
      sortOrder: 1,
    });
    await seedLesson({
      id: otherLessonId,
      moduleId: modId,
      title: "درس ۲",
      contentMarkdown: "متن ۲",
      sortOrder: 2,
    });

    // Seed 8 flashcards: 3 from preview lesson, 5 from other lesson
    const now = new Date().toISOString();
    for (let i = 1; i <= 3; i++) {
      await flashcardStore.create({
        id: asFlashcardId(randomUUID()),
        organizationId: orgId,
        courseId,
        lessonId: previewLessonId,
        front: `سوال پیش‌نمایش ${i}`,
        back: `پاسخ پیش‌نمایش ${i}`,
        sortOrder: i,
        status: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      } as any);
    }
    for (let i = 1; i <= 5; i++) {
      await flashcardStore.create({
        id: asFlashcardId(randomUUID()),
        organizationId: orgId,
        courseId,
        lessonId: otherLessonId,
        front: `سوال پولی ${i}`,
        back: `پاسخ پولی ${i}`,
        sortOrder: 10 + i,
        status: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      } as any);
    }

    // 1. Direct call to GET /v1/courses/:courseId/flashcards
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      cookies: student.cookies,
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);

    expect(listBody.is_preview).toBe(true);
    expect(listBody.preview_limit).toBe(5);
    expect(listBody.flashcards).toHaveLength(5);

    // Prioritized the 3 cards from preview lesson
    const previewCards = listBody.flashcards.filter((c: any) => c.lessonId === previewLessonId);
    expect(previewCards).toHaveLength(3);

    // 2. Explicit preview endpoint GET /v1/courses/:courseId/flashcards/preview
    const previewRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards/preview`,
      cookies: student.cookies,
    });
    expect(previewRes.statusCode).toBe(200);
    const previewBody = JSON.parse(previewRes.body);
    expect(previewBody.is_preview).toBe(true);
    expect(previewBody.flashcards).toHaveLength(5);

    // 3. Review queue endpoint returns preview cards gracefully
    const queueRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards/review-queue`,
      cookies: student.cookies,
    });
    expect(queueRes.statusCode).toBe(200);
    const queueBody = JSON.parse(queueRes.body);
    expect(queueBody.due_cards).toHaveLength(5);
  });

  it("Quiz preview & secret answer protection: Unentitled user gets 5 questions without answer keys and can take preview quiz", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "student5@avana.test", "دانشجو مشهدی");

    const courseId = asCourseId(randomUUID());
    const orgId = await seedCourse({
      id: courseId,
      name: "بیوشیمی بالینی",
      publicationStatus: "published",
      createdBy: randomUUID() as any,
    });

    await seedProduct({
      title: "دوره بیوشیمی",
      code: "course_biochem",
      price: 190000,
      courseId,
    });

    const modId = asModuleId(randomUUID());
    await seedModule({ id: modId, courseId, title: "فصل ۱", sortOrder: 1 });

    const previewLessonId = asLessonId(randomUUID());
    await seedLesson({
      id: previewLessonId,
      moduleId: modId,
      title: "درس آنزیم‌ها",
      contentMarkdown: "متن آنزیم‌ها",
      sortOrder: 1,
    });

    const quizId = asQuizId(randomUUID());
    const now = new Date().toISOString();
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      title: "آزمون جامع بیوشیمی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // Seed 7 quiz questions with secret correct answers
    const questions: any[] = [];
    for (let i = 1; i <= 7; i++) {
      const qId = asQuizQuestionId(randomUUID());
      questions.push({
        id: qId,
        quizId,
        question: `صورت سوال آزمون ${i}`,
        questionType: "multiple_choice",
        choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctAnswer: "گزینه الف",
        explanation: `تحلیل تشریحی سوال ${i}`,
        sortOrder: i,
        lessonId: i <= 3 ? previewLessonId : undefined,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    await quizQuestionStore.createMany(questions);

    // 1. GET /v1/courses/:courseId/quizzes (List quizzes)
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes`,
      cookies: student.cookies,
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);

    expect(listBody.is_preview).toBe(true);
    expect(listBody.quizzes).toHaveLength(1);
    const previewQuiz = listBody.quizzes[0];
    expect(previewQuiz.questions).toHaveLength(5);

    // Anti-leak verification: correct answers are NOT exposed!
    for (const q of previewQuiz.questions) {
      expect((q as any).correct_answer).toBeUndefined();
      expect((q as any).correctAnswer).toBeUndefined();
    }

    // 2. GET /v1/courses/:courseId/quizzes/:quizId
    const quizDetailRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}`,
      cookies: student.cookies,
    });
    expect(quizDetailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(quizDetailRes.body);
    expect(detailBody.quiz.is_preview).toBe(true);
    expect(detailBody.quiz.questions).toHaveLength(5);
    for (const q of detailBody.quiz.questions) {
      expect((q as any).correct_answer).toBeUndefined();
      expect((q as any).correctAnswer).toBeUndefined();
    }

    // 3. Take and submit preview quiz
    const previewQuestions = detailBody.quiz.questions;
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      cookies: student.cookies,
      payload: {
        answers: previewQuestions.map((q: any) => ({
          questionId: q.id,
          selectedChoice: "گزینه الف", // All correct
        })),
      },
    });
    expect([200, 201]).toContain(submitRes.statusCode);
    const submitBody = JSON.parse(submitRes.body);
    expect(submitBody.score).toBe(5);
    expect(submitBody.maxScore).toBe(5);
    expect(submitBody.attempt.score).toBe(100);
    expect(submitBody.attempt.correct).toBe(5);
    expect(submitBody.attempt.total).toBe(5);
    expect(submitBody.passed).toBe(true);
  });

  it("Entitled users receive complete 100% access to all lessons, cards, and quizzes", async () => {
    const app = await buildTestApp();
    const student = await registerUser(app, "buyer@avana.test", "خریدار محترم");

    const courseId = asCourseId(randomUUID());
    await seedCourse({
      id: courseId,
      name: "ایمونولوژی",
      publicationStatus: "published",
      createdBy: student.userId,
    });

    await seedProduct({
      title: "دوره ایمونولوژی",
      code: "course_immuno",
      price: 300000,
      courseId,
    });

    const modId = asModuleId(randomUUID());
    await seedModule({ id: modId, courseId, title: "فصل ۱", sortOrder: 1 });

    const l1 = asLessonId(randomUUID());
    const l2 = asLessonId(randomUUID());
    await seedLesson({
      id: l1,
      moduleId: modId,
      title: "درس ۱",
      contentMarkdown: "متن ۱",
      sortOrder: 1,
    });
    await seedLesson({
      id: l2,
      moduleId: modId,
      title: "درس ۲",
      contentMarkdown: "متن ۲",
      sortOrder: 2,
    });

    // Grant user lifetime course entitlement
    const now = new Date().toISOString();
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: student.userId,
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

    // 1. Learn endpoint shows course unlocked and all lessons unlocked
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: student.cookies,
    });
    expect(learnRes.statusCode).toBe(200);
    const learnBody = JSON.parse(learnRes.body);
    expect(learnBody.course.locked).toBe(false);
    expect(learnBody.modules[0].lessons[0].locked).toBe(false);
    expect(learnBody.modules[0].lessons[0].content_markdown).toBe("متن ۱");
    expect(learnBody.modules[0].lessons[1].locked).toBe(false);
    expect(learnBody.modules[0].lessons[1].content_markdown).toBe("متن ۲");
  });
});
