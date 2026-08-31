import { describe, expect, it, beforeEach, afterEach } from "vitest";
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

describe("Content Pack Concurrency, Lifecycle & Hardening Test Suite", () => {
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
    contentPackStore.setUsageStore(contentPackUsageStore);

    storageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "avana-concurrency-test-"),
    );
    storageProvider = new LocalStorageProvider(storageDir);
    auditService = new AuditService(new InMemoryAuditStore());
    queue = new InMemoryGenerationQueue();
    gateway = createModelGateway({
      provider: "mock",
      apiKey: "mock",
    });
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
    });
    await app.ready();
    return app;
  }

  async function setupUserAndOrg(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    name = "استاد رضایی",
    courseName = "زیست ۱",
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
      payload: { name: `Org ${name} ${Date.now()}-${Math.random()}` },
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
        subject: "زیست‌شناسی",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    return { userId, orgId, courseId, token };
  }

  async function seedAcceptedDocumentAndAllContents(
    creatorUserId: UserId,
    orgId: OrganizationId,
    courseId: CourseId,
  ) {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgId,
      originalName: "Biology-101.pdf",
      storageKey: `docs/${docId}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10240,
      pageCount: 5,
      status: "ready",
      errorMessage: null,
      retries: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lesson = await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "accepted",
      payload: {
        kind: "lesson",
        title: "زیست‌شناسی سلولی",
        sessions: [
          { title: "جلسه اول: ساختار سلول", contentMarkdown: "# سلول و اندامک‌ها", estimatedMinutes: 15 },
          { title: "جلسه دوم: غشای سلولی", contentMarkdown: "# فسفولیپیدها و انتقال مواد", estimatedMinutes: 20 },
        ],
      },
      promptVersion: "v1",
      model: "mock-model",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: now,
      acceptedBy: creatorUserId,
      reviewedBy: creatorUserId,
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

    const flashcard = await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "flashcard",
      status: "accepted",
      payload: {
        kind: "flashcard",
        cards: [
          { question: "میتوکندری چیست؟", answer: "اندامک تولید انرژی سلول (ATP)", sessionIndex: 0, difficulty: "easy" },
          { question: "ریبوزوم چه نقشی دارد؟", answer: "سنتز پروتئین‌ها", sessionIndex: 0, difficulty: "medium" },
          { question: "سیالیت غشا به چه عاملی بستگی دارد؟", answer: "اسیدهای چرب غیر اشباع و کلسترول", sessionIndex: 1, difficulty: "hard" },
        ],
      },
      promptVersion: "v1",
      model: "mock-model",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: now,
      acceptedBy: creatorUserId,
      reviewedBy: creatorUserId,
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

    const quiz = await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "accepted",
      payload: {
        kind: "quiz",
        title: "آزمون ارزیابی زیست سلولی",
        topic: "زیست سلولی",
        questions: [
          {
            question: "کدام اندامک مسئول تولید ATP است؟",
            choices: ["میتوکندری", "ریبوزوم", "هسته", "گلژی"],
            correctAnswer: "میتوکندری",
            sessionIndex: 0,
            difficulty: "easy",
          },
          {
            question: "سنتز پروتئین در کدام بخش انجام می‌شود؟",
            choices: ["ریبوزوم", "لیزوزوم", "واکوئل", "سانتریول"],
            correctAnswer: "ریبوزوم",
            sessionIndex: 0,
            difficulty: "medium",
          },
        ],
      },
      promptVersion: "v1",
      model: "mock-model",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: now,
      acceptedBy: creatorUserId,
      reviewedBy: creatorUserId,
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

    const reviewSummary = await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        overview: "خلاصه مباحث مهم زیست سلولی، اندامک‌ها و عملکرد غشا.",
        keyPoints: ["میتوکندری مرکز انرژی است", "ریبوزوم سازنده پروتئین است"],
      },
      promptVersion: "v1",
      model: "mock-model",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: now,
      acceptedBy: creatorUserId,
      reviewedBy: creatorUserId,
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

    return { docId, lesson, flashcard, quiz, reviewSummary };
  }

  // -------------------------------------------------------------------------
  // 1. Concurrent Publish
  // -------------------------------------------------------------------------
  it("Scenario 1: Concurrent Publish for same Document allows exactly 1 active pack and rejects duplicate with 409", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    // Two concurrent publish requests for the exact same document
    const [resA, resB] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
        headers: {
          cookie: `avana_session=${creator.token}`,
          "x-organization-id": creator.orgId,
        },
        payload: { title: "بسته زیست ۱" },
      }),
      app.inject({
        method: "POST",
        url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
        headers: {
          cookie: `avana_session=${creator.token}`,
          "x-organization-id": creator.orgId,
        },
        payload: { title: "بسته زیست ۱ موازی" },
      }),
    ]);

    const statusCodes = [resA.statusCode, resB.statusCode].sort();
    expect(statusCodes).toEqual([201, 409]);

    // Check that exactly one published pack exists
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const listBody = JSON.parse(listRes.body);
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].title).toBe("بسته زیست ۱");
  });

  // -------------------------------------------------------------------------
  // 2. Concurrent Add-to-Course (Same User + Same Course)
  // -------------------------------------------------------------------------
  it("Scenario 2: Concurrent Add-to-Course by same user in same course is completely idempotent and produces 0 duplicates", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته جامع زیست‌شناسی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Student setup
    const student = await setupUserAndOrg(app, "علی حسینی", "کنکور تجربی");

    // Two parallel add-to-course requests in the exact same millisecond
    const [addRes1, addRes2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/library/packs/${packId}/add-to-course`,
        headers: { cookie: `avana_session=${student.token}` },
        payload: { course_id: student.courseId },
      }),
      app.inject({
        method: "POST",
        url: `/v1/library/packs/${packId}/add-to-course`,
        headers: { cookie: `avana_session=${student.token}` },
        payload: { course_id: student.courseId },
      }),
    ]);

    expect(addRes1.statusCode).toBe(200);
    expect(addRes2.statusCode).toBe(200);

    const body1 = JSON.parse(addRes1.body);
    const body2 = JSON.parse(addRes2.body);

    const installedFlags = [body1.already_installed, body2.already_installed];
    expect(installedFlags).toContain(false);
    expect(installedFlags).toContain(true);

    // Verify exactly 1 module created in target course
    const targetModules = await moduleStore.listByCourse(student.courseId);
    expect(targetModules).toHaveLength(1);

    // Verify usage_count is exactly 1
    const pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 3. Concurrent Multi-User Installation
  // -------------------------------------------------------------------------
  it("Scenario 3: Concurrent Add-to-Course by 5 distinct users accurately increments usage_count to 5 without lost updates", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته جامع زیست‌شناسی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Create 5 students concurrently
    const students = await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        setupUserAndOrg(app, `دانشجو شماره ${i + 1}`, `دوره ${i + 1}`),
      ),
    );

    // 5 concurrent installations in parallel
    const installResponses = await Promise.all(
      students.map((st) =>
        app.inject({
          method: "POST",
          url: `/v1/library/packs/${packId}/add-to-course`,
          headers: { cookie: `avana_session=${st.token}` },
          payload: { course_id: st.courseId },
        }),
      ),
    );

    installResponses.forEach((res) => {
      expect(res.statusCode).toBe(200);
      const b = JSON.parse(res.body);
      expect(b.success).toBe(true);
      expect(b.already_installed).toBe(false);
    });

    // Check usage count
    const pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(5);

    // Check library search reflects usage_count 5
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const listBody = JSON.parse(listRes.body);
    expect(listBody.items[0].usage_count).toBe(5);
  });

  // -------------------------------------------------------------------------
  // 4. Concurrent Multi-Course Install by Same User
  // -------------------------------------------------------------------------
  it("Scenario 4: Concurrent Add-to-Course by same user into 3 courses in parallel increments usage_count by exactly 1", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته جامع زیست‌شناسی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Single student with 3 separate courses in their org
    const student = await setupUserAndOrg(app, "سارا راد", "کلاس الف");
    const now = new Date().toISOString();

    const c2 = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: c2,
        organizationId: student.orgId,
        name: "کلاس ب",
        subject: "زیست",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const c3 = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: c3,
        organizationId: student.orgId,
        name: "کلاس ج",
        subject: "زیست",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Install concurrently into all 3 courses
    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/library/packs/${packId}/add-to-course`,
        headers: { cookie: `avana_session=${student.token}` },
        payload: { course_id: student.courseId },
      }),
      app.inject({
        method: "POST",
        url: `/v1/library/packs/${packId}/add-to-course`,
        headers: { cookie: `avana_session=${student.token}` },
        payload: { course_id: c2 },
      }),
      app.inject({
        method: "POST",
        url: `/v1/library/packs/${packId}/add-to-course`,
        headers: { cookie: `avana_session=${student.token}` },
        payload: { course_id: c3 },
      }),
    ]);

    results.forEach((r) => expect(r.statusCode).toBe(200));

    // Verify all 3 courses got their module
    const m1 = await moduleStore.listByCourse(student.courseId);
    const m2 = await moduleStore.listByCourse(c2);
    const m3 = await moduleStore.listByCourse(c3);
    expect(m1).toHaveLength(1);
    expect(m2).toHaveLength(1);
    expect(m3).toHaveLength(1);

    // Invariant: usage_count MUST be exactly 1 because it represents unique users
    const pack = await contentPackStore.findById(packId);
    expect(pack?.usageCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 5. Lifecycle Decoupling: Creator Deleted
  // -------------------------------------------------------------------------
  it("Scenario 5: Creator user deletion does not delete public pack from library or prevent installations", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد موقت", "ریاضی ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته ریاضیات ۱" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Simulate creator account deletion / decoupling (creatorUserId set to null)
    const pack = await contentPackStore.findById(packId);
    expect(pack).toBeDefined();
    pack.creatorUserId = null;
    (contentPackStore as unknown as { packs: Map<string, typeof pack> }).packs.set(pack.id, { ...pack });

    // Public Library detail endpoint still works cleanly and defaults creator name
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/library/packs/${packId}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.pack.creator.name).toBe("کاربر آوانا");
    expect(detailBody.pack.title).toBe("بسته ریاضیات ۱");

    // Student can still add this pack to their course
    const student = await setupUserAndOrg(app, "امیر محمدی", "ریاضی کنکور");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      headers: { cookie: `avana_session=${student.token}` },
      payload: { course_id: student.courseId },
    });
    expect(addRes.statusCode).toBe(200);
    expect(JSON.parse(addRes.body).success).toBe(true);

    const mods = await moduleStore.listByCourse(student.courseId);
    expect(mods).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 6. Source Document Deletion & Regeneration Isolation
  // -------------------------------------------------------------------------
  it("Scenario 6: Creator deleting source document or regenerating drafts leaves Library snapshot 100% intact", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId, lesson, flashcard } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته زیست‌شناسی ماندگار" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // 1. Creator regenerates drafts / changes status to draft / edits payloads
    await generatedContentStore.update({
      ...lesson,
      status: "draft",
      payload: { kind: "lesson", title: "عنوان ویرایش شده", sessions: [] },
      updatedAt: new Date().toISOString(),
    });
    await generatedContentStore.update({
      ...flashcard,
      status: "rejected",
      payload: { kind: "flashcard", cards: [] },
      updatedAt: new Date().toISOString(),
    });

    // 2. Creator soft-deletes the source document
    await documentStore.update({
      ...(await documentStore.findByIdForOrganization(docId, creator.orgId))!,
      deletedAt: new Date().toISOString(),
    });

    // Verify Library Detail endpoint is completely unaffected
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/library/packs/${packId}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.body).pack;
    expect(detail.title).toBe("بسته زیست‌شناسی ماندگار");
    expect(detail.preview.lesson.sessionTitles).toHaveLength(2);
    expect(detail.preview.flashcard.sampleQuestions).toHaveLength(3);
    expect(detail.preview.quiz.totalQuestions).toBe(2);

    // Student adds to course successfully
    const student = await setupUserAndOrg(app, "محسن راد", "کنکور ۱۴۰۵");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      headers: { cookie: `avana_session=${student.token}` },
      payload: { course_id: student.courseId },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = JSON.parse(addRes.body);
    expect(addBody.materialized.lessons_created).toBe(2);
    expect(addBody.materialized.flashcards_created).toBe(3);
    expect(addBody.materialized.quiz_questions_created).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 7. Quiz Shuffling & Answer Synchronization Invariant
  // -------------------------------------------------------------------------
  it("Scenario 7: Materialized Quiz preserves correctAnswer synchronization and canonicalizes choices", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته ارزیابی آزمون" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    const student = await setupUserAndOrg(app, "نیما افشار", "آزمون آزمایشی");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      headers: { cookie: `avana_session=${student.token}` },
      payload: { course_id: student.courseId },
    });
    expect(addRes.statusCode).toBe(200);

    // Verify quiz questions in student's course
    const studentQuizzes = await quizStore.listByCourse(student.courseId, student.orgId);
    expect(studentQuizzes).toHaveLength(1);
    const studentQuiz = studentQuizzes[0];

    const questions = await quizQuestionStore.listByQuiz(studentQuiz.id);
    expect(questions).toHaveLength(2);

    const q1 = questions.find((q) => q.question.includes("تولید ATP"));
    expect(q1).toBeDefined();
    expect(q1.correctAnswer).toBe("میتوکندری");
    expect(q1.choices).toContain("میتوکندری");
    expect(q1.choices).toHaveLength(4);

    const q2 = questions.find((q) => q.question.includes("سنتز پروتئین"));
    expect(q2).toBeDefined();
    expect(q2.correctAnswer).toBe("ریبوزوم");
    expect(q2.choices).toContain("ریبوزوم");
    expect(q2.choices).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // 8. Tenant Authorization Isolation
  // -------------------------------------------------------------------------
  it("Scenario 8: User cannot add content pack to a course belonging to another organization where they are not a member (403)", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته محتوای عمومی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Student A creates Course in Org A
    const studentA = await setupUserAndOrg(app, "دانشجو الف", "دوره هوش مصنوعی");

    // Student B (in different Org B) attempts to install the pack into Course A
    const studentB = await setupUserAndOrg(app, "دانشجو ب", "دوره معماری");

    const hackAttemptRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      headers: { cookie: `avana_session=${studentB.token}` },
      payload: { course_id: studentA.courseId },
    });

    expect(hackAttemptRes.statusCode).toBe(403);
    const errBody = JSON.parse(hackAttemptRes.body);
    expect(errBody.error?.code || errBody.code || errBody.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 9. Learning State Isolation (Zero cloning of attempts, schedules, reviews)
  // -------------------------------------------------------------------------
  it("Scenario 9: Materialization creates completely fresh learning state with 0 schedules, 0 attempts, and 0 reviews", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته محتوای بدون پیشرفت قبلی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    const student = await setupUserAndOrg(app, "دانشجو پاک", "دوره تمیز");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      headers: { cookie: `avana_session=${student.token}` },
      payload: { course_id: student.courseId },
    });
    expect(addRes.statusCode).toBe(200);

    // Verify 0 flashcard reviews for student
    const reviewsCount = await flashcardReviewStore.countByUser(student.userId);
    expect(reviewsCount).toBe(0);

    // Verify 0 flashcard schedules for student
    const schedules = await userFlashcardScheduleStore.listByUser(student.userId);
    expect(schedules).toHaveLength(0);

    // Verify 0 quiz attempts for student
    const attempts = await quizAttemptStore.listByUser(student.userId);
    expect(attempts).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 10. Materialization ID & Course Isolation
  // -------------------------------------------------------------------------
  it("Scenario 10: Materialized entities are strictly scoped to target course and target organization", async () => {
    const app = await buildTestApp();
    const creator = await setupUserAndOrg(app, "استاد رضایی", "زیست ۱");
    const { docId } = await seedAcceptedDocumentAndAllContents(creator.userId, creator.orgId, creator.courseId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creator.orgId}/documents/${docId}/content-pack/publish`,
      headers: {
        cookie: `avana_session=${creator.token}`,
        "x-organization-id": creator.orgId,
      },
      payload: { title: "بسته ایزولاسیون کامل" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    const student = await setupUserAndOrg(app, "دانشجو ایزوله", "دوره ایزوله");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      headers: { cookie: `avana_session=${student.token}` },
      payload: { course_id: student.courseId },
    });
    expect(addRes.statusCode).toBe(200);

    // Check Module belongs strictly to student course
    const modules = await moduleStore.listByCourse(student.courseId);
    expect(modules).toHaveLength(1);
    expect(modules[0].courseId).toBe(student.courseId);

    // Check Lessons belong to student module
    const lessons = await lessonStore.listByModule(modules[0].id);
    expect(lessons).toHaveLength(2);
    lessons.forEach((l) => {
      expect(l.moduleId).toBe(modules[0].id);
    });

    // Check Flashcards belong to student course and target org
    const cards = await flashcardStore.listByCourse(student.courseId, student.orgId);
    expect(cards).toHaveLength(3);
    cards.forEach((c) => {
      expect(c.courseId).toBe(student.courseId);
      expect(c.organizationId).toBe(student.orgId);
      expect(c.lessonId).toBeDefined();
    });

    // Check Quizzes belong to student course and target org
    const quizzes = await quizStore.listByCourse(student.courseId, student.orgId);
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0].courseId).toBe(student.courseId);
    expect(quizzes[0].organizationId).toBe(student.orgId);
  });
});
