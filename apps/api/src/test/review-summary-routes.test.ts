// @ts-nocheck
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
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { OrganizationId, UserId } from "@avana/domain";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

describe("Review Summary HTTP Routes", () => {
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
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-rs-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    const auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    queue = new InMemoryGenerationQueue(generationJobStore);
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  async function buildTestApp() {
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
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      gateway: createModelGateway("mock"),
      auditService,
    });
    return app;
  }

  async function setupUserAndOrg(app: Awaited<ReturnType<typeof buildTestApp>>) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "student@example.com", name: "Student Reviewer" },
    });
    expect(res.statusCode).toBe(200);
    const token = extractSessionToken(res)!;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: "Medical Faculty" },
    });
    expect(orgRes.statusCode).toBe(201);
    const orgBody = JSON.parse(orgRes.body) as { organization: { id: string } };
    const organizationId = orgBody.organization.id as OrganizationId;

    const courseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e" as any;
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: courseId,
        organizationId,
        name: "فارماکولوژی کاربردی",
        subject: "داروشناسی",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
      },
      auditEvents: [],
    });

    return { token, organizationId, courseId };
  }

  it("generates and fetches Review Summary via dedicated endpoints", async () => {
    const app = await buildTestApp();
    const { token, organizationId, courseId } = await setupUserAndOrg(app);

    // Seed document with chunks directly in stores
    const now = new Date().toISOString();
    const docId = randomUUID() as any;
    const chunkId = randomUUID() as any;
    const ownerUserId = randomUUID() as UserId;
    await documentStore.create({
      id: docId,
      organizationId,
      courseId,
      ownerUserId,
      originalName: "cardio-summary.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: "c".repeat(64),
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 10,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await documentChunkStore.create({
      id: chunkId,
      documentId: docId,
      organizationId,
      sequence: 1,
      heading: "داروهای ضد فشار خون",
      content: "مهارکننده‌های ACE و مسدودکننده‌های گیرنده آنژیوتانسین II",
      startPage: 1,
      endPage: 5,
      tokenEstimate: 400,
      contentHash: "hash-chunk-1",
      createdAt: now,
    });

    // 1. Initial GET before generation returns content: null
    const getBeforeRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(getBeforeRes.statusCode).toBe(200);
    const getBeforeBody = JSON.parse(getBeforeRes.body);
    expect(getBeforeBody.content).toBeNull();

    // 2. POST to generate review summary
    const postRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: {
        "content-type": "application/json",
        cookie: `avana_session=${token}`,
      },
      payload: {},
    });
    expect(postRes.statusCode).toBe(200);
    const postBody = JSON.parse(postRes.body);
    expect(postBody.content).toBeDefined();
    expect(postBody.content.type).toBe("review_summary");
    expect(postBody.content.payload.kind).toBe("review_summary");
    expect(postBody.content.payload.estimatedReadingMinutes).toBeGreaterThanOrEqual(10);
    expect(postBody.content.payload.estimatedReadingMinutes).toBeLessThanOrEqual(15);
    expect(postBody.content.payload.sections.length).toBeGreaterThan(0);

    // 3. Subsequent GET returns the generated review summary
    const getAfterRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${docId}/review-summary`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(getAfterRes.statusCode).toBe(200);
    const getAfterBody = JSON.parse(getAfterRes.body);
    expect(getAfterBody.content.id).toBe(postBody.content.id);

    // 4. Org-scoped route also returns the same content
    const getOrgScopedRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/documents/${docId}/review-summary`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(getOrgScopedRes.statusCode).toBe(200);
    const getOrgScopedBody = JSON.parse(getOrgScopedRes.body);
    expect(getOrgScopedBody.content.id).toBe(postBody.content.id);
  });
});
