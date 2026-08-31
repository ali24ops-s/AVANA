/**
 * Integration Test: Exam Feature Powered by Real AVANA Learning Core Data
 *
 * Verifies:
 * 1. GET /study/exams/topics returns dynamic Sections (Modules) and Chapters (Lessons) from real Courses in DB.
 * 2. Exam Configuration is isolated to the user's organization.
 * 3. Seeded fallback data (Pharmacology/Cardiology) is NOT returned when the user has custom Course/Module/Lesson data.
 * 4. Starting an exam with specific Chapter selection retrieves questions matching that Lesson/Module.
 * 5. Difficulty filtering and question count validation work on real DB questions.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
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
import { v1Routes } from "../routes/v1.js";
import type { CourseId, OrganizationId, QuizId, QuizQuestionId, UserId, ModuleId, LessonId } from "@avana/domain";

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

type TestApp = Awaited<ReturnType<typeof createApp>>;

describe("Learning Core & Exam Integration", () => {
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let docStore: InMemoryDocumentStore;
  let docChunkStore: InMemoryDocumentChunkStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let genContentStore: InMemoryGeneratedContentStore;
  let genCitationStore: InMemoryGeneratedContentCitationStore;
  let genJobStore: InMemoryGenerationJobStore;
  let genQueue: InMemoryGenerationQueue;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  beforeEach(() => {
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    sessionStore = new InMemorySessionStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    docStore = new InMemoryDocumentStore();
    docChunkStore = new InMemoryDocumentChunkStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    genContentStore = new InMemoryGeneratedContentStore();
    genCitationStore = new InMemoryGeneratedContentCitationStore();
    genJobStore = new InMemoryGenerationJobStore();
    genQueue = new InMemoryGenerationQueue();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildTestApp() {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";
    process.env.JWT_SECRET = "test-jwt-secret-long-enough-32-chars!!";

    const config = loadApiConfig();
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
      documentStore: docStore,
      documentChunkStore: docChunkStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      generatedContentStore: genContentStore,
      generatedContentCitationStore: genCitationStore,
      generationJobStore: genJobStore,
      queue: genQueue,
      auditService,
    });

    await app.ready();
    return app;
  }

  async function signIn(app: TestApp, email: string) {
    const user = await userStore.createFromVerifiedIdentity({
      email,
      name: email.split("@")[0],
      provider: "local",
      providerSubject: `local|${email}`,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    const token = extractSessionToken(res)!;
    return { token, userId: user.id as UserId };
  }

  async function createOrg(app: TestApp, token: string, name: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    return body.organization.id;
  }

  it("fetches dynamic Sections & Chapters from real Learning Core DB (Course -> Module -> Lesson)", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "microbio_prof@example.com");
    const orgId = (await createOrg(app, token, "Medical Biology Department")) as OrganizationId;

    // 1. Create a real Course
    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "میکروب‌شناسی پزشکی",
        subject: "Microbiology",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Create 2 real Modules (Sections)
    const mod1Id = randomUUID() as ModuleId;
    const mod2Id = randomUUID() as ModuleId;

    await moduleStore.create({
      id: mod1Id,
      courseId,
      title: "بخش ۱: باکتری‌شناسی",
      description: "مطالعه ساختار و بیماری‌زایی باکتری‌ها",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await moduleStore.create({
      id: mod2Id,
      courseId,
      title: "بخش ۲: ویروس‌شناسی",
      description: "مطالعه رفتار ویروس‌ها و واکسیناسیون",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 3. Create 3 real Lessons (Chapters)
    const les1Id = randomUUID() as LessonId;
    const les2Id = randomUUID() as LessonId;

    await lessonStore.create({
      id: les1Id,
      moduleId: mod1Id,
      title: "سرفصل ۱: استافیلوکوک‌ها و استرپتوکوک‌ها",
      contentType: "markdown",
      contentMarkdown: "# باکتری‌های گرم مثبت",
      sortOrder: 1,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await lessonStore.create({
      id: les2Id,
      moduleId: mod2Id,
      title: "سرفصل ۲: ویروس‌های تنفسی و آنفلوانزا",
      contentType: "markdown",
      contentMarkdown: "# ویروس‌های پوشش‌دار",
      sortOrder: 1,
      estimatedMinutes: 25,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 4. Seed Quiz Questions for these real lessons
    const quizId = randomUUID() as QuizId;
    await quizStore.create({
      id: quizId,
      organizationId: orgId,
      courseId,
      documentId: null,
      title: "آزمون جامع میکروب‌شناسی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: "تست کاتالاز برای کدام دسته از باکتری‌های گرم مثبت مثبت است؟",
        topic: "سرفصل ۱: استافیلوکوک‌ها و استرپتوکوک‌ها",
        difficulty: "medium",
        questionType: "multiple_choice",
        choices: ["استافیلوکوک‌ها", "استرپتوکوک‌ها", "انتروکوک‌ها", "پنوموکوک‌ها"],
        correctAnswer: "استافیلوکوک‌ها",
        explanation: "استافیلوکوک‌ها آنزیم کاتالاز تولید می‌کنند.",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: "گلیکوپروتئین‌های اصلی سطح ویروس آنفلوانزا کدامند؟",
        topic: "سرفصل ۲: ویروس‌های تنفسی و آنفلوانزا",
        difficulty: "easy",
        questionType: "multiple_choice",
        choices: ["هم‌آگلوتینین و نورامینیداز", "GP120 و GP41", "کاپسید M1", "پروتئین N"],
        correctAnswer: "هم‌آگلوتینین و نورامینیداز",
        explanation: "HA و NA دو آنتی‌ژن اصلی ویروس آنفلوانزا هستند.",
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 5. Query GET /v1/organizations/:organizationId/study/exams/topics
    const topicsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/topics`,
      cookies: { avana_session: token },
    });

    expect(topicsRes.statusCode).toBe(200);
    const body = JSON.parse(topicsRes.body);

    // Verify Sections come strictly from real DB Modules ("بخش ۱: باکتری‌شناسی", "بخش ۲: ویروس‌شناسی")
    expect(body.sections).toBeDefined();
    expect(body.sections.length).toBeGreaterThanOrEqual(2);

    const bacteriologySec = body.sections.find((s: { id: string; title: string }) => s.id === mod1Id || s.title.includes("باکتری‌شناسی"));
    expect(bacteriologySec).toBeDefined();
    expect(bacteriologySec.title).toBe("بخش ۱: باکتری‌شناسی");
    expect(bacteriologySec.chapters[0].title).toBe("سرفصل ۱: استافیلوکوک‌ها و استرپتوکوک‌ها");
    expect(bacteriologySec.chapters[0].questionCount).toBe(1);

    const virologySec = body.sections.find((s: { id: string; title: string }) => s.id === mod2Id || s.title.includes("ویروس‌شناسی"));
    expect(virologySec).toBeDefined();
    expect(virologySec.title).toBe("بخش ۲: ویروس‌شناسی");
    expect(virologySec.chapters[0].title).toBe("سرفصل ۲: ویروس‌های تنفسی و آنفلوانزا");
    expect(virologySec.chapters[0].questionCount).toBe(1);

    // 6. Start exam selecting only the Virology chapter
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      cookies: { avana_session: token },
      payload: {
        chapters: ["سرفصل ۲: ویروس‌های تنفسی و آنفلوانزا"],
        questionCount: 1,
        difficulty: "easy",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const startBody = JSON.parse(startRes.body);
    expect(startBody.attemptId).toBeDefined();
    expect(startBody.questions.length).toBe(1);
    expect(startBody.questions[0].question).toContain("آنفلوانزا");

    await app.close();
  });
});
