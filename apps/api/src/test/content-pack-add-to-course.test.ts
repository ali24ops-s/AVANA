import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/index.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { createModelGateway } from "../modules/generation/index.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type {
  CourseId,
  DocumentId,
  GeneratedContentId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

describe("Content Pack Add to Course (Materialization) Integration Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
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
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let commerceStore: InMemoryCommerceStore;
  let paymentGateway: MockPaymentGateway;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;
  let gateway: ReturnType<typeof createModelGateway>;

  beforeEach(async () => {
    config = makeTestConfig();
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
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    contentPackUsageStore = new InMemoryContentPackUsageStore();
    contentPackStore = new InMemoryContentPackStore(
      userStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      generatedContentStore,
      contentPackUsageStore,
    );
    commerceStore = new InMemoryCommerceStore();
    paymentGateway = new MockPaymentGateway();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-mat-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    const auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    queue = new InMemoryGenerationQueue(generationJobStore);
    gateway = createModelGateway({ provider: "mock" });
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
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
      documentStore,
      documentChunkStore,
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      queue,
      gateway,
      auditService,
      contentPackStore,
      contentPackUsageStore,
      commerceStore,
      paymentGateway,
    });
    await app.ready();
    return app;
  }

  async function setupUserAndOrg(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    name = "دکتر داروساز",
    courseName = "فارماکولوژی ۱",
  ) {
    const email = `user-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name },
    });
    expect(res.statusCode).toBe(200);
    const token = extractSessionToken(res)!;
    const signInData = JSON.parse(res.body);
    const userId = signInData.user.id as UserId;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: `Faculty of ${name} ${Date.now()}-${Math.random()}` },
    });
    expect(orgRes.statusCode).toBe(201);
    const orgData = JSON.parse(orgRes.body);
    const orgId = orgData.organization.id as OrganizationId;

    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: courseName,
        subject: "فارماکولوژی",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    return { userId, orgId, courseId, token };
  }

  async function createPublishedPack(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    creator: { userId: UserId; orgId: OrganizationId; courseId: CourseId; token: string },
    packTitle = "بسته جامع فارماکولوژی قلب و عروق",
  ) {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: creator.orgId,
      courseId: creator.courseId,
      ownerUserId: creator.userId,
      originalName: "Cardio_Pharm.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024 * 300,
      sha256: "c".repeat(64),
      storageKey: `docs/${docId}/file.pdf`,
      pageCount: 12,
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: 95,
      qualityLevel: "high",
      qualityReport: null,
      qualityAnalyzedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Lesson
    await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: creator.orgId,
      documentId: docId,
      courseId: creator.courseId,
      type: "lesson",
      status: "accepted",
      payload: {
        kind: "lesson",
        title: packTitle,
        moduleTitle: "فصل اول: داروهای قلبی",
        sessions: [
          {
            title: "جلسه ۱: داروهای بتابلوکر",
            contentMarkdown: "# بتابلوکرها\nپروپرانولول و متوپرولول از داروهای مهم هستند.",
            estimatedMinutes: 15,
          },
          {
            title: "جلسه ۲: مهارکننده‌های ACE",
            contentMarkdown: "# مهارکننده‌های آنزیم مبدل آنژیوتانسین\nکاپتوپریل و انالاپریل.",
            estimatedMinutes: 12,
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 100, outputTokens: 200 },
      generationKey: "key-lesson",
      acceptedAt: now,
      acceptedBy: creator.userId,
      reviewedBy: creator.userId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 2. Flashcard
    await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: creator.orgId,
      documentId: docId,
      courseId: creator.courseId,
      type: "flashcard",
      status: "accepted",
      payload: {
        kind: "flashcard",
        title: "فلش‌کارت‌های قلبی",
        cards: [
          {
            front: "مکانیسم اثر متوپرولول چیست؟",
            back: "بلاک انتخابی گیرنده‌های بتا-۱ آدرنرژیک",
            sessionIndex: 0,
            difficulty: "easy",
          },
          {
            front: "عارضه شایع کاپتوپریل چیست؟",
            back: "سرفه خشک به دلیل افزایش برادی‌کینین",
            sessionIndex: 1,
            difficulty: "medium",
          },
          {
            front: "موارد منع مصرف بتابلوکرها چیست؟",
            back: "آسم شدید و برادی‌کاردی شدید",
            sessionIndex: 0,
            difficulty: "hard",
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 50, outputTokens: 100 },
      generationKey: "key-fc",
      acceptedAt: now,
      acceptedBy: creator.userId,
      reviewedBy: creator.userId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 3. Quiz
    await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: creator.orgId,
      documentId: docId,
      courseId: creator.courseId,
      type: "quiz",
      status: "accepted",
      payload: {
        kind: "quiz",
        title: "آزمون داروهای قلب",
        questions: [
          {
            question: "کدام دارو بتابلوکر غیراختصاصی است؟",
            questionType: "multiple_choice",
            choices: ["پروپرانولول", "متوپرولول", "آتنولول", "بسوپرولول"],
            correctAnswer: "پروپرانولول",
            explanation: "پروپرانولول هر دو گیرنده بتا-۱ و بتا-۲ را مهار می‌کند.",
            sessionIndex: 0,
          },
          {
            question: "کدام دارو مهارکننده مستقیم رنین است؟",
            questionType: "multiple_choice",
            choices: ["آلیسکایرن", "لوزارتان", "کاپتوپریل", "هیدرالازین"],
            correctAnswer: "آلیسکایرن",
            explanation: "آلیسکایرن مستقیماً آنزیم رنین را مهار می‌کند.",
            sessionIndex: 1,
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 60, outputTokens: 150 },
      generationKey: "key-quiz",
      acceptedAt: now,
      acceptedBy: creator.userId,
      reviewedBy: creator.userId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 4. Review Summary
    await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: creator.orgId,
      documentId: docId,
      courseId: creator.courseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "خلاصه نکات بالینی فارماکولوژی قلب",
        summaryText: "نکات کلیدی پیرامون داروهای ضد فشار خون و اینوتروپیک مثبت.",
        keyPoints: [
          "بتابلوکرها نباید در بیماران مبتلا به آسم حاد تجویز شوند.",
          "مهارکننده‌های ACE باعث هایپرکالمی و سرفه خشک می‌شوند.",
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 40, outputTokens: 80 },
      generationKey: "key-summary",
      acceptedAt: now,
      acceptedBy: creator.userId,
      reviewedBy: creator.userId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Publish Pack
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: creator.token },
      payload: {
        title: packTitle,
        description: "مجموعه آموزشی جامع فارماکولوژی قلبی عروقی شامل درسنامه و فلش‌کارت و آزمون",
        subject: "فارماکولوژی",
      },
    });
    expect(pubRes.statusCode).toBe(201);
    const pubData = JSON.parse(pubRes.body);
    await contentPackStore.updateStatus(pubData.pack.id, "published", { accessType: "free" });
    return { packId: pubData.pack.id as string, docId };
  }

  // ---------------------------------------------------------------------------
  // Test 1: Successful Materialization into Target User Course
  // ---------------------------------------------------------------------------
  it("Scenario 1: successfully materializes pack into user course with all 4 assets", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "دکتر سازنده");
    const { packId } = await createPublishedPack(app, creator);

    const student = await setupUserAndOrg(app, "دانشجو یادگیرنده", "درس فارماکولوژی دانشجو");

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.already_installed).toBe(false);
    expect(body.materialized).toBeDefined();
    expect(body.materialized.module_id).toBeDefined();
    expect(body.materialized.module_title).toBe("بسته جامع فارماکولوژی قلب و عروق");
    expect(body.materialized.lessons_created).toBe(2);
    expect(body.materialized.flashcards_created).toBe(3);
    expect(body.materialized.quizzes_created).toBe(1);
    expect(body.materialized.quiz_questions_created).toBe(2);
    expect(body.materialized.review_summary_created).toBe(true);

    // Verify Module created in student's course
    const studentModules = await moduleStore.listByCourse(student.courseId);
    expect(studentModules.length).toBe(1);
    const mod = studentModules[0];
    expect(mod.title).toBe("بسته جامع فارماکولوژی قلب و عروق");
    expect(mod.courseId).toBe(student.courseId);

    // Verify Lessons created in student's module
    const studentLessons = await lessonStore.listByModule(mod.id);
    expect(studentLessons.length).toBe(2);
    expect(studentLessons[0].title).toBe("جلسه ۱: داروهای بتابلوکر");
    expect(studentLessons[0].publicationStatus).toBe("published");
    expect(studentLessons[0].sortOrder).toBe(0);
    expect(studentLessons[1].title).toBe("جلسه ۲: مهارکننده‌های ACE");
    expect(studentLessons[1].sortOrder).toBe(1);

    // Verify Flashcards materialized with courseId and linked to lessons
    const studentCards = await flashcardStore.listByCourse(student.courseId, student.orgId);
    expect(studentCards.length).toBe(3);
    expect(studentCards[0].courseId).toBe(student.courseId);
    expect(studentCards[0].lessonId).toBe(studentLessons[0].id);
    expect(studentCards[1].lessonId).toBe(studentLessons[1].id);

    // Verify Quiz materialized in student's course
    const studentQuizzes = await quizStore.listByCourse(student.courseId, student.orgId);
    expect(studentQuizzes.length).toBe(1);
    expect(studentQuizzes[0].title).toBe("آزمون داروهای قلب");
    expect(studentQuizzes[0].status).toBe("published");

    const questions = await quizQuestionStore.listByQuiz(studentQuizzes[0].id);
    expect(questions.length).toBe(2);
    expect(questions[0].question).toBe("کدام دارو بتابلوکر غیراختصاصی است؟");
    expect(questions[0].correctAnswer).toBe("پروپرانولول");

    // Verify Review Summary in student's course
    const studentContents = await generatedContentStore.listByCourse(student.courseId, student.orgId);
    const summary = studentContents.find((c) => c.type === "review_summary");
    expect(summary).toBeDefined();
    expect(summary?.status).toBe("accepted");
    expect(summary?.courseId).toBe(student.courseId);
    expect((summary?.payload as { summaryText?: string } | undefined)?.summaryText).toBe(
      "نکات کلیدی پیرامون داروهای ضد فشار خون و اینوتروپیک مثبت.",
    );
  });

  // ---------------------------------------------------------------------------
  // Test 2: Zero LLM Calls Verification
  // ---------------------------------------------------------------------------
  it("Scenario 2: executes with zero LLM gateway calls", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const student = await setupUserAndOrg(app, "دانشجو تستی");

    const generateSpy = vi.spyOn(gateway, "complete");

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    expect(generateSpy).not.toHaveBeenCalled();
    generateSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Snapshot Isolation (Creator edits after publish do NOT alter pack)
  // ---------------------------------------------------------------------------
  it("Scenario 3: snapshot isolation — creator edits do not affect newly installed courses", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    // Creator edits original generated content
    const creatorContents = await generatedContentStore.listByCourse(creator.courseId);
    const creatorLesson = creatorContents.find((c) => c.type === "lesson")!;
    await generatedContentStore.update({
      ...creatorLesson,
      payload: {
        kind: "lesson",
        title: "عنوان تغییر یافته توسط سازنده",
        sessions: [
          { title: "جلسه نامربوط جدید", contentMarkdown: "محتوای خراب شده" },
        ],
      },
      updatedAt: new Date().toISOString(),
    });

    const student = await setupUserAndOrg(app, "دانشجو ایزوله");

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);

    // Student must get the immutable snapshot as it was when published
    const studentModules = await moduleStore.listByCourse(student.courseId);
    const studentLessons = await lessonStore.listByModule(studentModules[0].id);
    expect(studentLessons[0].title).toBe("جلسه ۱: داروهای بتابلوکر");
    expect(studentLessons[0].contentMarkdown).toContain("پروپرانولول و متوپرولول");
  });

  // ---------------------------------------------------------------------------
  // Test 4: Source Document Deletion Isolation
  // ---------------------------------------------------------------------------
  it("Scenario 4: source document deletion isolation — pack installs even if source document is deleted", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId, docId } = await createPublishedPack(app, creator);

    // Creator deletes their source document
    const doc = await documentStore.findByIdForOrganization(docId, creator.orgId);
    await documentStore.update({
      ...doc!,
      deletedAt: new Date().toISOString(),
    });

    const student = await setupUserAndOrg(app, "دانشجو داک پاک شده");

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.materialized.lessons_created).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 5: User Learning State Isolation (Fresh State)
  // ---------------------------------------------------------------------------
  it("Scenario 5: user learning state isolation — zero reviews, schedules, progress, or quiz attempts copied", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    // Seed creator review schedules & quiz attempts
    const creatorCardId = randomUUID();
    await userFlashcardScheduleStore.upsertSchedule({
      userId: creator.userId,
      flashcardId: creatorCardId,
      dueAt: new Date().toISOString(),
      intervalDays: 14,
      easeFactor: 2.8,
      lastReviewedAt: new Date().toISOString(),
      reviewCount: 5,
    });

    const student = await setupUserAndOrg(app, "دانشجو تمیز");

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);

    // Verify student has 0 schedules and 0 progress
    const studentSchedules = await userFlashcardScheduleStore.listByUser(student.userId);
    expect(studentSchedules.length).toBe(0);

    const studentAttempts = await quizAttemptStore.listByUser(student.userId);
    expect(studentAttempts.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Duplicate Installation Idempotency
  // ---------------------------------------------------------------------------
  it("Scenario 6: duplicate installation in same course is idempotent and safe", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const student = await setupUserAndOrg(app, "دانشجو دابل کلیک");

    // First install
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.already_installed).toBe(false);
    expect(body1.materialized.lessons_created).toBe(2);

    const packBefore = await contentPackStore.findById(packId);
    const usageCountBefore = packBefore?.usageCount;

    // Second install (double-click / retry)
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.success).toBe(true);
    expect(body2.already_installed).toBe(true);
    expect(body2.materialized.lessons_created).toBe(0);

    // Ensure 0 duplicate modules created
    const modules = await moduleStore.listByCourse(student.courseId);
    expect(modules.length).toBe(1);

    // Ensure usage count did not increment again
    const packAfter = await contentPackStore.findById(packId);
    expect(packAfter?.usageCount).toBe(usageCountBefore);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Multi-Course Installation by Same User (Usage Count Stays 1)
  // ---------------------------------------------------------------------------
  it("Scenario 7: multi-course installation by same user increments usage_count only once", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const student = await setupUserAndOrg(app, "دانشجو چند دوره‌ای", "دوره اول دانشجو");

    // Create a 2nd course for the same student
    const course2Id = randomUUID() as CourseId;
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: course2Id,
        organizationId: student.orgId,
        name: "دوره دوم دانشجو",
        subject: "فارماکولوژی",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 1. Install in course 1
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });
    expect(res1.statusCode).toBe(200);
    let pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(1);

    // 2. Install in course 2
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: course2Id },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.already_installed).toBe(false);
    expect(body2.materialized.lessons_created).toBe(2);

    // Usage count must remain 1 because it represents unique users
    pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(1);

    // Both courses have their own modules
    const modulesCourse1 = await moduleStore.listByCourse(student.courseId);
    const modulesCourse2 = await moduleStore.listByCourse(course2Id);
    expect(modulesCourse1.length).toBe(1);
    expect(modulesCourse2.length).toBe(1);
    expect(modulesCourse1[0].id).not.toBe(modulesCourse2[0].id);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Multi-User Usage Count Increment
  // ---------------------------------------------------------------------------
  it("Scenario 8: multi-user installs properly increment unique user usage count", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const student1 = await setupUserAndOrg(app, "دانشجوی اول");
    const student2 = await setupUserAndOrg(app, "دانشجوی دوم");

    // Student 1 installs
    await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student1.token },
      payload: { course_id: student1.courseId },
    });
    let pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(1);

    // Student 2 installs
    await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student2.token },
      payload: { course_id: student2.courseId },
    });
    pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Transaction Rollback on Failure
  // ---------------------------------------------------------------------------
  it("Scenario 9: transaction atomicity — rollback on error leaves zero orphaned records", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const student = await setupUserAndOrg(app, "دانشجو خطادار");

    // Force failure during materialization by making lessonStore throw
    const originalCreate = lessonStore.create;
    lessonStore.create = vi.fn().mockRejectedValue(new Error("Simulated DB error during lesson insert"));

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(500);

    // Restore
    lessonStore.create = originalCreate;
  });

  // ---------------------------------------------------------------------------
  // Test 10: Course Authorization Verification (403 Forbidden)
  // ---------------------------------------------------------------------------
  it("Scenario 10: unauthorized course access returns 403 Forbidden", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const victimOrg = await setupUserAndOrg(app, "کاربر سازمان قربانی", "دوره خصوصی");
    const attacker = await setupUserAndOrg(app, "کاربر مهاجم");

    // Attacker attempts to install pack into victim's course
    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: attacker.token },
      payload: { course_id: victimOrg.courseId },
    });

    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Test 11: Unpublished / Archived Pack & Non-existent entities (404 Not Found)
  // ---------------------------------------------------------------------------
  it("Scenario 11: returns 404 Not Found for non-existent or unpublished pack or missing course", async () => {
    const app = await buildTestApp();
    const student = await setupUserAndOrg(app, "دانشجو نات‌فاند");
    const fakePackId = randomUUID();
    const fakeCourseId = randomUUID();

    // 1. Missing pack
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${fakePackId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });
    expect(res1.statusCode).toBe(404);

    // 2. Missing course
    const creator = await setupUserAndOrg(app);
    const { packId } = await createPublishedPack(app, creator);

    const res2 = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: fakeCourseId },
    });
    expect(res2.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Test 12: Partial Pack Materialization — Lesson Only
  // ---------------------------------------------------------------------------
  it("Scenario 12: successfully materializes Lesson-only Content Pack", async () => {
    const app = await buildTestApp();
    const student = await setupUserAndOrg(app, "دانشجو پک درسنامه");

    const packId = randomUUID();
    const now = new Date().toISOString();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: student.userId,
        organizationId: student.orgId,
        sourceDocumentId: null,
        title: "پک فقط درسنامه",
        description: "توضیحات درسنامه",
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: { sessionCount: 2 },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID(),
          contentPackId: packId,
          contentType: "lesson",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "lesson",
            title: "درسنامه تخصصی",
            sessions: [
              { title: "جلسه اول", contentMarkdown: "محتوا ۱" },
              { title: "جلسه دوم", contentMarkdown: "محتوا ۲" },
            ],
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.materialized.lessons_created).toBe(2);
    expect(body.materialized.flashcards_created).toBe(0);
    expect(body.materialized.quizzes_created).toBe(0);
    expect(body.materialized.quiz_questions_created).toBe(0);
    expect(body.materialized.review_summary_created).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 13: Partial Pack Materialization — Flashcard Only
  // ---------------------------------------------------------------------------
  it("Scenario 13: successfully materializes Flashcard-only Content Pack (without lessons)", async () => {
    const app = await buildTestApp();
    const student = await setupUserAndOrg(app, "دانشجو پک فلش کارت");

    const packId = randomUUID();
    const now = new Date().toISOString();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: student.userId,
        organizationId: student.orgId,
        sourceDocumentId: null,
        title: "پک فقط فلش‌کارت",
        description: null,
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: { flashcardCount: 2 },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID(),
          contentPackId: packId,
          contentType: "flashcard",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "flashcard",
            cards: [
              { question: "سوال ۱؟", answer: "پاسخ ۱" },
              { question: "سوال ۲؟", answer: "پاسخ ۲" },
            ],
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.materialized.lessons_created).toBe(0);
    expect(body.materialized.flashcards_created).toBe(2);
    expect(body.materialized.quizzes_created).toBe(0);
    expect(body.materialized.review_summary_created).toBe(false);

    // Verify flashcards exist in store with null lessonId
    const courseCards = await flashcardStore.listByOrganization(student.orgId);
    const installedCards = courseCards.filter((c) => c.courseId === student.courseId);
    expect(installedCards).toHaveLength(2);
    expect(installedCards[0].lessonId).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test 14: Partial Pack Materialization — Quiz Only
  // ---------------------------------------------------------------------------
  it("Scenario 14: successfully materializes Quiz-only Content Pack (without lessons)", async () => {
    const app = await buildTestApp();
    const student = await setupUserAndOrg(app, "دانشجو پک آزمون");

    const packId = randomUUID();
    const now = new Date().toISOString();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: student.userId,
        organizationId: student.orgId,
        sourceDocumentId: null,
        title: "پک فقط آزمون",
        description: null,
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: { quizQuestionCount: 2 },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID(),
          contentPackId: packId,
          contentType: "quiz",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "quiz",
            title: "آزمون فارماکولوژی",
            questions: [
              {
                question: "سوال تست ۱؟",
                choices: ["الف", "ب", "ج", "د"],
                correctAnswer: "الف",
              },
              {
                question: "سوال تست ۲؟",
                choices: ["۱", "۲", "۳", "۴"],
                correctAnswer: "۲",
              },
            ],
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.materialized.lessons_created).toBe(0);
    expect(body.materialized.flashcards_created).toBe(0);
    expect(body.materialized.quizzes_created).toBe(1);
    expect(body.materialized.quiz_questions_created).toBe(2);
    expect(body.materialized.review_summary_created).toBe(false);

    // Verify questions exist in store with null lessonId
    const courseQuizzes = await quizStore.listByCourse(student.courseId, student.orgId);
    expect(courseQuizzes).toHaveLength(1);
    const questions = await quizQuestionStore.listByQuiz(courseQuizzes[0].id);
    expect(questions).toHaveLength(2);
    expect(questions[0].lessonId).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test 15: Partial Pack Materialization — Review Summary Only
  // ---------------------------------------------------------------------------
  it("Scenario 15: successfully materializes Review-Summary-only Content Pack", async () => {
    const app = await buildTestApp();
    const student = await setupUserAndOrg(app, "دانشجو پک خلاصه");

    const packId = randomUUID();
    const now = new Date().toISOString();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: student.userId,
        organizationId: student.orgId,
        sourceDocumentId: null,
        title: "پک فقط خلاصه",
        description: null,
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: { estimatedReadingMinutes: 10 },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID(),
          contentPackId: packId,
          contentType: "review_summary",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "review_summary",
            title: "خلاصه نکات مهم",
            contentMarkdown: "متن خلاصه جامع",
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.materialized.lessons_created).toBe(0);
    expect(body.materialized.flashcards_created).toBe(0);
    expect(body.materialized.quizzes_created).toBe(0);
    expect(body.materialized.review_summary_created).toBe(true);

    const courseContents = await generatedContentStore.listByCourse(student.courseId, student.orgId);
    const summary = courseContents.find((c) => c.type === "review_summary");
    expect(summary).toBeDefined();
    expect(summary?.status).toBe("accepted");
  });

  // ---------------------------------------------------------------------------
  // Test 16: Empty Pack Rejection
  // ---------------------------------------------------------------------------
  it("Scenario 16: fails cleanly if Content Pack has 0 items (empty pack)", async () => {
    const app = await buildTestApp();
    const student = await setupUserAndOrg(app, "دانشجو پک خالی");

    const emptyPackId = randomUUID();
    const now = new Date().toISOString();
    await contentPackStore.create(
      {
        id: emptyPackId,
        creatorUserId: student.userId,
        organizationId: student.orgId,
        sourceDocumentId: null,
        title: "پک کاملاً خالی",
        description: null,
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${emptyPackId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: student.courseId },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("فاقد محتوا");
  });

  // ---------------------------------------------------------------------------
  // Test 17: Normal Learner + Official/System Course (e.g. Pharmacology 3) + Free Pack
  // ---------------------------------------------------------------------------
  it("Scenario 17: learner without membership in SYSTEM_ORGANIZATION_ID successfully adds Free Pack to System Course (فارماکولوژی ۳)", async () => {
    const app = await buildTestApp();
    const systemOrgId = config.systemOrganizationId as OrganizationId;
    const pharm3CourseId = "5b0f6697-5964-44f8-b404-d306ad592ea0" as CourseId;

    // Seed System Course under SYSTEM_ORGANIZATION_ID
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: pharm3CourseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی ۳",
        subject: "فارماکولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Create creator who publishes a free pack
    const creator = await setupUserAndOrg(app, "دکتر مدرس");
    const { packId } = await createPublishedPack(app, creator);

    // Normal student who is ONLY a member of their own personal organization (NOT systemOrgId)
    const student = await setupUserAndOrg(app, "دانشجو یادگیرنده فارما");

    // Verify student is NOT a member of systemOrgId
    const sysMembership = await orgStore.findMembership(systemOrgId, student.userId);
    expect(sysMembership).toBeUndefined();

    // Student adds pack to System Course "فارماکولوژی ۳"
    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: pharm3CourseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.already_installed).toBe(false);
    expect(body.materialized.module_title).toBe("بسته جامع فارماکولوژی قلب و عروق");
    expect(body.materialized.lessons_created).toBe(2);
    expect(body.materialized.flashcards_created).toBe(3);
    expect(body.materialized.quizzes_created).toBe(1);
    expect(body.materialized.quiz_questions_created).toBe(2);
    expect(body.materialized.review_summary_created).toBe(true);

    // Modules materialized in pharm3CourseId
    const modules = await moduleStore.listByCourse(pharm3CourseId);
    expect(modules.length).toBe(1);
    expect(modules[0].title).toBe("بسته جامع فارماکولوژی قلب و عروق");
  });

  // ---------------------------------------------------------------------------
  // Test 18: Normal Learner + System Course + Paid Pack WITHOUT Entitlement
  // ---------------------------------------------------------------------------
  it("Scenario 18: paid pack without entitlement returns purchase/entitlement error (NOT course-access 403)", async () => {
    const app = await buildTestApp();
    const systemOrgId = config.systemOrganizationId as OrganizationId;
    const pharm3CourseId = "5b0f6697-5964-44f8-b404-d306ad592ea0" as CourseId;

    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: pharm3CourseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی ۳",
        subject: "فارماکولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const creator = await setupUserAndOrg(app, "دکتر سازنده پولی");
    const paidPackId = randomUUID();

    // Create a paid pack
    await contentPackStore.create(
      {
        id: paidPackId,
        creatorUserId: creator.userId,
        organizationId: creator.orgId,
        sourceDocumentId: null,
        title: "بسته پولی فارماکولوژی پیشرفته",
        description: "محتوای تخصصی",
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: { accessType: "paid" },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID(),
          contentPackId: paidPackId,
          contentType: "lesson",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "lesson",
            sessions: [{ title: "جلسه اول پولی", contentMarkdown: "متن درس پولی" }],
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    const student = await setupUserAndOrg(app, "دانشجو بدون اشتراک");

    // Attempt to add paid pack without entitlement
    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${paidPackId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: pharm3CourseId },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    // Crucial: Must be entitlement message, NOT "شما به این دوره دسترسی ندارید"
    expect(body.error.message).toContain("خرید این بسته الزامی است");
    expect(body.error.message).not.toContain("شما به این دوره دسترسی ندارید");
  });

  // ---------------------------------------------------------------------------
  // Test 19: Normal Learner + System Course + Paid Pack WITH Active Entitlement
  // ---------------------------------------------------------------------------
  it("Scenario 19: paid pack with active subscription or entitlement succeeds on System Course", async () => {
    const app = await buildTestApp();
    const systemOrgId = config.systemOrganizationId as OrganizationId;
    const pharm3CourseId = "5b0f6697-5964-44f8-b404-d306ad592ea0" as CourseId;

    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: pharm3CourseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی ۳",
        subject: "فارماکولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const creator = await setupUserAndOrg(app, "دکتر سازنده پولی ۲");
    const paidPackId = randomUUID();

    await contentPackStore.create(
      {
        id: paidPackId,
        creatorUserId: creator.userId,
        organizationId: creator.orgId,
        sourceDocumentId: null,
        title: "بسته پولی دارای لایسنس",
        description: "محتوای تخصصی",
        subject: "فارماکولوژی",
        status: "published",
        publishedAt: now,
        usageCount: 0,
        metadata: { accessType: "paid" },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      [
        {
          id: randomUUID(),
          contentPackId: paidPackId,
          contentType: "lesson",
          sourceGeneratedContentId: null,
          payloadSnapshot: {
            kind: "lesson",
            sessions: [{ title: "درس اول دارای اشتراک", contentMarkdown: "متن درس" }],
          },
          sortOrder: 0,
          createdAt: now,
        },
      ],
    );

    const student = await setupUserAndOrg(app, "دانشجو دارای اشتراک پلاس");

    // Grant active subscription entitlement to student
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: student.userId,
      resourceType: "subscription",
      resourceId: null,
      sourceType: "subscription",
      orderId: null,
      startsAt: new Date().toISOString(),
      expiresAt: futureDate.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Add paid pack with active subscription to System Course
    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${paidPackId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: pharm3CourseId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.materialized.lessons_created).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 20: IDOR Protection: Attacker cannot add pack to Victim's private course
  // ---------------------------------------------------------------------------
  it("Scenario 20: cross-tenant isolation is preserved (attacker cannot add to victim's private course)", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "سازنده آزاد");
    const { packId } = await createPublishedPack(app, creator);

    const victim = await setupUserAndOrg(app, "کاربر قربانی", "دوره محرمانه");
    const attacker = await setupUserAndOrg(app, "کاربر مهاجم");

    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: attacker.token },
      payload: { course_id: victim.courseId },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("شما به این دوره دسترسی ندارید");
  });

  // ---------------------------------------------------------------------------
  // Test 21: Non-existent course returns 404
  // ---------------------------------------------------------------------------
  it("Scenario 21: non-existent course returns 404 Not Found", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "سازنده دمو");
    const { packId } = await createPublishedPack(app, creator);
    const student = await setupUserAndOrg(app, "دانشجو عادی");

    const fakeCourseId = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: student.token },
      payload: { course_id: fakeCourseId },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("دوره آموزشی یافت نشد");
  });
});
