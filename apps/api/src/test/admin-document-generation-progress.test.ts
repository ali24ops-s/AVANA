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
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import {
  InMemoryGenerationProgressStore,
} from "../modules/generation/generation-progress-store.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import {
  type OrganizationId,
  type UserId,
  type DocumentId,
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

describe("Admin Documents API - Generation Progress Tracking", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let adminStore: InMemoryAdminStore;
  let storageProvider: LocalStorageProvider;
  let tmpDir: string;
  let app: ReturnType<typeof createApp>;

  let adminUserId: UserId;
  let orgId: OrganizationId;
  let adminToken: string;

  beforeEach(async () => {
    config = makeTestConfig();
    orgStore = new InMemoryOrganizationStore();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore(orgStore);
    courseStore = new InMemoryCourseStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    adminStore = new InMemoryAdminStore(
      userStore,
      orgStore,
      {
        courseStore,
        documentStore,
        generationProgressStore: progressStore,
      } as any,
    );

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-admin-prog-test-"));
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
      storageProvider,
      auditService,
      adminStore,
      generationProgressStore: progressStore,
      generationProgressService: progressService,
    });

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "admin@avana.org", password: "Password123!" },
    });
    adminToken = extractSessionToken(regRes) || "";
    const user = (regRes.json() as { user: { id: string } }).user;
    adminUserId = user.id as UserId;

    const userRec = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(user.id);
    if (userRec) {
      userRec.role = "platform_admin";
      userRec.globalRole = "platform_admin";
      orgStore.clearMembershipsForUser(user.id as UserId);
    }
    orgId = randomUUID() as OrganizationId;
  });

  it("should return documents with fallback generationProgress when no progress record exists", async () => {
    const docId = randomUUID() as DocumentId;
    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId: null,
      ownerUserId: adminUserId,
      originalName: "test-doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "test-key",
      status: "generating",
      pageCount: 5,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/documents",
      cookies: { avana_session: adminToken },
    });

    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.payload);
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe(docId);
    expect(body.documents[0].generationProgress).toBeDefined();
    expect(body.documents[0].generationProgress.status).toBe("generating");
  });

  it("should return detailed stage and progress in document list and detail APIs", async () => {
    const docId = randomUUID() as DocumentId;
    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId: null,
      ownerUserId: adminUserId,
      originalName: "pharmacology-chapter1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      storageKey: "test-key-2",
      status: "generating",
      pageCount: 10,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Start lesson stage with 4 sessions, and advance to session 2
    await progressService.startStage(docId, orgId, "lesson", 4);
    await progressService.updateProgress(docId, orgId, "lesson", 2, 4);

    // Test List API
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/documents",
      cookies: { avana_session: adminToken },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    const docFromList = listBody.documents.find((d: any) => d.id === docId);
    expect(docFromList).toBeDefined();
    expect(docFromList.generationProgress).toEqual({
      status: "generating",
      stage: "lesson",
      stageLabel: "تولید درسنامه",
      progress: {
        current: 2,
        total: 4,
        percentage: 50,
      },
      stageStartedAt: expect.any(String),
      lastActivityAt: expect.any(String),
      error: null,
    });

    // Test Detail API
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${docId}`,
      cookies: { avana_session: adminToken },
    });

    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.payload);
    expect(detailBody.id).toBe(docId);
    expect(detailBody.generationProgress).toEqual({
      status: "generating",
      stage: "lesson",
      stageLabel: "تولید درسنامه",
      progress: {
        current: 2,
        total: 4,
        percentage: 50,
      },
      stageStartedAt: expect.any(String),
      lastActivityAt: expect.any(String),
      error: null,
    });
  });
});
