import { describe, test, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  asCourseId,
  asCoursePublicationId,
  asDocumentId,
  asProductId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemorySubCourseGroupStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryCourseStore,
  InMemoryCoursePublicationStore,
} from "../modules/courses/test/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

describe("Personal Courses and Course Publication Workflow E2E", () => {
  let app: any;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;
  let courseStore: InMemoryCourseStore;
  let coursePublicationStore: InMemoryCoursePublicationStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let notificationStore: InMemoryNotificationStore;

  let regularUserToken: string;
  let regularUserId: UserId;
  let regularUserOrgId: OrganizationId;

  let adminUserToken: string;
  let adminUserId: UserId;
  let adminUserOrgId: OrganizationId;

  async function createAuthenticatedUser(email: string, role: Role) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "secure_pass_hash_123",
      name: email.split("@")[0],
    });
    if (role === Roles.platform_admin) {
      user.globalRole = "platform_admin";
      user.role = "platform_admin";
      userStore.insert({ ...user });
    } else if (role === Roles.content_worker) {
      user.globalRole = "content_worker";
      user.role = "content_worker";
      userStore.insert({ ...user });
    }
    const orgId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: `${email} Org`,
        slug: `org-${user.id}`,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgId,
        userId: user.id as UserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
    const session = await sessionService.createSession(user.id);
    return { token: session.sessionToken, userId: user.id, orgId };
  }

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    sessionService = new SessionService(sessionStore, config.session);

    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    documentStore = new InMemoryDocumentStore();
    const documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    const citationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();
    const gateway = new MockModelGateway();
    const queue = new InMemoryGenerationQueue();

    courseStore = new InMemoryCourseStore(orgStore);
    coursePublicationStore = new InMemoryCoursePublicationStore();
    moduleStore = new InMemoryModuleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    subCourseGroupStore.setModuleStore(moduleStore);
    lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    notificationStore = new InMemoryNotificationStore();
    const notificationService = new NotificationService(notificationStore);

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore,
      gateway,
      queue,
      courseStore,
      coursePublicationStore,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      notificationService,
    });
    await app.ready();

    const regular = await createAuthenticatedUser("learner@example.com", Roles.authenticated);
    regularUserToken = regular.token;
    regularUserId = regular.userId;
    regularUserOrgId = regular.orgId;

    const admin = await createAuthenticatedUser("admin@avana.ir", Roles.platform_admin);
    adminUserToken = admin.token;
    adminUserId = admin.userId;
    adminUserOrgId = admin.orgId;
  });

  test("Complete lifecycle: personal course creation, structuring, submission, rejection, resubmission, and approval", async () => {
    // 1. Create a personal course
    const createCourseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "جامع یادگیری ماشین و پایتون",
        subject: "هوش مصنوعی و داده",
      },
    });

    expect(createCourseRes.statusCode).toBe(201);
    const courseBody = createCourseRes.json();
    expect(courseBody.course.id).toBeDefined();
    expect(courseBody.course.title).toBe("جامع یادگیری ماشین و پایتون");
    const courseId = courseBody.course.id;

    // 2. Add chapters
    const createChap1Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "فصل اول: مقدمه و پیش‌نیازها",
        orderIndex: 0,
      },
    });
    expect(createChap1Res.statusCode).toBe(201);
    const chap1 = createChap1Res.json().chapter;

    const createChap2Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "فصل دوم: رگرسیون و طبقه‌بندی",
        orderIndex: 1,
      },
    });
    expect(createChap2Res.statusCode).toBe(201);
    const chap2 = createChap2Res.json().chapter;

    // 3. Add module with document to chapter 1
    const docId = asDocumentId(randomUUID());
    await documentStore.insert({
      id: docId,
      organizationId: regularUserOrgId,
      courseId,
      ownerUserId: regularUserId,
      userId: regularUserId,
      title: "جزوه ریاضیات یادگیری ماشین",
      filename: "math_ml.pdf",
      originalName: "math_ml.pdf",
      mimeType: "application/pdf",
      byteSize: 1024 * 50,
      sizeBytes: 1024 * 50,
      pageCount: 15,
      contentHash: "sha256-secret-hash-1234",
      sha256: "sha256-secret-hash-1234",
      storageKey: "private/vault/math_ml.pdf",
      language: "fa",
      summary: "خلاصه مباحث جبر خطی و آمار",
      tags: ["math", "ml"],
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any);

    const createModRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/modules`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "درس ۱: جبر خطی کاربردی",
        description: "بردارها و ماتریس‌ها",
        chapterId: chap1.id,
        documentId: docId,
      },
    });
    expect(createModRes.statusCode).toBe(201);
    const module1 = createModRes.json().module;
    expect(module1.documentId).toBe(docId);

    // 4. Check course structure endpoint
    const structureRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/structure`,
      headers: {
        Cookie: `avana_session=${regularUserToken}`,
      },
    });
    expect(structureRes.statusCode).toBe(200);
    const structure = structureRes.json();
    expect(structure.chapters.length).toBe(2);
    expect(structure.chapters[0].modules.length).toBe(1);

    // 5. Attempt publication without generated content -> Should fail with 400
    const failPublishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "جامع یادگیری ماشین و پایتون",
      },
    });
    expect(failPublishRes.statusCode).toBe(400);
    const failBody = failPublishRes.json();
    expect(failBody.error).toBeDefined();

    // 6. Populate required generated content for the module (lesson, flashcard, quiz, review summary)
    const now = new Date().toISOString();
    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "lesson",
      status: "accepted",
      payload: {
        kind: "lesson",
        title: "درس‌نامه جبر خطی",
        contentMarkdown: "# ماتریس‌ها\nماتریس آرایه‌ای دو بعدی از اعداد است.",
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "flashcard",
      status: "accepted",
      payload: {
        kind: "flashcard",
        cards: [
          {
            front: "ماتریس همانی چیست؟",
            back: "ماتریسی با درایه‌های قطر اصلی ۱ و بقیه ۰",
            difficulty: "easy",
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "quiz",
      status: "accepted",
      payload: {
        kind: "quiz",
        title: "کوئیز جبر خطی",
        questions: [
          {
            question: "دترمینان ماتریس واحد چند است؟",
            choices: ["0", "1", "-1", "تعریف نشده"],
            correctAnswer: "1",
            difficulty: "easy",
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "مرور سریع فصل",
        overview: "دترمینان ماتریس معکوس‌پذیری را نشان می‌دهد.",
        summary: "دترمینان ماتریس معکوس‌پذیری را نشان می‌دهد.",
        estimatedReadingMinutes: 5,
        sections: [
          {
            title: "نکات مهم",
            keyPoints: ["ماتریس وارون‌پذیر دترمینان غیر صفر دارد."],
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Publish course with full valid content -> Should succeed!
    const publishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "جامع یادگیری ماشین و پایتون",
        description: "نسخه نهایی دوره همراه با درس، فلش‌کارت، کوییز و خلاصه",
      },
    });
    expect(publishRes.statusCode).toBe(201);
    const pubBody = publishRes.json();
    expect(pubBody.publication.status).toBe("pending_review");
    expect(pubBody.publication.id).toBeDefined();

    // 8. Privacy & Sanitization Check: Ensure snapshot does NOT leak private keys / hashes
    const publication = await coursePublicationStore.findLatestByCourse(asCourseId(courseId));
    expect(publication).toBeDefined();
    const snapshot = publication!.snapshot;
    expect(snapshot.title).toBe("جامع یادگیری ماشین و پایتون");
    expect(snapshot.chapters.length).toBe(2);
    expect(snapshot.stats.lessonCount).toBe(1);
    expect(snapshot.stats.flashcardCount).toBe(1);
    expect(snapshot.stats.quizQuestionCount).toBe(1);

    const serializedSnapshot = JSON.stringify(snapshot);
    expect(serializedSnapshot).not.toContain("private/vault/math_ml.pdf");
    expect(serializedSnapshot).not.toContain("sha256-secret-hash-1234");

    // 9. Admin lists course submissions
    const adminListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/course-submissions",
      headers: {
        Cookie: `avana_session=${adminUserToken}`,
      },
    });
    expect(adminListRes.statusCode).toBe(200);
    const adminList = adminListRes.json();
    expect(adminList.items.length).toBe(1);
    expect(adminList.items[0].courseId).toBe(courseId);
    expect(adminList.items[0].status).toBe("pending_review");

    // 10. Admin rejects with reason
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${adminList.items[0].id}/reject`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        rejectionReason: "لطفاً توضیحات فصل دوم را کامل‌تر کنید.",
      },
    });
    expect(rejectRes.statusCode).toBe(200);
    const rejectBody = rejectRes.json();
    expect(rejectBody.status).toBe("rejected");
    expect(rejectBody.rejectionReason).toBe("لطفاً توضیحات فصل دوم را کامل‌تر کنید.");

    // Direct Persistence Verification: Rejection saved in DB & course reverted to draft
    const persistedRejectedPub = await coursePublicationStore.findById(asCoursePublicationId(adminList.items[0].id));
    expect(persistedRejectedPub).toBeDefined();
    expect(persistedRejectedPub?.status).toBe("rejected");
    expect(persistedRejectedPub?.metadata.rejectionReason).toBe("لطفاً توضیحات فصل دوم را کامل‌تر کنید.");

    const persistedCourseAfterReject = await courseStore.findById(asCourseId(courseId));
    expect(persistedCourseAfterReject).toBeDefined();
    expect(persistedCourseAfterReject?.status).toBe("draft");

    // Verify rejection notification was created
    const notificationsAfterReject = await notificationStore.listForUser(regularUserId);
    expect(
      notificationsAfterReject.items.some(
        (n: any) => n.type === "course_rejected" || n.type === "COURSE_REJECTED",
      ),
    ).toBe(true);

    // 11. User updates chapter 2 and resubmits
    await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/chapters/${chap2.id}`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "فصل دوم: الگوریتم‌های طبقه‌بندی و رگرسیون",
      },
    });

    const resubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "جامع یادگیری ماشین و پایتون",
        description: "توضیحات فصل دوم طبق بازخورد اصلاح گردید.",
      },
    });
    expect(resubmitRes.statusCode).toBe(201);

    // 12. Admin approves course as Paid (150,000 Tomans)
    const adminListRes2 = await app.inject({
      method: "GET",
      url: "/v1/admin/course-submissions",
      headers: {
        Cookie: `avana_session=${adminUserToken}`,
      },
    });
    const pendingItem = adminListRes2.json().items[0];

    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pendingItem.id}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
        priceTomans: 150000,
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const approvedBody = approveRes.json();
    expect(approvedBody.status).toBe("published");
    expect(approvedBody.accessType).toBe("paid");
    expect(approvedBody.priceTomans).toBe(150000);
    expect(approvedBody.productId).toBeDefined();

    // Direct Persistence Verification: Approval saved in DB & course published
    const persistedApprovedPub = await coursePublicationStore.findById(asCoursePublicationId(pendingItem.id));
    expect(persistedApprovedPub).toBeDefined();
    expect(persistedApprovedPub?.status).toBe("published");
    expect(persistedApprovedPub?.metadata.accessType).toBe("paid");

    const persistedCourseAfterApprove = await courseStore.findById(asCourseId(courseId));
    expect(persistedCourseAfterApprove).toBeDefined();
    expect(persistedCourseAfterApprove?.status).toBe("published");

    // Verify commerce product was created
    const product = await commerceStore.findProductById(asProductId(approvedBody.productId));
    expect(product).toBeDefined();
    expect(product?.price).toBe(150000);
    expect(product?.currency).toBe("toman");
    expect(product?.targetType).toBe("course_publication");

    // Verify publication approval notification was created
    const notificationsAfterApprove = await notificationStore.listForUser(regularUserId);
    expect(
      notificationsAfterApprove.items.some(
        (n: any) => n.type === "course_published" || n.type === "COURSE_PUBLISHED",
      ),
    ).toBe(true);

    // Verify course publication status from user endpoint
    const pubStatusRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publication-status`,
      headers: {
        Cookie: `avana_session=${regularUserToken}`,
      },
    });
    expect(pubStatusRes.statusCode).toBe(200);
    const pubStatus = pubStatusRes.json();
    expect(pubStatus.publication.status).toBe("published");
  });

  test("Free course approval: publishes course with accessType='free' and no paid product required", async () => {
    // 1. Create a personal course
    const createCourseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "دوره مقدماتی رایگان پایتون",
        subject: "برنامه‌نویسی",
      },
    });
    expect(createCourseRes.statusCode).toBe(201);
    const courseId = createCourseRes.json().course.id;

    // 2. Add chapter & module
    const createChapRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "فصل اول: نصب و راه‌اندازی",
        orderIndex: 0,
      },
    });
    const chap = createChapRes.json().chapter;

    const docId = asDocumentId(randomUUID());
    await documentStore.insert({
      id: docId,
      organizationId: regularUserOrgId,
      courseId,
      ownerUserId: regularUserId,
      userId: regularUserId,
      title: "جزوه پایتون مقدماتی",
      filename: "python_intro.pdf",
      originalName: "python_intro.pdf",
      mimeType: "application/pdf",
      byteSize: 1024 * 20,
      sizeBytes: 1024 * 20,
      pageCount: 5,
      contentHash: "sha256-hash-py-intro",
      sha256: "sha256-hash-py-intro",
      storageKey: "private/vault/python_intro.pdf",
      language: "fa",
      summary: "مبانی پایتون",
      tags: ["python"],
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any);

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/modules`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "درس ۱: ساختار زبان",
        chapterId: chap.id,
        documentId: docId,
      },
    });

    // Populate required generated content
    const now = new Date().toISOString();
    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "lesson",
      status: "accepted",
      payload: {
        kind: "lesson",
        title: "درس‌نامه ساختار زبان",
        contentMarkdown: "# دستورات پایه\nچاپ متن با دستور print",
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "flashcard",
      status: "accepted",
      payload: {
        kind: "flashcard",
        cards: [{ front: "print چیست؟", back: "تابع چاپ در خروجی", difficulty: "easy" }],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "quiz",
      status: "accepted",
      payload: {
        kind: "quiz",
        title: "کوئیز مبانی پایتون",
        questions: [
          {
            question: "کدام کلمه کلیدی برای تعریف تابع استفاده می‌شود؟",
            choices: ["def", "func", "function", "lambda"],
            correctAnswer: "def",
            difficulty: "easy",
          },
        ],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      documentId: docId,
      courseId: courseId as any,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "مرور سریع فصل اول",
        overview: "آشنایی با نحوه کدنویسی در پایتون",
        summary: "آشنایی با نحوه کدنویسی در پایتون",
        estimatedReadingMinutes: 3,
        sections: [{ title: "مفاهیم", keyPoints: ["پایتون زبانی مفسری است."] }],
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: now,
      acceptedBy: regularUserId,
      reviewedBy: regularUserId,
      reviewedAt: now,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // 3. User submits course for publication
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "دوره مقدماتی رایگان پایتون",
      },
    });
    expect(pubRes.statusCode).toBe(201);
    const pubId = pubRes.json().publication.id;

    // 4. Admin approves as Free
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "free",
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const approveBody = approveRes.json();
    expect(approveBody.status).toBe("published");
    expect(approveBody.accessType).toBe("free");
    expect(approveBody.productId).toBeNull();

    // Verify publication status from store
    const persistedPub = await coursePublicationStore.findById(asCoursePublicationId(pubId));
    expect(persistedPub?.status).toBe("published");
    expect(persistedPub?.metadata.accessType).toBe("free");
  });

  test("Official AVANA courses cannot be submitted for user publication and return clean publication status", async () => {
    const now = new Date().toISOString();
    const officialCourseId = asCourseId(randomUUID());

    // 1. Create an official AVANA course
    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: regularUserOrgId,
        name: "دوره جامع بیوشیمی بالینی (رسمی)",
        description: "دوره رسمی تولید شده توسط تیم علمی آوانا",
        subject: "بیوشیمی",
        status: "published",
        isOfficial: true,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Publication status for official course returns isOfficial: true and publication: null
    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${regularUserOrgId}/courses/${officialCourseId}/publication-status`,
      headers: {
        Cookie: `avana_session=${regularUserToken}`,
      },
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = statusRes.json();
    expect(statusBody.isOfficial).toBe(true);
    expect(statusBody.publication).toBeNull();

    // 3. Attempting to submit publication request for official course fails with 400 Bad Request
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${officialCourseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "درخواست انتشار دوره رسمی",
      },
    });
    expect(pubRes.statusCode).toBe(400);
    expect(pubRes.json().error.message).toContain("دوره‌های رسمی آوانا از طریق پنل مدیریت منتشر می‌شوند");

    // 4. Learning service returns isOfficial: true in course object
    await courseStore.addUserCourse(regularUserId, officialCourseId);

    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${officialCourseId}/learn`,
      headers: {
        Cookie: `avana_session=${regularUserToken}`,
      },
    });
    expect(learnRes.statusCode).toBe(200);
    const learnBody = learnRes.json();
    expect(learnBody.course.isOfficial).toBe(true);
    expect(learnBody.course.is_official).toBe(true);
  });

  test("Regression: Rejection of approval when accessType is missing or invalid", async () => {
    const pubId = asCoursePublicationId(randomUUID());
    const courseId = asCourseId(randomUUID());
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: regularUserOrgId,
        name: "دوره تست اعتبارسنجی accessType",
        description: null,
        subject: null,
        status: "pending_review",
        isOfficial: false,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    await coursePublicationStore.create({
      id: pubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "دوره تست اعتبارسنجی accessType",
      description: "دوره ارسالی توسط مدرس",
      subject: "برنامه‌نویسی",
      status: "pending_review",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: null,
      metadata: {
        accessType: "paid",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
      snapshot: {
        courseId,
        title: "دوره تست اعتبارسنجی accessType",
        chapters: [],
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Missing accessType (empty body or targetPrice only like previous bug)
    const emptyRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        targetPrice: 50000,
        reviewNotes: "یادداشت تست",
      },
    });
    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.json().message).toBe("نوع دسترسی (accessType) باید 'free' یا 'paid' باشد.");

    // 2. Invalid accessType
    const invalidRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "subscription",
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json().message).toBe("نوع دسترسی (accessType) باید 'free' یا 'paid' باشد.");
  });

  test("Regression: Rejection of paid course approval when price is zero, negative, or decimal", async () => {
    const pubId = asCoursePublicationId(randomUUID());
    const courseId = asCourseId(randomUUID());
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: regularUserOrgId,
        name: "دوره تست اعتبارسنجی قیمت",
        description: null,
        subject: null,
        status: "pending_review",
        isOfficial: false,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    await coursePublicationStore.create({
      id: pubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "دوره تست اعتبارسنجی قیمت",
      description: "دوره ارسالی توسط مدرس",
      subject: "پزشکی",
      status: "pending_review",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: null,
      metadata: {
        accessType: "paid",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
      snapshot: {
        courseId,
        title: "دوره تست اعتبارسنجی قیمت",
        chapters: [],
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Paid accessType with price = 0
    const zeroPriceRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
        price: 0,
      },
    });
    expect(zeroPriceRes.statusCode).toBe(400);
    expect(zeroPriceRes.json().message).toBe("برای دوره آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر).");

    // 2. Paid accessType with negative price
    const negPriceRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
        price: -50000,
      },
    });
    expect(negPriceRes.statusCode).toBe(400);
    expect(negPriceRes.json().message).toBe("برای دوره آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر).");

    // 3. Paid accessType with decimal price
    const decPriceRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
        price: 25000.75,
      },
    });
    expect(decPriceRes.statusCode).toBe(400);
    expect(decPriceRes.json().message).toBe("برای دوره آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر).");

    // 4. Paid accessType with missing price
    const noPriceRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
      },
    });
    expect(noPriceRes.statusCode).toBe(400);
    expect(noPriceRes.json().message).toBe("برای دوره آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر).");
  });

  test("Regression: Switching from paid to free deactivates previous commerce product, and unapproved courses have no active product", async () => {
    const pubId = asCoursePublicationId(randomUUID());
    const courseId = asCourseId(randomUUID());
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: regularUserOrgId,
        name: "دوره تست تغییر مدل مالی",
        description: null,
        subject: null,
        status: "pending_review",
        isOfficial: false,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    await coursePublicationStore.create({
      id: pubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "دوره تست تغییر مدل مالی",
      description: "دوره ارسالی توسط مدرس",
      subject: "برنامه‌نویسی",
      status: "pending_review",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: null,
      metadata: {
        accessType: "paid",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
      snapshot: {
        courseId,
        title: "دوره تست تغییر مدل مالی",
        chapters: [],
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Unapproved course has no active commerce product
    const unapprovedProduct = await commerceStore.findProductByTarget("course_publication", pubId);
    expect(unapprovedProduct).toBeNull();

    // 2. Admin approves as Paid (80,000 Tomans)
    const approvePaidRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
        price: 80000,
        reviewNotes: "تأیید شد با قیمت اولیه",
      },
    });
    expect(approvePaidRes.statusCode).toBe(200);
    const paidPub = await coursePublicationStore.findById(asCoursePublicationId(pubId));
    expect(paidPub?.metadata.accessType).toBe("paid");
    expect(paidPub?.metadata.reviewNotes).toBe("تأیید شد با قیمت اولیه");

    const activeProd = await commerceStore.findProductByTarget("course_publication", pubId);
    expect(activeProd).toBeDefined();
    expect(activeProd?.active).toBe(true);
    expect(activeProd?.price).toBe(80000);

    // 3. Admin updates/re-approves as Free
    const approveFreeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "free",
        reviewNotes: "تبدیل به دوره عمومی رایگان",
      },
    });
    expect(approveFreeRes.statusCode).toBe(200);
    const freeBody = approveFreeRes.json();
    expect(freeBody.accessType).toBe("free");
    expect(freeBody.priceTomans).toBe(0);

    // 4. Product was deactivated
    const deactivatedProd = await commerceStore.findProductByTarget("course_publication", pubId);
    expect(deactivatedProd).toBeDefined();
    expect(deactivatedProd?.active).toBe(false);

    // 5. Publication metadata updated to free
    const updatedPub = await coursePublicationStore.findById(asCoursePublicationId(pubId));
    expect(updatedPub?.metadata.accessType).toBe("free");
    expect(updatedPub?.metadata.reviewNotes).toBe("تبدیل به دوره عمومی رایگان");
  });

  test("Published course update request: zero-downtime, diff computation, change requests, rejection immunity, and content materialization", async () => {
    // 1. Setup an initially published course (v1)
    const courseId = asCourseId(randomUUID());
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: regularUserOrgId,
        name: "دوره جامع فیزیک کوانتوم",
        description: "مفاهیم پایه کوانتوم",
        subject: "فیزیک",
        status: "published",
        isOfficial: false,
        version: 1,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const v1PubId = asCoursePublicationId(randomUUID());
    await coursePublicationStore.create({
      id: v1PubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "دوره جامع فیزیک کوانتوم",
      description: "مفاهیم پایه کوانتوم",
      subject: "فیزیک",
      status: "published",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: now,
      metadata: {
        accessType: "paid",
        rejectionReason: null,
        reviewedAt: now,
        reviewedByUserId: adminUserId,
      },
      snapshot: {
        courseId,
        title: "دوره جامع فیزیک کوانتوم",
        chapters: [
          {
            id: "ch-1",
            title: "فصل ۱: دوگانگی موج و ذره",
            sortOrder: 0,
            lessons: [
              {
                id: "lesson-1",
                title: "آزمایش یانگ",
                contentMarkdown: "آزمایش دوشکاف یانگ و الگوی تداخل...",
                sortOrder: 0,
                estimatedMinutes: 15,
              },
            ],
          },
        ],
        stats: {
          lessonCount: 1,
          chapterCount: 1,
          flashcardCount: 0,
          quizCount: 0,
          quizQuestionCount: 0,
          summaryCount: 0,
          totalEstimatedMinutes: 15,
        },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Create active commercial product for v1
    const v1ProductId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: v1ProductId,
      code: `course_pub_${v1PubId}`,
      type: "course",
      title: "دوره جامع فیزیک کوانتوم",
      description: "مفاهیم پایه کوانتوم",
      price: 50000,
      currency: "toman",
      targetType: "course_publication",
      targetId: v1PubId,
      durationDays: null,
      active: true,
      metadata: { coursePublicationId: v1PubId, courseId },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Populate moduleStore & subCourseGroupStore so chapter structure is intact
    const ch1Group = await subCourseGroupStore.create({
      id: "ch-1" as any,
      courseId,
      title: "فصل ۱: دوگانگی موج و ذره",
      description: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    const mod1 = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: ch1Group.id,
      title: "مقدمه کوانتوم",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await lessonStore.create({
      id: "lesson-1" as any,
      organizationId: regularUserOrgId,
      moduleId: mod1.id,
      title: "آزمایش یانگ",
      contentMarkdown: "آزمایش دوشکاف یانگ و الگوی تداخل...",
      sortOrder: 0,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 2. Creator prepares update content: adds a 2nd chapter and a draft lesson
    const createCh2Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "فصل ۲: اصل عدم قطعیت هایزنبرگ",
        orderIndex: 1,
      },
    });
    expect(createCh2Res.statusCode).toBe(201);
    const ch2 = createCh2Res.json().chapter;

    const mod2 = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: ch2.id,
      title: "ماژول عدم قطعیت",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const draftLessonId = "lesson-2-draft";
    await lessonStore.create({
      id: draftLessonId as any,
      organizationId: regularUserOrgId,
      moduleId: mod2.id,
      title: "روابط عدم قطعیت تکانه و مکان",
      contentMarkdown: "دلتا ایکس در دلتا پی بزرگتر مساوی اچ بار دوم...",
      sortOrder: 0,
      estimatedMinutes: 20,
      publicationStatus: "draft",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Verify draft lesson is draft
    const draftedLessonBefore = await lessonStore.findById(draftLessonId as any);
    expect(draftedLessonBefore?.publicationStatus).toBe("draft");

    // 3. Creator submits update request
    const updateSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "دوره جامع فیزیک کوانتوم (ویرایش جدید)",
        description: "مفاهیم کوانتوم با اضافه شدن اصل عدم قطعیت",
      },
    });
    expect(updateSubmitRes.statusCode).toBe(201);
    const updateBody = updateSubmitRes.json();
    const v2Pub = updateBody.publication;
    expect(v2Pub.status).toBe("pending_review");
    expect(v2Pub.version).toBe(2);
    expect(v2Pub.metadata.isUpdate).toBe(true);
    expect(v2Pub.metadata.baseVersion).toBe(1);
    expect(v2Pub.metadata.requestType).toBe("update");
    expect(v2Pub.metadata.diffSummary).toBeDefined();
    expect(v2Pub.metadata.diffSummary.addedLessons.some((l: any) => l.title === "روابط عدم قطعیت تکانه و مکان")).toBe(true);

    // ZERO DOWNTIME CHECK: Course in courseStore MUST still be published!
    const liveCourseAfterSubmit = await courseStore.findById(courseId);
    expect(liveCourseAfterSubmit?.status).toBe("published");

    // Product must still be active!
    const activeProdAfterSubmit = await commerceStore.findProductByTarget("course_publication", v1PubId);
    expect(activeProdAfterSubmit?.active).toBe(true);

    // 4. Duplicate pending update submission must fail with 409
    const duplicateSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "ارسال دوباره",
      },
    });
    expect(duplicateSubmitRes.statusCode).toBe(409);

    // 5. Admin lists submissions: verifies isUpdate and diffSummary
    const adminListRes = await app.inject({
      method: "GET",
      url: `/v1/admin/course-submissions?courseId=${courseId}`,
      headers: {
        Cookie: `avana_session=${adminUserToken}`,
      },
    });
    expect(adminListRes.statusCode).toBe(200);
    const submissionsList = adminListRes.json();
    const pendingItem = submissionsList.items.find((s: any) => s.id === v2Pub.id);
    expect(pendingItem.isUpdate).toBe(true);
    expect(pendingItem.baseVersion).toBe(1);
    expect(pendingItem.diffSummary).toBeDefined();

    // 6. Admin requests changes
    const requestChangesRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${v2Pub.id}/request-changes`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        reviewNotes: "لطفاً تمرین حل شده به درس جدید اضافه کنید.",
      },
    });
    expect(requestChangesRes.statusCode).toBe(200);
    expect(requestChangesRes.json().status).toBe("changes_requested");

    // Check creator's publication status endpoint returns both publication and publishedPublication
    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publication-status`,
      headers: {
        Cookie: `avana_session=${regularUserToken}`,
      },
    });
    expect(statusRes.statusCode).toBe(200);
    const pubStatus = statusRes.json();
    expect(pubStatus.publication.status).toBe("changes_requested");
    expect(pubStatus.publication.reviewNotes).toBe("لطفاً تمرین حل شده به درس جدید اضافه کنید.");
    expect(pubStatus.publishedPublication).toBeDefined();
    expect(pubStatus.publishedPublication.version).toBe(1);

    // 7. Creator updates lesson and resubmits
    await lessonStore.update({
      ...(await lessonStore.findById(draftLessonId as any))!,
      contentMarkdown: "دلتا ایکس در دلتا پی بزرگتر مساوی اچ بار دوم به همراه دو مثال حل‌شده.",
    });

    const resubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "دوره جامع فیزیک کوانتوم (ویرایش ۲ نهایی)",
      },
    });
    expect(resubmitRes.statusCode).toBe(201);
    const resubmittedPub = resubmitRes.json().publication;
    expect(resubmittedPub.status).toBe("pending_review");

    // 8. Admin rejects the update request -> Live course MUST REMAIN published!
    const rejectUpdateRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${resubmittedPub.id}/reject`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        rejectionReason: "کیفیت محتوا با استانداردهای علمی تطابق ندارد.",
      },
    });
    expect(rejectUpdateRes.statusCode).toBe(200);

    // ZERO DOWNTIME CHECK: Course in courseStore MUST STILL be published!
    const liveCourseAfterReject = await courseStore.findById(courseId);
    expect(liveCourseAfterReject?.status).toBe("published");
    const activeProdAfterReject = await commerceStore.findProductByTarget("course_publication", v1PubId);
    expect(activeProdAfterReject?.active).toBe(true);

    // 9. Creator resubmits again, admin approves
    const submitAgainRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "دوره جامع فیزیک کوانتوم (تأییدیه دانشگاهی)",
      },
    });
    expect(submitAgainRes.statusCode).toBe(201);
    const finalPubId = submitAgainRes.json().publication.id;

    const approveUpdateRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${finalPubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "paid",
        price: 65000,
        reviewNotes: "بسیار عالی، به روزرسانی تایید شد.",
      },
    });
    expect(approveUpdateRes.statusCode).toBe(200);

    // Direct Persistence Verification: Live course version updated to 2, status published
    const finalLiveCourse = await courseStore.findById(courseId);
    expect(finalLiveCourse?.status).toBe("published");
    expect(finalLiveCourse?.version).toBe(2);
    expect(finalLiveCourse?.name).toBe("دوره جامع فیزیک کوانتوم (تأییدیه دانشگاهی)");

    // DRAFT LESSON IS NOW MATERIALIZED / ACTIVATED TO PUBLISHED!
    const activatedLesson = await lessonStore.findById(draftLessonId as any);
    expect(activatedLesson?.publicationStatus).toBe("published");

    // Commerce product updated with new price
    const updatedProd = await commerceStore.findProductByTarget("course_publication", finalPubId);
    expect(updatedProd).toBeDefined();
    expect(updatedProd?.active).toBe(true);
    expect(updatedProd?.price).toBe(65000);
  });

  test("Role boundaries: content_worker cannot approve, reject, or request changes on course submissions", async () => {
    const worker = await createAuthenticatedUser("worker_mod@avana.ir", Roles.content_worker);
    const pubId = asCoursePublicationId(randomUUID());
    const courseId = asCourseId(randomUUID());

    await coursePublicationStore.create({
      id: pubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "دوره تست نقش محتواکار",
      description: "تست",
      subject: "شیمی",
      status: "pending_review",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: null,
      metadata: {
        accessType: "free",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
      snapshot: {
        courseId,
        title: "دوره تست نقش محتواکار",
        chapters: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Content worker cannot approve
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${worker.token}`,
      },
      payload: { accessType: "free" },
    });
    expect(approveRes.statusCode).toBe(403);

    // Content worker cannot reject
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/reject`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${worker.token}`,
      },
      payload: { rejectionReason: "رد توسط محتواکار" },
    });
    expect(rejectRes.statusCode).toBe(403);

    // Content worker cannot request changes
    const changeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/request-changes`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${worker.token}`,
      },
      payload: { reviewNotes: "درخواست تغییر توسط محتواکار" },
    });
    expect(changeRes.statusCode).toBe(403);
  });

  test("Live vs Proposed Isolation: Learner calling /learn and /progress is strictly isolated from unapproved edits, deletions, and draft additions", async () => {
    const student = await createAuthenticatedUser("student_isolation@avana.ir", Roles.student);
    const now = new Date().toISOString();
    const courseId = asCourseId(randomUUID());

    // Grant student active subscription and membership in organization
    await commerceStore.createSubscription({
      id: "sub-student-isolation" as any,
      userId: student.userId,
      planType: "monthly",
      status: "active",
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      renewsAt: null,
      canceledAt: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    await orgStore.addMembership({
      id: randomUUID() as any,
      organizationId: regularUserOrgId,
      userId: student.userId,
      role: Roles.student,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Setup published course with 2 lessons
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: regularUserOrgId,
        name: "شیمی آلی دارویی ۱ (نسخه رسمی ۱)",
        description: "شیمی آلی مقدماتی",
        subject: "شیمی",
        status: "published",
        isOfficial: false,
        version: 1,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const ch1 = await subCourseGroupStore.create({
      id: randomUUID() as any,
      courseId,
      title: "فصل ۱: گروه‌های عاملی",
      description: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    const mod1 = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: ch1.id,
      title: "آلکان‌ها و آلکن‌ها",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    const lesson1Id = randomUUID() as any;
    const lesson2Id = randomUUID() as any;

    await lessonStore.create({
      id: lesson1Id,
      organizationId: regularUserOrgId,
      moduleId: mod1.id,
      title: "درس ۱: ساختار آلکان",
      contentMarkdown: "محتوای تأیید شده درس ۱",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await lessonStore.create({
      id: lesson2Id,
      organizationId: regularUserOrgId,
      moduleId: mod1.id,
      title: "درس ۲: سنتز آلکن",
      contentMarkdown: "محتوای تأیید شده درس ۲",
      sortOrder: 1,
      estimatedMinutes: 12,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Published publication v1
    const v1PubId = asCoursePublicationId(randomUUID());
    await coursePublicationStore.create({
      id: v1PubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "شیمی آلی دارویی ۱ (نسخه رسمی ۱)",
      description: "شیمی آلی مقدماتی",
      subject: "شیمی",
      status: "published",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: now,
      metadata: {
        accessType: "free",
      },
      snapshot: {
        courseId,
        title: "شیمی آلی دارویی ۱ (نسخه رسمی ۱)",
        chapters: [
          {
            id: mod1.id,
            title: "فصل ۱: گروه‌های عاملی",
            sortOrder: 0,
            lessons: [
              {
                id: lesson1Id,
                title: "درس ۱: ساختار آلکان",
                contentMarkdown: "محتوای تأیید شده درس ۱",
                sortOrder: 0,
                estimatedMinutes: 10,
              },
              {
                id: lesson2Id,
                title: "درس ۲: سنتز آلکن",
                contentMarkdown: "محتوای تأیید شده درس ۲",
                sortOrder: 1,
                estimatedMinutes: 12,
              },
            ],
          },
        ],
        stats: {
          lessonCount: 2,
          chapterCount: 1,
          flashcardCount: 0,
          quizCount: 0,
          quizQuestionCount: 0,
          summaryCount: 0,
          totalEstimatedMinutes: 22,
        },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Student completes lesson 1
    const markL1Res = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lesson1Id}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${student.token}`,
      },
      payload: { completed: true },
    });
    expect(markL1Res.statusCode).toBe(200);

    // 2. Creator makes unapproved draft changes in working tables:
    // - renames course
    // - edits lesson 1 content
    // - soft deletes lesson 2
    // - adds unapproved lesson 3
    const liveCourse = await courseStore.findById(courseId);
    await courseStore.update({
      ...liveCourse!,
      name: "عنوان پیش‌نویس تأیید نشده که نباید دیده شود",
    });

    const dbL1 = await lessonStore.findById(lesson1Id);
    await lessonStore.update({
      ...dbL1!,
      title: "عنوان تغییریافته درس ۱ پیش‌نویس",
      contentMarkdown: "متن لو رفته پیش‌نویس درس ۱",
    });

    const dbL2 = await lessonStore.findById(lesson2Id);
    await lessonStore.update({
      ...dbL2!,
      deletedAt: new Date().toISOString(), // Soft-deleted by creator
    });

    const unapprovedLesson3Id = randomUUID() as any;
    await lessonStore.create({
      id: unapprovedLesson3Id,
      organizationId: regularUserOrgId,
      moduleId: mod1.id,
      title: "درس ۳ پیش‌نویس بدون تأیید",
      contentMarkdown: "متن پیش‌نویس",
      sortOrder: 2,
      estimatedMinutes: 15,
      publicationStatus: "draft",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 3. Student requests course learning: /v1/courses/:id/learn
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        Cookie: `avana_session=${student.token}`,
      },
    });
    expect(learnRes.statusCode).toBe(200);
    const learnBody = learnRes.json();

    // Verification: Student sees official v1 title, NOT the draft rename
    expect(learnBody.course.title).toBe("شیمی آلی دارویی ۱ (نسخه رسمی ۱)");
    expect(learnBody.course.version).toBe(1);

    // Verification: Student sees 2 published lessons (lesson 2 is NOT deleted for student)
    const lessonsInMod = learnBody.modules[0].lessons;
    expect(lessonsInMod.length).toBe(2);

    const servedL1 = lessonsInMod.find((l: any) => l.id === lesson1Id);
    expect(servedL1).toBeDefined();
    expect(servedL1.title).toBe("درس ۱: ساختار آلکان");
    expect(servedL1.content_markdown).toBe("محتوای تأیید شده درس ۱");
    expect(servedL1.completed).toBe(true);

    const servedL2 = lessonsInMod.find((l: any) => l.id === lesson2Id);
    expect(servedL2).toBeDefined();
    expect(servedL2.title).toBe("درس ۲: سنتز آلکن");
    expect(servedL2.content_markdown).toBe("محتوای تأیید شده درس ۲");
    expect(servedL2.completed).toBe(false);

    // Unapproved lesson 3 is NOT present for student
    expect(lessonsInMod.some((l: any) => l.id === unapprovedLesson3Id)).toBe(false);

    // Verification: Progress percentage is strictly 50% (1 of 2 completed)
    expect(learnBody.progress.total_lessons).toBe(2);
    expect(learnBody.progress.completed_lessons).toBe(1);
    expect(learnBody.progress.progress_percent).toBe(50);

    // 4. Student calls /v1/courses/:id/progress
    const progressRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/progress`,
      headers: {
        Cookie: `avana_session=${student.token}`,
      },
    });
    expect(progressRes.statusCode).toBe(200);
    const progressBody = progressRes.json();
    expect(progressBody.total_lessons).toBe(2);
    expect(progressBody.completed_lessons).toBe(1);
    expect(progressBody.percentage).toBe(50);

    // 5. Student cannot complete unapproved draft lesson 3
    const markUnapprovedRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${unapprovedLesson3Id}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${student.token}`,
      },
      payload: { completed: true },
    });
    expect(markUnapprovedRes.statusCode).toBe(404);
  });

  test("Post-submission draft safety: draft lesson created after update submission is NOT activated on approval", async () => {
    const now = new Date().toISOString();
    const courseId = asCourseId(randomUUID());

    // 1. Setup published course v1
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: regularUserOrgId,
        name: "فیزیک هالیدی",
        description: "مکانیک",
        subject: "فیزیک",
        status: "published",
        isOfficial: false,
        version: 1,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const v1PubId = asCoursePublicationId(randomUUID());
    await coursePublicationStore.create({
      id: v1PubId,
      courseId,
      organizationId: regularUserOrgId,
      version: 1,
      title: "فیزیک هالیدی",
      description: "مکانیک",
      subject: "فیزیک",
      status: "published",
      creatorUserId: regularUserId,
      creatorRole: "teacher",
      publishedAt: now,
      metadata: { accessType: "free" },
      snapshot: {
        courseId,
        title: "فیزیک هالیدی",
        chapters: [],
        stats: {
          lessonCount: 0,
          chapterCount: 0,
          flashcardCount: 0,
          quizCount: 0,
          quizQuestionCount: 0,
          summaryCount: 0,
          totalEstimatedMinutes: 0,
        },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const ch = await subCourseGroupStore.create({
      id: randomUUID() as any,
      courseId,
      title: "فصل دینامیک",
      description: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    const mod = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: ch.id,
      title: "قوانین نیوتن",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const approvedLessonId = randomUUID() as any;
    await lessonStore.create({
      id: approvedLessonId,
      organizationId: regularUserOrgId,
      moduleId: mod.id,
      title: "قانون اول نیوتن",
      contentMarkdown: "لختی اجسام",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "draft",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 2. Creator submits update v2
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${regularUserOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${regularUserToken}`,
      },
      payload: {
        title: "فیزیک هالیدی ویرایش دوم",
      },
    });
    expect(submitRes.statusCode).toBe(201);
    const pubId = submitRes.json().publication.id;

    // 3. Creator creates another draft lesson AFTER submitting update
    const postSubmitDraftId = randomUUID() as any;
    await lessonStore.create({
      id: postSubmitDraftId,
      organizationId: regularUserOrgId,
      moduleId: mod.id,
      title: "قانون گرانش بعد از ارسال پیش‌نویس شد",
      contentMarkdown: "هنوز کامل نیست",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "draft",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 4. Admin approves v2
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "free",
      },
    });
    expect(approveRes.statusCode).toBe(200);

    // 5. Verification:
    // Approved lesson is activated to "published"
    const activatedL = await lessonStore.findById(approvedLessonId);
    expect(activatedL?.publicationStatus).toBe("published");

    // Post-submission draft lesson REMAINS "draft" (NOT activated prematurely!)
    const postDraftL = await lessonStore.findById(postSubmitDraftId);
    expect(postDraftL?.publicationStatus).toBe("draft");
  });
});
