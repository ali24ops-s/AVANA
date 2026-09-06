import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type Actor,
  type ContentPackId,
  type CourseId,
  type DocumentId,
  type GeneratedContentId,
  type OrganizationId,
  type UserId,
  asContentPackId,
  asDocumentId,
  asOrganizationId,
  asUserId,
} from "@avana/domain";
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
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { createModelGateway } from "../modules/generation/index.js";
import type { GeneratedContentRecord } from "../modules/generation/generation-store.js";

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

describe("Community Content Pack Review & Monetization Architecture", () => {
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
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;
  let paymentGateway: MockPaymentGateway;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
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
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
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
    adminStore = new InMemoryAdminStore(userStore, orgStore, { documentStore } as any);
    paymentGateway = new MockPaymentGateway();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-cpm-test-"));
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
      commerceStore,
      adminStore,
      paymentGateway,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    });
    await app.ready();
    return app;
  }

  async function setupTeacher(app: Awaited<ReturnType<typeof buildTestApp>>) {
    const email = `teacher-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "دکتر مریم رضایی" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const token = extractSessionToken(res)!;
    const teacherId = body.user.id as UserId;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: `Tehran Faculty ${Date.now()}` },
    });
    expect(orgRes.statusCode).toBe(201);
    const orgId = JSON.parse(orgRes.body).organization.id as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره فارماکولوژی بالینی",
        subject: "فارماکولوژی",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    return { teacherId, orgId, courseId, token };
  }

  async function setupAdmin(app: Awaited<ReturnType<typeof buildTestApp>>) {
    const email = `admin-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "ادمین ارشد سیستم" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const token = extractSessionToken(res)!;
    const adminId = body.user.id as UserId;

    // Grant platform_admin global role in userStore
    const user = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(adminId);
    if (user) {
      user.globalRole = "platform_admin";
      user.role = "platform_admin";
    }

    return { adminId, token };
  }

  async function setupStudent(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    orgId: OrganizationId,
  ) {
    const email = `student-${Date.now()}-${Math.random()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "علی محمدی" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const token = extractSessionToken(res)!;
    const studentId = body.user.id as UserId;

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: studentId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { studentId, token };
  }

  async function createReadyDocumentWithContents(
    orgId: OrganizationId,
    courseId: CourseId,
    userId: UserId,
  ) {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: userId,
      originalName: "cardiovascular-notes.pdf",
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
    const lessonId = randomUUID() as GeneratedContentId;
    await generatedContentStore.create({
      id: lessonId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "accepted",
      payload: {
        kind: "lesson",
        title: "فارماکولوژی قلب و عروق",
        moduleTitle: "فصل اول",
        outline: [{ title: "مقدمه" }],
        sessions: [
          {
            title: "جلسه اول: داروهای ضد فشار خون",
            contentMarkdown: "## مهارکننده‌های ACE\nکاپتوپریل و انالاپریل",
            estimatedMinutes: 12,
          },
        ],
      },
      promptVersion: "v1",
      model: "gpt-4",
      tokenUsage: { inputTokens: 500, outputTokens: 800 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: userId,
      reviewedBy: userId,
      reviewedAt: now,
      reviewReason: null,
      rejectedAt: null,
      rejectedBy: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const flashcardId = randomUUID() as GeneratedContentId;
    await generatedContentStore.create({
      id: flashcardId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "flashcard",
      status: "accepted",
      payload: {
        kind: "flashcard",
        title: "فلش‌کارت‌های قلب و عروق",
        cards: [
          {
            front: "کاپتوپریل چیست؟",
            back: "مهارکننده ACE",
            explanation: "کاهش سطح آنژیوتانسین ۲",
          },
        ],
      },
      promptVersion: "v1",
      model: "gpt-4",
      tokenUsage: { inputTokens: 400, outputTokens: 600 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: userId,
      reviewedBy: userId,
      reviewedAt: now,
      reviewReason: null,
      rejectedAt: null,
      rejectedBy: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const quizId = randomUUID() as GeneratedContentId;
    await generatedContentStore.create({
      id: quizId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "quiz",
      status: "accepted",
      payload: {
        kind: "quiz",
        title: "آزمون قلب و عروق",
        questions: [
          {
            question: "کدام دارو بتابلاکر است؟",
            choices: ["پروپرانولول", "لوزارتان", "کاپتوپریل", "آملودیپین"],
            correctAnswer: "پروپرانولول",
            explanation: "پروپرانولول یک بتابلاکر غیراختصاصی است.",
          },
        ],
      },
      promptVersion: "v1",
      model: "gpt-4",
      tokenUsage: { inputTokens: 400, outputTokens: 600 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: userId,
      reviewedBy: userId,
      reviewedAt: now,
      reviewReason: null,
      rejectedAt: null,
      rejectedBy: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const summaryId = randomUUID() as GeneratedContentId;
    await generatedContentStore.create({
      id: summaryId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "خلاصه جامع قلب و عروق",
        summary: "مرور نکات کلیدی و تست‌های مهم داروهای فشار خون",
      },
      promptVersion: "v1",
      model: "gpt-4",
      tokenUsage: { inputTokens: 400, outputTokens: 600 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: userId,
      reviewedBy: userId,
      reviewedAt: now,
      reviewReason: null,
      rejectedAt: null,
      rejectedBy: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return { docId };
  }

  it("1. Creator publishes Content Pack -> initially saved with status='pending_review' and excluded from Public Library", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    // 1. Submit for review
    const publishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: {
        title: "بسته تخصصی قلب و عروق",
        description: "شامل ۴ بخش آموزشی استاندارد",
        subject: "فارماکولوژی",
      },
    });

    expect(publishRes.statusCode).toBe(201);
    const publishBody = JSON.parse(publishRes.body);
    expect(publishBody.pack.status).toBe("pending_review");
    const packId = publishBody.pack.id;

    // 2. Must NOT appear in Public Library
    const publicListRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    expect(publicListRes.statusCode).toBe(200);
    const publicList = JSON.parse(publicListRes.body);
    expect(publicList.items).toHaveLength(0);

    // 3. Must NOT be accessible via public detail
    const publicDetailRes = await app.inject({
      method: "GET",
      url: `/v1/library/packs/${packId}`,
    });
    expect(publicDetailRes.statusCode).toBe(404);
  });

  it("2. Non-admin cannot access Admin Content Pack moderation endpoints (403 Forbidden)", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const publishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته آزمایشی" },
    });
    const packId = JSON.parse(publishRes.body).pack.id;

    // Try GET /v1/admin/content-packs as instructor
    const adminListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/content-packs",
      cookies: { avana_session: teacherToken },
    });
    expect(adminListRes.statusCode).toBe(403);

    // Try POST /v1/admin/content-packs/:id/approve as instructor
    const adminApproveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: teacherToken },
      payload: { accessType: "free" },
    });
    expect(adminApproveRes.statusCode).toBe(403);
  });

  it("3. Admin Review Workspace: List pending packs and view full preview snapshots", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { token: adminToken } = await setupAdmin(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const publishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته تخصصی قلب و عروق", subject: "پزشکی" },
    });
    const packId = JSON.parse(publishRes.body).pack.id;

    // Admin lists pending packs
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/content-packs?status=pending_review",
      cookies: { avana_session: adminToken },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].id).toBe(packId);
    expect(listBody.items[0].status).toBe("pending_review");
    expect(listBody.items[0].creator.name).toBe("دکتر مریم رضایی");

    // Admin views single pack detail with full snapshot preview
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-packs/${packId}`,
      cookies: { avana_session: adminToken },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.pack.id).toBe(packId);
    expect(detailBody.preview.lesson.sessionCount).toBe(1);
    expect(detailBody.preview.lesson.sessions).toHaveLength(1);
    expect(detailBody.preview.lesson.sessions[0].title).toBe("جلسه اول: داروهای ضد فشار خون");
    expect(detailBody.preview.lesson.sessions[0].contentMarkdown).toContain("کاپتوپریل");
    expect(detailBody.preview.flashcard.totalCards).toBe(1);
    expect(detailBody.preview.flashcard.cards).toHaveLength(1);
    expect(detailBody.preview.flashcard.cards[0].front).toBe("کاپتوپریل چیست؟");
    expect(detailBody.preview.flashcard.cards[0].back).toBe("مهارکننده ACE");
    expect(detailBody.preview.quiz.totalQuestions).toBe(1);
    expect(detailBody.preview.quiz.questions).toHaveLength(1);
    expect(detailBody.preview.quiz.questions[0].question).toBe("کدام دارو بتابلاکر است؟");
    expect(detailBody.preview.quiz.questions[0].choices).toContain("پروپرانولول");
    expect(detailBody.preview.review_summary.title).toBe("خلاصه جامع قلب و عروق");
    expect(detailBody.preview.review_summary.summary).toContain("مرور نکات کلیدی");
    expect(detailBody.itemsCount).toBe(4);
  });

  it("4. Admin Approves Content Pack as FREE: visible in library, price=0, direct access granted", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { token: adminToken } = await setupAdmin(app);
    const { studentId, token: studentToken } = await setupStudent(app, orgId);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته رایگان قلب و عروق", subject: "پزشکی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Admin approves as FREE
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "free" },
    });
    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.success).toBe(true);
    expect(approveBody.pack.status).toBe("published");
    expect(approveBody.pack.metadata.accessType).toBe("free");

    // Visible in Public Library
    const publicListRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    expect(publicListRes.statusCode).toBe(200);
    const publicList = JSON.parse(publicListRes.body);
    expect(publicList.items).toHaveLength(1);
    expect(publicList.items[0].id).toBe(packId);
    expect(publicList.items[0].access_type).toBe("free");
    expect(publicList.items[0].pricing.is_free).toBe(true);
    expect(publicList.items[0].pricing.price).toBe(0);

    // Student adds pack to course -> materialization succeeds without payment
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: studentToken },
      payload: { course_id: courseId },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = JSON.parse(addRes.body);
    expect(addBody.success).toBe(true);
    expect(addBody.materialized.lessons_created).toBe(1);
  });

  it("5. Admin Approves Content Pack as PAID: creates Commerce product, paywalls access, verifies checkout & purchase", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { token: adminToken } = await setupAdmin(app);
    const { studentId, token: studentToken } = await setupStudent(app, orgId);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته پیشرفته آریتمی قلبی", subject: "پزشکی" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Admin attempts to approve as paid without valid price -> 400 Bad Request
    const badApproveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "paid", price: 0 },
    });
    expect(badApproveRes.statusCode).toBe(400);

    // Admin approves with valid price (120,000 Tomans)
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "paid", price: 120000 },
    });
    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.success).toBe(true);
    expect(approveBody.pack.status).toBe("published");
    expect(approveBody.pack.metadata.accessType).toBe("paid");
    expect(approveBody.product).toBeDefined();
    expect(approveBody.product.price).toBe(120000);
    expect(approveBody.product.active).toBe(true);
    const productId = approveBody.product.id;

    // Public Library shows price
    const publicListRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const publicList = JSON.parse(publicListRes.body);
    expect(publicList.items[0].access_type).toBe("paid");
    expect(publicList.items[0].pricing.is_free).toBe(false);
    expect(publicList.items[0].pricing.price).toBe(120000);
    expect(publicList.items[0].pricing.product_id).toBe(productId);

    // Student attempts to add to course without purchasing -> 403 Forbidden
    const unauthAddRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: studentToken },
      payload: { course_id: courseId },
    });
    expect(unauthAddRes.statusCode).toBe(403);

    // Student initiates checkout for this pack product
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: { avana_session: studentToken },
      payload: {
        productId,
        callbackUrl: "https://example.com/checkout/callback",
      },
    });
    expect(checkoutRes.statusCode).toBe(201);
    const checkoutBody = JSON.parse(checkoutRes.body);
    expect(checkoutBody.authority).toBeDefined();

    // Verify Payment Callback -> provisions permanent entitlement
    const verifyRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/verify",
      cookies: { avana_session: studentToken },
      payload: {
        authority: checkoutBody.authority,
        status: "OK",
      },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.body);
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.entitlement.resource_type).toBe("content_pack");
    expect(verifyBody.entitlement.resource_id).toBe(packId);

    // Student now adds pack to course -> Materialization succeeds
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/library/packs/${packId}/add-to-course`,
      cookies: { avana_session: studentToken },
      payload: { course_id: courseId },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = JSON.parse(addRes.body);
    expect(addBody.success).toBe(true);
    expect(addBody.materialized.lessons_created).toBe(1);
  });

  it("6. Approval Idempotency & Price Updates: Exactly 1 active product per pack, price updates without duplicate products", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { token: adminToken } = await setupAdmin(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته تکرار تایید" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // First Approve at 100,000 Tomans
    const app1 = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "paid", price: 100000 },
    });
    expect(app1.statusCode).toBe(200);
    const prod1Id = JSON.parse(app1.body).product.id;

    // Second Approve (price changed to 150,000 Tomans)
    const app2 = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "paid", price: 150000 },
    });
    expect(app2.statusCode).toBe(200);
    const prod2 = JSON.parse(app2.body).product;
    expect(prod2.id).toBe(prod1Id); // Same product updated, no duplicate created!
    expect(prod2.price).toBe(150000);

    // Verify exactly 1 product exists in commerce store for this target
    const allProducts = await commerceStore.listActiveProducts();
    const matching = allProducts.filter((p) => p.targetId === packId);
    expect(matching).toHaveLength(1);
    expect(matching[0].price).toBe(150000);
  });

  it("7. Admin Rejects Content Pack: sets status to 'rejected', deactivates product, excludes from library", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { token: adminToken } = await setupAdmin(app);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته با کیفیت نامناسب" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Reject pack with reason
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/reject`,
      cookies: { avana_session: adminToken },
      payload: { reason: "کیفیت پاسخ‌های آزمون مناسب انتشار عمومی نیست." },
    });
    expect(rejectRes.statusCode).toBe(200);
    const rejectBody = JSON.parse(rejectRes.body);
    expect(rejectBody.success).toBe(true);
    expect(rejectBody.pack.status).toBe("rejected");
    expect(rejectBody.pack.metadata.rejectionReason).toBe(
      "کیفیت پاسخ‌های آزمون مناسب انتشار عمومی نیست.",
    );

    // Verify excluded from public library
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const list = JSON.parse(listRes.body);
    expect(list.items).toHaveLength(0);
  });

  it("8. Fail-Closed Security: If accessType='paid' but active product is missing/inactive, access is denied (NOT assumed free) and checkout fails", async () => {
    const app = await buildTestApp();
    const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
    const { token: adminToken } = await setupAdmin(app);
    const { studentId, token: studentToken } = await setupStudent(app, orgId);
    const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
      cookies: { avana_session: teacherToken },
      payload: { title: "بسته تست Fail Closed" },
    });
    const packId = JSON.parse(pubRes.body).pack.id;

    // Approve as paid
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-packs/${packId}/approve`,
      cookies: { avana_session: adminToken },
      payload: { accessType: "paid", price: 80000 },
    });
    const productId = JSON.parse(approveRes.body).product.id;

    // Deactivate product to simulate configuration error or missing product
    await commerceStore.updateProduct(productId, { active: false });

    // 1. Library Discovery pricing fallback -> is_free: false (fail-closed)
    const publicListRes = await app.inject({
      method: "GET",
      url: "/v1/library/packs",
    });
    const publicList = JSON.parse(publicListRes.body);
    expect(publicList.items[0].pricing.is_free).toBe(false);

    // 2. Checkout must reject inactive product -> 404
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: { avana_session: studentToken },
      payload: {
        productId,
        callbackUrl: "https://example.com/callback",
      },
    });
    expect(checkoutRes.statusCode).toBe(404);
  });

  describe("Admin Review Preview Robustness & Status Isolation Regression Tests", () => {
    it("9. Comprehensive Payload Normalization: Handles canonical sessions, master markdown, snake_case, type='lesson', raw payloads, and truly empty payloads", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, teacherId } = await setupTeacher(app);
      const { token: adminToken } = await setupAdmin(app);

      // Helper to create pack directly in store with custom payload items
      async function createCustomPack(items: Array<{ contentType: "lesson" | "flashcard" | "quiz" | "review_summary"; payload: any }>) {
        const packId = randomUUID() as unknown as ContentPackId;
        const now = new Date().toISOString();
        const packRecord: ContentPackRecord = {
          id: packId,
          creatorUserId: teacherId,
          organizationId: orgId,
          sourceDocumentId: null,
          title: "بسته تستی بررسی ساختارها",
          description: "تست بررسی انواع payload",
          subject: "پزشکی",
          status: "pending_review",
          usageCount: 0,
          publishedAt: null,
          metadata: {
            sessionCount: 1,
            flashcardCount: 0,
            quizQuestionCount: 0,
            estimatedReadingMinutes: 10,
          },
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        const itemRecords: ContentPackItemRecord[] = items.map((it, i) => ({
          id: randomUUID(),
          contentPackId: packId,
          contentType: it.contentType,
          sourceGeneratedContentId: randomUUID() as unknown as GeneratedContentId,
          payloadSnapshot: it.payload,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        }));

        await contentPackStore.create(packRecord, itemRecords);
        return packId;
      }

      // Scenario A: Pending pack + canonical sessions array
      const packIdA = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            kind: "lesson",
            title: "درسنامه قلب",
            sessions: [
              { title: "جلسه اول", contentMarkdown: "محتوای جلسه اول", estimatedMinutes: 10 },
              { title: "جلسه دوم", contentMarkdown: "محتوای جلسه دوم", estimatedMinutes: 15 },
            ],
          },
        },
      ]);
      const resA = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdA}`,
        cookies: { avana_session: adminToken },
      });
      const bodyA = JSON.parse(resA.body);
      expect(bodyA.preview.lesson.sessions).toHaveLength(2);
      expect(bodyA.preview.lesson.hasCanonicalSessions).toBe(true);
      expect(bodyA.preview.lesson.sessions[0].contentMarkdown).toBe("محتوای جلسه اول");
      expect(bodyA.preview.lesson.sessions[1].contentMarkdown).toBe("محتوای جلسه دوم");

      // Scenario B: Pending pack + only contentMarkdown (no sessions array) -> NOT empty state!
      const packIdB = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            kind: "lesson",
            title: "درسنامه یکپارچه بدون sessions",
            contentMarkdown: "این یک درسنامه کامل است که در یک فایل آمده است.",
          },
        },
      ]);
      const resB = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdB}`,
        cookies: { avana_session: adminToken },
      });
      const bodyB = JSON.parse(resB.body);
      expect(bodyB.preview.lesson.sessions).toHaveLength(1);
      expect(bodyB.preview.lesson.hasCanonicalSessions).toBe(false);
      expect(bodyB.preview.lesson.sessions[0].contentMarkdown).toBe(
        "این یک درسنامه کامل است که در یک فایل آمده است.",
      );
      expect(bodyB.preview.lesson.contentMarkdown).toBe(
        "این یک درسنامه کامل است که در یک فایل آمده است.",
      );

      // Scenario C: Pending pack + snake_case content_markdown
      const packIdC = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            kind: "lesson",
            title: "درسنامه snake_case",
            sessions: [
              { title: "جلسه اسنیک", content_markdown: "متن با فرمت اسنیک کیس", estimated_minutes: 20 },
            ],
          },
        },
      ]);
      const resC = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdC}`,
        cookies: { avana_session: adminToken },
      });
      const bodyC = JSON.parse(resC.body);
      expect(bodyC.preview.lesson.sessions[0].contentMarkdown).toBe("متن با فرمت اسنیک کیس");
      expect(bodyC.preview.lesson.sessions[0].estimatedMinutes).toBe(20);

      // Scenario D: Pending pack + type="lesson" (instead of kind="lesson")
      const packIdD = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            type: "lesson",
            title: "درسنامه با تایپ",
            contentMarkdown: "محتوای تایپ لسون",
          },
        },
      ]);
      const resD = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdD}`,
        cookies: { avana_session: adminToken },
      });
      const bodyD = JSON.parse(resD.body);
      expect(bodyD.preview.lesson).toBeDefined();
      expect(bodyD.preview.lesson.sessions[0].contentMarkdown).toBe("محتوای تایپ لسون");

      // Scenario E: Pending pack + kind="lesson"
      const packIdE = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            kind: "lesson",
            title: "درسنامه با کایند",
            contentMarkdown: "محتوای کایند لسون",
          },
        },
      ]);
      const resE = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdE}`,
        cookies: { avana_session: adminToken },
      });
      const bodyE = JSON.parse(resE.body);
      expect(bodyE.preview.lesson).toBeDefined();
      expect(bodyE.preview.lesson.sessions[0].contentMarkdown).toBe("محتوای کایند لسون");

      // Scenario F: Pending pack + raw lesson payload without kind/type
      const packIdF = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            title: "درسنامه خام",
            contentMarkdown: "محتوای پی‌لود خام",
          },
        },
      ]);
      const resF = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdF}`,
        cookies: { avana_session: adminToken },
      });
      const bodyF = JSON.parse(resF.body);
      expect(bodyF.preview.lesson).toBeDefined();
      expect(bodyF.preview.lesson.sessions[0].contentMarkdown).toBe("محتوای پی‌لود خام");

      // Scenario G: Truly empty lesson
      const packIdG = await createCustomPack([
        {
          contentType: "lesson",
          payload: {
            sessions: [],
          },
        },
      ]);
      const resG = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packIdG}`,
        cookies: { avana_session: adminToken },
      });
      const bodyG = JSON.parse(resG.body);
      expect(bodyG.preview.lesson.sessions).toHaveLength(0);
      expect(bodyG.preview.lesson.sessionCount).toBe(0);
    });

    it("10. Status Isolation: Pending review pack is fully visible to Admin, but strictly excluded from Student/Public Library", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, teacherId, token: teacherToken } = await setupTeacher(app);
      const { token: adminToken } = await setupAdmin(app);
      const { studentId, token: studentToken } = await setupStudent(app, orgId);
      const { docId } = await createReadyDocumentWithContents(orgId, courseId, teacherId);

      // Creator publishes pack -> status='pending_review'
      const pubRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/content-pack/publish`,
        cookies: { avana_session: teacherToken },
        payload: { title: "بسته آزمایشی ایزولاسیون" },
      });
      expect(pubRes.statusCode).toBe(201);
      const packId = JSON.parse(pubRes.body).pack.id;

      // Scenario H: Admin CAN view full content preview and sourceDocument metadata
      const adminDetailRes = await app.inject({
        method: "GET",
        url: `/v1/admin/content-packs/${packId}`,
        cookies: { avana_session: adminToken },
      });
      expect(adminDetailRes.statusCode).toBe(200);
      const adminDetail = JSON.parse(adminDetailRes.body);
      expect(adminDetail.pack.status).toBe("pending_review");
      expect(adminDetail.preview.lesson).toBeDefined();
      expect(adminDetail.preview.lesson.sessions.length).toBeGreaterThan(0);
      expect(adminDetail.preview.flashcard.cards.length).toBeGreaterThan(0);
      expect(adminDetail.preview.quiz.questions.length).toBeGreaterThan(0);
      expect(adminDetail.sourceDocument).toBeDefined();
      expect(adminDetail.sourceDocument.id).toBe(docId);

      // Scenario I: Student/Public CANNOT see the pending review pack in list or detail
      const publicListRes = await app.inject({
        method: "GET",
        url: "/v1/library/packs",
      });
      const publicList = JSON.parse(publicListRes.body);
      expect(publicList.items.find((p: any) => p.id === packId)).toBeUndefined();

      const publicDetailRes = await app.inject({
        method: "GET",
        url: `/v1/library/packs/${packId}`,
      });
      expect(publicDetailRes.statusCode).toBe(404);

      // Scenario J: Approved pack -> visible and access behavior preserved
      const approveRes = await app.inject({
        method: "POST",
        url: `/v1/admin/content-packs/${packId}/approve`,
        cookies: { avana_session: adminToken },
        payload: { accessType: "free" },
      });
      expect(approveRes.statusCode).toBe(200);

      const approvedPublicDetailRes = await app.inject({
        method: "GET",
        url: `/v1/library/packs/${packId}`,
      });
      expect(approvedPublicDetailRes.statusCode).toBe(200);
      const approvedPublic = JSON.parse(approvedPublicDetailRes.body);
      expect(approvedPublic.pack.id).toBe(packId);
      expect(approvedPublic.pack.access_type).toBe("free");
      expect(approvedPublic.pack.preview).toBeDefined();
    });
  });
});
