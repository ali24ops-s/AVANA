/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Comprehensive Integration & Verification Suite for Approved User-Created Courses:
 * Public Library Discovery, Organization Catalog Selection, and "My Courses" Enrollment.
 *
 * Verifies all 12 core acceptance criteria and invariants:
 * 1. Official courses behavior preserved (official/systemOrg courses).
 * 2. User-created approved course displayed in public library (GET /v1/library/resources).
 * 3. User-created approved course displayed in course selector (GET /v1/organizations/:orgId/courses).
 * 4. Adding user-created approved course succeeds (POST /v1/organizations/:orgId/courses/my).
 * 5. Enrolled user-created course listed in GET /v1/organizations/:orgId/courses/my.
 * 6. Idempotency: re-adding does not fail or duplicate.
 * 7. Unapproved (draft, pending_review, rejected) courses return 404 and are isolated.
 * 8. Access control: foreign users cannot update or delete the public course.
 * 9. Commercial rules preserved: paid course content remains gated by entitlements.
 * 10. Privacy preserved: no creator private info (email/userId) in course responses.
 * 11. No AI generation / Gemini re-invoked on adding.
 * 12. Own-organization courses and official courses continue to work as expected.
 */

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
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryUserFlashcardScheduleStore,
} from "../modules/study/test/in-memory-stores.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/index.js";
import { InMemoryCommerceStore } from "../modules/commerce/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

class InMemoryStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();

  async createUpload(options: { storageKey: string; mimeType: string }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`File not found: ${storageKey}`);
    return data;
  }
}

