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
  DEFAULT_GENERATION_STALE_THRESHOLD_MS,
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

describe("Generation Flow End-to-End RCA Regression Suite", () => {
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

  let userId: UserId;
  let orgId: OrganizationId;
  let courseId: CourseId;
  let sessionToken: string;

  beforeEach(async () => {
    config = makeTestConfig();
    orgStore = new InMemoryOrganizationStore();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore(orgStore);
    courseStore = new InMemoryCourseStore(orgStore);
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

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-rca-gen-test-"));
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

    const reg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "teacher@avana.org",
        password: "Password123!",
        firstName: "استاد",
        lastName: "آوانا",
        phoneNumber: "09121110041",
      },
    });
    sessionToken = extractSessionToken(reg) || "";
    userId = (reg.json() as { user: { id: string } }).user.id as UserId;

    orgId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Medical Academy",
        slug: "med-academy",
        type: "regular",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgId,
        userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        ownerUserId: userId,
        title: "Cell Biology",
        description: "Comprehensive cell biology course",
        category: "biology",
        targetAudience: "students",
        difficulty: "intermediate",
        estimatedDurationMinutes: 120,
        priceAmount: 0,
        priceCurrency: "IRR",
        isPublished: false,
        publishedAt: null,
        status: "draft",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
  });

  it("Requirement 2: Race Condition Elimination - POST /generate -> 202 -> immediate GET /active sees 'queued' -> worker executes stages -> completed", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: userId,
      originalName: "cell-structure.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "key-cell",
      status: "extracted",
      pageCount: 4,
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

    // 1. Client calls POST /generate
    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      cookies: { avana_session: sessionToken },
      payload: { types: ["lesson", "flashcard", "quiz"] },
    });

    expect(genRes.statusCode).toBe(202);
    const genPayload = JSON.parse(genRes.payload);
    expect(genPayload.job_id).toBeDefined();

    // 2. Synchronous progress check: record must already exist in 'queued' status
    const queuedRecord = await progressStore.findByDocument(docId, orgId);
    expect(queuedRecord).not.toBeNull();
    expect(queuedRecord?.status).toBe("queued");
    expect(queuedRecord?.progressCurrent).toBe(0);
    expect(queuedRecord?.progressTotal).toBe(1);

    // 3. Immediate GET /generation/active (simulating instant React Query refetch before worker run)
    const activeRes1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/generation/active`,
      cookies: { avana_session: sessionToken },
    });
    expect(activeRes1.statusCode).toBe(200);
    const activeBody1 = JSON.parse(activeRes1.payload);
    expect(activeBody1.items).toHaveLength(1);
    expect(activeBody1.items[0].documentId).toBe(docId);
    expect(activeBody1.items[0].status).toBe("queued");
    expect(activeBody1.items[0].organizationId).toBe(orgId);

    // 4. Worker starts processing: transitions to 'planning'
    await progressService.startStage(docId, orgId, "planning", 1);
    const activeRes2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/generation/active`,
      cookies: { avana_session: sessionToken },
    });
    const activeBody2 = JSON.parse(activeRes2.payload);
    expect(activeBody2.items[0].status).toBe("planning");
    expect(activeBody2.items[0].stage).toBe("planning");
    expect(activeBody2.items[0].stageLabel).toBe(STAGE_LABELS_FA.planning);

    // 5. Worker progresses to 'lesson'
    await progressService.startStage(docId, orgId, "lesson", 3);
    await progressService.updateProgress(docId, orgId, "lesson", 1, 3);
    const activeRes3 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/generation/active`,
      cookies: { avana_session: sessionToken },
    });
    const activeBody3 = JSON.parse(activeRes3.payload);
    expect(activeBody3.items[0].status).toBe("generating");
    expect(activeBody3.items[0].stage).toBe("lesson");
    expect(activeBody3.items[0].progress.current).toBe(1);
    expect(activeBody3.items[0].progress.total).toBe(3);
    expect(activeBody3.items[0].progress.percentage).toBe(33);

    // 6. Worker progresses to 'flashcard'
    await progressService.startStage(docId, orgId, "flashcard", 10);
    await progressService.updateProgress(docId, orgId, "flashcard", 5, 10);
    const activeRes4 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/generation/active`,
      cookies: { avana_session: sessionToken },
    });
    const activeBody4 = JSON.parse(activeRes4.payload);
    expect(activeBody4.items[0].stage).toBe("flashcard");
    expect(activeBody4.items[0].progress.percentage).toBe(50);

    // 7. Worker completes successfully
    await progressService.complete(docId, orgId);
    const activeRes5 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/generation/active`,
      cookies: { avana_session: sessionToken },
    });
    const activeBody5 = JSON.parse(activeRes5.payload);
    // Completed item is no longer in active generations (Header projection removes completed item)
    expect(activeBody5.items).toHaveLength(0);

    // Canonical progress store still contains the completed record
    const finalRecord = await progressService.getRecord(docId, orgId);
    expect(finalRecord?.status).toBe("completed");
  });

  it("Requirement 1: Deterministic Stale Detection - Safe reconciliation without deleting data", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: userId,
      originalName: "stuck-doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "key-stuck",
      status: "generating",
      pageCount: 4,
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

    // Simulate an abandoned generation (> 5 minutes threshold ago with no active worker/lease)
    const tenMinutesAgo = new Date(Date.now() - (DEFAULT_GENERATION_STALE_THRESHOLD_MS + 60000)).toISOString();
    await progressStore.updateMonotonic(docId, orgId, {
      status: "generating",
      stage: "lesson",
      progressCurrent: 1,
      progressTotal: 5,
      stageStartedAt: tenMinutesAgo,
      lastActivityAt: tenMinutesAgo,
    });

    // When GET /generation/active is called, it detects deterministic stale condition safely
    const activeRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/generation/active`,
      cookies: { avana_session: sessionToken },
    });
    expect(activeRes.statusCode).toBe(200);

    // The stuck doc was safely failed and marked with GENERATION_TIMEOUT_STALE
    const docInDb = await documentStore.findByIdForOrganization(docId, orgId);
    expect(docInDb?.status).toBe("extracted");
    expect(docInDb?.errorCode).toBe("GENERATION_TIMEOUT_STALE");

    // Progress record transitioned to failed
    const progressRecord = await progressStore.findByDocument(docId, orgId);
    expect(progressRecord?.status).toBe("failed");
  });

  it("Requirement 4: Safe and Idempotent Stop & Delete Operations", async () => {
    const docId = randomUUID() as DocumentId;
    const now = new Date().toISOString();
    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: userId,
      originalName: "stop-test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "key-stop",
      status: "generating",
      pageCount: 4,
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

    await progressService.startStage(docId, orgId, "lesson", 4);

    // 1. Stop generation for document
    const stopRes1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation/stop`,
      cookies: { avana_session: sessionToken },
    });
    expect(stopRes1.statusCode).toBe(200);
    expect(JSON.parse(stopRes1.payload).status).toBe("stopped");

    // 2. Stop again (Idempotency check)
    const stopRes2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation/stop`,
      cookies: { avana_session: sessionToken },
    });
    expect(stopRes2.statusCode).toBe(200);
    expect(JSON.parse(stopRes2.payload).status).toBe("stopped");

    // Document status safely reset to extracted (since no drafts)
    const docAfterStop = await documentStore.findByIdForOrganization(docId, orgId);
    expect(docAfterStop?.status).toBe("extracted");

    // 3. Delete generation
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation`,
      cookies: { avana_session: sessionToken },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.payload).status).toBe("deleted");

    // Document itself MUST NOT be deleted
    const docAfterDelete = await documentStore.findByIdForOrganization(docId, orgId);
    expect(docAfterDelete).not.toBeNull();
    expect(docAfterDelete?.deletedAt).toBeNull();
    expect(docAfterDelete?.status).toBe("extracted");

    // Progress reset to idle
    const progressAfterDelete = await progressStore.findByDocument(docId, orgId);
    expect(progressAfterDelete?.status).toBe("idle");
  });
});
