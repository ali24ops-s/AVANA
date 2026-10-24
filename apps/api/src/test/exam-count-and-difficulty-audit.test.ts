import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { generateSessionToken, hashToken } from "../modules/identity/session-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { calculateSpecialExamPrice } from "@avana/domain";
import { adaptToGeminiJsonSchema } from "../modules/generation/gateway/gemini.js";
import type { CourseId, OrganizationId, QuizId, QuizQuestionId, UserId } from "@avana/domain";

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

type TestApp = Awaited<ReturnType<typeof createApp>>;

describe("Exam Question Count (80 & 120) and Difficulty Audit Tests", () => {
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let queue: InMemoryGenerationQueue;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const courseId = "22222222-3333-4444-8555-666666666666" as CourseId;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";

    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    queue = new InMemoryGenerationQueue(generationJobStore);
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildTestApp(): Promise<TestApp> {
    const config = loadApiConfig();
    const app = createApp({ config });

    await app.register(v1Routes, {
      config,
      userStore,
      sessionStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditStore,
      auditService,
    });

    await app.ready();
    return app;
  }

  async function setupAuthenticatedUserAndCourse(
    _app: any,
    questionCounts: { easy: number; medium: number; hard: number },
  ) {
    const orgId = "11111111-2222-3333-8444-555555555555" as OrganizationId;
    const user = await userStore.createFromVerifiedIdentity({
      email: "student@test.com",
      name: "Student",
      provider: "local",
      providerSubject: "local|student",
    });
    const userId = user.id;

    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Medical Academy",
        slug: "med-academy",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgId,
        userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await sessionStore.createSessionWithTakeover({
      userId,
      tokenHash,
      expiresAt,
    });

    // Create course and module
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "Comprehensive Pharmacology",
        description: null,
        subject: null,
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const modId = "33333333-4444-5555-8666-777777777777";
    await moduleStore.create({
      id: modId as any,
      courseId,
      documentId: null,
      title: "Autonomic Nervous System",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lesId = "44444444-5555-6666-8777-888888888888";
    await lessonStore.create({
      id: lesId as any,
      moduleId: modId as any,
      title: "Adrenergic Agonists & Antagonists",
      contentType: "markdown",
      contentMarkdown: "",
      sortOrder: 1,
      estimatedMinutes: 30,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const quizId = randomUUID() as QuizId;
    quizStore.insert({
      id: quizId,
      organizationId: orgId,
      courseId,
      documentId: null,
      title: "Comprehensive Question Bank",
      topic: "Adrenergic Agonists & Antagonists",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Populate Easy questions
    for (let i = 0; i < questionCounts.easy; i++) {
      quizQuestionStore.insert({
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: `Easy Question ${i + 1}: What is the basic receptor?`,
        questionType: "multiple_choice",
        difficulty: "easy",
        topic: "Adrenergic Agonists & Antagonists",
        lessonId: lesId as any,
        choices: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        explanation: "Basic direct recall question.",
        sortOrder: i + 1,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Populate Medium questions
    for (let i = 0; i < questionCounts.medium; i++) {
      quizQuestionStore.insert({
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: `Medium Question ${i + 1}: Compare receptor selectivity`,
        questionType: "multiple_choice",
        difficulty: "medium",
        topic: "Adrenergic Agonists & Antagonists",
        lessonId: lesId as any,
        choices: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option B",
        explanation: "Comparative mechanism question.",
        sortOrder: questionCounts.easy + i + 1,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Populate Hard questions
    for (let i = 0; i < questionCounts.hard; i++) {
      quizQuestionStore.insert({
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: `Hard Question ${i + 1}: Multi-factor clinical vignette`,
        questionType: "multiple_choice",
        difficulty: "hard",
        topic: "Adrenergic Agonists & Antagonists",
        lessonId: lesId as any,
        choices: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option C",
        explanation: "High-discrimination clinical reasoning question.",
        sortOrder: questionCounts.easy + questionCounts.medium + i + 1,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return { orgId, sessionToken, modId, lesId };
  }

  // =========================================================================
  // Part 1: Question Count Tests (80, 120, validations, pricing)
  // =========================================================================

  it("Question Count: starts exam with requestedCount = 80 when pool has 130 questions", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 40,
      medium: 50,
      hard: 40,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 80,
        difficulty: "all",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.requestedCount).toBe(80);
    expect(body.questions).toHaveLength(80);
    expect(body.attemptId).toBeDefined();

    // Verify snapshot in store has exactly 80 questions
    const attempt = await quizAttemptStore.findById(body.attemptId);
    expect(attempt?.questionIds).toHaveLength(80);
  });

  it("Question Count: starts exam with requestedCount = 120 when pool has 140 questions", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 40,
      medium: 60,
      hard: 40,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 120,
        difficulty: "all",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.requestedCount).toBe(120);
    expect(body.questions).toHaveLength(120);

    const attempt = await quizAttemptStore.findById(body.attemptId);
    expect(attempt?.questionIds).toHaveLength(120);
  });

  it("Question Count: rejects 80 questions if pool has only 50 questions with clear 400 error", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 10,
      medium: 20,
      hard: 20,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 80,
        difficulty: "all",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errorMessage = body.error?.message ?? body.message;
    expect(errorMessage).toContain("فقط 50 سؤال برای سرفصل‌ها و سطح دشواری انتخاب‌شده در دسترس است");
    expect(errorMessage).toContain("حداقل تعداد درخواستی (80) تأمین نمی‌شود");
  });

  it("Question Count: rejects 120 questions if pool has only 90 questions with clear 400 error", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 30,
      medium: 30,
      hard: 30,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 120,
        difficulty: "all",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errorMessage = body.error?.message ?? body.message;
    expect(errorMessage).toContain("فقط 90 سؤال");
    expect(errorMessage).toContain("حداقل تعداد درخواستی (120) تأمین نمی‌شود");
  });

  it("Question Count: rejects invalid counts (0, -10, non-integer) with bad_request", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 20,
      medium: 20,
      hard: 20,
    });

    for (const badCount of [0, -10, 15.5]) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/start`,
        cookies: { avana_session: sessionToken },
        payload: {
          questionCount: badCount,
          difficulty: "all",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      const errorMessage = body.error?.message ?? body.message;
      expect(errorMessage).toBe("تعداد سؤالات باید یک عدد صحیح مثبت باشد.");
    }
  });

  it("Question Count: calculateSpecialExamPrice returns correct pricing for 80 and 120", () => {
    expect(calculateSpecialExamPrice(80)).toBe(40_000);
    expect(calculateSpecialExamPrice(120)).toBe(60_000);
  });

  // =========================================================================
  // Part 2: Difficulty Level Audit Tests
  // =========================================================================

  it("Difficulty: defaults to 'medium' when difficulty is omitted", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 10,
      medium: 20,
      hard: 10,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.difficulty).toBe("medium");
    expect(body.questions).toHaveLength(10);
    // Every question should be medium
    body.questions.forEach((q: { difficulty?: string }) => {
      expect(q.difficulty?.toLowerCase()).toBe("medium");
    });
  });

  it("Difficulty: rejects invalid difficulty string with bad_request", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 10,
      medium: 10,
      hard: 10,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 10,
        difficulty: "super_ultra_hard",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errorMessage = body.error?.message ?? body.message;
    expect(errorMessage).toContain("سطح دشواری نامعتبر است");
  });

  it("Difficulty: strictly selects only questions matching the chosen difficulty when pool is sufficient", async () => {
    const app = await buildTestApp();
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 15,
      medium: 15,
      hard: 15,
    });

    // Test 'easy'
    const easyRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: { questionCount: 10, difficulty: "easy" },
    });
    expect(easyRes.statusCode).toBe(200);
    const easyBody = JSON.parse(easyRes.body);
    expect(easyBody.difficulty).toBe("easy");
    easyBody.questions.forEach((q: { difficulty?: string }) => {
      expect(q.difficulty?.toLowerCase()).toBe("easy");
    });

    // Test 'hard'
    const hardRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: { questionCount: 10, difficulty: "hard" },
    });
    expect(hardRes.statusCode).toBe(200);
    const hardBody = JSON.parse(hardRes.body);
    expect(hardBody.difficulty).toBe("hard");
    hardBody.questions.forEach((q: { difficulty?: string }) => {
      expect(q.difficulty?.toLowerCase()).toBe("hard");
    });
  });

  it("Difficulty Audit Finding: silently relaxes difficulty filter when matching questions are fewer than requested", async () => {
    const app = await buildTestApp();
    // Pool only has 3 'hard' questions, but 25 questions total
    const { orgId, sessionToken } = await setupAuthenticatedUserAndCourse(app, {
      easy: 10,
      medium: 12,
      hard: 3,
    });

    // User explicitly requests 10 questions of difficulty "hard"
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: sessionToken },
      payload: {
        questionCount: 10,
        difficulty: "hard",
      },
    });

    // Backend silently fulfills using relaxedQuestions (easy and medium included)
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.difficulty).toBe("hard"); // Attempt still labeled "hard"
    expect(body.questions).toHaveLength(10);

    const difficulties = body.questions.map((q: { difficulty?: string }) => q.difficulty?.toLowerCase());
    // Contains non-hard questions because candidateQuestions was silently relaxed!
    const nonHardCount = difficulties.filter((d: string) => d !== "hard").length;
    expect(nonHardCount).toBeGreaterThan(0);
  });

  it("Difficulty Schema: Gemini JSON Schema for quizzes includes difficulty property with enum ['easy', 'medium', 'hard']", () => {
    const schema = adaptToGeminiJsonSchema({ type: "quizzes" }) as any;
    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties.questions).toBeDefined();

    const questionProps = schema.properties.questions.items.properties;
    expect(questionProps.difficulty).toBeDefined();
    expect(questionProps.difficulty.type).toBe("string");
    expect(questionProps.difficulty.enum).toEqual(["easy", "medium", "hard"]);
    expect(questionProps.category).toBeDefined();
    expect(questionProps.category.type).toBe("string");
  });
});
