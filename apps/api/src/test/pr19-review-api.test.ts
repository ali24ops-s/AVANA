/**
 * PR6-6 Integration tests: AI generation review & acceptance API.
 *
 * Covers the human-in-the-loop review workflow:
 *   1. Editor GET review-queue → lists pending (draft/edited) content
 *   2. Editor GET generated/:contentId → content + citations + source chunks
 *   3. Editor POST accept → draft → accepted, materializes a lesson draft
 *   4. Editor POST reject → requires reason, draft → rejected
 *   5. Editor PATCH → edit payload before acceptance (preserves citations)
 *   6. Editor POST regenerate → 202 + job_id, marks regenerating
 *   7. Student cannot read the review-queue (content:review) or accept content
 *      (content:accept) — both are editor/admin only → 403
 *   8. Cross-organization access is non-disclosing (404)
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
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
  GeneratedContentStatus,
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

describe("PR6-6: AI generation review & acceptance API", () => {
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
  const documentId = "22222222-2222-4222-8222-222222222222" as DocumentId;
  const chunkId = "33333333-3333-4333-8333-333333333333";

  function seedContent(
    organizationId: OrganizationId,
    overrides: {
      id?: GeneratedContentId;
      status?: GeneratedContentStatus;
      courseId?: string;
      documentId?: string;
    } = {},
  ): GeneratedContentId {
    const id = overrides.id ?? (randomUUID() as unknown as GeneratedContentId);
    const now = new Date().toISOString();
    generatedContentStore.insert({
      id,
      organizationId,
      documentId: (overrides.documentId ?? documentId) as DocumentId,
      courseId: (overrides.courseId ?? courseId) as CourseId,
      type: "lesson",
      status: overrides.status ?? "draft",
      payload: {
        kind: "lesson",
        title: "AI Lesson",
        contentMarkdown: "# Generated content",
        citationChunkIds: [chunkId],
      },
      promptVersion: "v1",
      model: "mock-1",
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
    return id;
  }

  function seedDocumentAndChunk(organizationId: OrganizationId): void {
    const now = new Date().toISOString();
    documentStore.insert({
      id: documentId,
      organizationId,
      courseId,
      ownerUserId: randomUUID() as UserId,
      originalName: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      sha256: "c".repeat(64),
      storageKey: `uploads/${documentId}.pdf`,
      pageCount: 1,
      status: "review_pending",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    documentChunkStore.createMany([
      {
        id: chunkId as never,
        documentId,
        organizationId,
        sequence: 1,
        heading: "Intro",
        content: "Source chunk text",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 10,
        contentHash: "hash-1",
        createdAt: now,
      },
    ]);
  }

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
    queue = new InMemoryGenerationQueue(generationJobStore);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  afterEach(async () => {
    // In-memory stores require no teardown.
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
    // Optionally promote the seeded user to an editor role for this test.
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
    const body = JSON.parse(res.body) as { organization: { id: string } };
    return body.organization.id as OrganizationId;
  }

  describe("GET .../generated/review-queue", () => {
    it("lists pending (draft/edited) content for an editor", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Review Org");
      seedDocumentAndChunk(organizationId);
      seedContent(organizationId); // draft
      seedContent(organizationId, { status: "edited" });
      seedContent(organizationId, { status: "accepted" });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { pending: unknown[] };
      expect(body.pending).toHaveLength(2);
      await app.close();
    });

    it("forbids a student from reading the review-queue (403)", async () => {
      // Product requirement: students may read only accepted content. The
      // review-queue exposes drafts, so it is editor/admin only.
      const app = await buildApp();
      const { token: adminToken } = await signIn(
        app,
        "admin-rq@example.com",
        "organization_admin",
      );
      const organizationId = await createOrg(app, adminToken, "Read Org");

      const { token, userId } = await signIn(
        app,
        "stu-read@example.com",
        "student",
      );
      orgStore.addMembership({
        id: randomUUID(),
        organizationId,
        userId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      seedDocumentAndChunk(organizationId);
      seedContent(organizationId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("GET .../generated/:contentId", () => {
    it("returns content with citations and source chunks", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor2@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Detail Org");
      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);
      generatedContentCitationStore.insert({
        generatedContentId: contentId,
        documentChunkId: chunkId as never,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        content: { id: string; citations: unknown[] };
        source_chunks: unknown[];
      };
      expect(body.content.id).toBe(contentId);
      expect(body.content.citations).toContain(chunkId);
      expect(body.source_chunks).toHaveLength(1);
      await app.close();
    });
  });

  describe("POST .../generated/:contentId/accept", () => {
    it("accepts a draft lesson and materializes a lesson draft", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor3@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Accept Org");
      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        status: string;
        materialized_lesson_id: string | null;
      };
      expect(body.status).toBe("accepted");
      expect(body.materialized_lesson_id).toBeTruthy();

      // Lesson materialized as published upon review acceptance.
      const lessons = lessonStore.getAll();
      expect(lessons).toHaveLength(1);
      expect(lessons[0].publicationStatus).toBe("published");
      await app.close();
    });

    it("forbids a student from accepting content (403)", async () => {
      const app = await buildApp();
      const { token: adminToken } = await signIn(
        app,
        "admin-acc@example.com",
        "organization_admin",
      );
      const organizationId = await createOrg(app, adminToken, "Forbid Org");

      const { token: studentToken, userId } = await signIn(
        app,
        "stu-accept@example.com",
        "student",
      );
      orgStore.addMembership({
        id: randomUUID(),
        organizationId,
        userId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
        cookies: { avana_session: studentToken },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("POST .../generated/:contentId/reject", () => {
    it("rejects a draft with a reason", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor4@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Reject Org");
      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/reject`,
        cookies: { avana_session: token },
        payload: { reason: "Off-topic content" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { status: string };
      expect(body.status).toBe("rejected");
      await app.close();
    });

    it("rejects without a reason with 400", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor4b@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Reject Org B");
      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/reject`,
        cookies: { avana_session: token },
        payload: { reason: "" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("PATCH .../generated/:contentId", () => {
    it("edits a draft payload before acceptance", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor5@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Edit Org");
      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}`,
        cookies: { avana_session: token },
        payload: {
          payload: {
            kind: "lesson",
            title: "Edited Lesson",
            contentMarkdown: "# Edited",
            citationChunkIds: [chunkId],
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        content: { status: string; payload: { title: string } };
      };
      expect(body.content.status).toBe("edited");
      expect(body.content.payload.title).toBe("Edited Lesson");
      await app.close();
    });
  });

  describe("POST .../generated/:contentId/regenerate", () => {
    it("returns 202 and creates a regeneration job", async () => {
      const app = await buildApp();
      const { token } = await signIn(
        app,
        "editor6@example.com",
        "course_editor",
      );
      const organizationId = await createOrg(app, token, "Regen Org");
      seedDocumentAndChunk(organizationId);
      const contentId = seedContent(organizationId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/regenerate`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body) as {
        job_id: string;
        status: string;
      };
      expect(body.status).toBe("regenerating");
      expect(body.job_id).toBeTruthy();
      expect(generationJobStore.getAll()).toHaveLength(1);
      await app.close();
    });
  });

  describe("Cross-organization isolation", () => {
    it("returns 404 for content in another organization (non-disclosing)", async () => {
      const app = await buildApp();
      // Org A owns the content.
      const { token: tokenA } = await signIn(
        app,
        "editorA@example.com",
        "course_editor",
      );
      const orgA = await createOrg(app, tokenA, "Org A");
      seedDocumentAndChunk(orgA);
      const contentId = seedContent(orgA);

      // Org B attempts to read it.
      const { token: tokenB } = await signIn(
        app,
        "editorB@example.com",
        "course_editor",
      );
      const orgB = await createOrg(app, tokenB, "Org B");

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgB}/courses/${courseId}/generated/${contentId}`,
        cookies: { avana_session: tokenB },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
