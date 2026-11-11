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
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/index.js";
import { InMemorySearchStore } from "../modules/search/index.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";

describe("User Course Publication Discovery, Direct Access, and Commerce Regression Suite", () => {
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
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let notificationStore: InMemoryNotificationStore;
  let contentPackStore: InMemoryContentPackStore;
  let searchStore: InMemorySearchStore;

  // Creator User (Tenant A)
  let creatorToken: string;
  let creatorUserId: UserId;
  let creatorOrgId: OrganizationId;

  // Learner User (Tenant B - distinct organization)
  let learnerToken: string;
  let learnerUserId: UserId;

  // Admin User (Platform Admin)
  let adminToken: string;

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
    courseStore.setPublicationStore(coursePublicationStore);

    moduleStore = new InMemoryModuleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    subCourseGroupStore.setModuleStore(moduleStore);
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    notificationStore = new InMemoryNotificationStore();
    const notificationService = new NotificationService(notificationStore);

    const flashcardStore = new InMemoryFlashcardStore();
    const quizStore = new InMemoryQuizStore();
    const quizQuestionStore = new InMemoryQuizQuestionStore();
    const contentPackUsageStore = new InMemoryContentPackUsageStore();

    contentPackStore = new InMemoryContentPackStore(
      userStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      generatedContentStore,
      contentPackUsageStore,
      courseStore,
      progressStore,
      orgStore,
      coursePublicationStore,
    );

    searchStore = new InMemorySearchStore(
      courseStore,
      orgStore,
      contentPackStore,
      moduleStore,
      lessonStore,
      config.systemOrganizationId as OrganizationId,
      coursePublicationStore,
    );

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
      contentPackStore,
      contentPackUsageStore,
      searchStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    });
    await app.ready();

    // 1. Create Creator (Tenant A)
    const creator = await createAuthenticatedUser("creator@avana.ir", Roles.authenticated);
    creatorToken = creator.token;
    creatorUserId = creator.userId;
    creatorOrgId = creator.orgId;

    // 2. Create Learner (Tenant B)
    const learner = await createAuthenticatedUser("learner@outside.ir", Roles.authenticated);
    learnerToken = learner.token;
    learnerUserId = learner.userId;

    // 3. Create Admin
    const admin = await createAuthenticatedUser("admin@avana.ir", Roles.platform_admin);
    adminToken = admin.token;
  });

  async function setupCourseWithLesson(
    token: string,
    orgId: OrganizationId,
    userId: UserId,
    courseTitle: string,
    lessonTitle: string,
    options?: { subject?: string; description?: string },
  ) {
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${token}`,
      },
      payload: {
        title: courseTitle,
        description: options?.description,
        subject: options?.subject ?? "عمومی",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const courseId = createRes.json().course.id;

    // Create Chapter
    const createChapRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${token}`,
      },
      payload: {
        title: "فصل اول",
        orderIndex: 0,
      },
    });
    expect(createChapRes.statusCode).toBe(201);
    const chapterId = createChapRes.json().chapter.id;

    // Create Document
    const docId = randomUUID() as any;
    const now = new Date().toISOString();
    await documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: userId,
      userId,
      title: lessonTitle,
      filename: "lesson.pdf",
      originalName: "lesson.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sizeBytes: 1024,
      pageCount: 1,
      contentHash: "dummy-hash",
      sha256: "dummy-hash",
      storageKey: "private/lesson.pdf",
      language: "fa",
      summary: null,
      tags: [],
      status: "ready",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // Create Module
    const createModRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/modules`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${token}`,
      },
      payload: {
        title: "بخش اول",
        chapterId,
        documentId: docId,
      },
    });
    expect(createModRes.statusCode).toBe(201);
    const moduleId = createModRes.json().module.id;

    // Seed Lesson 1 in lessonStore (becomes free preview lesson)
    const lessonId = randomUUID() as any;
    lessonStore.insert({
      id: lessonId,
      organizationId: orgId,
      moduleId,
      courseId,
      title: lessonTitle,
      contentMarkdown: `# ${lessonTitle}\nمحتوای آموزشی کامل`,
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      reference: null,
      contentType: "markdown",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    // Seed Lesson 2 in lessonStore (commercial locked lesson)
    const lockedLessonId = randomUUID() as any;
    lessonStore.insert({
      id: lockedLessonId,
      organizationId: orgId,
      moduleId,
      courseId,
      title: `${lessonTitle} - بخش پیشرفته`,
      contentMarkdown: `# ${lessonTitle} - پیشرفته\nمحتوای اختصاصی پولی`,
      sortOrder: 2,
      estimatedMinutes: 15,
      publicationStatus: "published",
      reference: null,
      contentType: "markdown",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as any);

    return { courseId, chapterId, moduleId, lessonId, lockedLessonId };
  }

  test("Approved paid course is discoverable in Library, Packages, Search, and accessible via Direct URL with paywall enforcement", async () => {
    // Step 1: Creator creates personal course with chapter, module, and lessons
    const { courseId, lockedLessonId } = await setupCourseWithLesson(
      creatorToken,
      creatorOrgId,
      creatorUserId,
      "فارماکولوژی کاربردی بالینی",
      "پنی‌سیلین‌ها و بتالاکتام‌ها",
      {
        subject: "علوم پزشکی",
        description: "دوره جامع یادگیری مفاهیم فارماکولوژی برای دانشجویان علوم پزشکی",
      },
    );

    // Step 2: Before submission/approval, course is NOT discoverable by Learner B or Guest
    const libBefore = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(libBefore.statusCode).toBe(200);
    const foundBefore = libBefore.json().courses.find((c: any) => c.id === courseId);
    expect(foundBefore).toBeUndefined();

    // Direct access before approval throws 404
    const directBefore = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(directBefore.statusCode).toBe(404);

    // Step 3: Creator submits course for publication
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorToken}`,
      },
      payload: { title: "فارماکولوژی کاربردی بالینی" },
    });
    expect(submitRes.statusCode).toBe(201);
    const pubId = submitRes.json().publication.id;

    // Step 4: Admin reviews and approves course with pricing (150,000 Tomans)
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminToken}`,
      },
      payload: {
        accessType: "paid",
        priceTomans: 150000,
        reviewNotes: "دوره تایید شد و قیمت‌گذاری انجام گرفت.",
      },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().publication.status).toBe("published");

    // Step 5: Verification in Avana Public Library (/v1/library/resources)
    // 5.1 Learner B (different organization) sees the course with correct pricing
    const libLearner = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(libLearner.statusCode).toBe(200);
    const courseInLib = libLearner.json().courses.find((c: any) => c.id === courseId);
    expect(courseInLib).toBeDefined();
    expect(courseInLib.title).toBe("فارماکولوژی کاربردی بالینی");
    expect(courseInLib.access.isFree).toBe(false);
    expect(courseInLib.purchase.price).toBe(150000);
    expect(courseInLib.purchase.canPurchase).toBe(true);

    // 5.2 Guest (unauthenticated) visitor also sees the course in the public library
    const libGuest = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
    });
    expect(libGuest.statusCode).toBe(200);
    const courseInGuestLib = libGuest.json().courses.find((c: any) => c.id === courseId);
    expect(courseInGuestLib).toBeDefined();
    expect(courseInGuestLib.title).toBe("فارماکولوژی کاربردی بالینی");
    expect(courseInGuestLib.access.isFree).toBe(false);
    expect(courseInGuestLib.purchase.price).toBe(150000);

    // Step 6: Verification in Course Packages (/v1/library/course-packages)
    const pkgRes = await app.inject({
      method: "GET",
      url: "/v1/library/course-packages",
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(pkgRes.statusCode).toBe(200);
    const courseInPkgs = pkgRes.json().courses.find((c: any) => c.id === courseId);
    expect(courseInPkgs).toBeDefined();
    expect(courseInPkgs.packages.length).toBeGreaterThan(0);
    expect(courseInPkgs.totalPackages).toBeGreaterThan(0);

    // Step 7: Verification in Global Search (/v1/search)
    const searchRes = await app.inject({
      method: "GET",
      url: "/v1/search?q=فارماکولوژی",
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchMatch = searchRes.json().grouped.courses.find((c: any) => c.id === courseId);
    expect(searchMatch).toBeDefined();
    expect(searchMatch.title).toBe("فارماکولوژی کاربردی بالینی");

    // Step 8: Direct route learning access (/v1/courses/:courseId/learn)
    const directLearnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(directLearnRes.statusCode).toBe(200);
    const learnData = directLearnRes.json();
    expect(learnData.course.id).toBe(courseId);
    expect(learnData.modules.length).toBe(1);
    expect(learnData.modules[0].lessons.length).toBe(2);

    // Step 9: Paywall enforcement - learner cannot mark locked lesson complete
    const progressBeforePay = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lockedLessonId}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${learnerToken}`,
      },
      payload: { completed: true },
    });
    expect(progressBeforePay.statusCode).toBe(403);

    // Step 10: Commerce Purchase Flow
    const product = await commerceStore.findActiveProductByTarget("course", courseId);
    expect(product).toBeDefined();
    expect(product?.price).toBe(150000);

    // Learner B completes purchase: course entitlement is issued
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: learnerUserId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "course_purchase",
      orderId: null,
      startsAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Step 11: After payment, lesson is unlocked and progress marks successfully
    const progressAfterPay = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lockedLessonId}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${learnerToken}`,
      },
      payload: { completed: true },
    });
    expect(progressAfterPay.statusCode).toBe(200);
    expect(progressAfterPay.json().completed).toBe(true);

    // Step 12: Library reflects purchased status
    const libAfterPay = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(libAfterPay.statusCode).toBe(200);
    const courseAfterPay = libAfterPay.json().courses.find((c: any) => c.id === courseId);
    expect(courseAfterPay.access.hasAccess).toBe(true);
    expect(courseAfterPay.purchase.canPurchase).toBe(false);
  });

  test("Approved free course publishes with accessType='free' and allows instant learning without paywall", async () => {
    // 1. Creator creates free course
    const { courseId, lessonId } = await setupCourseWithLesson(
      creatorToken,
      creatorOrgId,
      creatorUserId,
      "مبانی فوریت‌های پزشکی رایگان",
      "زنجیره بقا در ایست قلبی",
      {
        subject: "علوم پزشکی",
      },
    );

    // Submit for publication
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorToken}`,
      },
      payload: { title: "مبانی فوریت‌های پزشکی رایگان" },
    });
    expect(submitRes.statusCode).toBe(201);
    const pubId = submitRes.json().publication.id;

    // Admin approves as FREE
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminToken}`,
      },
      payload: {
        accessType: "free",
        reviewNotes: "دوره رایگان تأیید شد.",
      },
    });
    expect(approveRes.statusCode).toBe(200);

    // Learner B sees it as free in library
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(libRes.statusCode).toBe(200);
    const item = libRes.json().courses.find((c: any) => c.id === courseId);
    expect(item).toBeDefined();
    expect(item.access.isFree).toBe(true);
    expect(item.access.hasAccess).toBe(true);

    // Learner B can immediately record progress without any purchase
    const progressRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lessonId}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${learnerToken}`,
      },
      payload: { completed: true },
    });
    expect(progressRes.statusCode).toBe(200);
    expect(progressRes.json().completed).toBe(true);
  });

  test("Tenant boundary security: Learner B cannot mutate Creator A's course even after public approval", async () => {
    // Creator course approved
    const { courseId } = await setupCourseWithLesson(
      creatorToken,
      creatorOrgId,
      creatorUserId,
      "دوره حفاظت شده",
      "درس قوانین",
      { subject: "حقوق" },
    );

    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorToken}`,
      },
      payload: { title: "دوره حفاظت شده" },
    });
    expect(submitRes.statusCode).toBe(201);
    const pubId = submitRes.json().publication.id;

    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminToken}`,
      },
      payload: { accessType: "free" },
    });
    expect(approveRes.statusCode).toBe(200);

    // Learner B attempts to rename/update Creator's course
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${learnerToken}`,
      },
      payload: { title: "تلاش غیرمجاز برای تغییر دوره" },
    });
    // Strict tenant isolation denies access (404 prevents tenant enumeration; 403 if membership checked)
    expect([403, 404]).toContain(updateRes.statusCode);

    // Learner B also cannot add chapters to Creator's course
    const addChapRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${learnerToken}`,
      },
      payload: { title: "فصل متجاوز" },
    });
    expect([403, 404]).toContain(addChapRes.statusCode);
  });

  test("SEO preview route renders public metadata for approved course and neutral fallback for draft", async () => {
    // 1. Create course
    const { courseId } = await setupCourseWithLesson(
      creatorToken,
      creatorOrgId,
      creatorUserId,
      "آموزش هوش مصنوعی در پزشکی",
      "مفاهیم یادگیری عمیق",
      { subject: "پزشکی", description: "توضیحات مهم دوره پزشکی" },
    );

    // While in draft, share metadata returns neutral fallback
    const shareDraft = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/share-preview`,
    });
    expect(shareDraft.statusCode).toBe(200);
    expect(shareDraft.json().isPublic).toBe(false);
    expect(shareDraft.json().title).toBe("مشاهده دوره در آوانا");

    // Also verify HTML response for draft does not expose course title
    const htmlDraft = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });
    expect(htmlDraft.statusCode).toBe(200);
    expect(htmlDraft.headers["content-type"]).toContain("text/html");
    expect(htmlDraft.body).not.toContain("آموزش هوش مصنوعی در پزشکی");
    expect(htmlDraft.body).toContain("مشاهده دوره در آوانا");

    // Submit & Approve
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorToken}`,
      },
      payload: { title: "آموزش هوش مصنوعی در پزشکی" },
    });
    expect(submitRes.statusCode).toBe(201);
    const pubId = submitRes.json().publication.id;

    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminToken}`,
      },
      payload: { accessType: "free" },
    });
    expect(approveRes.statusCode).toBe(200);

    // After approval, share metadata discloses title
    const shareApproved = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/share-preview`,
    });
    expect(shareApproved.statusCode).toBe(200);
    expect(shareApproved.json().isPublic).toBe(true);
    expect(shareApproved.json().title).toContain("آموزش هوش مصنوعی در پزشکی");

    // And HTML contains the approved course title in OpenGraph tags
    const htmlApproved = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });
    expect(htmlApproved.statusCode).toBe(200);
    expect(htmlApproved.body).toContain("آموزش هوش مصنوعی در پزشکی");
  });
});
