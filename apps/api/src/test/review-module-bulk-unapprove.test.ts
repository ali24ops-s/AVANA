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
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { isContentOwnedByModule } from "../modules/generation/module-content-ownership.js";
import type {
  CourseId,
  DocumentId,
  GeneratedContentId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";

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

describe("Module Bulk Unapprove Integration Tests", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let queue: InMemoryGenerationQueue;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const courseId = "11111111-1111-4111-8111-111111111111" as CourseId;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    queue = new InMemoryGenerationQueue();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      queue,
      auditService,
    });
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
    role = "student",
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    const userId = body.user.id as UserId;
    userStore.insert({ id: userId, email: body.user.email, role });
    const token = extractSessionToken(res)!;
    return { token, userId, email: body.user.email };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ): Promise<OrganizationId> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      organization: { id: OrganizationId };
    };
    const orgId = body.organization.id;

    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        creatorUserId: "11111111-1111-4111-8111-111111111111",
        name: "Test Course",
        subject: "Test Subject",
        description: null,
        examDate: null,
        status: "review",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });

    return orgId;
  }

  function seedModule(organizationId: OrganizationId, title: string, orderIndex = 0): ModuleId {
    const modId = randomUUID() as ModuleId;
    const now = new Date().toISOString();
    moduleStore.insert({
      id: modId,
      organizationId,
      courseId,
      title,
      description: null,
      documentId: null,
      orderIndex,
      previewLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return modId;
  }

  function seedDoc(organizationId: OrganizationId, ownerUserId?: string): DocumentId {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    documentStore.insert({
      id: docId,
      organizationId,
      courseId,
      ownerUserId: (ownerUserId ?? "11111111-1111-4111-8111-111111111111") as UserId,
      originalName: "test-lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "a".repeat(64),
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 3,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return docId;
  }

  function seedContent(
    organizationId: OrganizationId,
    opts: {
      documentId?: DocumentId;
      status?: "draft" | "accepted" | "rejected";
      type?: "lesson" | "flashcard" | "quiz" | "review_summary";
      materializedLessonId?: LessonId | null;
      payload?: Record<string, unknown>;
    } = {},
  ): GeneratedContentId {
    const contentId = randomUUID() as GeneratedContentId;
    const now = new Date().toISOString();
    let defaultPayload: Record<string, unknown>;
    if (opts.type === "quiz") {
      defaultPayload = {
        title: "Test Quiz",
        question: "Sample Question 1",
        choices: ["Option A", "Option B"],
        correctAnswer: "Option A",
        questions: [
          {
            question: "Sample Question 1",
            choices: ["Option A", "Option B"],
            correctAnswer: "Option A",
          },
        ],
      };
    } else if (opts.type === "flashcard") {
      defaultPayload = {
        title: "Test Flashcards",
        flashcards: [
          { front: "Front 1", back: "Back 1" },
          { front: "Front 2", back: "Back 2" },
        ],
      };
    } else if (opts.type === "review_summary") {
      defaultPayload = {
        title: "Review Summary Title",
        summary: "Comprehensive module summary",
        keyTakeaways: ["Point 1", "Point 2"],
      };
    } else {
      defaultPayload = {
        kind: "lesson",
        title: "Generated Content Title",
        summary: "A brief summary",
        contentMarkdown: "# Generated Content\nSection body text.",
        citationChunkIds: [],
      };
    }

    generatedContentStore.insert({
      id: contentId,
      organizationId,
      courseId,
      documentId: opts.documentId ?? (randomUUID() as DocumentId),
      type: opts.type ?? "lesson",
      status: opts.status ?? "draft",
      payload: (opts.payload ?? defaultPayload) as any,
      promptVersion: "v1.0",
      model: "test-model",
      tokenUsage: { inputTokens: 100, outputTokens: 200 },
      generationKey: "key-1",
      acceptedAt: opts.status === "accepted" ? now : null,
      acceptedBy: opts.status === "accepted" ? "11111111-1111-4111-8111-111111111111" : null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: opts.materializedLessonId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return contentId;
  }

  it("1. Successfully bulk unapproves all accepted contents of a target module and clears materialized entities", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Bulk Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleId = seedModule(organizationId, "Module 1", 0);
    const doc1 = seedDoc(organizationId, userId);
    const mod = await moduleStore.findById(moduleId);
    if (mod) await moduleStore.update({ ...mod, documentId: doc1 });

    // Create 1 lesson content and 1 flashcard content
    const content1 = seedContent(organizationId, { documentId: doc1, type: "lesson" });
    const content2 = seedContent(organizationId, { documentId: doc1, type: "flashcard", status: "accepted" });

    // Accept content 1 (lesson)
    const acceptRes1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${content1}/accept`,
      cookies: { avana_session: token },
    });
    expect(acceptRes1.statusCode).toBe(200);
    const lesson1Id = JSON.parse(acceptRes1.body).materialized_lesson_id as LessonId;

    // Move lesson1 to moduleId
    const l1 = await lessonStore.findById(lesson1Id);
    if (l1) await lessonStore.update({ ...l1, moduleId });

    // Set previewLessonId on module to lesson1Id
    const currentMod = await moduleStore.findById(moduleId);
    if (currentMod) await moduleStore.update({ ...currentMod, previewLessonId: lesson1Id });

    // Seed a flashcard linked to lesson1 and content2
    const flashcardId = randomUUID();
    const now = new Date().toISOString();
    await flashcardStore.create({
      flashcard: {
        id: flashcardId as any,
        organizationId,
        courseId,
        documentId: doc1,
        lessonId: lesson1Id,
        generatedContentId: content2,
        front: "Question 1",
        back: "Answer 1",
        difficulty: 1,
        orderIndex: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    });

    // Execute Bulk Unapprove on moduleId
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });

    expect(unapproveRes.statusCode).toBe(200);
    const body = JSON.parse(unapproveRes.body);
    expect(body.success).toBe(true);
    expect(body.unapproved_count).toBe(2);

    // Verify generated contents reverted to draft
    const c1After = await generatedContentStore.findById(content1);
    expect(c1After?.status).toBe("draft");
    expect(c1After?.materializedLessonId).toBeNull();
    expect(c1After?.acceptedAt).toBeNull();
    expect(c1After?.acceptedBy).toBeNull();

    const c2After = await generatedContentStore.findById(content2);
    expect(c2After?.status).toBe("draft");

    // Verify materialized lesson soft-deleted
    const l1After = await lessonStore.findById(lesson1Id);
    expect(l1After?.deletedAt).not.toBeNull();

    // Verify flashcard soft-deleted
    const fcAfter = await flashcardStore.findById(flashcardId as any);
    expect(fcAfter?.deletedAt).not.toBeNull();

    // Verify previewLessonId cleared on module
    const modAfter = await moduleStore.findById(moduleId);
    expect(modAfter?.previewLessonId).toBeNull();

    await app.close();
  });

  it("2. Does not touch contents or lessons belonging to other modules", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor2@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Isolation Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleA = seedModule(organizationId, "Module A", 0);
    const moduleB = seedModule(organizationId, "Module B", 1);
    const docA = seedDoc(organizationId, userId);
    const docB = seedDoc(organizationId, userId);

    const modA = await moduleStore.findById(moduleA);
    if (modA) await moduleStore.update({ ...modA, documentId: docA });
    const modB = await moduleStore.findById(moduleB);
    if (modB) await moduleStore.update({ ...modB, documentId: docB });

    const contentA = seedContent(organizationId, { documentId: docA });
    const contentB = seedContent(organizationId, { documentId: docB });

    // Accept both
    const resA = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentA}/accept`,
      cookies: { avana_session: token },
    });
    const lessonAId = JSON.parse(resA.body).materialized_lesson_id as LessonId;
    const lA = await lessonStore.findById(lessonAId);
    if (lA) await lessonStore.update({ ...lA, moduleId: moduleA });

    const resB = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentB}/accept`,
      cookies: { avana_session: token },
    });
    const lessonBId = JSON.parse(resB.body).materialized_lesson_id as LessonId;
    const lB = await lessonStore.findById(lessonBId);
    if (lB) await lessonStore.update({ ...lB, moduleId: moduleB });

    // Unapprove Module A only
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleA}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    const body = JSON.parse(unapproveRes.body);
    expect(body.unapproved_count).toBe(1);

    // Module A content is draft
    const cA = await generatedContentStore.findById(contentA);
    expect(cA?.status).toBe("draft");

    // Module B content and lesson are UNTOUCHED
    const cB = await generatedContentStore.findById(contentB);
    expect(cB?.status).toBe("accepted");
    expect(cB?.materializedLessonId).toBe(lessonBId);

    const lBAfter = await lessonStore.findById(lessonBId);
    expect(lBAfter?.deletedAt).toBeNull();

    await app.close();
  });

  it("3. Ignores draft and rejected contents in the module", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor3@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Status Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleId = seedModule(organizationId, "Module Draft/Rejected", 0);
    const docId = seedDoc(organizationId, userId);

    // Module linked to docId
    const mod = await moduleStore.findById(moduleId);
    if (mod) await moduleStore.update({ ...mod, documentId: docId });

    const draftContent = seedContent(organizationId, { documentId: docId, status: "draft" });
    const rejectedContent = seedContent(organizationId, { documentId: docId, status: "rejected" });

    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    const body = JSON.parse(unapproveRes.body);
    expect(body.unapproved_count).toBe(0);

    const d = await generatedContentStore.findById(draftContent);
    expect(d?.status).toBe("draft");

    const r = await generatedContentStore.findById(rejectedContent);
    expect(r?.status).toBe("rejected");

    await app.close();
  });

  it("4. Returns 409 Conflict if course is published", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor4@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Pub Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleId = seedModule(organizationId, "Module Pub", 0);

    // Publish the course
    const course = await courseStore.findById(courseId);
    if (course) {
      await courseStore.update({ ...course, status: "published" });
    }

    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(409);
    const body = JSON.parse(unapproveRes.body);
    expect(body.error.message).toContain("دوره‌های منتشرشده");

    await app.close();
  });

  it("5. Returns 403 Forbidden without content:accept permission", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "student@example.com", "student");
    const organizationId = await createOrg(app, token, "Student Org");
    const moduleId = seedModule(organizationId, "Module Student", 0);

    // Demote user to student role without content:accept
    orgStore.setMembershipRole(organizationId, userId, "student");

    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(403);

    await app.close();
  });

  it("6. Preserves shared materialized lesson if claimed by another active content", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor6@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Shared Lesson Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleA = seedModule(organizationId, "Module A", 0);
    const moduleB = seedModule(organizationId, "Module B", 1);
    const docA = seedDoc(organizationId, userId);
    const docB = seedDoc(organizationId, userId);

    const modA = await moduleStore.findById(moduleA);
    if (modA) await moduleStore.update({ ...modA, documentId: docA });
    const modB = await moduleStore.findById(moduleB);
    if (modB) await moduleStore.update({ ...modB, documentId: docB });

    // Accept content in Module A creating lessonA
    const contentA = seedContent(organizationId, { documentId: docA });
    const resA = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentA}/accept`,
      cookies: { avana_session: token },
    });
    const lessonAId = JSON.parse(resA.body).materialized_lesson_id as LessonId;
    const lA = await lessonStore.findById(lessonAId);
    if (lA) await lessonStore.update({ ...lA, moduleId: moduleA });

    // Seed content B in Module B (claimed by docB) which ALSO references lessonAId
    const contentB = seedContent(organizationId, {
      documentId: docB,
      status: "accepted",
      materializedLessonId: lessonAId,
    });

    // Unapprove Module A
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleA}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);

    // contentA is draft
    const cA = await generatedContentStore.findById(contentA);
    expect(cA?.status).toBe("draft");

    // Because contentB still references lessonAId and is not deleted, lessonA is NOT soft-deleted
    const lAAfter = await lessonStore.findById(lessonAId);
    expect(lAAfter?.deletedAt).toBeNull();

    await app.close();
  });

  it("7. Allows re-approval via acceptContent after bulk unapproval", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor7@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Reapprove Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleId = seedModule(organizationId, "Module Reapprove", 0);
    const docId = seedDoc(organizationId, userId);
    const mod = await moduleStore.findById(moduleId);
    if (mod) await moduleStore.update({ ...mod, documentId: docId });

    const contentId = seedContent(organizationId, { documentId: docId });

    // 1. Accept
    const acceptRes1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      cookies: { avana_session: token },
    });
    expect(acceptRes1.statusCode).toBe(200);
    const lesson1Id = JSON.parse(acceptRes1.body).materialized_lesson_id as LessonId;
    const l1 = await lessonStore.findById(lesson1Id);
    if (l1) await lessonStore.update({ ...l1, moduleId });

    // 2. Bulk Unapprove
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    expect(JSON.parse(unapproveRes.body).unapproved_count).toBe(1);

    // Lesson1 is soft-deleted
    const l1Deleted = await lessonStore.findById(lesson1Id);
    expect(l1Deleted?.deletedAt).not.toBeNull();

    // 3. Re-accept
    const acceptRes2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      cookies: { avana_session: token },
    });
    expect(acceptRes2.statusCode).toBe(200);
    const reapprovedBody = JSON.parse(acceptRes2.body);
    expect(reapprovedBody.status).toBe("accepted");
    expect(reapprovedBody.materialized_lesson_id).toBeDefined();

    // New materialized lesson is active
    const newLesson = await lessonStore.findById(reapprovedBody.materialized_lesson_id);
    expect(newLesson?.deletedAt).toBeNull();

    await app.close();
  });

  it("8. Lesson-less module (Chapter 34 scenario): counts unapprovable standalone quiz, flashcard, review_summary, bulk unapproves them, and allows re-approval", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor8@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Lessonless Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleId = seedModule(organizationId, "Chapter 34 - No Lessons", 33);
    const docId = seedDoc(organizationId, userId);
    const mod = await moduleStore.findById(moduleId);
    if (mod) await moduleStore.update({ ...mod, documentId: docId });

    // Ensure 0 lessons in this module
    const lessonsInMod = await lessonStore.listByModule(moduleId);
    expect(lessonsInMod.length).toBe(0);

    // Seed 1 Flashcard GC, 1 Quiz GC, 1 Review Summary GC
    const flashcardGc = seedContent(organizationId, {
      documentId: docId,
      type: "flashcard",
      status: "accepted",
    });
    const quizGc = seedContent(organizationId, {
      documentId: docId,
      type: "quiz",
      status: "accepted",
    });
    const summaryGc = seedContent(organizationId, {
      documentId: docId,
      type: "review_summary",
      status: "accepted",
    });

    // Materialize 4 flashcards with lessonId = null
    const now = new Date().toISOString();
    for (let i = 0; i < 4; i++) {
      await flashcardStore.create({
        id: randomUUID() as any,
        organizationId,
        courseId,
        documentId: docId,
        generatedContentId: flashcardGc,
        lessonId: null,
        question: `Question ${i}`,
        answer: `Answer ${i}`,
        explanation: null,
        cardType: "definition",
        difficulty: "medium",
        dueAt: now,
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    // Materialize 1 Quiz with multiple Quiz Questions with lessonId = null
    const quizId = randomUUID() as any;
    await quizStore.create({
      id: quizId,
      organizationId,
      courseId,
      documentId: docId,
      title: "Module Quiz",
      topic: "Topic 1",
      difficulty: "medium",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await quizQuestionStore.createMany([
      {
        id: randomUUID() as any,
        quizId,
        generatedContentId: quizGc,
        lessonId: null,
        question: "Q1?",
        questionType: "multiple_choice",
        choices: ["A", "B"],
        correctAnswer: "A",
        explanation: null,
        difficulty: "medium",
        topic: "Topic 1",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      {
        id: randomUUID() as any,
        quizId,
        generatedContentId: quizGc,
        lessonId: null,
        question: "Q2?",
        questionType: "multiple_choice",
        choices: ["C", "D"],
        correctAnswer: "C",
        explanation: null,
        difficulty: "medium",
        topic: "Topic 1",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ]);

    // 1. Verify getCourseHierarchy in InMemoryAdminStore returns unapprovableContentCount === 3
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    adminStore.setLearningStores({
      courseStore,
      moduleStore,
      lessonStore,
      generatedContentStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    });
    const hierarchy = await adminStore.getCourseHierarchy(courseId);
    expect(hierarchy).not.toBeNull();
    const targetModHierarchy = hierarchy?.modules.find((m) => m.id === moduleId);
    expect(targetModHierarchy).toBeDefined();
    expect(targetModHierarchy?.lessons.length).toBe(0);
    expect(targetModHierarchy?.unapprovableContentCount).toBe(3);

    // 2. Execute Bulk Unapprove
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    const unapproveBody = JSON.parse(unapproveRes.body);
    expect(unapproveBody.success).toBe(true);
    expect(unapproveBody.unapproved_count).toBe(3);
    expect(unapproveBody.unapproved_ids).toContain(flashcardGc);
    expect(unapproveBody.unapproved_ids).toContain(quizGc);
    expect(unapproveBody.unapproved_ids).toContain(summaryGc);

    // 3. Verify Materialized entities are soft-deleted
    const allCards = await flashcardStore.listByCourse(courseId, organizationId);
    const activeCards = allCards.filter((c) => c.generatedContentId === flashcardGc && !c.deletedAt);
    expect(activeCards.length).toBe(0);

    const questions = await quizQuestionStore.listByQuiz(quizId);
    const activeQuestions = questions.filter((q) => !q.deletedAt);
    expect(activeQuestions.length).toBe(0);

    const quizRecord = (await quizStore.listByCourse(courseId, organizationId)).find((q) => q.id === quizId);
    expect(quizRecord?.deletedAt).not.toBeNull();

    // 4. Verify Generated Contents reverted to draft
    const [gcFc, gcQ, gcSummary] = await Promise.all([
      generatedContentStore.findById(flashcardGc),
      generatedContentStore.findById(quizGc),
      generatedContentStore.findById(summaryGc),
    ]);
    expect(gcFc?.status).toBe("draft");
    expect(gcQ?.status).toBe("draft");
    expect(gcSummary?.status).toBe("draft");

    // 5. Verify hierarchy unapprovableContentCount is now 0
    const hierarchyAfter = await adminStore.getCourseHierarchy(courseId);
    const targetModAfter = hierarchyAfter?.modules.find((m) => m.id === moduleId);
    expect(targetModAfter?.unapprovableContentCount).toBe(0);

    // 6. Verify re-approval via acceptContent works cleanly
    const acceptResQuiz = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${quizGc}/accept`,
      cookies: { avana_session: token },
    });
    expect(acceptResQuiz.statusCode).toBe(200);
    expect(JSON.parse(acceptResQuiz.body).status).toBe("accepted");

    const acceptResFc = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${flashcardGc}/accept`,
      cookies: { avana_session: token },
    });
    expect(acceptResFc.statusCode).toBe(200);
    expect(JSON.parse(acceptResFc.body).status).toBe("accepted");

    await app.close();
  });

  it("9. Shared document across modules: unapproving Module A preserves Module B's content and leaves ambiguous contents untouched", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor9@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Shared Doc Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const sharedDocId = seedDoc(organizationId, userId);
    const moduleA = seedModule(organizationId, "Module A", 0);
    const moduleB = seedModule(organizationId, "Module B", 1);
    const modA = await moduleStore.findById(moduleA);
    if (modA) await moduleStore.update({ ...modA, documentId: sharedDocId });
    const modB = await moduleStore.findById(moduleB);
    if (modB) await moduleStore.update({ ...modB, documentId: sharedDocId });

    // Lesson in Module A
    const lessonAId = randomUUID() as any;
    const now = new Date().toISOString();
    await lessonStore.create({
      id: lessonAId,
      organizationId,
      courseId,
      moduleId: moduleA,
      title: "Lesson A",
      contentMarkdown: "# A",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Lesson in Module B
    const lessonBId = randomUUID() as any;
    await lessonStore.create({
      id: lessonBId,
      organizationId,
      courseId,
      moduleId: moduleB,
      title: "Lesson B",
      contentMarkdown: "# B",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Content A belongs to Module A via lessonAId
    const contentA = seedContent(organizationId, {
      documentId: sharedDocId,
      type: "flashcard",
      status: "accepted",
    });
    await flashcardStore.create({
      id: randomUUID() as any,
      organizationId,
      courseId,
      documentId: sharedDocId,
      generatedContentId: contentA,
      lessonId: lessonAId,
      question: "Q-A",
      answer: "A-A",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Content B belongs to Module B via lessonBId
    const contentB = seedContent(organizationId, {
      documentId: sharedDocId,
      type: "flashcard",
      status: "accepted",
    });
    await flashcardStore.create({
      id: randomUUID() as any,
      organizationId,
      courseId,
      documentId: sharedDocId,
      generatedContentId: contentB,
      lessonId: lessonBId,
      question: "Q-B",
      answer: "A-B",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Content C has lessonId: null on the shared document (ambiguous ownership between modules)
    const contentC = seedContent(organizationId, {
      documentId: sharedDocId,
      type: "flashcard",
      status: "accepted",
    });
    await flashcardStore.create({
      id: randomUUID() as any,
      organizationId,
      courseId,
      documentId: sharedDocId,
      generatedContentId: contentC,
      lessonId: null,
      question: "Q-Ambiguous",
      answer: "A-Ambiguous",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Unapprove Module A
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleA}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    const unapproveBody = JSON.parse(unapproveRes.body);
    expect(unapproveBody.unapproved_count).toBe(1);
    expect(unapproveBody.unapproved_ids).toEqual([contentA]);

    // Content A is draft
    const gcA = await generatedContentStore.findById(contentA);
    expect(gcA?.status).toBe("draft");

    // Content B is still accepted
    const gcB = await generatedContentStore.findById(contentB);
    expect(gcB?.status).toBe("accepted");

    // Content C is still accepted
    const gcC = await generatedContentStore.findById(contentC);
    expect(gcC?.status).toBe("accepted");

    await app.close();
  });

  it("10. Prevents duplicate counting and duplicate unapproval when content matches both lesson and document", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor10@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Duplicate Guard Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");

    const moduleId = seedModule(organizationId, "Module 1", 0);
    const docId = seedDoc(organizationId, userId);
    const mod = await moduleStore.findById(moduleId);
    if (mod) await moduleStore.update({ ...mod, documentId: docId });

    const lessonId = randomUUID() as any;
    const now = new Date().toISOString();
    await lessonStore.create({
      id: lessonId,
      organizationId,
      courseId,
      moduleId,
      title: "Lesson 1",
      contentMarkdown: "# L1",
      sortOrder: 0,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Content matches both documentId and lessonId
    const contentId = seedContent(organizationId, {
      documentId: docId,
      type: "flashcard",
      status: "accepted",
    });
    await flashcardStore.create({
      id: randomUUID() as any,
      organizationId,
      courseId,
      documentId: docId,
      generatedContentId: contentId,
      lessonId,
      question: "Q1",
      answer: "A1",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    adminStore.setLearningStores({
      courseStore,
      moduleStore,
      lessonStore,
      generatedContentStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    });
    const hierarchy = await adminStore.getCourseHierarchy(courseId);
    const modHierarchy = hierarchy?.modules.find((m) => m.id === moduleId);
    // Count must be exactly 1, not 2
    expect(modHierarchy?.unapprovableContentCount).toBe(1);

    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/unapprove-contents`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    expect(JSON.parse(unapproveRes.body).unapproved_count).toBe(1);

    await app.close();
  });

  it("11. Consistency: isContentOwnedByModule handles all priority and boundary rules predictably", () => {
    const contextNormal = {
      targetModuleId: "mod-1",
      targetModuleDocId: "doc-1",
      moduleLessonIds: new Set(["l-1"]),
      otherLessonIds: new Set(["l-2"]),
      otherModuleDocIds: new Set(["doc-2"]),
      isDocumentShared: false,
    };

    // 1. Foreign doc: belongs to doc-2 which is owned by another module
    expect(
      isContentOwnedByModule(
        { id: "gc-foreign", type: "flashcard", documentId: "doc-2" },
        contextNormal,
      ),
    ).toBe(false);

    // 2. Lesson-less module with standalone flashcard on own doc
    const contextNoLessons = {
      targetModuleId: "mod-34",
      targetModuleDocId: "doc-34",
      moduleLessonIds: new Set<string>(),
      otherLessonIds: new Set<string>(),
      otherModuleDocIds: new Set(["doc-other"]),
      isDocumentShared: false,
    };
    expect(
      isContentOwnedByModule(
        { id: "gc-fc", type: "flashcard", documentId: "doc-34" },
        contextNoLessons,
      ),
    ).toBe(true);

    // 3. Shared doc with no lesson mapping -> false (prevent false capture)
    const contextSharedDoc = {
      ...contextNoLessons,
      isDocumentShared: true,
    };
    expect(
      isContentOwnedByModule(
        { id: "gc-fc", type: "flashcard", documentId: "doc-34" },
        contextSharedDoc,
      ),
    ).toBe(false);

    // 4. Shared doc with explicit lesson mapping -> true for matching lesson, false for other
    const contextSharedWithLessons = {
      targetModuleId: "mod-A",
      targetModuleDocId: "shared-doc",
      moduleLessonIds: new Set(["lesson-A"]),
      otherLessonIds: new Set(["lesson-B"]),
      otherModuleDocIds: new Set(["shared-doc"]),
      isDocumentShared: true,
    };
    const fcMap = new Map<string, Array<{ lessonId: string | null }>>([
      ["gc-A", [{ lessonId: "lesson-A" }]],
      ["gc-B", [{ lessonId: "lesson-B" }]],
      ["gc-none", [{ lessonId: null }]],
    ]);
    expect(
      isContentOwnedByModule(
        { id: "gc-A", type: "flashcard", documentId: "shared-doc" },
        contextSharedWithLessons,
        fcMap,
      ),
    ).toBe(true);
    expect(
      isContentOwnedByModule(
        { id: "gc-B", type: "flashcard", documentId: "shared-doc" },
        contextSharedWithLessons,
        fcMap,
      ),
    ).toBe(false);
    expect(
      isContentOwnedByModule(
        { id: "gc-none", type: "flashcard", documentId: "shared-doc" },
        contextSharedWithLessons,
        fcMap,
      ),
    ).toBe(false);
  });
});
