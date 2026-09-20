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
      userId: regularUserId,
      title: "جزوه ریاضیات یادگیری ماشین",
      filename: "math_ml.pdf",
      mimeType: "application/pdf",
      byteSize: 1024 * 50,
      pageCount: 15,
      contentHash: "sha256-secret-hash-1234",
      storageKey: "private/vault/math_ml.pdf",
      language: "fa",
      summary: "خلاصه مباحث جبر خطی و آمار",
      tags: ["math", "ml"],
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

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
      userId: regularUserId,
      title: "جزوه پایتون مقدماتی",
      filename: "python_intro.pdf",
      mimeType: "application/pdf",
      byteSize: 1024 * 20,
      pageCount: 5,
      contentHash: "sha256-hash-py-intro",
      storageKey: "private/vault/python_intro.pdf",
      language: "fa",
      summary: "مبانی پایتون",
      tags: ["python"],
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

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
});
