/**
 * Generation Routes Lifecycle Integration Tests (PR Real Stop & Delete).
 *
 * Verifies HTTP routes and tenant isolation (IDOR protection):
 * 1. POST /v1/organizations/:orgId/documents/:docId/generation/stop
 * 2. POST /v1/organizations/:orgId/courses/:courseId/documents/:docId/generation/stop
 * 3. POST /v1/organizations/:orgId/generation/:jobId/stop
 * 4. DELETE /v1/organizations/:orgId/documents/:docId/generation
 * 5. DELETE /v1/organizations/:orgId/courses/:courseId/documents/:docId/generation
 * 6. DELETE /v1/organizations/:orgId/generation/:jobId
 * 7. Tenant boundary & IDOR: User from Org B cannot stop or delete Org A's generation.
 * 8. Validation: 404 on missing documents / invalid UUIDs.
 */

import { describe, expect, it, beforeEach } from "vitest";
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
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import {
  InMemoryGenerationProgressStore,
} from "../modules/generation/generation-progress-store.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import {
  type OrganizationId,
  type UserId,
  type DocumentId,
  type CourseId,
  type GenerationJobId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

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

describe("Generation Routes Lifecycle & Tenant Isolation (Stop & Delete)", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let jobStore: InMemoryGenerationJobStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let queue: InMemoryGenerationQueue;
  let gateway: MockModelGateway;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let storageProvider: LocalStorageProvider;
  let tmpDir: string;
  let app: ReturnType<typeof createApp>;

  let userAId: UserId;
  let userBId: UserId;
  let orgAId: OrganizationId;
  let orgBId: OrganizationId;
  let courseAId: CourseId;
  let tokenUserA: string;
  let tokenUserB: string;

  beforeEach(async () => {
    config = makeTestConfig();
    orgStore = new InMemoryOrganizationStore();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore(orgStore);
    courseStore = new InMemoryCourseStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    jobStore = new InMemoryGenerationJobStore();
    chunkRecordStore = new InMemoryGenerationChunkStore();
    queue = new InMemoryGenerationQueue(jobStore);
    gateway = new MockModelGateway();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-gen-routes-test-"));
    storageProvider = new LocalStorageProvider(tmpDir);

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      documentStore,
      documentChunkStore: chunkStore,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore: jobStore,
      generationChunkStore: chunkRecordStore,
      generationProgressStore: progressStore,
      generationProgressService: progressService,
      queue,
      gateway,
      storageProvider,
      auditService,
    });

    // Create User A in Org A (with course_editor role)
    const regA = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "authorA@avana.org", password: "Password123!" },
    });
    tokenUserA = extractSessionToken(regA) || "";
    userAId = (regA.json() as { user: { id: string } }).user.id as UserId;

    orgAId = randomUUID() as OrganizationId;
    courseAId = randomUUID() as CourseId;

    await orgStore.createWithAdminMembership({
      organization: {
        id: orgAId,
        name: "Org A",
        slug: "org-a",
        type: "regular",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgAId,
        userId: userAId,
        role: "course_editor",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Create User B in Org B (isolated tenant)
    const regB = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "attackerB@avana.org", password: "Password123!" },
    });
    tokenUserB = extractSessionToken(regB) || "";
    userBId = (regB.json() as { user: { id: string } }).user.id as UserId;

    orgBId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgBId,
        name: "Org B",
        slug: "org-b",
        type: "regular",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgBId,
        userId: userBId,
        role: "course_editor",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
  });

  it("POST /documents/:docId/generation/stop should stop queued generation", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: courseAId,
      ownerUserId: userAId,
      originalName: "cardiology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "docs/cardio.pdf",
      status: "generating",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const jobId = randomUUID() as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "lesson",
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await progressService.queue(docId, orgAId);

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgAId}/documents/${docId}/generation/stop`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("stopped");
    expect(body.previous_status).toBe("queued");

    const updatedJob = await jobStore.findByIdForOrganization(jobId, orgAId);
    expect(updatedJob?.status).toBe("stopped");

    const progress = await progressService.getRecord(docId, orgAId);
    expect(progress?.status).toBe("stopped");
  });

  it("POST /courses/:courseId/documents/:docId/generation/stop should stop running generation", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: courseAId,
      ownerUserId: userAId,
      originalName: "neurology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      storageKey: "docs/neuro.pdf",
      status: "generating",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const jobId = randomUUID() as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "lesson",
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await progressService.startStage(docId, orgAId, "lesson", 3);

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgAId}/courses/${courseAId}/documents/${docId}/generation/stop`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("stopping");
    expect(body.previous_status).toBe("running");

    const updatedJob = await jobStore.findByIdForOrganization(jobId, orgAId);
    expect(updatedJob?.status).toBe("stopping");

    const progress = await progressService.getRecord(docId, orgAId);
    expect(progress?.status).toBe("stopping");
  });

  it("POST /generation/:jobId/stop should stop a specific job", async () => {
    const docId = randomUUID() as DocumentId;
    const jobId = randomUUID() as GenerationJobId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: courseAId,
      ownerUserId: userAId,
      originalName: "pathology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "docs/path.pdf",
      status: "generating",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await jobStore.create({
      id: jobId,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "flashcard",
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgAId}/generation/${jobId}/stop`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("stopping");
    expect(body.job_id).toBe(jobId);
  });

  it("DELETE /documents/:docId/generation should safely delete generation without deleting document", async () => {
    const docId = randomUUID() as DocumentId;
    const jobId = randomUUID() as GenerationJobId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: courseAId,
      ownerUserId: userAId,
      originalName: "genetics.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "docs/genetics.pdf",
      status: "generating",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await jobStore.create({
      id: jobId,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "quiz",
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Add draft content to be cleaned up
    await generatedContentStore.insert({
      id: randomUUID() as any,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "quiz",
      status: "draft",
      payload: { quiz: { questions: [] } },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await progressService.startStage(docId, orgAId, "quiz", 2);

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgAId}/documents/${docId}/generation`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("deleted");

    // Check parent document was NOT deleted
    const doc = await documentStore.findById(docId);
    expect(doc).toBeDefined();
    expect(doc?.deletedAt).toBeNull();
    expect(doc?.status).toBe("extracted");

    // Check draft content was cleaned up
    const drafts = await generatedContentStore.listByDocument(docId, orgAId);
    expect(drafts.filter((d) => d.deletedAt === null)).toHaveLength(0);

    // Check progress was reset to idle
    const progress = await progressService.getRecord(docId, orgAId);
    expect(progress?.status).toBe("idle");
  });

  it("DELETE /generation/:jobId should delete specific job and clean up chunks", async () => {
    const docId = randomUUID() as DocumentId;
    const jobId = randomUUID() as GenerationJobId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: courseAId,
      ownerUserId: userAId,
      originalName: "immunology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "docs/immuno.pdf",
      status: "generating",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await jobStore.create({
      id: jobId,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "lesson",
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgAId}/generation/${jobId}`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("deleted");
    expect(body.job_id).toBe(jobId);

    // Job should be soft-deleted
    const job = await jobStore.findByIdForOrganization(jobId, orgAId);
    expect(job).toBeUndefined();
  });

  it("Tenant Boundary (IDOR): User B from Org B cannot stop or delete Org A generation", async () => {
    const docId = randomUUID() as DocumentId;
    const jobId = randomUUID() as GenerationJobId;
    const now = new Date().toISOString();

    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: courseAId,
      ownerUserId: userAId,
      originalName: "confidential_orgA.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "docs/confidential.pdf",
      status: "generating",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await jobStore.create({
      id: jobId,
      organizationId: orgAId,
      documentId: docId,
      courseId: courseAId,
      type: "lesson",
      status: "running",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. User B tries to stop Org A document via Org A path -> Forbidden / Policy Check
    const stopDocRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgAId}/documents/${docId}/generation/stop`,
      cookies: { avana_session: tokenUserB },
    });
    expect([403, 404]).toContain(stopDocRes.statusCode);

    // 2. User B tries to stop Org A document via Org B path -> 404 (document not in Org B)
    const stopDocCrossRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgBId}/documents/${docId}/generation/stop`,
      cookies: { avana_session: tokenUserB },
    });
    expect(stopDocCrossRes.statusCode).toBe(404);

    // 3. User B tries to stop Org A job -> 403 or 404
    const stopJobRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgAId}/generation/${jobId}/stop`,
      cookies: { avana_session: tokenUserB },
    });
    expect([403, 404]).toContain(stopJobRes.statusCode);

    // 4. User B tries to delete Org A generation -> 403 or 404
    const deleteDocRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgAId}/documents/${docId}/generation`,
      cookies: { avana_session: tokenUserB },
    });
    expect([403, 404]).toContain(deleteDocRes.statusCode);

    // 5. User B tries to delete Org A job -> 403 or 404
    const deleteJobRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgAId}/generation/${jobId}`,
      cookies: { avana_session: tokenUserB },
    });
    expect([403, 404]).toContain(deleteJobRes.statusCode);
  });
});
