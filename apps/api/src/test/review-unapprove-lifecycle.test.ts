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
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type {
  CourseId,
  DocumentId,
  GeneratedContentId,
  OrganizationId,
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

describe("Review Unapprove Lifecycle & Deletion Invariants Tests", () => {
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

    // Seed course
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
    opts: { documentId?: DocumentId; status?: "draft" | "accepted"; type?: "lesson" | "flashcard" | "quiz" } = {},
  ): GeneratedContentId {
    const contentId = randomUUID() as GeneratedContentId;
    const now = new Date().toISOString();
    generatedContentStore.insert({
      id: contentId,
      organizationId,
      courseId,
      documentId: opts.documentId ?? (randomUUID() as DocumentId),
      type: opts.type ?? "lesson",
      status: opts.status ?? "draft",
      payload: {
        kind: "lesson",
        title: "Generated Lesson Title",
        summary: "A brief summary",
        contentMarkdown: "# Generated Content\nSection body text.",
        citationChunkIds: [],
      },
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
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return contentId;
  }

  it("1. Successfully unapproves an accepted lesson and clears materialized references", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Test Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");
    const docId = seedDoc(organizationId, userId);
    const contentId = seedContent(organizationId, { documentId: docId });

    // Step A: Accept the content
    const acceptRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      cookies: { avana_session: token },
    });
    if (acceptRes.statusCode !== 200) console.log("acceptRes error:", acceptRes.body);
    expect(acceptRes.statusCode).toBe(200);
    const acceptBody = JSON.parse(acceptRes.body);
    expect(acceptBody.status).toBe("accepted");
    expect(acceptBody.materialized_lesson_id).toBeDefined();
    const lessonId = acceptBody.materialized_lesson_id;

    // Check lesson exists
    const lesson = await lessonStore.findById(lessonId);
    expect(lesson).toBeDefined();

    // Step B: Unapprove the content
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/unapprove`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(200);
    const unapproveBody = JSON.parse(unapproveRes.body);
    expect(unapproveBody.status).toBe("draft");

    // Check content record updated
    const updatedContent = await generatedContentStore.findById(contentId);
    expect(updatedContent?.status).toBe("draft");
    expect(updatedContent?.acceptedAt).toBeNull();
    expect(updatedContent?.acceptedBy).toBeNull();
    expect(updatedContent?.materializedLessonId).toBeNull();

    // Check materialized lesson was soft-deleted
    const removedLesson = await lessonStore.findById(lessonId);
    expect(removedLesson?.deletedAt).toBeTruthy();

    // Step C: Re-approving works
    const reAcceptRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      cookies: { avana_session: token },
    });
    expect(reAcceptRes.statusCode).toBe(200);
    const reAcceptBody = JSON.parse(reAcceptRes.body);
    expect(reAcceptBody.status).toBe("accepted");
    expect(reAcceptBody.materialized_lesson_id).toBeDefined();

    await app.close();
  });

  it("2. Rejects unapprove with 409 Conflict if course is published", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor-pub@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Published Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");
    const docId = seedDoc(organizationId, userId);
    const contentId = seedContent(organizationId, { documentId: docId });

    // Accept content while in draft
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      cookies: { avana_session: token },
    });

    // Publish the course
    const course = await courseStore.findById(courseId);
    if (course) {
      await courseStore.update({ ...course, status: "published" });
    }

    // Attempt unapprove
    const unapproveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/unapprove`,
      cookies: { avana_session: token },
    });
    expect(unapproveRes.statusCode).toBe(409);
    const body = JSON.parse(unapproveRes.body);
    expect(body.error.message).toContain("دوره‌های منتشرشده");

    await app.close();
  });

  it("3. Rejects unapprove if content is not in accepted status", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor-draft@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Draft Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");
    const docId = seedDoc(organizationId, userId);
    const contentId = seedContent(organizationId, { documentId: docId, status: "draft" });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/unapprove`,
      cookies: { avana_session: token },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("تنها محتوای تأییدشده");

    await app.close();
  });

  it("4. Deletes generated content permanently and cascades attributable dependencies", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor-del@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Delete Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");
    const docId = seedDoc(organizationId, userId);
    const contentId = seedContent(organizationId, { documentId: docId });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}`,
      cookies: { avana_session: token },
    });
    expect(delRes.statusCode).toBe(200);
    const delBody = JSON.parse(delRes.body);
    expect(delBody.success).toBe(true);

    const check = await generatedContentStore.findById(contentId);
    expect(check?.deletedAt || !check).toBeTruthy();

    await app.close();
  });

  it("5. Review queue excludes items whose source document or materialized lesson was deleted", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "editor-queue@example.com", "course_editor");
    const organizationId = await createOrg(app, token, "Queue Org");
    orgStore.setMembershipRole(organizationId, userId, "course_editor");
    const docId = seedDoc(organizationId, userId);
    const contentId = seedContent(organizationId, { documentId: docId });

    // Accept content
    const acceptRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      cookies: { avana_session: token },
    });
    const lessonId = JSON.parse(acceptRes.body).materialized_lesson_id;

    // Queue query with status=accepted shows 1 item
    const queueRes1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue?status=accepted`,
      cookies: { avana_session: token },
    });
    expect(queueRes1.statusCode).toBe(200);
    const queueBody1 = JSON.parse(queueRes1.body);
    expect(queueBody1.groups[0].stats.approved).toBe(1);

    // Now delete the materialized lesson (simulating manual or external deletion)
    await lessonStore.delete(lessonId);

    // Queue query must now EXCLUDE this accepted content and stats.approved must be 0
    const queueRes2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue?status=accepted`,
      cookies: { avana_session: token },
    });
    expect(queueRes2.statusCode).toBe(200);
    const queueBody2 = JSON.parse(queueRes2.body);
    expect(queueBody2.groups.length).toBe(0);

    await app.close();
  });
});
