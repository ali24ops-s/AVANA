import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/session-service.js";
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
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { createModelGateway } from "../modules/generation/index.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardReviewStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { CourseId, DocumentId, OrganizationId, QuizId, UserId } from "@avana/domain";

function makeTestConfig(systemOrgId: OrganizationId) {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  const cfg = loadApiConfig();
  return {
    ...cfg,
    systemOrganizationId: systemOrgId,
  };
}

describe("Official Course Summary and Quiz Flow - Multi-Tenant Access Tests", () => {
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
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;

  const systemOrgId = randomUUID() as OrganizationId;
  const userPersonalOrgId = randomUUID() as OrganizationId;
  const otherOrgId = randomUUID() as OrganizationId;

  let studentUserId: UserId;
  const studentEmail = "student@avana.test";
  let studentToken: string;

  const officialCourseId = randomUUID() as CourseId;
  const privateCourseId = randomUUID() as CourseId;

  const doc1Id = randomUUID() as DocumentId;
  const doc2Id = randomUUID() as DocumentId;
  const privateDocId = randomUUID() as DocumentId;

  const quiz1Id = randomUUID() as QuizId;
  const quiz2Id = randomUUID() as QuizId;
  const privateQuizId = randomUUID() as QuizId;

  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    const config = makeTestConfig(systemOrgId);
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(orgStore);
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
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    auditService = new AuditService(new InMemoryAuditStore());
    queue = new InMemoryGenerationQueue(generationJobStore);
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-test-official-"));
    storageProvider = new LocalStorageProvider(storageDir);

    const now = new Date().toISOString();

    // 1. Setup Student User & Personal Org
    const createdUser = await userStore.createFromVerifiedIdentity({
      email: studentEmail,
      name: "Ali Student",
    });
    studentUserId = createdUser.id;
    const sessionService = new SessionService(sessionStore, config.session);
    const session = await sessionService.createSession(studentUserId);
    studentToken = session.sessionToken;

    await orgStore.createWithAdminMembership({
      organization: {
        id: userPersonalOrgId,
        name: "Student Personal Space",
        slug: "student-personal",
        createdAt: now,
        updatedAt: now,
      },
      membership: {
        id: randomUUID(),
        organizationId: userPersonalOrgId,
        userId: studentUserId,
        role: "organization_admin",
        createdAt: now,
        updatedAt: now,
      },
      auditEvents: [],
    });

    // 2. Setup System Organization
    await orgStore.createWithAdminMembership({
      organization: {
        id: systemOrgId,
        name: "AVANA System / Official Content",
        slug: "avana-official",
        createdAt: now,
        updatedAt: now,
      },
      membership: {
        id: randomUUID(),
        organizationId: systemOrgId,
        userId: randomUUID() as UserId,
        role: "platform_admin",
        createdAt: now,
        updatedAt: now,
      },
      auditEvents: [],
    });

    // 3. Setup Other Organization
    await orgStore.createWithAdminMembership({
      organization: {
        id: otherOrgId,
        name: "Other Organization",
        slug: "other-org",
        createdAt: now,
        updatedAt: now,
      },
      membership: {
        id: randomUUID(),
        organizationId: otherOrgId,
        userId: randomUUID() as UserId,
        role: "organization_admin",
        createdAt: now,
        updatedAt: now,
      },
      auditEvents: [],
    });

    // 4. Setup Official Course in systemOrgId
    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی ۳",
        description: "دوره جامع فارماکولوژی",
        subject: "داروسازی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });
    await courseStore.addUserCourse(studentUserId, officialCourseId, "student");

    // 5. Setup Private Course in otherOrgId (student NOT enrolled)
    await courseStore.create({
      course: {
        id: privateCourseId,
        organizationId: otherOrgId,
        name: "دوره خصوصی محرمانه",
        description: "دوره متعلق به سازمانی دیگر",
        subject: "پزشکی",
        status: "published",
        isOfficial: false,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 6. Setup Documents for Official Course
    await documentStore.create({
      id: doc1Id,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      ownerUserId: studentUserId,
      originalName: "39.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: "hash39",
      storageKey: "uploads/39.pdf",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await documentStore.create({
      id: doc2Id,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      ownerUserId: studentUserId,
      originalName: "37.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: "hash37",
      storageKey: "uploads/37.pdf",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await documentStore.create({
      id: privateDocId,
      organizationId: otherOrgId,
      courseId: privateCourseId,
      ownerUserId: randomUUID() as UserId,
      originalName: "private.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: "hashPrivate",
      storageKey: "uploads/private.pdf",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 7. Setup Review Summaries in generated_contents
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: systemOrgId,
      documentId: doc1Id,
      courseId: officialCourseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "39.pdf",
        overview: "خلاصه فارماکولوژی فصل ۳۹",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱", "نکته ۲"],
            clinicalPearls: ["نکته بالینی ۱"],
          },
        ],
        finalTakeaways: ["جمع‌بندی فصل ۳۹"],
        targetReadingMinutes: 10,
        estimatedReadingMinutes: 12,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: systemOrgId,
      documentId: doc2Id,
      courseId: officialCourseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "37.pdf",
        overview: "خلاصه فارماکولوژی فصل ۳۷",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته هیپوتالاموس"],
          },
        ],
        finalTakeaways: ["جمع‌بندی فصل ۳۷"],
        targetReadingMinutes: 10,
        estimatedReadingMinutes: 11,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await generatedContentStore.create({
      id: randomUUID(),
      organizationId: otherOrgId,
      documentId: privateDocId,
      courseId: privateCourseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "private.pdf",
        overview: "اطلاعات محرمانه",
        sections: [],
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 8. Setup Quizzes & Questions
    await quizStore.create({
      id: quiz1Id,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      documentId: doc1Id,
      title: "آزمون فصل ۳۹",
      topic: "فارماکولوژی آدرنال",
      difficulty: "medium",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await quizQuestionStore.createMany([
      {
        id: randomUUID() as any,
        quizId: quiz1Id,
        generatedContentId: null,
        lessonId: null,
        question: "سوال آزمون ۳۹",
        topic: "فارماکولوژی آدرنال",
        difficulty: "medium",
        questionType: "multiple_choice",
        choices: ["الف", "ب", "ج", "د"],
        correctAnswer: "الف",
        explanation: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await quizStore.create({
      id: quiz2Id,
      organizationId: systemOrgId,
      courseId: officialCourseId,
      documentId: doc2Id,
      title: "آزمون فصل ۳۷",
      topic: "فارماکولوژی هیپوفیز",
      difficulty: "medium",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await quizQuestionStore.createMany([
      {
        id: randomUUID() as any,
        quizId: quiz2Id,
        generatedContentId: null,
        lessonId: null,
        question: "سوال آزمون ۳۷",
        topic: "فارماکولوژی هیپوفیز",
        difficulty: "medium",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await quizStore.create({
      id: privateQuizId,
      organizationId: otherOrgId,
      courseId: privateCourseId,
      documentId: privateDocId,
      title: "آزمون خصوصی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 9. Create Fastify App
    app = createApp({ config });
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
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      queue,
      gateway: createModelGateway("mock"),
      auditService,
    });
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1: Official Course + User in Personal Org -> Summaries & Quizzes visible
  // -------------------------------------------------------------------------
  it("Test 1: Returns published quizzes and review summaries for official course when user is in personal org", async () => {
    // 1. Quizzes
    const quizRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${officialCourseId}/quizzes`,
      cookies: { avana_session: studentToken },
    });
    expect(quizRes.statusCode).toBe(200);
    const quizBody = JSON.parse(quizRes.body);
    expect(quizBody.quizzes).toHaveLength(2);
    expect(quizBody.quizzes.map((q: { title: string }) => q.title)).toContain("آزمون فصل ۳۹");
    expect(quizBody.quizzes.map((q: { title: string }) => q.title)).toContain("آزمون فصل ۳۷");

    // 2. Review Summary for Doc 1
    const summary1Res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${officialCourseId}/documents/${doc1Id}/review-summary`,
      cookies: { avana_session: studentToken },
    });
    expect(summary1Res.statusCode).toBe(200);
    const summary1Body = JSON.parse(summary1Res.body);
    expect(summary1Body.content).toBeDefined();
    expect(summary1Body.content.payload.title).toBe("39.pdf");
    expect(summary1Body.content.payload.overview).toBe("خلاصه فارماکولوژی فصل ۳۹");
  });

  // -------------------------------------------------------------------------
  // Test 2: Official Course + Published Quiz Details
  // -------------------------------------------------------------------------
  it("Test 2: Allows taking published quiz on official course and sanitizes correct answers for student", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${officialCourseId}/quizzes/${quiz1Id}`,
      cookies: { avana_session: studentToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.quiz).toBeDefined();
    expect(body.quiz.title).toBe("آزمون فصل ۳۹");
    expect(body.quiz.questions).toHaveLength(1);
    expect(body.quiz.questions[0].question).toBe("سوال آزمون ۳۹");
    expect(body.quiz.questions[0].correct_answer).toBeUndefined();
    expect(body.quiz.questions[0].correctAnswer).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 3: Official Course + Accepted Review Summary Structured Payload
  // -------------------------------------------------------------------------
  it("Test 3: Returns full structured payload for accepted review summary on official course", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${officialCourseId}/documents/${doc2Id}/review-summary`,
      cookies: { avana_session: studentToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.content).not.toBeNull();
    expect(body.content.type).toBe("review_summary");
    expect(body.content.payload.sections).toHaveLength(1);
    expect(body.content.payload.finalTakeaways).toContain("جمع‌بندی فصل ۳۷");
  });

  // -------------------------------------------------------------------------
  // Test 4: User without access to private course -> Denied (404/403)
  // -------------------------------------------------------------------------
  it("Test 4: Denies access to quizzes and summaries of a private course the user does not belong to", async () => {
    // 1. Quizzes of private course
    const quizRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${privateCourseId}/quizzes`,
      cookies: { avana_session: studentToken },
    });
    expect(quizRes.statusCode).toBe(404);

    // 2. Summary of private course
    const summaryRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${privateCourseId}/documents/${privateDocId}/review-summary`,
      cookies: { avana_session: studentToken },
    });
    expect(summaryRes.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Test 5: Route with personal organizationId parameter still resolves course resources
  // -------------------------------------------------------------------------
  it("Test 5: Resolves course resources when personal organizationId is passed in route params", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${officialCourseId}/quizzes`,
      cookies: { avana_session: studentToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.quizzes.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 6: Cross-course tampering / mismatch -> Denied without data leak
  // -------------------------------------------------------------------------
  it("Test 6: Denies requesting a document summary using the wrong courseId (cross-course tampering)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${userPersonalOrgId}/courses/${officialCourseId}/documents/${privateDocId}/review-summary`,
      cookies: { avana_session: studentToken },
    });
    expect(res.statusCode).toBe(404);
  });
});
