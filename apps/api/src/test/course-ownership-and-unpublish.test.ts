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
  type Actor,
  asCoursePublicationId,
  asCourseId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import { CourseService } from "../modules/courses/course-service.js";
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
  async createUploadIntent(_input: UploadIntent): Promise<{ uploadUrl: string; fileKey: string }> {
    return { uploadUrl: "http://storage/test", fileKey: `mock-${randomUUID()}` };
  }
  async completeUpload(_fileKey: string): Promise<StoredFile> {
    return {
      fileKey: `mock-${randomUUID()}`,
      url: "http://storage/test/file.pdf",
      size: 1024,
      mimeType: "application/pdf",
      sha256: "dummy-sha256",
    };
  }
  async getDownloadUrl(fileKey: string): Promise<string> {
    return `http://storage/test/${fileKey}`;
  }
  async deleteFile(_fileKey: string): Promise<void> {}
}

describe("Course Ownership, Permission Isolation, and Unpublishing Lifecycle", () => {
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
  let contentPackStore: InMemoryContentPackStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let progressStore: InMemoryProgressStore;

  let creatorUserToken: string;
  let creatorOrgId: OrganizationId;

  let recipientUserToken: string;
  let recipientUserId: UserId;
  let recipientOrgId: OrganizationId;

  let adminUserToken: string;

  let thirdUserToken: string;
  let thirdOrgId: OrganizationId;

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
    coursePublicationStore.setCourseStore(courseStore);

    moduleStore = new InMemoryModuleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    subCourseGroupStore.setModuleStore(moduleStore);
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    notificationStore = new InMemoryNotificationStore();
    const notificationService = new NotificationService(notificationStore);

    contentPackStore = new InMemoryContentPackStore();
    contentPackUsageStore = new InMemoryContentPackUsageStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    const storageProvider = new InMemoryStorageProvider();

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
      notificationStore,
      notificationService,
      contentPackStore,
      contentPackUsageStore,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      userFlashcardScheduleStore,
      storageProvider,
    });

    const creator = await createAuthenticatedUser("creator@avana.ir", Roles.teacher);
    creatorUserToken = creator.token;
    creatorOrgId = creator.orgId;

    const recipient = await createAuthenticatedUser("recipient_admin@avana.ir", Roles.student);
    recipientUserToken = recipient.token;
    recipientUserId = recipient.userId;
    recipientOrgId = recipient.orgId;

    const admin = await createAuthenticatedUser("superadmin@avana.ir", Roles.platform_admin);
    adminUserToken = admin.token;

    const third = await createAuthenticatedUser("third_user@avana.ir", Roles.student);
    thirdUserToken = third.token;
    thirdOrgId = third.orgId;
  });

  test("Creator creates, publishes, recipient enrolls, recipient CANNOT edit, creator unpublishes with continuous study access", async () => {
    // 1. Creator creates a course
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره بیوشیمی پزشکی دکتر علوی",
        name: "دوره بیوشیمی پزشکی دکتر علوی",
        description: "مفاهیم بیوشیمی و مسیرهای متابولیک",
        subject: "پزشکی",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const courseId = createRes.json().course.id;

    // Creator adds a chapter, module, lesson
    const createChRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "فصل ۱: گلیکولیز و چرخه کربس",
      },
    });
    expect(createChRes.statusCode).toBe(201);
    const chapterId = createChRes.json().chapter.id;

    const mod = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: chapterId,
      title: "ماژول گلیکولیز",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lesson = await lessonStore.create({
      id: randomUUID() as any,
      organizationId: creatorOrgId,
      moduleId: mod.id,
      title: "درس آنزیم‌های کلیدی گلیکولیز",
      contentMarkdown: "فسفوفروکتوکیناز آنزیم کلیدی تنظیم گلیکولیز است.",
      sortOrder: 0,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const flashcard = await flashcardStore.create({
      id: randomUUID() as any,
      organizationId: creatorOrgId,
      courseId,
      moduleId: mod.id,
      lessonId: lesson.id,
      front: "آنزیم کلیدی گلیکولیز چیست؟",
      back: "فسفوفروکتوکیناز-۱ (PFK-1)",
      sourceDocumentId: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const quiz = await quizStore.create({
      id: randomUUID() as any,
      organizationId: creatorOrgId,
      courseId,
      moduleId: mod.id,
      lessonId: lesson.id,
      title: "آزمون ارزیابی گلیکولیز",
      type: "lesson_assessment",
      status: "published",
      shuffleQuestions: false,
      isExamScope: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const questionId = randomUUID() as any;
    await quizQuestionStore.createMany([
      {
        id: questionId,
        quizId: quiz.id,
        generatedContentId: null,
        question: "کدام آنزیم مرحله محدودکننده سرعت گلیکولیز را کاتالیز می‌کند؟",
        questionType: "multiple_choice",
        choices: ["هگزوکیناز", "فسفوفروکتوکیناز-۱"],
        correctAnswer: "فسفوفروکتوکیناز-۱",
        explanation: "PFK-1 آنزیم اصلی کنترل‌کننده مسیر است.",
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    // 2. Creator submits for publication
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره بیوشیمی پزشکی دکتر علوی (نسخه عمومی)",
      },
    });
    expect(pubRes.statusCode).toBe(201);
    const publicationId = pubRes.json().publication.id;

    // Admin approves the publication
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${publicationId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "free",
        reviewNotes: "محتوای علمی تایید شد.",
      },
    });
    expect(approveRes.statusCode).toBe(200);

    // 3. Recipient User B views library and adds course to My Courses
    const libraryRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(libraryRes.statusCode).toBe(200);
    const libraryCourses = libraryRes.json().courses ?? [];
    expect(libraryCourses.some((c: any) => c.id === courseId)).toBe(true);

    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${recipientOrgId}/courses/my`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        courseId,
      },
    });
    expect([200, 201]).toContain(addRes.statusCode);

    // 4. Permission payload verification for Creator vs Recipient
    const creatorStatusRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publication-status`,
      headers: {
        Cookie: `avana_session=${creatorUserToken}`,
      },
    });
    expect(creatorStatusRes.statusCode).toBe(200);
    expect(creatorStatusRes.json().canEdit).toBe(true);
    expect(creatorStatusRes.json().isOwner).toBe(true);

    const recipientCourseRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${recipientOrgId}/courses/${courseId}`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(recipientCourseRes.statusCode).toBe(200);
    const recipientCourseData = recipientCourseRes.json().course;
    expect(recipientCourseData.can_edit).toBe(false);
    expect(recipientCourseData.canEdit).toBe(false);
    expect(recipientCourseData.is_owner).toBe(false);
    expect(recipientCourseData.isOwner).toBe(false);
    expect(recipientCourseData.is_enrolled).toBe(true);
    expect(recipientCourseData.isEnrolled).toBe(true);

    // 5. Recipient attempts MUTATIONS -> ALL MUST BE REJECTED (403 Forbidden or 404 Not Found)
    // A. Update course metadata via recipientOrgId (tenant isolation prevents access)
    const updateFailRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${recipientOrgId}/courses/${courseId}`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        name: "تلاش غیرمجاز برای تغییر نام دوره",
      },
    });
    expect([403, 404]).toContain(updateFailRes.statusCode);

    // Direct attack on creatorOrgId by recipient -> 403 Forbidden
    const directUpdateFailRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        name: "تلاش مستقیم برای تغییر نام دوره در سازمان سازنده",
      },
    });
    expect(directUpdateFailRes.statusCode).toBe(403);

    // B. Add new chapter
    const addChapterFailRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${recipientOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        title: "فصل غیرمجاز",
      },
    });
    expect([403, 404]).toContain(addChapterFailRes.statusCode);

    const directAddChapterFailRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        title: "فصل غیرمجاز مستقیم",
      },
    });
    expect(directAddChapterFailRes.statusCode).toBe(403);

    // C. Reorder chapters
    const reorderFailRes = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${recipientOrgId}/courses/${courseId}/chapters/reorder`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        chapterIds: [chapterId],
      },
    });
    expect([403, 404]).toContain(reorderFailRes.statusCode);

    // D. Submit publication request
    const pubFailRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${recipientOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        title: "تلاش غیرمجاز برای انتشار",
      },
    });
    expect([403, 404]).toContain(pubFailRes.statusCode);

    const directPubFailRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        title: "تلاش غیرمجاز مستقیم برای انتشار",
      },
    });
    expect(directPubFailRes.statusCode).toBe(403);

    // E. Unpublish by non-creator
    const unpubFailRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${recipientOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect([403, 404]).toContain(unpubFailRes.statusCode);

    const directUnpubFailRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(directUnpubFailRes.statusCode).toBe(403);

    // 6. Creator UNPUBLISHES the course
    const unpublishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${creatorUserToken}`,
      },
    });
    expect(unpublishRes.statusCode).toBe(200);
    const unpubData = unpublishRes.json();
    expect(unpubData.course.status).toBe("unpublished");
    expect(unpubData.publication.status).toBe("unpublished");

    // Check publication history is PRESERVED (snapshot and version intact)
    const storedPub = await coursePublicationStore.findById(publicationId);
    expect(storedPub).toBeDefined();
    expect(storedPub?.version).toBe(1);
    expect(storedPub?.snapshot).toBeDefined();
    expect(storedPub?.status).toBe("unpublished");
    expect(storedPub?.metadata.unpublishedAt).toBeDefined();

    // 7. Discoverability check: Course is HIDDEN from library and course list
    const libraryAfterUnpubRes = await app.inject({
      method: "GET",
      url: "/v1/library/resources?type=courses",
      headers: {
        Cookie: `avana_session=${thirdUserToken}`,
      },
    });
    expect(libraryAfterUnpubRes.statusCode).toBe(200);
    const libraryAfterUnpubCourses = libraryAfterUnpubRes.json().courses ?? [];
    expect(libraryAfterUnpubCourses.some((c: any) => c.id === courseId)).toBe(false);

    const selectorAfterUnpubRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${thirdOrgId}/courses`,
      headers: {
        Cookie: `avana_session=${thirdUserToken}`,
      },
    });
    const selectorAfterUnpubItems = selectorAfterUnpubRes.json().items ?? [];
    expect(selectorAfterUnpubItems.some((c: any) => c.id === courseId)).toBe(false);

    // 8. New user cannot add unpublished course
    const thirdAddRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${thirdOrgId}/courses/my`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${thirdUserToken}`,
      },
      payload: {
        courseId,
        course_id: courseId,
      },
    });
    expect(thirdAddRes.statusCode).toBe(404);

    // 9. Enrolled student (Recipient B) RETAINS FULL STUDY ACCESS via /learn
    const recipientLearnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(recipientLearnRes.statusCode).toBe(200);
    const learnData = recipientLearnRes.json();
    expect(learnData.course.id).toBe(courseId);
    expect(learnData.course.status).toBe("unpublished");
    expect(learnData.course.can_edit).toBe(false);
    expect(learnData.course.is_enrolled).toBe(true);
    expect(learnData.modules.length).toBeGreaterThanOrEqual(1);

    // 9a. Enrolled student marks lesson as completed after unpublish
    const completeProgressRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lesson.id}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: { completed: true },
    });
    expect(completeProgressRes.statusCode).toBe(200);
    expect(completeProgressRes.json().completed).toBe(true);

    // 9b. Non-enrolled user C cannot mark progress on this lesson
    const thirdProgressRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${lesson.id}/progress`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${thirdUserToken}`,
      },
      payload: { completed: true },
    });
    expect([403, 404]).toContain(thirdProgressRes.statusCode);

    // 9c. Enrolled student accesses and reviews flashcards after unpublish
    const flashcardListRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(flashcardListRes.statusCode).toBe(200);
    expect(flashcardListRes.json().flashcards.length).toBeGreaterThanOrEqual(1);

    const submitReviewRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/flashcards/${flashcard.id}/review`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        rating: "good",
        reaction_ms: 1200,
      },
    });
    expect(submitReviewRes.statusCode).toBe(200);
    expect(submitReviewRes.json().success).toBe(true);

    // 9d. Non-enrolled user C cannot access flashcards of unpublished course
    const thirdFlashcardRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      headers: {
        Cookie: `avana_session=${thirdUserToken}`,
      },
    });
    expect([400, 403, 404]).toContain(thirdFlashcardRes.statusCode);

    // 9e. Enrolled student accesses quizzes and submits quiz attempt after unpublish
    const quizzesListRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(quizzesListRes.statusCode).toBe(200);

    const quizAttemptRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${quiz.id}/attempts`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: {
        answers: [
          { questionId, answer: "فسفوفروکتوکیناز-۱" },
        ],
      },
    });
    expect([200, 201]).toContain(quizAttemptRes.statusCode);
    const attemptData = quizAttemptRes.json();
    expect(attemptData.passed).toBe(true);

    // 9f. Non-enrolled user C cannot access quizzes of unpublished course
    const thirdQuizzesRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes`,
      headers: {
        Cookie: `avana_session=${thirdUserToken}`,
      },
    });
    expect([400, 403, 404]).toContain(thirdQuizzesRes.statusCode);

    // 10. Re-publishing lifecycle: Creator submits update/re-publish
    const republishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره بیوشیمی پزشکی دکتر علوی (انتشار مجدد نسخه ۲)",
      },
    });
    expect(republishRes.statusCode).toBe(201);
    const newPub = republishRes.json().publication;
    expect(newPub.version).toBe(2);
    expect(newPub.status).toBe("pending_review");

    // Admin approves re-publication
    const approveV2Res = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${newPub.id}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: {
        accessType: "free",
        reviewNotes: "انتشار مجدد تأیید شد.",
      },
    });
    expect(approveV2Res.statusCode).toBe(200);

    // Verify course is published again at version 2
    const finalCourse = await courseStore.findById(courseId);
    expect(finalCourse?.status).toBe("published");
    expect(finalCourse?.version).toBe(2);

    // Verify enrolled student preserves previous study records and progress!
    const recipientPostRepublishLearn = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(recipientPostRepublishLearn.statusCode).toBe(200);
    const progressStatus = recipientPostRepublishLearn.json().progress;
    expect(progressStatus.completed_lessons).toBeGreaterThanOrEqual(1);
  });

  test("Platform admin can unpublish course, but unpublishing an already unpublished course returns 400", async () => {
    // 1. Create and publish course
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره فیزیولوژی اعصاب",
        subject: "پزشکی",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const courseId = createRes.json().course.id;

    const chRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "فصل اول" },
    });
    expect(chRes.statusCode).toBe(201);

    const mod = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: chRes.json().chapter.id,
      title: "ماژول نورون",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: randomUUID() as any,
      organizationId: creatorOrgId,
      moduleId: mod.id,
      title: "پتانسیل عمل",
      contentMarkdown: "پمپ سدیم پتاسیم و کانال‌های ولتاژی...",
      sortOrder: 0,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "دوره فیزیولوژی اعصاب (عمومی)" },
    });
    expect(pubRes.statusCode).toBe(201);

    await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubRes.json().publication.id}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: { accessType: "free" },
    });

    // 2. Platform admin unpublishes
    const adminUnpubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${adminUserToken}`,
      },
    });
    expect(adminUnpubRes.statusCode).toBe(200);
    expect(adminUnpubRes.json().course.status).toBe("unpublished");

    // 3. Duplicate unpublish returns 400 Bad Request
    const duplicateUnpubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${adminUserToken}`,
      },
    });
    expect(duplicateUnpubRes.statusCode).toBe(400);
    expect(duplicateUnpubRes.json().error.message).toContain("این دوره در حال حاضر منتشر نشده است");
  });

  test("Pending update request management on Unpublish: supersedes pending submission, blocks admin approval, and ensures clean monotonic republishing", async () => {
    // 1. Creator creates and publishes course (Version 1)
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره فارماکولوژی بالینی",
        subject: "پزشکی",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const courseId = createRes.json().course.id;

    const chRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "فصل آنتی‌بیوتیک‌ها" },
    });
    expect(chRes.statusCode).toBe(201);

    const mod = await moduleStore.create({
      id: randomUUID() as any,
      courseId,
      subCourseGroupId: chRes.json().chapter.id,
      title: "ماژول بتالاکتام‌ها",
      description: null,
      documentId: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: randomUUID() as any,
      organizationId: creatorOrgId,
      moduleId: mod.id,
      title: "پنی‌سیلین‌ها و سفالوسپورین‌ها",
      contentMarkdown: "مکانیسم مهار سنتز دیواره سلولی باکتری...",
      sortOrder: 0,
      estimatedMinutes: 25,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Submit initial publication (v1)
    const pubV1Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "دوره فارماکولوژی بالینی (نسخه اول)" },
    });
    expect(pubV1Res.statusCode).toBe(201);
    const pubV1Id = pubV1Res.json().publication.id;

    // Admin approves v1
    const approveV1Res = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubV1Id}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: { accessType: "free" },
    });
    expect(approveV1Res.statusCode).toBe(200);

    // Recipient B adds to My Courses
    const enrollRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${recipientOrgId}/courses/my`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: { courseId },
    });
    expect(enrollRes.statusCode).toBe(200);

    // 2. Creator submits an update proposal (v2 in pending_review)
    const updatePubRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "دوره فارماکولوژی بالینی (پیشنهاد نسخه دوم)" },
    });
    expect(updatePubRes.statusCode).toBe(201);
    const pubV2 = updatePubRes.json().publication;
    expect(pubV2.version).toBe(2);
    expect(pubV2.status).toBe("pending_review");

    // Live course is STILL published while update is pending review
    const liveBeforeUnpub = await courseStore.findById(courseId);
    expect(liveBeforeUnpub?.status).toBe("published");

    // 3. Creator UNPUBLISHES the course while v2 update is pending!
    const unpublishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${creatorUserToken}`,
      },
    });
    expect(unpublishRes.statusCode).toBe(200);
    expect(unpublishRes.json().course.status).toBe("unpublished");

    // Verify publication statuses after unpublish:
    // v1 is unpublished, and v2 pending request was automatically superseded!
    const pubV1Record = await coursePublicationStore.findById(asCoursePublicationId(pubV1Id));
    expect(pubV1Record?.status).toBe("unpublished");

    const pubV2Record = await coursePublicationStore.findById(asCoursePublicationId(pubV2.id));
    expect(pubV2Record?.status).toBe("superseded");
    expect(pubV2Record?.metadata.cancellationReason).toContain("Unpublish");

    // 4. Admin tries to approve the superseded v2 request -> MUST BE REJECTED!
    const tryApproveObsoleteRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubV2.id}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: { accessType: "free" },
    });
    expect([400, 409]).toContain(tryApproveObsoleteRes.statusCode);

    // Verify course remains strictly unpublished
    const courseAfterFailedApprove = await courseStore.findById(courseId);
    expect(courseAfterFailedApprove?.status).toBe("unpublished");

    // 5. Creator submits a brand new publication request after unpublish
    const republishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "دوره فارماکولوژی بالینی (انتشار مجدد نسخه جدید)" },
    });
    expect(republishRes.statusCode).toBe(201);
    const pubV3 = republishRes.json().publication;
    // Guaranteed strictly monotonic versioning greater than both v1 and superseded v2:
    expect(pubV3.version).toBe(3);
    expect(pubV3.status).toBe("pending_review");

    // 6. Admin approves the new v3 publication
    const approveV3Res = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubV3.id}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: { accessType: "free" },
    });
    expect(approveV3Res.statusCode).toBe(200);

    // Course is now published at version 3
    const finalCourse = await courseStore.findById(courseId);
    expect(finalCourse?.status).toBe("published");
    expect(finalCourse?.version).toBe(3);

    // Enrolled learner B still has full continuous access
    const recipientLearnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(recipientLearnRes.statusCode).toBe(200);
    expect(recipientLearnRes.json().course.is_enrolled).toBe(true);
  });

  test("Snapshot isolation: Enrolled student sees frozen approved snapshot after unpublish, while creator sees live drafts", async () => {
    // 1. Creator creates a course with one module and one lesson
    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره هوش مصنوعی در پزشکی",
        name: "دوره هوش مصنوعی در پزشکی",
        description: "مفاهیم هوش مصنوعی در سلامت",
        subject: "پزشکی",
      },
    });
    expect(courseRes.statusCode).toBe(201);
    const courseId = courseRes.json().course.id;

    const chRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/chapters`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "فصل ۱: مقدمات هوش مصنوعی",
      },
    });
    expect(chRes.statusCode).toBe(201);
    const chapterId = chRes.json().chapter.id;

    const mod1 = await moduleStore.create({
      id: `mod-${randomUUID()}`,
      courseId,
      title: "فصل ۱: مقدمات هوش مصنوعی",
      description: "آشنایی با مبانی",
      documentId: null,
      sortOrder: 1,
      subCourseGroupId: chapterId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: `les-${randomUUID()}`,
      organizationId: creatorOrgId,
      moduleId: mod1.id,
      title: "درس ۱: یادگیری ماشین در سلامت",
      contentMarkdown: "# محتوای اولیه تأییدشده",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      reference: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Creator submits and Admin approves course publication v1
    const pubSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/publish`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: { title: "دوره هوش مصنوعی در پزشکی (نسخه ۱)" },
    });
    expect(pubSubmitRes.statusCode).toBe(201);
    const pubId = pubSubmitRes.json().publication.id;

    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/course-submissions/${pubId}/approve`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${adminUserToken}`,
      },
      payload: { accessType: "free" },
    });
    expect(approveRes.statusCode).toBe(200);

    // 3. Recipient student enrolls in the course
    const enrollRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${recipientOrgId}/courses/my`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${recipientUserToken}`,
      },
      payload: { courseId },
    });
    expect([200, 201]).toContain(enrollRes.statusCode);

    // 4. Creator unpublishes the course
    const unpublishRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${creatorUserToken}`,
      },
    });
    expect(unpublishRes.statusCode).toBe(200);

    // 5. Creator modifies database directly: adds new live draft module and lesson
    const modDraft = await moduleStore.create({
      id: `mod-draft-${randomUUID()}`,
      courseId,
      title: "فصل ۲ پیش‌نویس محرمانه (منتشر نشده)",
      description: "فقط برای سازنده",
      documentId: null,
      sortOrder: 2,
      subCourseGroupId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: `les-draft-${randomUUID()}`,
      organizationId: creatorOrgId,
      moduleId: modDraft.id,
      title: "درس محرمانه منتشر نشده",
      contentMarkdown: "# رازهای افشا نشده",
      contentType: "markdown",
      sortOrder: 1,
      estimatedMinutes: 20,
      publicationStatus: "published",
      reference: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 6. Recipient learner accesses /v1/courses/:courseId/learn:
    // MUST ONLY SEE the frozen snapshot (1 module, 1 lesson)! Never draft additions!
    const learnerViewRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(learnerViewRes.statusCode).toBe(200);
    const learnerData = learnerViewRes.json();
    expect(learnerData.modules.length).toBe(1);
    expect(learnerData.modules[0].title).toBe("فصل ۱: مقدمات هوش مصنوعی");
    expect(learnerData.modules[0].lessons.length).toBe(1);
    expect(learnerData.modules[0].lessons[0].title).toBe("درس ۱: یادگیری ماشین در سلامت");
    // Verify draft module is completely absent from learner's view:
    const draftModInLearner = learnerData.modules.find((m: any) => m.title.includes("پیش‌نویس"));
    expect(draftModInLearner).toBeUndefined();

    // 7. Creator accesses /v1/courses/:courseId/learn:
    // Creator CAN see both modules (live draft data) for editing purposes
    const creatorViewRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        Cookie: `avana_session=${creatorUserToken}`,
      },
    });
    expect(creatorViewRes.statusCode).toBe(200);
    const creatorData = creatorViewRes.json();
    expect(creatorData.modules.length).toBe(2);
    expect(creatorData.course.can_edit).toBe(true);
  });

  test("Security: Unpublished course without any approved snapshot securely fails with 404 for learners", async () => {
    // 1. Create a course that is unpublished from start and never had an approved snapshot
    const courseId = randomUUID() as CourseId;
    const course = await courseStore.create({
      course: {
        id: courseId,
        organizationId: creatorOrgId,
        name: "دوره پیش‌نویس بدون انتشار",
        description: "تست امنیتی",
        subject: "عمومی",
        targetAcademicFields: [],
        status: "unpublished",
        isOfficial: false,
        examDate: null,
        examScope: null,
        officialExamDate: null,
        officialExamScope: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    });

    await moduleStore.create({
      id: `mod-${randomUUID()}`,
      courseId: course.id,
      title: "فصل پیش‌نویس ۱",
      description: null,
      documentId: null,
      sortOrder: 1,
      subCourseGroupId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Learner is enrolled
    await courseStore.addUserCourse(recipientUserId, course.id);

    // Learner tries to get course learning -> Must fail securely with 404 Not Found
    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${course.id}/learn`,
      headers: {
        Cookie: `avana_session=${recipientUserToken}`,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  test("Concurrency: Duplicate publication version throws 409 Conflict", async () => {
    const courseId = randomUUID() as CourseId;
    const course = await courseStore.create({
      course: {
        id: courseId,
        organizationId: creatorOrgId,
        name: "دوره بررسی هم‌زمانی",
        description: "تست نسخه تکراری",
        subject: "مهندسی",
        targetAcademicFields: [],
        status: "draft",
        isOfficial: false,
        examDate: null,
        examScope: null,
        officialExamDate: null,
        officialExamScope: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    });

    const now = new Date().toISOString();
    // Insert version 1
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID() as any),
      courseId: course.id,
      creatorUserId: "usr-creator" as any,
      organizationId: creatorOrgId,
      title: "نسخه اول",
      description: null,
      subject: "مهندسی",
      version: 1,
      status: "pending_review",
      publishedAt: null,
      metadata: {} as any,
      snapshot: { chapters: [], stats: {} } as any,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Attempting to insert duplicate version 1 must throw 409 Conflict DomainError
    await expect(
      coursePublicationStore.create({
        id: asCoursePublicationId(randomUUID() as any),
        courseId: course.id,
        creatorUserId: "usr-creator" as any,
        organizationId: creatorOrgId,
        title: "نسخه اول موازی",
        description: null,
        subject: "مهندسی",
        version: 1,
        status: "pending_review",
        publishedAt: null,
        metadata: {} as any,
        snapshot: { chapters: [], stats: {} } as any,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).rejects.toThrowError(/نسخه 1/);
  });

  test("Unpublish resilience: audit emission failure does not fail the unpublish operation", async () => {
    const courseId = asCourseId(randomUUID());
    const course = await courseStore.create({
      course: {
        id: courseId,
        organizationId: creatorOrgId,
        name: "دوره تست تاب‌آوری ادیت",
        description: "بررسی ادیت در آن‌پابلیش",
        subject: "فناوری",
        targetAcademicFields: [],
        status: "published",
        isOfficial: false,
        examDate: null,
        examScope: null,
        officialExamDate: null,
        officialExamScope: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    });

    const now = new Date().toISOString();
    const pubId = asCoursePublicationId(randomUUID());
    await coursePublicationStore.create({
      id: pubId,
      courseId,
      creatorUserId: "usr-creator" as any,
      organizationId: creatorOrgId,
      title: "دوره منتشر شده",
      description: null,
      subject: "فناوری",
      version: 1,
      status: "published",
      publishedAt: now,
      metadata: {} as any,
      snapshot: { chapters: [], stats: {} } as any,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Failing audit service that throws an exception upon emitting events
    const failingAuditService = {
      emit: async () => {
        throw new Error("Simulated Kafka / audit store outage");
      },
    };

    const courseServiceWithFailingAudit = new CourseService(
      courseStore,
      async () => ({ role: "organization_admin" }),
      undefined,
      failingAuditService as any,
      undefined,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      documentStore,
      generatedContentStore,
      coursePublicationStore,
      quizStore,
      flashcardStore,
      orgStore,
      userStore,
    );

    const actor: Actor = {
      userId: "usr-creator" as UserId,
      role: "teacher",
      memberships: [
        {
          id: randomUUID() as any,
          organizationId: creatorOrgId,
          userId: "usr-creator" as UserId,
          role: "organization_admin",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
    };

    // Unpublish must NOT throw despite audit service failure
    const result = await courseServiceWithFailingAudit.unpublishCourse(
      actor,
      creatorOrgId,
      courseId,
    );

    expect(result.course.status).toBe("unpublished");
    expect(result.publication.status).toBe("unpublished");

    // Live store persistence is committed
    const persistedCourse = await courseStore.findById(courseId);
    expect(persistedCourse?.status).toBe("unpublished");
    const persistedPub = await coursePublicationStore.findById(pubId);
    expect(persistedPub?.status).toBe("unpublished");
  });

  test("Unpublish edge case: course with status 'published' but missing publication record returns clean 400 Bad Request", async () => {
    // Create course as creator
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses`,
      headers: {
        "Content-Type": "application/json",
        Cookie: `avana_session=${creatorUserToken}`,
      },
      payload: {
        title: "دوره بدون رکورد انتشار",
        name: "دوره بدون رکورد انتشار",
        description: "داده‌های ناهمگون",
        subject: "فناوری",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const courseId = createRes.json().course.id;

    // Inconsistent state: course table says published, but no course_publications rows exist
    const course = await courseStore.findById(courseId);
    await courseStore.update({
      ...course!,
      status: "published",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${creatorOrgId}/courses/${courseId}/unpublish`,
      headers: {
        Cookie: `avana_session=${creatorUserToken}`,
      },
    });

    // Must return clean 400 Bad Request rather than 500 TypeError
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("دوره در وضعیت انتشار عمومی قرار ندارد و هیچ رکورد انتشار معتبری برای آن یافت نشد.");
  });

  test("Uniqueness across historical statuses: cannot reuse version from unpublished, superseded, or rejected publications", async () => {
    const courseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: creatorOrgId,
        name: "دوره تست نسخه‌های تاریخی",
        description: "بررسی یکتایی شماره نسخه در تمام وضعیت‌ها",
        subject: "ریاضی",
        targetAcademicFields: [],
        status: "draft",
        isOfficial: false,
        examDate: null,
        examScope: null,
        officialExamDate: null,
        officialExamScope: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    });

    const now = new Date().toISOString();

    // 1. Unpublished version 1
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId,
      creatorUserId: "usr-creator" as any,
      organizationId: creatorOrgId,
      title: "نسخه خارج شده از انتشار",
      description: null,
      subject: "ریاضی",
      version: 1,
      status: "unpublished",
      publishedAt: null,
      metadata: {} as any,
      snapshot: { chapters: [], stats: {} } as any,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Re-inserting version 1 with pending_review must be rejected with 409 Conflict
    await expect(
      coursePublicationStore.create({
        id: asCoursePublicationId(randomUUID()),
        courseId,
        creatorUserId: "usr-creator" as any,
        organizationId: creatorOrgId,
        title: "نسخه تکراری با وضعیت قبلی unpublished",
        description: null,
        subject: "ریاضی",
        version: 1,
        status: "pending_review",
        publishedAt: null,
        metadata: {} as any,
        snapshot: { chapters: [], stats: {} } as any,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).rejects.toThrowError(/نسخه 1/);

    // 2. Superseded version 2
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId,
      creatorUserId: "usr-creator" as any,
      organizationId: creatorOrgId,
      title: "نسخه لغو شده (superseded)",
      description: null,
      subject: "ریاضی",
      version: 2,
      status: "superseded",
      publishedAt: null,
      metadata: {} as any,
      snapshot: { chapters: [], stats: {} } as any,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Re-inserting version 2 with pending_review must be rejected with 409 Conflict
    await expect(
      coursePublicationStore.create({
        id: asCoursePublicationId(randomUUID()),
        courseId,
        creatorUserId: "usr-creator" as any,
        organizationId: creatorOrgId,
        title: "نسخه تکراری با وضعیت قبلی superseded",
        description: null,
        subject: "ریاضی",
        version: 2,
        status: "pending_review",
        publishedAt: null,
        metadata: {} as any,
        snapshot: { chapters: [], stats: {} } as any,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).rejects.toThrowError(/نسخه 2/);

    // 3. Rejected version 3
    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId,
      creatorUserId: "usr-creator" as any,
      organizationId: creatorOrgId,
      title: "نسخه رد شده (rejected)",
      description: null,
      subject: "ریاضی",
      version: 3,
      status: "rejected",
      publishedAt: null,
      metadata: {} as any,
      snapshot: { chapters: [], stats: {} } as any,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Re-inserting version 3 with pending_review must be rejected with 409 Conflict
    await expect(
      coursePublicationStore.create({
        id: asCoursePublicationId(randomUUID()),
        courseId,
        creatorUserId: "usr-creator" as any,
        organizationId: creatorOrgId,
        title: "نسخه تکراری با وضعیت قبلی rejected",
        description: null,
        subject: "ریاضی",
        version: 3,
        status: "pending_review",
        publishedAt: null,
        metadata: {} as any,
        snapshot: { chapters: [], stats: {} } as any,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).rejects.toThrowError(/نسخه 3/);
  });
});