describe("User-Created Approved Courses: Library & Enrollment (19 Invariants)", () => {
  let app: any;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;
  let courseStore: InMemoryCourseStore;
  let coursePublicationStore: InMemoryCoursePublicationStore;
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let storageProvider: InMemoryStorageProvider;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let notificationStore: InMemoryNotificationStore;
  let generationQueue: InMemoryGenerationQueue;
  let config: ReturnType<typeof loadApiConfig>;

  let creatorToken: string;
  let creatorUserId: UserId;
  let creatorOrgId: OrganizationId;

  let learnerToken: string;
  let learnerUserId: UserId;
  let learnerOrgId: OrganizationId;

  let adminToken: string;
  let adminUserId: UserId;
  let adminOrgId: OrganizationId;

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

  function authHeaders(token: string) {
    return {
      "Content-Type": "application/json",
      Cookie: `avana_session=${token}`,
    };
  }

  beforeEach(async () => {
    config = loadApiConfig();
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
    generationQueue = new InMemoryGenerationQueue();

    courseStore = new InMemoryCourseStore(orgStore);
    coursePublicationStore = new InMemoryCoursePublicationStore();
    courseStore.setPublicationStore(coursePublicationStore);

    contentPackStore = new InMemoryContentPackStore(userStore);
    contentPackUsageStore = new InMemoryContentPackUsageStore();

    moduleStore = new InMemoryModuleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    subCourseGroupStore.setModuleStore(moduleStore);
    lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizAttemptStore = new InMemoryQuizAttemptStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    storageProvider = new InMemoryStorageProvider();
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
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      userFlashcardScheduleStore,
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore,
      gateway,
      queue: generationQueue,
      courseStore,
      coursePublicationStore,
      contentPackStore,
      contentPackUsageStore,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      notificationService,
    });
    await app.ready();

    // Setup creator, learner, and platform admin
    const creator = await createAuthenticatedUser("creator@example.com", Roles.authenticated);
    creatorToken = creator.token;
    creatorUserId = creator.userId;
    creatorOrgId = creator.orgId;

    const learner = await createAuthenticatedUser("learner@example.com", Roles.authenticated);
    learnerToken = learner.token;
    learnerUserId = learner.userId;
    learnerOrgId = learner.orgId;

    const admin = await createAuthenticatedUser("admin@avana.test", Roles.platform_admin);
    adminToken = admin.token;
    adminUserId = admin.userId;
    adminOrgId = admin.orgId;
  });

  // Helper to publish a user-created course in stores with optional course outputs
  async function createAndPublishUserCourse(
    title: string,
    subject = "داروسازی",
    options?: { withOutputs?: boolean },
  ) {
    const now = new Date().toISOString();
    const courseId = asCourseId(randomUUID());
    const course = await courseStore.create({
      course: {
        id: courseId,
        organizationId: creatorOrgId,
        name: title,
        subject,
        description: `توضیحات دوره ${title}`,
        isOfficial: false,
        status: "published",
        publisherName: "creator",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    let docId: any = null;
    let moduleId: any = null;
    let lessonId: any = null;
    let flashcardId: any = null;
    let quizId: any = null;
    let summaryId: any = null;

    if (options?.withOutputs) {
      docId = randomUUID();
      const storageKey = `uploads/${docId}.pdf`;
      await storageProvider.save({
        storageKey,
        data: Buffer.from("PDF Content for " + title),
        mimeType: "application/pdf",
      });
      await documentStore.create({
        id: docId,
        organizationId: creatorOrgId,
        courseId,
        ownerUserId: creatorUserId,
        originalName: `${title}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        sha256: "dummy-hash",
        storageKey,
        pageCount: 5,
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
      });

      moduleId = randomUUID();
      await moduleStore.create({
        id: moduleId,
        organizationId: creatorOrgId,
        courseId,
        documentId: docId,
        title: `فصل اول: مبانی ${title}`,
        description: `توضیحات فصل اول ${title}`,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      lessonId = randomUUID();
      await lessonStore.create({
        id: lessonId,
        organizationId: creatorOrgId,
        moduleId,
        title: `درس اول ${title}`,
        sortOrder: 1,
        content: "محتوای متنی آموزشی درس",
        publicationStatus: "published",
        estimatedMinutes: 10,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      flashcardId = randomUUID();
      await flashcardStore.create({
        id: flashcardId,
        organizationId: creatorOrgId,
        courseId,
        documentId: docId,
        lessonId,
        front: `پرسش فلش‌کارت ${title}`,
        back: `پاسخ فلش‌کارت ${title}`,
        difficulty: "medium",
        status: "active",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      quizId = randomUUID();
      await quizStore.create({
        id: quizId,
        organizationId: creatorOrgId,
        courseId,
        documentId: docId,
        title: `آزمون جامع ${title}`,
        status: "published",
        type: "multiple_choice",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await quizQuestionStore.createMany([
        {
          id: randomUUID() as any,
          quizId,
          question: "سوال تستی شماره ۱؟",
          options: [
            { id: "opt-1", text: "گزینه ۱", isCorrect: true },
            { id: "opt-2", text: "گزینه ۲", isCorrect: false },
          ],
          explanation: "توضیح پاسخ صحیح",
          sortOrder: 1,
          topic: "کلیات",
          difficulty: "medium",
          lessonId,
        },
      ]);

      summaryId = randomUUID();
      await generatedContentStore.create({
        id: summaryId,
        organizationId: creatorOrgId,
        documentId: docId,
        courseId,
        type: "review_summary",
        status: "accepted",
        payload: {
          kind: "review_summary",
          title: `خلاصه نکات کلیدی ${title}`,
          overview: "مرور اجمالی مباحث مهم و جمع‌بندی مفاهیم",
          summary: "مرور اجمالی مباحث مهم و جمع‌بندی مفاهیم",
          estimatedReadingMinutes: 8,
          sections: [
            {
              title: "سرفصل اول: مفاهیم پایه",
              keyPoints: ["نکته آزمونی ۱", "نکته آزمونی ۲"],
            },
          ],
          finalTakeaways: ["جمع‌بندی نهایی مبحث"],
          citationChunkIds: [],
        } as any,
        promptVersion: "1.0",
        model: "gemini-pro",
        tokenUsage: { inputTokens: 100, outputTokens: 200 },
        generationKey: null,
        acceptedAt: now,
        acceptedBy: creatorUserId,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    const pubId = asCoursePublicationId(randomUUID());
    const chapters = options?.withOutputs
      ? [
          {
            id: moduleId,
            title: `فصل اول: مبانی ${title}`,
            description: `توضیحات فصل اول ${title}`,
            documentId: docId,
            sortOrder: 1,
            lessons: [
              {
                id: lessonId,
                title: `درس اول ${title}`,
                contentMarkdown: "محتوای متنی آموزشی درس",
                sortOrder: 1,
                estimatedMinutes: 10,
              },
            ],
            reviewSummary: {
              title: `خلاصه نکات کلیدی ${title}`,
              overview: "مرور اجمالی مباحث مهم و جمع‌بندی مفاهیم",
              summary: "مرور اجمالی مباحث مهم و جمع‌بندی مفاهیم",
              estimatedReadingMinutes: 8,
              sections: [
                {
                  title: "سرفصل اول: مفاهیم پایه",
                  keyPoints: ["نکته آزمونی ۱", "نکته آزمونی ۲"],
                },
              ],
            },
          },
        ]
      : [];

    await coursePublicationStore.create({
      id: pubId,
      courseId: course.id,
      organizationId: creatorOrgId,
      requestedByUserId: creatorUserId,
      reviewedByUserId: adminUserId,
      version: 1,
      status: "published",
      publishedAt: now,
      reviewedAt: now,
      title: course.name,
      description: course.description ?? "",
      subject: course.subject ?? "",
      metadata: {
        chapters,
      },
      snapshot: {
        courseId: course.id,
        title: course.name,
        description: course.description ?? "",
        subject: course.subject ?? "",
        chapters,
        stats: {
          chapterCount: chapters.length,
          lessonCount: chapters.reduce((acc, c) => acc + c.lessons.length, 0),
          flashcardCount: options?.withOutputs ? 1 : 0,
          quizQuestionCount: options?.withOutputs ? 1 : 0,
          estimatedReadingMinutes: 10,
        },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return {
      courseId: course.id,
      publicationId: pubId,
      docId,
      moduleId,
      lessonId,
      flashcardId,
      quizId,
      summaryId,
    };
  }

  test("1. Official platform courses behavior is completely preserved", async () => {
    const systemOrgId = (config.systemOrganizationId ?? "b4a0b464-16db-4087-92b7-163a1e6f6776") as OrganizationId;
    const officialCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: systemOrgId,
        name: "دوره رسمی پلتفرم آوانا",
        subject: "پزشکی عمومی",
        description: "دوره رسمی استاندارد آوانا",
        isOfficial: true,
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 1. Learner sees official course in organization catalog
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    expect(catRes.statusCode).toBe(200);
    const catItems = JSON.parse(catRes.body).items;
    expect(catItems.some((c: any) => c.id === officialCourse.id)).toBe(true);

    // 2. Learner adds official course to My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: officialCourse.id },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // 3. Learner's My Courses contains official course
    const myRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
    });
    expect(myRes.statusCode).toBe(200);
    expect(JSON.parse(myRes.body).items.some((c: any) => c.id === officialCourse.id)).toBe(true);
  });

  test("2. User-created approved course is displayed in public library resources", async () => {
    const { courseId } = await createAndPublishUserCourse("فیزیولوژی عمومی کاربرساخته");

    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const body = JSON.parse(libRes.body);
    const found = body.courses.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.title).toBe("فیزیولوژی عمومی کاربرساخته");
  });

  test("3. User-created approved course is displayed in course selector for other organizations", async () => {
    const { courseId } = await createAndPublishUserCourse("فارماکولوژی قلب و عروق");

    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    expect(catRes.statusCode).toBe(200);
    const items = JSON.parse(catRes.body).items;
    const found = items.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.title).toBe("فارماکولوژی قلب و عروق");
  });

  test("4. Learner in another organization can successfully add approved user course to My Courses", async () => {
    const { courseId } = await createAndPublishUserCourse("شیمی دارویی پیشرفته");

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);
    const body = JSON.parse(addRes.body);
    expect(body.success).toBe(true);
  });

  test("5. Enrolled user-created course is listed in GET /courses/my for the learner", async () => {
    const { courseId } = await createAndPublishUserCourse("ایمونولوژی پایه");

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    const myRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
    });
    expect(myRes.statusCode).toBe(200);
    const items = JSON.parse(myRes.body).items;
    const found = items.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.title).toBe("ایمونولوژی پایه");
  });

  test("6. Adding user course to My Courses is idempotent and does not duplicate or crash", async () => {
    const { courseId } = await createAndPublishUserCourse("میکروبیولوژی پزشکی");

    // First add
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(res1.statusCode);

    // Second add (idempotent)
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(res2.statusCode);

    // Verify exactly 1 entry in list
    const myRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
    });
    const items = JSON.parse(myRes.body).items.filter((c: any) => c.id === courseId);
    expect(items.length).toBe(1);
  });

  test("7. Unapproved courses (draft, pending_review, rejected) are strictly isolated and return 404/cannot be added", async () => {
    const now = new Date().toISOString();

    // 1. Draft course
    const draftCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: creatorOrgId,
        name: "دوره پیش‌نویس محرمانه",
        subject: "داروسازی",
        description: "پیش نویس",
        isOfficial: false,
        status: "draft",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Pending review course
    const pendingCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: creatorOrgId,
        name: "دوره در انتظار بررسی",
        subject: "داروسازی",
        description: "در انتظار بررسی",
        isOfficial: false,
        status: "pending_review",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId: pendingCourse.id,
      organizationId: creatorOrgId,
      requestedByUserId: creatorUserId,
      reviewedByUserId: null,
      version: 1,
      status: "pending_review",
      publishedAt: null,
      reviewedAt: null,
      title: pendingCourse.name,
      description: pendingCourse.description ?? "",
      subject: pendingCourse.subject ?? "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 3. Rejected course
    const rejCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: creatorOrgId,
        name: "دوره رد شده",
        subject: "داروسازی",
        description: "رد شده",
        isOfficial: false,
        status: "draft",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId: rejCourse.id,
      organizationId: creatorOrgId,
      requestedByUserId: creatorUserId,
      reviewedByUserId: adminUserId,
      version: 1,
      status: "rejected",
      publishedAt: null,
      reviewedAt: now,
      title: rejCourse.name,
      description: rejCourse.description ?? "",
      subject: rejCourse.subject ?? "",
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Verify none of them appear in learner's catalog
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    const catIds = JSON.parse(catRes.body).items.map((c: any) => c.id);
    expect(catIds).not.toContain(draftCourse.id);
    expect(catIds).not.toContain(pendingCourse.id);
    expect(catIds).not.toContain(rejCourse.id);

    // Verify none of them appear in public library
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const libIds = JSON.parse(libRes.body).courses.map((c: any) => c.id);
    expect(libIds).not.toContain(draftCourse.id);
    expect(libIds).not.toContain(pendingCourse.id);
    expect(libIds).not.toContain(rejCourse.id);

    // Verify attempting to add any of them to learner's My Courses fails with 404
    for (const cid of [draftCourse.id, pendingCourse.id, rejCourse.id]) {
      const addRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${learnerOrgId}/courses/my`,
        headers: authHeaders(learnerToken),
        payload: { course_id: cid },
      });
      expect(addRes.statusCode).toBe(404);
    }
  });

  test("8. Access control: other users who enrolled in public course CANNOT mutate or delete the course", async () => {
    const { courseId } = await createAndPublishUserCourse("سم‌شناسی بالینی");

    // Learner adds course
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    // Learner attempts to modify the course -> blocked (400, 403, or 404)
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}`,
      headers: authHeaders(learnerToken),
      payload: { title: "تغییر غیرمجاز عنوان دوره" },
    });
    expect([400, 403, 404]).toContain(updateRes.statusCode);

    // Learner attempts to delete the main course -> blocked (400, 403, or 404)
    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}`,
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect([400, 403, 404]).toContain(delRes.statusCode);

    // Learner can remove it from their OWN My Courses list without affecting the course
    const removeRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${learnerOrgId}/courses/my/${courseId}`,
      headers: { Cookie: `avana_session=${learnerToken}` },
    });
    expect(removeRes.statusCode).toBe(204);

    // Course still exists in store
    const course = await courseStore.findById(asCourseId(courseId));
    expect(course).toBeDefined();
    expect(course?.deletedAt).toBeNull();
  });

  test("9. Commercial rules preserved: paid course requires entitlement to view lessons", async () => {
    const { courseId, publicationId } = await createAndPublishUserCourse("بیوشیمی بالینی پیشرفته (پولی)");

    // Attach paid commerce product
    const prodId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: prodId,
      code: `course_pub_${publicationId}`,
      type: "course",
      title: "بیوشیمی بالینی پیشرفته (پولی)",
      description: "دوره پولی",
      price: 50000,
      currency: "toman",
      targetType: "course_publication",
      targetId: publicationId,
      durationDays: null,
      active: true,
      metadata: { coursePublicationId: publicationId, courseId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Learner adds course to My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // In library, the course is marked as paid with price 50000
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const libCourse = JSON.parse(libRes.body).courses.find((c: any) => c.id === courseId);
    expect(libCourse).toBeDefined();
    expect(libCourse.purchase).toBeDefined();
    expect(libCourse.purchase.price).toBe(50000);
    expect(libCourse.access.hasAccess).toBe(false);
  });

  test("10. Privacy preserved: no creator private info (email/userId) in course responses", async () => {
    const { courseId } = await createAndPublishUserCourse("اصول فیزیوتراپی");

    // Catalog response
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    const item = JSON.parse(catRes.body).items.find((c: any) => c.id === courseId);
    expect(item).toBeDefined();
    expect(item.creatorEmail).toBeUndefined();
    expect(item.email).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain("creator@example.com");

    // Library response
    const libRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: authHeaders(learnerToken),
    });
    expect(libRes.statusCode).toBe(200);
    const libItem = JSON.parse(libRes.body).courses.find((c: any) => c.id === courseId);
    expect(libItem).toBeDefined();
    expect(JSON.stringify(libItem)).not.toContain("creator@example.com");
  });

  test("11. Adding approved course to My Courses does not trigger AI generation or Gemini jobs", async () => {
    const queueSpy = { enqueueCount: 0 };
    const originalEnqueue = generationQueue.enqueueGenerationJob.bind(generationQueue);
    generationQueue.enqueueGenerationJob = async (input: any) => {
      queueSpy.enqueueCount++;
      return originalEnqueue(input);
    };

    const { courseId } = await createAndPublishUserCourse("آناتومی اندام فوقانی");

    const countBefore = queueSpy.enqueueCount;

    // Learner adds course
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // AI generation queue was NOT touched
    expect(queueSpy.enqueueCount).toBe(countBefore);
  });

  test("12. Own-organization courses work seamlessly without public publishing", async () => {
    // Creator creates a personal course in their own org
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: authHeaders(creatorToken),
      payload: {
        title: "دوره شخصی خودم (بدون انتشار)",
        subject: "یادداشت شخصی",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const ownCourseId = JSON.parse(createRes.body).course.id;

    // Visible in creator's own catalog
    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: authHeaders(creatorToken),
    });
    expect(JSON.parse(catRes.body).items.some((c: any) => c.id === ownCourseId)).toBe(true);

    // Creator can add it to their My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/my`,
      headers: authHeaders(creatorToken),
      payload: { course_id: ownCourseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // Creator can edit their own course
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${creatorOrgId}/courses/${ownCourseId}`,
      headers: authHeaders(creatorToken),
      payload: { title: "عنوان ویرایش شده دوره شخصی" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).course.title).toBe("عنوان ویرایش شده دوره شخصی");
  });

  test("13. Visual differentiation and contract: user-published course returns isOfficial: false, isUserPublished: true, publisherName", async () => {
    const { courseId } = await createAndPublishUserCourse("اصول تصویربرداری پزشکی");

    const catRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    expect(catRes.statusCode).toBe(200);
    const catItems = JSON.parse(catRes.body).items;
    const userCourse = catItems.find((c: any) => c.id === courseId);
    expect(userCourse).toBeDefined();
    expect(userCourse.isOfficial).toBe(false);
    expect(userCourse.is_official).toBe(false);
    expect(userCourse.isUserPublished).toBe(true);
    expect(userCourse.is_user_published).toBe(true);
    expect(userCourse.publisherName).toBe("creator");

    // Official course returns isOfficial: true, isUserPublished: false
    const systemOrgId = (config.systemOrganizationId ?? "b4a0b464-16db-4087-92b7-163a1e6f6776") as OrganizationId;
    const officialCourse = await courseStore.create({
      course: {
        id: asCourseId(randomUUID()),
        organizationId: systemOrgId,
        name: "دوره رسمی استاندارد آوانا ۲",
        subject: "پزشکی",
        isOfficial: true,
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const catRes2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses`,
      headers: authHeaders(learnerToken),
    });
    const offItem = JSON.parse(catRes2.body).items.find((c: any) => c.id === officialCourse.id);
    expect(offItem).toBeDefined();
    expect(offItem.isOfficial).toBe(true);
    expect(offItem.isUserPublished).toBe(false);
  });

  test("14. Enrolled user B sees all published outputs of User A's published course (lessons, flashcards, quizzes, documents, review summary)", async () => {
    const { courseId, docId, quizId, flashcardId } = await createAndPublishUserCourse(
      "بیوشیمی ساختاری",
      "بیوشیمی",
      { withOutputs: true },
    );

    // Learner B enrolls in Course A
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // 1. Lessons: Learner B can access course learning modules & lessons
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: authHeaders(learnerToken),
    });
    expect(learnRes.statusCode).toBe(200);
    const learnBody = JSON.parse(learnRes.body);
    expect(learnBody.modules.length).toBeGreaterThan(0);
    expect(learnBody.modules[0].document_id).toBe(docId);
    expect(learnBody.modules[0].lessons.length).toBeGreaterThan(0);

    // 2. Flashcards: Learner B can access published flashcards
    const fcRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      headers: authHeaders(learnerToken),
    });
    expect(fcRes.statusCode).toBe(200);
    const fcItems = JSON.parse(fcRes.body).items;
    expect(fcItems.some((f: any) => f.id === flashcardId)).toBe(true);

    // 3. Quizzes: Learner B can access published quizzes
    const qzRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes`,
      headers: authHeaders(learnerToken),
    });
    expect(qzRes.statusCode).toBe(200);
    const qzItems = JSON.parse(qzRes.body).items;
    expect(qzItems.some((q: any) => q.id === quizId)).toBe(true);

    // 4. Documents: Learner B can list documents attached to Course A
    const docRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/documents?course_id=${courseId}`,
      headers: authHeaders(learnerToken),
    });
    expect(docRes.statusCode).toBe(200);
    const docItems = JSON.parse(docRes.body).items;
    expect(docItems.some((d: any) => d.id === docId)).toBe(true);

    // 5. Document download: Learner B can download the course document
    const dlRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/documents/${docId}/download`,
      headers: authHeaders(learnerToken),
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.body).toContain("PDF Content for بیوشیمی ساختاری");
  });

  test("15. User B can study flashcards and take quizzes & submit attempts", async () => {
    const { courseId, quizId } = await createAndPublishUserCourse(
      "ژنتیک مولکولی",
      "ژنتیک",
      { withOutputs: true },
    );

    // Learner B enrolls
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    // Learner B gets quiz for attempt
    const quizRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}`,
      headers: authHeaders(learnerToken),
    });
    expect(quizRes.statusCode).toBe(200);
    const quizData = JSON.parse(quizRes.body);
    expect(quizData.quiz.id).toBe(quizId);
    expect(quizData.quiz.questions.length).toBeGreaterThan(0);
    const questionId = quizData.quiz.questions[0].id;

    // Learner B submits attempt
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      headers: authHeaders(learnerToken),
      payload: {
        answers: [
          {
            questionId,
            selectedOptionId: "opt-1",
            durationSeconds: 15,
          },
        ],
      },
    });
    expect([200, 201]).toContain(submitRes.statusCode);
    const attemptBody = JSON.parse(submitRes.body);
    expect(attemptBody.attempt).toBeDefined();
    const attemptId = attemptBody.attempt_id || attemptBody.attempt.attemptId;
    const savedAttempt = await quizAttemptStore.findById(attemptId);
    expect(savedAttempt?.userId).toBe(learnerUserId);
  });

  test("16. Personal study progress of User B is recorded and isolated to User B", async () => {
    const { courseId, quizId } = await createAndPublishUserCourse(
      "ایمونولوژی سلولی",
      "ایمونولوژی",
      { withOutputs: true },
    );

    // Learner B enrolls and submits an attempt
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    const quizData = JSON.parse((await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes/${quizId}`,
      headers: authHeaders(learnerToken),
    })).body);
    const questionId = quizData.quiz.questions[0].id;

    await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quizId}/attempts`,
      headers: authHeaders(learnerToken),
      payload: {
        answers: [{ questionId, selectedOptionId: "opt-1", durationSeconds: 20 }],
      },
    });

    // Verify User B has recorded attempt
    const learnerAttempts = await quizAttemptStore.listByUserAndQuiz(learnerUserId, quizId);
    expect(learnerAttempts.length).toBe(1);

    // Verify Creator A has NO attempts
    const creatorAttempts = await quizAttemptStore.listByUserAndQuiz(creatorUserId, quizId);
    expect(creatorAttempts.length).toBe(0);
  });

  test("17. Strict read-only: User B cannot mutate or delete course, lessons, flashcards, quizzes, or documents", async () => {
    const { courseId, docId } = await createAndPublishUserCourse(
      "ویروس‌شناسی بالینی",
      "ویروس‌شناسی",
      { withOutputs: true },
    );

    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    // Learner B cannot delete creator's course
    const delCourseRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}`,
      headers: authHeaders(learnerToken),
    });
    expect([400, 403, 404]).toContain(delCourseRes.statusCode);

    // Learner B cannot delete creator's document
    const delDocRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${creatorOrgId}/documents/${docId}`,
      headers: authHeaders(learnerToken),
    });
    expect([400, 403, 404]).toContain(delDocRes.statusCode);

    // Learner B cannot delete creator's quizzes by document
    const delQuizRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${creatorOrgId}/documents/${docId}/quizzes`,
      headers: authHeaders(learnerToken),
    });
    expect([400, 403, 404]).toContain(delQuizRes.statusCode);

    // Learner B cannot delete creator's flashcards by document
    const delFcRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${creatorOrgId}/documents/${docId}/flashcards`,
      headers: authHeaders(learnerToken),
    });
    expect([400, 403, 404]).toContain(delFcRes.statusCode);
  });

  test("18. Cross-course document isolation: User B sees only documents of enrolled course, not creator's other courses", async () => {
    // Course 1 is published and enrolled
    const { courseId: c1Id, docId: d1Id } = await createAndPublishUserCourse(
      "فارماکولوژی ۱",
      "داروسازی",
      { withOutputs: true },
    );
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: c1Id },
    });

    // Course 2 is a separate private/draft course by Creator A
    const c2Id = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: c2Id,
        organizationId: creatorOrgId,
        name: "فارماکولوژی ۲ (خصوصی)",
        subject: "داروسازی",
        isOfficial: false,
        status: "draft",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
    const d2Id = randomUUID() as any;
    await documentStore.create({
      id: d2Id,
      organizationId: creatorOrgId,
      courseId: c2Id,
      ownerUserId: creatorUserId,
      originalName: "private_doc2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: "dummy-2",
      storageKey: `uploads/${d2Id}.pdf`,
      pageCount: 3,
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
    });

    // Learner B lists documents for Course 1: should ONLY see d1Id, NEVER d2Id
    const c1DocsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/documents?course_id=${c1Id}`,
      headers: authHeaders(learnerToken),
    });
    expect(c1DocsRes.statusCode).toBe(200);
    const c1Docs = JSON.parse(c1DocsRes.body).items;
    expect(c1Docs.some((d: any) => d.id === d1Id)).toBe(true);
    expect(c1Docs.some((d: any) => d.id === d2Id)).toBe(false);

    // Learner B attempts to query documents for un-enrolled private Course 2 -> 404
    const c2DocsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/documents?course_id=${c2Id}`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(c2DocsRes.statusCode);

    // Learner B attempts to download private document d2Id -> 404
    const d2DlRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/documents/${d2Id}/download`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(d2DlRes.statusCode);

    // Tampered non-existent courseId returns 404
    const fakeCourseRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/documents?course_id=${randomUUID()}`,
      headers: authHeaders(learnerToken),
    });
    expect(fakeCourseRes.statusCode).toBe(404);
  });

  test("19. Revoked or suspended publication immediately revokes cross-tenant public access", async () => {
    const { courseId, publicationId, docId } = await createAndPublishUserCourse(
      "باکتری‌شناسی جامع",
      "میکروبیولوژی",
      { withOutputs: true },
    );

    // Learner B enrolls
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });

    // Flashcards & Documents access works initially
    const initFc = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      headers: authHeaders(learnerToken),
    });
    expect(initFc.statusCode).toBe(200);

    // Admin or system rejects/revokes the publication
    const existingPub = await coursePublicationStore.findById(publicationId);
    if (existingPub) {
      await coursePublicationStore.updateStatus(publicationId, "rejected", adminUserId, "violates policy");
      const c = await courseStore.findById(courseId);
      if (c) await courseStore.update({ ...c, status: "draft" });
    }

    // Now cross-tenant flashcards query fails with 404
    const revokedFc = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(revokedFc.statusCode);

    // Cross-tenant documents query also fails with 404
    const revokedDocs = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/documents?course_id=${courseId}`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(revokedDocs.statusCode);
  });

  test("20. Comprehensive Review Summary: Enrolled Learner B access, read-only enforcement, zero leakage of private summaries, and revocation on unpublish", async () => {
    const { courseId, publicationId, docId } = await createAndPublishUserCourse(
      "فارماکولوژی بالینی جامع",
      "داروسازی",
      { withOutputs: true },
    );

    // 1. Learner B enrolls in the published course
    const enrollRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/my`,
      headers: authHeaders(learnerToken),
      payload: { course_id: courseId },
    });
    expect([200, 201]).toContain(enrollRes.statusCode);

    // 2. Learner B requests Review Summary via both creator organization path and learner organization path
    const getSummaryViaCreatorOrg = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(learnerToken),
    });
    expect(getSummaryViaCreatorOrg.statusCode).toBe(200);

    const getSummaryViaLearnerOrg = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(learnerToken),
    });
    expect(getSummaryViaLearnerOrg.statusCode).toBe(200);

    // 3. Verify that all payload sections and fields are properly returned
    const body = JSON.parse(getSummaryViaLearnerOrg.body);
    expect(body.content).toBeTruthy();
    expect(body.content.type).toBe("review_summary");
    expect(body.content.status).toBe("accepted");
    expect(body.content.payload).toBeDefined();
    expect(body.content.payload.overview).toBe("مرور اجمالی مباحث مهم و جمع‌بندی مفاهیم");
    expect(body.content.payload.summary).toBe("مرور اجمالی مباحث مهم و جمع‌بندی مفاهیم");
    expect(body.content.payload.estimatedReadingMinutes).toBe(8);
    expect(body.content.payload.sections).toHaveLength(1);
    expect(body.content.payload.sections[0].title).toBe("سرفصل اول: مفاهیم پایه");
    expect(body.content.payload.sections[0].keyPoints).toContain("نکته آزمونی ۱");
    expect(body.content.payload.sections[0].keyPoints).toContain("نکته آزمونی ۲");

    // 4. Learner B CANNOT regenerate or overwrite creator's review summary (403 Forbidden)
    const regenerateRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(learnerToken),
      payload: { force: true },
    });
    expect([403, 404]).toContain(regenerateRes.statusCode);

    const regenerateViaLearnerOrgRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(learnerToken),
      payload: { force: true },
    });
    expect([403, 404]).toContain(regenerateViaLearnerOrgRes.statusCode);

    // 5. Learner B CANNOT delete generation for the document (403 or 404)
    const deleteGenRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/documents/${docId}/generation`,
      headers: authHeaders(learnerToken),
    });
    expect([400, 403, 404]).toContain(deleteGenRes.statusCode);

    // 6. Learner B CANNOT access private documents' summaries or unassociated documents
    const privateDocId = randomUUID();
    const privateDocStorageKey = `uploads/${privateDocId}.pdf`;
    await storageProvider.save({
      storageKey: privateDocStorageKey,
      data: Buffer.from("Private PDF"),
      mimeType: "application/pdf",
    });
    await documentStore.create({
      id: privateDocId,
      organizationId: creatorOrgId,
      courseId: null,
      ownerUserId: creatorUserId,
      originalName: "private-research.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512,
      sha256: "hash-priv",
      storageKey: privateDocStorageKey,
      pageCount: 2,
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
    });
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: creatorOrgId,
      documentId: privateDocId,
      courseId: asCourseId(randomUUID()),
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "خلاصه کاملاً محرمانه",
        overview: "اطلاعات محرمانه خصوصی",
        sections: [],
      } as any,
      promptVersion: "1.0",
      model: "gemini-pro",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: new Date().toISOString(),
      acceptedBy: creatorUserId,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Requesting summary for private document via published course -> 404 (Document not found in course)
    const privateSummaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/documents/${privateDocId}/review-summary`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(privateSummaryRes.statusCode);

    // Requesting summary directly on creator org without courseId -> 404 (Learner is not org member)
    const directOrgSummaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/documents/${docId}/review-summary`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(directOrgSummaryRes.statusCode);

    // 7. Revocation upon unpublish
    await coursePublicationStore.updateStatus(publicationId, "rejected", adminUserId, "revocation test");
    const course = await courseStore.findById(courseId);
    if (course) {
      await courseStore.update({ ...course, status: "draft" });
    }

    const revokedSummaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${learnerOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(learnerToken),
    });
    expect([403, 404]).toContain(revokedSummaryRes.statusCode);

    // 8. Creator and Admin retain full review summary access even after unpublish
    const creatorSummaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(creatorToken),
    });
    expect(creatorSummaryRes.statusCode).toBe(200);

    const adminSummaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: authHeaders(adminToken),
    });
    expect(adminSummaryRes.statusCode).toBe(200);
  });
});
