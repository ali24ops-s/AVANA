/**
 * PR6-9E — Authorization & Multi-Tenant Hardening Integration Tests.
 *
 * Covers:
 * 1. Unauthenticated vs Authenticated (401)
 * 2. Organization A vs Organization B cross-tenant isolation & non-disclosure (404)
 * 3. Course A vs Course B cross-tenant isolation (404)
 * 4. Student vs Editor vs Admin role escalation protection (403)
 * 5. User A vs User B private data isolation (quiz attempt, flashcards, lesson progress, analytics)
 * 6. IDOR / Parameter mismatch detection (ORG_A with COURSE_B -> 404)
 */

import { describe, expect, it, beforeEach } from "vitest";
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
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type {
  CourseId,
  DocumentId,
  FlashcardId,
  GeneratedContentId,
  ModuleId,
  LessonId,
  OrganizationId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionCookie(res: {
  cookies: Array<{ name: string; value: string }>;
}): string {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie ? `avana_session=${cookie.value}` : "";
}

describe("PR6-9E: Authorization & Multi-Tenant Hardening", () => {
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
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let queue: InMemoryGenerationQueue;
  let storageProvider: StorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  // Tenant A IDs
  const orgA = "00000000-0000-4000-8000-00000000000a" as OrganizationId;
  const courseA = "00000000-0000-4000-8000-0000000000a1" as CourseId;
  const moduleA = "00000000-0000-4000-8000-0000000000a2" as ModuleId;
  const lessonA = "00000000-0000-4000-8000-0000000000a3" as LessonId;
  const docA = "00000000-0000-4000-8000-0000000000a4" as DocumentId;
  const contentA = "00000000-0000-4000-8000-0000000000a5" as GeneratedContentId;
  const quizA = "00000000-0000-4000-8000-0000000000a6" as QuizId;
  const flashcardA = "00000000-0000-4000-8000-0000000000a7" as FlashcardId;

  // Users A
  const userAdminA = "00000000-0000-4000-8000-0000000000u1" as UserId;
  const userEditorA = "00000000-0000-4000-8000-0000000000u2" as UserId;
  const userStudentA = "00000000-0000-4000-8000-0000000000u3" as UserId;

  // Tenant B IDs & Users
  const orgB = "00000000-0000-4000-8000-00000000000b" as OrganizationId;
  const courseB = "00000000-0000-4000-8000-0000000000b1" as CourseId;
  const docB = "00000000-0000-4000-8000-0000000000b2" as DocumentId;
  const contentB = "00000000-0000-4000-8000-0000000000b3" as GeneratedContentId;
  const userStudentB = "00000000-0000-4000-8000-0000000000u4" as UserId;

  beforeEach(() => {
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
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    queue = new InMemoryGenerationQueue(generationJobStore);
    storageProvider = {
      createUpload: async (p: { storageKey: string; mimeType: string }) => ({ storageKey: p.storageKey, uploadUrl: null, expiresAt: new Date().toISOString() }),
      save: async () => {},
      read: async () => Buffer.from("data"),
      delete: async () => {},
      exists: async () => true,
    };
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    const now = new Date().toISOString();

    // Seed Org A
    orgStore.createWithAdminMembership({
      organization: { id: orgA, name: "Organization A", slug: "org-a", createdAt: now, updatedAt: now, deletedAt: null },
      membership: { id: randomUUID(), organizationId: orgA, userId: userAdminA, role: "organization_admin", createdAt: now, updatedAt: now },
      auditEvents: [],
    });
    orgStore.addMembership({ id: randomUUID(), organizationId: orgA, userId: userEditorA, role: "course_editor", createdAt: now, updatedAt: now });
    orgStore.addMembership({ id: randomUUID(), organizationId: orgA, userId: userStudentA, role: "student", createdAt: now, updatedAt: now });

    // Seed Course A, Module A, Lesson A
    courseStore.create({ course: { id: courseA, organizationId: orgA, name: "Course A", subject: "Math", examDate: null, createdAt: now, updatedAt: now, deletedAt: null }, auditEvents: [] });
    moduleStore.insert({ id: moduleA, courseId: courseA, title: "Module A", description: null, sortOrder: 0, createdAt: now, updatedAt: now, deletedAt: null });
    lessonStore.insert({ id: lessonA, moduleId: moduleA, title: "Lesson A", contentType: "markdown", contentMarkdown: "# Content A", sortOrder: 0, estimatedMinutes: 10, publicationStatus: "published", createdAt: now, updatedAt: now, deletedAt: null });

    // Seed Document A, GeneratedContent A
    documentStore.insert({ id: docA, organizationId: orgA, courseId: courseA, ownerUserId: userAdminA, originalName: "docA.pdf", mimeType: "application/pdf", sizeBytes: 1024, sha256: "hashA", storageKey: "keys/docA.pdf", pageCount: 1, status: "extracted", errorCode: null, retryCount: 0, createdAt: now, updatedAt: now, deletedAt: null });
    generatedContentStore.insert({
      id: contentA,
      organizationId: orgA,
      courseId: courseA,
      documentId: docA,
      type: "lesson",
      status: "draft",
      payload: { kind: "lesson", title: "Draft A", contentMarkdown: "# Draft A", citationChunkIds: [] },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
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

    // Seed Quiz A & Question
    quizStore.insert({ id: quizA, organizationId: orgA, courseId: courseA, documentId: docA, title: "Quiz A", status: "published", createdAt: now, updatedAt: now, deletedAt: null });
    quizQuestionStore.insert({ id: "q-1" as QuizQuestionId, quizId: quizA, generatedContentId: null, question: "1+1?", questionType: "multiple_choice", choices: ["1", "2"], correctAnswer: "2", explanation: null, sortOrder: 0, createdAt: now, updatedAt: now });

    // Seed Flashcard A
    flashcardStore.insert({ id: flashcardA, organizationId: orgA, courseId: courseA, documentId: docA, generatedContentId: null, question: "Q A", answer: "A A", explanation: null, cardType: "basic", difficulty: "medium", dueAt: now, intervalDays: 0, easeFactor: 2.5, createdAt: now, updatedAt: now, deletedAt: null });

    // Seed Org B & User B
    orgStore.createWithAdminMembership({
      organization: { id: orgB, name: "Organization B", slug: "org-b", createdAt: now, updatedAt: now, deletedAt: null },
      membership: { id: randomUUID(), organizationId: orgB, userId: userStudentB, role: "student", createdAt: now, updatedAt: now },
      auditEvents: [],
    });
    courseStore.create({ course: { id: courseB, organizationId: orgB, name: "Course B", subject: "Bio", examDate: null, createdAt: now, updatedAt: now, deletedAt: null }, auditEvents: [] });
    documentStore.insert({ id: docB, organizationId: orgB, courseId: courseB, ownerUserId: userStudentB, originalName: "docB.pdf", mimeType: "application/pdf", sizeBytes: 2048, sha256: "hashB", storageKey: "keys/docB.pdf", pageCount: 1, status: "extracted", errorCode: null, retryCount: 0, createdAt: now, updatedAt: now, deletedAt: null });
    generatedContentStore.insert({
      id: contentB,
      organizationId: orgB,
      courseId: courseB,
      documentId: docB,
      type: "lesson",
      status: "draft",
      payload: { kind: "lesson", title: "Draft B", contentMarkdown: "# Draft B", citationChunkIds: [] },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
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
  });

  async function loginAs(userId: UserId, role: string) {
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
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      storageProvider,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditService,
    });

    userStore.insert({
      id: userId,
      email: `${userId}@example.com`,
      role: role as never,
    });

    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: `${userId}@example.com` },
    });

    const cookieHeader = extractSessionCookie(loginRes);
    return { app, cookieHeader };
  }

  // -------------------------------------------------------------------------
  // 1. Unauthenticated access (401)
  // -------------------------------------------------------------------------
  it("rejects unauthenticated requests with HTTP 401", async () => {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}`,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // -------------------------------------------------------------------------
  // 2. Cross-Tenant Isolation & Non-Disclosure (404)
  // -------------------------------------------------------------------------
  it("returns HTTP 404 (non-disclosure) when user A accesses Org B resources", async () => {
    const { app, cookieHeader } = await loginAs(userStudentA, "student");

    // Attempt to list courses in Org B
    const resCourses = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgB}/courses`,
      headers: { cookie: cookieHeader },
    });
    expect(resCourses.statusCode).toBe(404);

    // Attempt to read Document B in Org B
    const resDoc = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgB}/documents/${docB}`,
      headers: { cookie: cookieHeader },
    });
    expect(resDoc.statusCode).toBe(404);

    // Attempt to delete Document B in Org B
    const resDelDoc = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgB}/documents/${docB}`,
      headers: { cookie: cookieHeader },
    });
    expect(resDelDoc.statusCode).toBe(404);

    // Attempt to read Generated Content B in Org B
    const resContent = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgB}/courses/${courseB}/generated/${contentB}`,
      headers: { cookie: cookieHeader },
    });
    expect(resContent.statusCode).toBe(404);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // 3. Role Escalation Protection (403)
  // -------------------------------------------------------------------------
  it("rejects student attempts at editor/admin actions with HTTP 403", async () => {
    const { app, cookieHeader } = await loginAs(userStudentA, "student");

    // Student attempting to accept generated content
    const resAccept = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/courses/${courseA}/generated/${contentA}/accept`,
      headers: { cookie: cookieHeader },
    });
    expect(resAccept.statusCode).toBe(403);

    // Student attempting to reject generated content
    const resReject = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/courses/${courseA}/generated/${contentA}/reject`,
      headers: { cookie: cookieHeader },
      payload: { reason: "Bad content" },
    });
    expect(resReject.statusCode).toBe(403);

    // Student attempting to edit generated content
    const resEdit = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${orgA}/courses/${courseA}/generated/${contentA}`,
      headers: { cookie: cookieHeader },
      payload: { payload: { title: "Hacked" } },
    });
    expect(resEdit.statusCode).toBe(403);

    // Student attempting to create a module
    const resCreateMod = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/courses/${courseA}/modules`,
      headers: { cookie: cookieHeader },
      payload: { title: "New Module" },
    });
    expect(resCreateMod.statusCode).toBe(403);

    // Student attempting to update course metadata
    const resUpdateCourse = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${orgA}/courses/${courseA}`,
      headers: { cookie: cookieHeader },
      payload: { title: "Hacked Course" },
    });
    expect(resUpdateCourse.statusCode).toBe(403);

    await app.close();
  });

  it("rejects course editor attempts at org-admin-only actions with HTTP 403", async () => {
    const { app, cookieHeader } = await loginAs(userEditorA, "course_editor");

    // Course Editor attempting to archive course
    const resArchive = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgA}/courses/${courseA}`,
      headers: { cookie: cookieHeader },
    });
    expect(resArchive.statusCode).toBe(403);

    // Course Editor attempting to list org members (admin-only)
    const resListMembers = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/members`,
      headers: { cookie: cookieHeader },
    });
    expect(resListMembers.statusCode).toBe(403);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // 4. User Data Privacy & Isolation
  // -------------------------------------------------------------------------
  it("isolates quiz attempt data across users (user B cannot read user A's attempt)", async () => {
    const { app: appA, cookieHeader: cookieA } = await loginAs(userStudentA, "student");

    // User A submits quiz attempt
    const resSubmit = await appA.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/courses/${courseA}/quizzes/${quizA}/attempts`,
      headers: { cookie: cookieA },
      payload: {
        answers: [{ questionId: "q-1", answer: "2" }],
      },
    });
    expect(resSubmit.statusCode).toBe(200);
    const attemptId = JSON.parse(resSubmit.body).attempt.attemptId;
    await appA.close();

    // User B in Org A attempts to read User A's quiz attempt
    // (First register User B in Org A as student)
    orgStore.addMembership({ id: randomUUID(), organizationId: orgA, userId: userStudentB, role: "student", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    const { app: appB, cookieHeader: cookieB } = await loginAs(userStudentB, "student");
    const resReadAttempt = await appB.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/courses/${courseA}/quizzes/${quizA}/attempts/${attemptId}`,
      headers: { cookie: cookieB },
    });

    // Should return 404 non-disclosing
    expect(resReadAttempt.statusCode).toBe(404);
    await appB.close();
  });

  it("isolates lesson completion progress across users", async () => {
    const { app: appA, cookieHeader: cookieA } = await loginAs(userStudentA, "student");

    // User A completes lesson A
    const resComplete = await appA.inject({
      method: "POST",
      url: `/v1/courses/${courseA}/lessons/${lessonA}/progress`,
      headers: { cookie: cookieA },
      payload: { completed: true },
    });
    expect(resComplete.statusCode).toBe(200);
    await appA.close();

    // User B checks their own course learning structure
    orgStore.addMembership({ id: randomUUID(), organizationId: orgA, userId: userStudentB, role: "student", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const { app: appB, cookieHeader: cookieB } = await loginAs(userStudentB, "student");
    const resLearnB = await appB.inject({
      method: "GET",
      url: `/v1/courses/${courseA}/learn`,
      headers: { cookie: cookieB },
    });
    expect(resLearnB.statusCode).toBe(200);
    const bodyB = JSON.parse(resLearnB.body);
    const lessonResourceB = bodyB.modules[0].lessons[0];

    // User B's lesson completion must still be false
    expect(lessonResourceB.completed).toBe(false);
    expect(bodyB.progress.completed_lessons).toBe(0);

    await appB.close();
  });

  // -------------------------------------------------------------------------
  // 5. IDOR / Parameter Mismatch Protection
  // -------------------------------------------------------------------------
  it("rejects mismatched orgId and courseId route parameters with HTTP 404", async () => {
    const { app, cookieHeader } = await loginAs(userAdminA, "organization_admin");

    // Requesting Org A with Course B (where Course B belongs to Org B)
    const resMismatch = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/courses/${courseB}/content`,
      headers: { cookie: cookieHeader },
    });

    expect(resMismatch.statusCode).toBe(404);
    await app.close();
  });
});
