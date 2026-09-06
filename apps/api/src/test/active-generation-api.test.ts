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
  STAGE_LABELS_FA,
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

describe("Active Generation and Document Progress API & Tenant Isolation", () => {
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
    queue = new InMemoryGenerationQueue(jobStore);
    gateway = new MockModelGateway();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-active-gen-test-"));
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
      generationProgressStore: progressStore,
      generationProgressService: progressService,
      queue,
      gateway,
      storageProvider,
      auditService,
    });

    // Create User A in Org A
    const regA = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "userA@avana.org", password: "Password123!" },
    });
    tokenUserA = extractSessionToken(regA) || "";
    userAId = (regA.json() as { user: { id: string } }).user.id as UserId;

    orgAId = randomUUID() as OrganizationId;
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
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Create User B in Org B
    const regB = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "userB@avana.org", password: "Password123!" },
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
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
  });

  it("should return active generation items for authorized user and reflect canonical progress", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: null,
      ownerUserId: userAId,
      originalName: "pharmacology-intro.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      storageKey: "key-1",
      status: "generating",
      pageCount: 12,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Update progress in progress service
    await progressService.startStage(docId, orgAId, "lesson", 12);
    await progressService.updateProgress(docId, orgAId, "lesson", 3, 12);

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgAId}/generation/active`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      documentId: docId,
      documentName: "pharmacology-intro.pdf",
      courseId: null,
      organizationId: orgAId,
      status: "generating",
      stage: "lesson",
      stageLabel: STAGE_LABELS_FA.lesson,
      progress: {
        current: 3,
        total: 12,
        percentage: 25,
      },
      stageStartedAt: expect.any(String),
      lastActivityAt: expect.any(String),
      error: null,
      updatedAt: expect.any(String),
    });
  });

  it("should return document-level generation progress for single document endpoint", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    await documentStore.create({
      id: docId,
      organizationId: orgAId,
      courseId: null,
      ownerUserId: userAId,
      originalName: "chapter2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      storageKey: "key-2",
      status: "generating",
      pageCount: 8,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await progressService.startStage(docId, orgAId, "flashcard", 20);
    await progressService.updateProgress(docId, orgAId, "flashcard", 10, 20);

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgAId}/documents/${docId}/progress`,
      cookies: { avana_session: tokenUserA },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.document_id).toBe(docId);
    expect(body.document_name).toBe("chapter2.pdf");
    expect(body.generationProgress).toEqual({
      status: "generating",
      stage: "flashcard",
      stageLabel: STAGE_LABELS_FA.flashcard,
      progress: {
        current: 10,
        total: 20,
        percentage: 50,
      },
      stageStartedAt: expect.any(String),
      lastActivityAt: expect.any(String),
      error: null,
    });
  });

  it("IDOR Protection: User B cannot access User A's active generations or document progress", async () => {
    const docIdA = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    await documentStore.create({
      id: docIdA,
      organizationId: orgAId,
      courseId: null,
      ownerUserId: userAId,
      originalName: "userA-private.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "key-a",
      status: "generating",
      pageCount: 5,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await progressService.startStage(docIdA, orgAId, "quiz", 10);

    // 1. User B tries to query Org A's active generations -> Should fail with 404/not found org
    const resActive = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgAId}/generation/active`,
      cookies: { avana_session: tokenUserB },
    });
    expect(resActive.statusCode).toBe(404);

    // 2. User B tries to query document A progress directly under Org A -> 404
    const resDocUnderOrgA = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgAId}/documents/${docIdA}/progress`,
      cookies: { avana_session: tokenUserB },
    });
    expect(resDocUnderOrgA.statusCode).toBe(404);

    // 3. User B tries to tamper URL by passing docIdA under Org B -> 404
    const resDocUnderOrgB = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgBId}/documents/${docIdA}/progress`,
      cookies: { avana_session: tokenUserB },
    });
    expect(resDocUnderOrgB.statusCode).toBe(404);
  });
});
