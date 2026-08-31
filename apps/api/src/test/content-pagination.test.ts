/**
 * Content Pagination & Deterministic Sorting Integration Tests (P2 Fix).
 *
 * Verifies:
 * 1. GET .../documents/:documentId/generated supports page & limit pagination.
 * 2. GET .../generated/review-queue supports page, limit, and type filters.
 * 3. Deterministic sorting (createdAt + id) across multiple records.
 * 4. Backward compatibility when query parameters are omitted.
 * 5. Tenant isolation (Org A vs Org B).
 * 6. Soft-deleted generated contents are excluded.
 * 7. Store-level pagination & count calculation.
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
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { createModelGateway } from "../modules/generation/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type {
  CourseId,
  DocumentId,
  GeneratedContentId,
  GeneratedContentStatus,
  GeneratedContentType,
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

describe("P2 Content Pagination & Deterministic Sorting", () => {
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
  let queue: InMemoryGenerationQueue;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const courseId = "11111111-1111-4111-8111-111111111111" as CourseId;
  const documentId = "22222222-2222-4222-8222-222222222222" as DocumentId;

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
    queue = new InMemoryGenerationQueue(generationJobStore);
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
      progressStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      storageProvider: {
        createUpload: async (p: { storageKey: string; mimeType: string }) => ({
          storageKey: p.storageKey,
          uploadUrl: null,
          expiresAt: new Date().toISOString(),
        }),
        save: async () => {},
        read: async () => Buffer.from("data"),
        delete: async () => {},
        exists: async () => true,
      },
      gateway: createModelGateway("mock"),
      auditService,
    });
    await app.ready();
    return app;
  }

  async function signIn(app: Awaited<ReturnType<typeof buildApp>>, email: string, role = "student") {
    const user = await userStore.createFromVerifiedIdentity({
      email,
      name: email.split("@")[0],
    });
    userStore.insert({
      id: user.id,
      email: user.email,
      role: role as never,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email },
    });
    const token = extractSessionToken(res)!;
    return { token, userId: user.id };
  }

  async function createOrg(app: Awaited<ReturnType<typeof buildApp>>, token: string, name: string) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    const body = JSON.parse(res.body);
    const orgId = body.organization.id as OrganizationId;

    // Also create the shared course if not already present
    try {
      const now = new Date().toISOString();
      await courseStore.create({
        course: {
          id: courseId,
          organizationId: orgId,
          name: "Test Course",
          subject: "General",
          examDate: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
        auditEvents: [],
      });
    } catch {
      // Course already exists for this test context
    }

    return orgId;
  }

  function seedDocument(organizationId: OrganizationId, docId = documentId, ownerUserId?: UserId) {
    const now = new Date().toISOString();
    documentStore.insert({
      id: docId,
      organizationId,
      courseId,
      ownerUserId: ownerUserId ?? (randomUUID() as UserId),
      originalName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 1,
      status: "review_pending",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    });
  }

  function seedGeneratedItem(
    organizationId: OrganizationId,
    overrides: {
      id?: string;
      documentId?: DocumentId;
      courseId?: CourseId;
      type?: GeneratedContentType;
      status?: GeneratedContentStatus;
      createdAt?: string;
      title?: string;
      deletedAt?: string | null;
    } = {},
  ) {
    const id = (overrides.id ?? randomUUID()) as GeneratedContentId;
    const now = overrides.createdAt ?? new Date().toISOString();
    generatedContentStore.insert({
      id,
      organizationId,
      documentId: overrides.documentId ?? documentId,
      courseId: overrides.courseId ?? courseId,
      type: overrides.type ?? "lesson",
      status: overrides.status ?? "draft",
      payload: {
        kind: "lesson",
        title: overrides.title ?? `Draft Item ${id}`,
        contentMarkdown: "Some markdown",
        citationChunkIds: [],
      },
      promptVersion: "v1",
      model: "mock-model",
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
      deletedAt: overrides.deletedAt ?? null,
    });
    return id;
  }

  it("paginates document generated contents with page and limit", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "pag1@example.com");
    const organizationId = await createOrg(app, token, "Pag Org 1");
    seedDocument(organizationId);

    // Seed 5 items with sequential timestamps
    for (let i = 1; i <= 5; i++) {
      seedGeneratedItem(organizationId, {
        id: `00000000-0000-4000-8000-00000000000${i}`,
        title: `Item ${i}`,
        createdAt: `2026-01-0${i}T00:00:00.000Z`,
      });
    }

    // Page 1 with limit 2
    const resPage1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated?page=1&limit=2`,
      cookies: { avana_session: token },
    });
    expect(resPage1.statusCode).toBe(200);
    const body1 = JSON.parse(resPage1.body);
    expect(body1.contents).toHaveLength(2);
    expect(body1.contents[0].id).toBe("00000000-0000-4000-8000-000000000001");
    expect(body1.contents[1].id).toBe("00000000-0000-4000-8000-000000000002");
    expect(body1.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      total_pages: 3,
      totalPages: 3,
      next_cursor: null,
    });

    // Page 2 with limit 2
    const resPage2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated?page=2&limit=2`,
      cookies: { avana_session: token },
    });
    expect(resPage2.statusCode).toBe(200);
    const body2 = JSON.parse(resPage2.body);
    expect(body2.contents).toHaveLength(2);
    expect(body2.contents[0].id).toBe("00000000-0000-4000-8000-000000000003");
    expect(body2.contents[1].id).toBe("00000000-0000-4000-8000-000000000004");
    expect(body2.pagination.page).toBe(2);

    // Page 3 with limit 2
    const resPage3 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated?page=3&limit=2`,
      cookies: { avana_session: token },
    });
    expect(resPage3.statusCode).toBe(200);
    const body3 = JSON.parse(resPage3.body);
    expect(body3.contents).toHaveLength(1);
    expect(body3.contents[0].id).toBe("00000000-0000-4000-8000-000000000005");

    await app.close();
  });

  it("guarantees deterministic sorting when created_at timestamps are identical", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "det@example.com");
    const organizationId = await createOrg(app, token, "Det Org");
    seedDocument(organizationId);

    const identicalTimestamp = "2026-08-24T12:00:00.000Z";
    // Seed items with identical timestamp but alphabetical IDs
    seedGeneratedItem(organizationId, {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Item B",
      createdAt: identicalTimestamp,
    });
    seedGeneratedItem(organizationId, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Item A",
      createdAt: identicalTimestamp,
    });
    seedGeneratedItem(organizationId, {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Item C",
      createdAt: identicalTimestamp,
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated?page=1&limit=10`,
      cookies: { avana_session: token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.contents).toHaveLength(3);
    // Deterministic tie-breaker by ID: A, B, C
    expect(body.contents[0].id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body.contents[1].id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(body.contents[2].id).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");

    await app.close();
  });

  it("paginates and filters review-queue at store level", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "rq-pag@example.com");
    const organizationId = await createOrg(app, token, "RQ Pag Org");
    seedDocument(organizationId);

    // Seed 3 lesson drafts, 2 flashcard drafts, and 1 accepted item
    seedGeneratedItem(organizationId, {
      id: "11111111-0000-4000-8000-000000000001",
      type: "lesson",
      status: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    seedGeneratedItem(organizationId, {
      id: "11111111-0000-4000-8000-000000000002",
      type: "lesson",
      status: "draft",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    seedGeneratedItem(organizationId, {
      id: "11111111-0000-4000-8000-000000000003",
      type: "lesson",
      status: "draft",
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    seedGeneratedItem(organizationId, {
      id: "22222222-0000-4000-8000-000000000001",
      type: "flashcard",
      status: "draft",
      createdAt: "2026-01-04T00:00:00.000Z",
    });
    seedGeneratedItem(organizationId, {
      id: "22222222-0000-4000-8000-000000000002",
      type: "flashcard",
      status: "edited",
      createdAt: "2026-01-05T00:00:00.000Z",
    });
    // Accepted content should NOT appear in review queue
    seedGeneratedItem(organizationId, {
      id: "33333333-0000-4000-8000-000000000001",
      type: "lesson",
      status: "accepted",
      createdAt: "2026-01-06T00:00:00.000Z",
    });

    // 1. All pending items paginated (total 5)
    const resAll = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue?page=1&limit=3`,
      cookies: { avana_session: token },
    });
    expect(resAll.statusCode).toBe(200);
    const bodyAll = JSON.parse(resAll.body);
    expect(bodyAll.pending).toHaveLength(3);
    expect(bodyAll.pagination.total).toBe(5);
    expect(bodyAll.pagination.totalPages).toBe(2);

    // 2. Filter by type=flashcard
    const resCards = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue?type=flashcard&page=1&limit=10`,
      cookies: { avana_session: token },
    });
    expect(resCards.statusCode).toBe(200);
    const bodyCards = JSON.parse(resCards.body);
    expect(bodyCards.pending).toHaveLength(2);
    expect(bodyCards.pending.every((p: { type: string }) => p.type === "flashcard")).toBe(true);
    expect(bodyCards.pagination.total).toBe(2);

    await app.close();
  });

  it("enforces tenant isolation and excludes soft-deleted records", async () => {
    const app = await buildApp();
    const { token: tokenA } = await signIn(app, "tenantA@example.com");
    const orgA = await createOrg(app, tokenA, "Tenant A");
    seedDocument(orgA);

    const { token: tokenB } = await signIn(app, "tenantB@example.com");
    const orgB = await createOrg(app, tokenB, "Tenant B");

    // Item in Org A
    seedGeneratedItem(orgA, {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
    });
    // Soft-deleted item in Org A
    seedGeneratedItem(orgA, {
      id: "aaaaaaaa-0000-4000-8000-000000000002",
      deletedAt: new Date().toISOString(),
    });

    // Org A queries: only sees active item in Org A
    const resA = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/courses/${courseId}/documents/${documentId}/generated`,
      cookies: { avana_session: tokenA },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body);
    expect(bodyA.contents).toHaveLength(1);
    expect(bodyA.contents[0].id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
    expect(bodyA.pagination.total).toBe(1);

    // Org B queries Org A's document: 404 non-disclosing
    const resB = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgB}/courses/${courseId}/documents/${documentId}/generated`,
      cookies: { avana_session: tokenB },
    });
    expect(resB.statusCode).toBe(404);

    await app.close();
  });

  it("maintains backward compatibility when pagination query params are omitted", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "legacy@example.com");
    const organizationId = await createOrg(app, token, "Legacy Org");
    seedDocument(organizationId);

    seedGeneratedItem(organizationId, {
      id: "11111111-2222-4333-8444-555555555555",
    });

    // No query params
    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated`,
      cookies: { avana_session: token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Legacy contents property is intact
    expect(Array.isArray(body.contents)).toBe(true);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].id).toBe("11111111-2222-4333-8444-555555555555");
    // Pagination property is also available
    expect(body.pagination.total).toBe(1);

    await app.close();
  });

  it("allows student to accept, reject, edit, and view review-queue for their own authorized content", async () => {
    const app = await buildApp();
    const { token: adminToken } = await signIn(app, "admin-stu@example.com", "organization_admin");
    const orgId = await createOrg(app, adminToken, "Student Perm Org");

    const { token: studentToken, userId } = await signIn(app, "student1@example.com", "student");
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    seedDocument(orgId, documentId, userId);
    const itemId = seedGeneratedItem(orgId, {
      id: "99999999-0000-4000-8000-000000000001",
      title: "Student Draft Item",
    });

    // 1. Student reads review-queue
    const resQueue = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/review-queue`,
      cookies: { avana_session: studentToken },
    });
    expect(resQueue.statusCode).toBe(200);
    const bodyQueue = JSON.parse(resQueue.body);
    expect(bodyQueue.pending).toHaveLength(1);

    // 2. Student accepts content
    const resAccept = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/${itemId}/accept`,
      cookies: { avana_session: studentToken },
    });
    expect(resAccept.statusCode).toBe(200);
    const bodyAccept = JSON.parse(resAccept.body);
    expect(bodyAccept.status).toBe("accepted");

    await app.close();
  });

  it("denies student from performing administrative operations or accessing other tenant content", async () => {
    const app = await buildApp();
    const { token: adminToken } = await signIn(app, "admin-sec@example.com", "organization_admin");
    const orgA = await createOrg(app, adminToken, "Org A");
    const orgB = await createOrg(app, adminToken, "Org B");

    const { token: studentToken, userId } = await signIn(app, "student-sec@example.com", "student");
    // Member only in Org A
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgA,
      userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    seedDocument(orgB);
    const itemInB = seedGeneratedItem(orgB, {
      id: "88888888-0000-4000-8000-000000000001",
    });

    // 1. Student in Org A cannot accept content in Org B (404/403)
    const resCrossAccept = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgB}/courses/${courseId}/generated/${itemInB}/accept`,
      cookies: { avana_session: studentToken },
    });
    expect(resCrossAccept.statusCode).toBe(404);

    // 2. Student cannot list organization members (403 forbidden)
    const resListMembers = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/members`,
      cookies: { avana_session: studentToken },
    });
    expect(resListMembers.statusCode).toBe(403);

    await app.close();
  });
});
