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
import type { GeneratedContentRecord } from "../modules/generation/generation-store.js";
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

describe("Content Packs & Library Backend Test Suite", () => {
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
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;

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
    contentPackStore = new InMemoryContentPackStore(userStore);
    contentPackUsageStore = new InMemoryContentPackUsageStore();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-cp-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    const auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    queue = new InMemoryGenerationQueue(generationJobStore);
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
      queue,
      gateway: createModelGateway({ provider: "mock" }),
      auditService,
      contentPackStore,
      contentPackUsageStore,
    });
    await app.ready();
    return app;
  }

  async function setupUserAndOrg(app: Awaited<ReturnType<typeof buildTestApp>>) {
    const email = `creator-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "دکتر داروساز نمونه" },
    });
    expect(res.statusCode).toBe(200);
    const token = extractSessionToken(res)!;
    const signInData = JSON.parse(res.body);
    const userId = signInData.user.id as UserId;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: "Tehran Pharmacy Faculty" },
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
        name: "فارماکولوژی ۱",
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

  async function createReadyDocumentWithContents(
    orgId: OrganizationId,
    courseId: CourseId,
    userId: UserId,
    statuses: {
      lesson?: string;
      flashcard?: string;
      quiz?: string;
      review_summary?: string;
    } = {
      lesson: "accepted",
      flashcard: "accepted",
      quiz: "accepted",
      review_summary: "accepted",
    },
  ) {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: userId,
      originalName: "فارماکولوژی_دستگاه_عصبی_CNS.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024 * 500,
      sha256: "a".repeat(64),
      storageKey: `docs/${docId}/file.pdf`,
      pageCount: 15,
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: 92,
      qualityLevel: "high",
      qualityReport: null,
      qualityAnalyzedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Seed 4 generated contents
    const contentsMap: Record<string, GeneratedContentRecord> = {};

    if (statuses.lesson) {
      const lessonId = randomUUID() as GeneratedContentId;
      const lessonPayload = {
        kind: "lesson",
        title: "فارماکولوژی اعصاب خودکار و CNS",
        moduleTitle: "فصل: فارماکولوژی اعصاب",
        outline: [
          { title: "مقدمه بر گیرنده‌های کولینرژیک" },
          { title: "داروهای شبه‌آدرنرژیک" },
        ],
        sessions: [
          {
            title: "جلسه اول: گیرنده‌های کولینرژیک",
            contentMarkdown: "## مقدمه\nگیرنده‌های استیل‌کولین به دو دسته نیکوتینی و موسکارینی تقسیم می‌شوند.",
            estimatedMinutes: 15,
          },
          {
            title: "جلسه دوم: داروهای شبه‌آدرنرژیک",
            contentMarkdown: "## آگونیست‌های سمپاتیک\nاپی‌نفرین و نوراپی‌نفرین انتقال‌دهنده‌های اصلی هستند.",
            estimatedMinutes: 20,
          },
        ],
        contentMarkdown: "# جامع اعصاب",
        citationChunkIds: ["chk-1", "chk-2"],
      };
      await generatedContentStore.create({
        id: lessonId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "lesson",
        status: statuses.lesson,
        payload: lessonPayload,
        promptVersion: "v1",
        model: "gemini-2.5-flash",
        tokenUsage: { inputTokens: 500, outputTokens: 800 },
        generationKey: null,
        acceptedAt: statuses.lesson === "accepted" ? now : null,
        acceptedBy: statuses.lesson === "accepted" ? userId : null,
        reviewedBy: userId,
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
      contentsMap.lesson = lessonPayload;
    }

    if (statuses.flashcard) {
      const fcId = randomUUID() as GeneratedContentId;
      const fcPayload = {
        kind: "flashcard",
        cards: [
          {
            question: "مکانیسم اثر آتروپین چیست؟",
            answer: "آنتاگونیست رقابتی گیرنده‌های موسکارینی استیل‌کولین",
            explanation: "آتروپین باعث بلوک پاسخ‌های پاراسمپاتیک می‌شود.",
            cardType: "mechanism",
            difficulty: "medium",
          },
          {
            question: "اندیکاسیون اصلی پیلوکارپین چیست؟",
            answer: "درمان گلوکوم با زاویه باز",
            cardType: "clinical",
            difficulty: "easy",
          },
        ],
        citationChunkIds: ["chk-1"],
      };
      await generatedContentStore.create({
        id: fcId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "flashcard",
        status: statuses.flashcard,
        payload: fcPayload,
        promptVersion: "v1",
        model: "gemini-2.5-flash",
        tokenUsage: { inputTokens: 300, outputTokens: 400 },
        generationKey: null,
        acceptedAt: statuses.flashcard === "accepted" ? now : null,
        acceptedBy: statuses.flashcard === "accepted" ? userId : null,
        reviewedBy: userId,
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
      contentsMap.flashcard = fcPayload;
    }

    if (statuses.quiz) {
      const qzId = randomUUID() as GeneratedContentId;
      const qzPayload = {
        kind: "quiz",
        title: "آزمون ارزیابی فارماکولوژی CNS",
        topic: "سیستم اعصاب خودکار",
        questions: [
          {
            question: "کدام دارو مهارکننده غیرقابل برگشت استیل‌کولین‌استراز است؟",
            questionType: "multiple_choice",
            choices: ["اکوتیوفات", "نئوستیگمین", "پیریدوستیگمین", "ادروفونیوم"],
            correctAnswer: "اکوتیوفات",
            explanation: "ترکیبات ارگانوفسفره مانند اکوتیوفات پیوند کووالانسی پایدار برقرار می‌کنند.",
            topic: "آنتی‌کولین‌استرازها",
          },
        ],
        citationChunkIds: ["chk-1", "chk-2"],
      };
      await generatedContentStore.create({
        id: qzId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "quiz",
        status: statuses.quiz,
        payload: qzPayload,
        promptVersion: "v1",
        model: "gemini-2.5-flash",
        tokenUsage: { inputTokens: 400, outputTokens: 300 },
        generationKey: null,
        acceptedAt: statuses.quiz === "accepted" ? now : null,
        acceptedBy: statuses.quiz === "accepted" ? userId : null,
        reviewedBy: userId,
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
      contentsMap.quiz = qzPayload;
    }

    if (statuses.review_summary) {
      const rsId = randomUUID() as GeneratedContentId;
      const rsPayload = {
        kind: "review_summary",
        title: "خلاصه مروری فارماکولوژی اعصاب",
        estimatedReadingMinutes: 12,
        overview: "مرور جامع و سریع اصول انتقال عصبی در ۱۲ دقیقه",
        sections: [
          {
            title: "دسته‌بندی گیرنده‌ها",
            keyPoints: ["گیرنده‌های M1 تا M5 موسکارینی", "گیرنده‌های Nm و Nn نیکوتینی"],
          },
        ],
        finalTakeaways: ["شناخت گیرنده‌ها کلید فهم عوارض جانبی است."],
        citationChunkIds: ["chk-1"],
      };
      await generatedContentStore.create({
        id: rsId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "review_summary",
        status: statuses.review_summary,
        payload: rsPayload,
        promptVersion: "v1",
        model: "gemini-2.5-flash",
        tokenUsage: { inputTokens: 600, outputTokens: 500 },
        generationKey: null,
        acceptedAt: statuses.review_summary === "accepted" ? now : null,
        acceptedBy: statuses.review_summary === "accepted" ? userId : null,
        reviewedBy: userId,
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
      contentsMap.review_summary = rsPayload;
    }

    return { docId, contentsMap };
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it("1. Successful Publish with all 4 accepted contents -> creates 1 content_pack and 4 items", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId);

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: {
        title: "بسته طلایی فارماکولوژی CNS",
        description: "شامل درسنامه‌ها، آزمون و فلش‌کارت‌های کامل مبحث",
        subject: "فارماکولوژی ۱",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.request_id).toBeDefined();
    expect(body.pack).toBeDefined();
    expect(body.pack.id).toBeDefined();
    expect(body.pack.title).toBe("بسته طلایی فارماکولوژی CNS");
    expect(body.pack.status).toBe("published");
    expect(body.pack.usage_count).toBe(0);
    expect(body.pack.items_count).toBe(4);
    expect(body.pack.stats.session_count).toBe(2);
    expect(body.pack.stats.flashcard_count).toBe(2);
    expect(body.pack.stats.quiz_question_count).toBe(1);
    expect(body.pack.stats.estimated_reading_minutes).toBe(12);

    // Verify persisted items in store
    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(4);
    const types = items.map((i) => i.contentType);
    expect(types).toEqual(["lesson", "flashcard", "quiz", "review_summary"]);
  });

  it("2. Publish succeeds with 'lesson' only (1 item snapshot)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      lesson: "accepted",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته فقط درسنامه" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.pack.items_count).toBe(1);
    expect(body.pack.stats.session_count).toBe(2);
    expect(body.pack.stats.flashcard_count).toBe(0);
    expect(body.pack.stats.quiz_question_count).toBe(0);

    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe("lesson");
  });

  it("3. Publish succeeds with 'flashcard' only (1 item snapshot)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      flashcard: "accepted",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته فقط فلش‌کارت" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.pack.items_count).toBe(1);
    expect(body.pack.stats.flashcard_count).toBe(2);
    expect(body.pack.stats.session_count).toBe(0);

    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe("flashcard");
  });

  it("4. Publish succeeds with 'quiz' only (1 item snapshot)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      quiz: "accepted",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته فقط آزمون" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.pack.items_count).toBe(1);
    expect(body.pack.stats.quiz_question_count).toBe(1);

    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe("quiz");
  });

  it("5. Publish succeeds with 'review_summary' only (1 item snapshot)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      review_summary: "accepted",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته فقط خلاصه مروری" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.pack.items_count).toBe(1);
    expect(body.pack.stats.estimated_reading_minutes).toBe(12);

    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe("review_summary");
  });

  it("6. Publish succeeds with 'lesson' + 'quiz' (2 item snapshots)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      lesson: "accepted",
      quiz: "accepted",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته درس و آزمون" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.pack.items_count).toBe(2);
    expect(body.pack.stats.session_count).toBe(2);
    expect(body.pack.stats.quiz_question_count).toBe(1);

    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(2);
    const types = items.map((i) => i.contentType);
    expect(types).toEqual(["lesson", "quiz"]);
  });

  it("7. Publish with partial accepted contents snapshots only accepted items (ignores draft/rejected)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      lesson: "accepted",
      flashcard: "draft",
      quiz: "rejected",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته با محتواهای ترکیبی" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.pack.items_count).toBe(1);

    const items = await contentPackStore.findItemsByPackId(body.pack.id);
    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe("lesson");
  });

  it("7b. Publish fails if zero accepted/publishable contents exist (all draft/rejected)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {
      lesson: "draft",
      flashcard: "draft",
      quiz: "rejected",
      review_summary: "draft",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته بدون محتوای تاییدشده" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toBe("این محتوا هنوز برای انتشار آماده نیست.");
  });

  it("7c. Publish fails if document has zero generated contents", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId, {});

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "بسته بدون محتوا" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toBe("این محتوا هنوز برای انتشار آماده نیست.");
  });

  it("8. Duplicate Publish: cannot publish 2 active published packs for the same document", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId);

    // First publish succeeds
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "پک اول" },
    });
    expect(res1.statusCode).toBe(201);

    // Second publish on same document must fail with 409 Conflict
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "پک دوم تکراری" },
    });
    expect(res2.statusCode).toBe(409);
    const body2 = JSON.parse(res2.body);
    expect(body2.error.message).toContain("از قبل وجود دارد");
  });

  it("9. Snapshot Immutability: Mutating generated_contents after publish does NOT change payload_snapshot", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId);

    // Publish pack
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "پک با تست اسنپ‌شات" },
    });
    expect(pubRes.statusCode).toBe(201);
    const packId = JSON.parse(pubRes.body).pack.id;

    // Mutate the original generated_contents row in database
    const docContents = await generatedContentStore.listByDocument(docId, orgId);
    const originalLesson = docContents.find((c) => c.type === "lesson")!;
    const mutatedPayload = {
      ...originalLesson.payload,
      title: "این یک عنوان دستکاری‌شده پس از انتشار است!",
      sessions: [],
    };
    await generatedContentStore.update({
      ...originalLesson,
      payload: mutatedPayload,
    });

    // Read the published pack items snapshot
    const packItems = await contentPackStore.findItemsByPackId(packId);
    const snapshotLesson = packItems.find((i) => i.contentType === "lesson")!;

    // Must be completely unaltered!
    expect(snapshotLesson.payloadSnapshot.title).toBe("فارماکولوژی اعصاب خودکار و CNS");
    expect((snapshotLesson.payloadSnapshot as { sessions?: unknown[] }).sessions).toHaveLength(2);
    expect(snapshotLesson.payloadSnapshot.title).not.toBe(mutatedPayload.title);
  });

  it("10. Source deletion isolation: Deleting or soft-deleting document preserves Content Pack", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "پک مقاوم در برابر حذف سند" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Simulate creator deleting their document
    await documentStore.delete(docId);

    // Detail API must still return the pack and all previews perfectly
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/library/packs/${packId}`,
    });

    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.pack.id).toBe(packId);
    expect(detailBody.pack.preview.lesson.sessionCount).toBe(2);
    expect(detailBody.pack.preview.flashcard.totalCards).toBe(2);
    expect(detailBody.pack.preview.quiz.totalQuestions).toBe(1);
    expect(detailBody.pack.preview.review_summary.title).toBe("خلاصه مروری فارماکولوژی اعصاب");
  });

  it("11. Public privacy test: GET /v1/library/packs contains NO private info", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId);

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: {
        title: "پک تست حریم خصوصی",
        description: "توضیحات عمومی پک",
        subject: "فارماکولوژی",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    const pack = body.items[0];

    // Allowed public fields
    expect(pack.id).toBeDefined();
    expect(pack.title).toBe("پک تست حریم خصوصی");
    expect(pack.creator).toBeDefined();
    expect(pack.creator.id).toBe(userId);
    expect(pack.creator.name).toBe("دکتر داروساز نمونه");

    // Strictly forbidden fields
    expect(pack.email).toBeUndefined();
    expect(pack.organization_id).toBeUndefined();
    expect(pack.source_document_id).toBeUndefined();
    expect(pack.storage_key).toBeUndefined();
    expect(pack.sha256).toBeUndefined();
    expect(pack.chunks).toBeUndefined();
    expect(res.body).not.toContain("example.com");
  });

  it("12. Library filtering: keyword 'q' and 'subject' filtering works correctly", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);

    // Create Doc 1
    const { docId: doc1 } = await createReadyDocumentWithContents(orgId, courseId, userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${doc1}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "فارماکولوژی قلب و عروق", subject: "فارماکولوژی ۱" },
    });

    // Create Doc 2
    const { docId: doc2 } = await createReadyDocumentWithContents(orgId, courseId, userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${doc2}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "میکروب‌شناسی عمومی", subject: "میکروب‌شناسی" },
    });

    // Filter by subject "فارماکولوژی ۱"
    const subRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs?subject=فارماکولوژی%20۱",
    });
    const subBody = JSON.parse(subRes.body);
    expect(subBody.items).toHaveLength(1);
    expect(subBody.items[0].title).toBe("فارماکولوژی قلب و عروق");

    // Filter by keyword query "میکروب"
    const qRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs?q=میکروب",
    });
    const qBody = JSON.parse(qRes.body);
    expect(qBody.items).toHaveLength(1);
    expect(qBody.items[0].title).toBe("میکروب‌شناسی عمومی");
  });

  it("13. Sorting: supports popular and newest ordering", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);

    const { docId: doc1 } = await createReadyDocumentWithContents(orgId, courseId, userId);
    const pub1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${doc1}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "پک قدیمی اما با استفاده بالا" },
    });
    const pack1Id = JSON.parse(pub1.body).pack.id;

    // Simulate high usage on pack1
    const p1 = await contentPackStore.findById(pack1Id);
    p1.usageCount = 50;
    p1.publishedAt = new Date(Date.now() - 100000).toISOString();
    (contentPackStore as unknown as { packs: Map<string, typeof p1> }).packs.set(p1.id, { ...p1 });

    const { docId: doc2 } = await createReadyDocumentWithContents(orgId, courseId, userId);
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${doc2}/content-pack/publish`,
      cookies: { avana_session: token },
      payload: { title: "پک تازه منتشر شده" },
    });

    // Test sort=popular (default) -> pack1 first
    const popRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs?sort=popular",
    });
    const popBody = JSON.parse(popRes.body);
    expect(popBody.items[0].title).toBe("پک قدیمی اما با استفاده بالا");

    // Test sort=newest -> pack2 first
    const newRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs?sort=newest",
    });
    const newBody = JSON.parse(newRes.body);
    expect(newBody.items[0].title).toBe("پک تازه منتشر شده");
  });

  it("14. Pagination: page, limit, total_count, and total_pages are accurate", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, userId, token } = await setupUserAndOrg(app);

    // Create 5 packs
    for (let i = 1; i <= 5; i++) {
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, userId);
      await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: token },
        payload: { title: `پک شماره ${i}` },
      });
    }

    const pageRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs?page=2&limit=2",
    });
    const body = JSON.parse(pageRes.body);
    expect(body.items).toHaveLength(2);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.total_count).toBe(5);
    expect(body.pagination.total_pages).toBe(3);
  });

  it("15. Usage uniqueness: Schema and Store ensure unique usage installation per course", async () => {
    const app = await buildTestApp();
    const { courseId, userId } = await setupUserAndOrg(app);
    const packId = randomUUID();

    // User adds pack to course 1
    await contentPackUsageStore.recordUsage({
      id: randomUUID(),
      contentPackId: packId,
      userId,
      targetCourseId: courseId,
      targetModuleId: null,
      addedAt: new Date().toISOString(),
    });

    const isAdded = await contentPackUsageStore.hasUserAdded(packId, userId);
    expect(isAdded).toBe(true);

    const userCount = await contentPackUsageStore.getUniqueUserCount(packId);
    expect(userCount).toBe(1);

    // Adding to second course by same user does not increase unique user count
    const course2Id = randomUUID();
    await contentPackUsageStore.recordUsage({
      id: randomUUID(),
      contentPackId: packId,
      userId,
      targetCourseId: course2Id,
      targetModuleId: null,
      addedAt: new Date().toISOString(),
    });

    const userCountAfterSecondCourse = await contentPackUsageStore.getUniqueUserCount(packId);
    expect(userCountAfterSecondCourse).toBe(1);
  });

  describe("16. Document Owner & Role Authorization for Content Pack Publishing", () => {
    it("16.1. student + owns document + accepted lesson -> Publish succeeds", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      // Create student member
      const studentEmail = `student-ls-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو ۱" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Student owns document with accepted lesson
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, studentId, {
        lesson: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "بسته درسنامه دانشجو" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("بسته درسنامه دانشجو");
      expect(body.pack.items_count).toBe(1);
    });

    it("16.2. student + owns document + accepted flashcard -> Publish succeeds", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      const studentEmail = `student-fc-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو فلش‌کارت" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { docId } = await createReadyDocumentWithContents(orgId, courseId, studentId, {
        flashcard: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "بسته فلش‌کارت دانشجو" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("بسته فلش‌کارت دانشجو");
      expect(body.pack.stats.flashcard_count).toBe(2);
    });

    it("16.3. student + owns document + accepted quiz -> Publish succeeds", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      const studentEmail = `student-qz-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو آزمون" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { docId } = await createReadyDocumentWithContents(orgId, courseId, studentId, {
        quiz: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "بسته آزمون دانشجو" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("بسته آزمون دانشجو");
      expect(body.pack.stats.quiz_question_count).toBe(1);
    });

    it("16.4. student + owns document + accepted review summary -> Publish succeeds", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      const studentEmail = `student-rs-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو خلاصه مروری" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { docId } = await createReadyDocumentWithContents(orgId, courseId, studentId, {
        review_summary: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "بسته خلاصه مروری دانشجو" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("بسته خلاصه مروری دانشجو");
      expect(body.pack.stats.estimated_reading_minutes).toBe(12);
    });

    it("16.5. student + owns document + partial accepted content -> Publish succeeds with accepted items", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      const studentEmail = `student-partial-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو محتوای جزئی" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { docId } = await createReadyDocumentWithContents(orgId, courseId, studentId, {
        lesson: "accepted",
        flashcard: "draft",
        quiz: "rejected",
        review_summary: "draft",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "بسته با محتوای جزئی دانشجو" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.items_count).toBe(1);
    });

    it("16.6. student + owns document + only draft/rejected content -> 400 Bad Request", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      const studentEmail = `student-draft-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو بدون تایید" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const { docId } = await createReadyDocumentWithContents(orgId, courseId, studentId, {
        lesson: "draft",
        flashcard: "draft",
        quiz: "rejected",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "بسته تاییدنشده" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toBe("این محتوا هنوز برای انتشار آماده نیست.");
    });

    it("16.7. student + does NOT own document -> 403 Forbidden", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, userId: ownerAdminId } = await setupUserAndOrg(app);

      // Student member in org
      const studentEmail = `student-non-owner-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو غیرمالک" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Document owned by ownerAdminId (NOT studentId)
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, ownerAdminId, {
        lesson: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "تلاش غیرمجاز دانشجو برای انتشار سند دیگری" },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("forbidden");
      expect(body.error.message).toContain("not permitted for role 'student'");
    });

    it("16.8. student + owns document in Org A, but tries to publish under Org B -> 404 Not Found (Cross-org isolation)", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, courseId: courseA } = await setupUserAndOrg(app);

      // Setup Org B directly via randomUUID
      const orgB = randomUUID() as OrganizationId;

      // Student is member of Org A
      const studentEmail = `student-org-iso-${Date.now()}@example.com`;
      const sRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: studentEmail, name: "دانشجو ایزولاسیون" },
      });
      const studentToken = extractSessionToken(sRes)!;
      const studentId = JSON.parse(sRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgA,
        userId: studentId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Doc is created in Org A, owned by studentId
      const { docId } = await createReadyDocumentWithContents(orgA, courseA, studentId, {
        lesson: "accepted",
      });

      // Student tries to publish under Org B (where doc does not exist and student is not member)
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgB}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: studentToken },
        payload: { title: "تلاش بین سازمانی" },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("not_found");
    });

    it("16.9. organization_admin + document owned by another user -> Publish succeeds (role permission)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, token: adminToken } = await setupUserAndOrg(app);

      // Student uploads document
      const otherStudentId = randomUUID() as UserId;
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, otherStudentId, {
        lesson: "accepted",
      });

      // Org admin publishes the document
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: adminToken },
        payload: { title: "انتشار توسط ادمین سازمان" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("انتشار توسط ادمین سازمان");
    });

    it("16.10. course_editor + document owned by another user -> Publish succeeds (role permission)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      // Create course_editor in org
      const editorEmail = `editor-${Date.now()}@example.com`;
      const eRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: editorEmail, name: "ویراستار دوره" },
      });
      const editorToken = extractSessionToken(eRes)!;
      const editorId = JSON.parse(eRes.body).user.id as UserId;

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: editorId,
        role: "course_editor",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Document owned by someone else
      const otherStudentId = randomUUID() as UserId;
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, otherStudentId, {
        lesson: "accepted",
        flashcard: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: editorToken },
        payload: { title: "انتشار توسط ویراستار دوره" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("انتشار توسط ویراستار دوره");
    });

    it("16.11. platform_admin + document owned by another user -> Publish succeeds (role permission)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await setupUserAndOrg(app);

      // Create platform_admin
      const adminEmail = `platform-admin-${Date.now()}@example.com`;
      const aRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: adminEmail, name: "سوپر ادمین پلتفرم" },
      });
      const adminToken = extractSessionToken(aRes)!;
      const adminId = JSON.parse(aRes.body).user.id as UserId;

      // Set global role to platform_admin in userStore
      const user = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(adminId);
      if (user) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
      }

      // Add membership to org (even as student membership, global role is platform_admin)
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: adminId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const otherStudentId = randomUUID() as UserId;
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, otherStudentId, {
        lesson: "accepted",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: adminToken },
        payload: { title: "انتشار توسط پلتفرم ادمین" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.pack.title).toBe("انتشار توسط پلتفرم ادمین");
    });
  });
});
