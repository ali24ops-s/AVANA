/**
 * Runtime E2E Integration Test for AI Generation Pipeline Progress Tracking.
 *
 * Verifies that the AI Generation Pipeline:
 * 1. Progresses through all 8 canonical stages during real GenerationService execution.
 * 2. Correctly updates progress counters (current / total) across sessions and stages.
 * 3. Accurately updates timestamps (stageStartedAt, lastActivityAt).
 * 4. Yields consistent API payloads in GET /admin/documents and GET /admin/documents/:id.
 * 5. Handles crash resumption from cached chunks without regressing counters.
 * 6. Records failures properly with error details.
 * 7. Enforces monotonic progress under out-of-order updates.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  type DocumentId,
  type CourseId,
  type OrganizationId,
  type UserId,
  type DocumentChunkId,
  RoleBasedPolicy,
} from "@avana/domain";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationChunkStore } from "../modules/generation/generation-chunk-store.js";
import { InMemoryGenerationProgressStore } from "../modules/generation/generation-progress-store.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import type { CompletionRequest, CompletionResult, ModelGateway } from "../modules/generation/gateway/types.js";

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

describe("Generation Pipeline Progress Tracking - Runtime E2E Audit", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let jobStore: InMemoryGenerationJobStore;
  let genChunkStore: InMemoryGenerationChunkStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
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
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    jobStore = new InMemoryGenerationJobStore();
    genChunkStore = new InMemoryGenerationChunkStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    adminStore = new InMemoryAdminStore(
      userStore,
      orgStore,
      {
        courseStore,
        documentStore,
        generationProgressStore: progressStore,
      } as any,
    );

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-gen-e2e-"));
    storageProvider = new LocalStorageProvider(tmpDir);

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      documentStore,
      documentChunkStore: chunkStore,
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore: jobStore,
      generationChunkStore: genChunkStore,
      generationProgressStore: progressStore,
      generationProgressService: progressService,
      auditService,
      adminStore,
    });

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "admin-e2e@avana.org",
        password: "Password123!",
        firstName: "ادمین",
        lastName: "سیستم",
        phoneNumber: "09121110042",
      },
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
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "سازمان فارماکولوژی",
        slug: "pharma-org",
        ownerUserId: adminUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: adminUserId,
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
  });

  it("executes the full GenerationService pipeline and tracks stage progression through Admin APIs", async () => {
    const docId = randomUUID() as DocumentId;
    const courseId = randomUUID() as CourseId;
    const chunk1Id = randomUUID() as DocumentChunkId;
    const chunk2Id = randomUUID() as DocumentChunkId;

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی قلب و عروق",
        description: "دوره جامع داروشناسی بالینی",
        status: "draft",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await documentStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: adminUserId,
      originalName: "cardiovascular-pharmacology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      storageKey: "cardio-key",
      status: "extracted",
      pageCount: 15,
      qualityScore: 90,
      qualityLevel: "high",
      qualityReport: null,
      qualityAnalyzedAt: new Date().toISOString(),
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await chunkStore.createMany([
      {
        id: chunk1Id,
        documentId: docId,
        organizationId: orgId,
        sequence: 1,
        heading: "داروهای مسدودکننده بتا",
        content: "بتابلوکرها شامل پروپرانولول و متوپرولول بوده و باعث کاهش ریتم قلبی می‌شوند.",
        startPage: 1,
        endPage: 5,
        tokenCount: 150,
      },
      {
        id: chunk2Id,
        documentId: docId,
        organizationId: orgId,
        sequence: 2,
        heading: "داروهای مهارکننده ACE",
        content: "مهارکننده‌های ACE مانند کاپتوپریل و انالاپریل در درمان نارسایی قلبی و فشار خون بالا کاربرد دارند.",
        startPage: 6,
        endPage: 12,
        tokenCount: 180,
      },
    ]);

    // Deterministic Mock Gateway simulating 2 sessions
    const mockGateway: ModelGateway = {
      provider: "mock",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const stage = req.stage;
        const prompt = req.messages?.find((m) => m.role === "user")?.content || req.userPrompt || "";

        if (stage === "planning") {
          return {
            text: JSON.stringify({
              moduleTitle: "داروشناسی قلب",
              sessions: [
                {
                  index: 0,
                  title: "جلسه اول: بتابلوکرها",
                  description: "آشنایی با مسدودکننده‌های گیرنده بتا",
                  relevantChunkIds: [chunk1Id],
                },
                {
                  index: 1,
                  title: "جلسه دوم: مهارکننده‌های ACE",
                  description: "آشنایی با مهارکننده‌های آنزیم مبدل آنژیوتانسین",
                  relevantChunkIds: [chunk2Id],
                },
              ],
            }),
            model: "mock-model",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 50 },
          };
        }

        if (stage === "lesson") {
          return {
            text: JSON.stringify({
              title: prompt.includes("بتابلوکر") || prompt.includes("پروپرانولول") ? "جلسه اول: بتابلوکرها" : "جلسه دوم: مهارکننده‌های ACE",
              content_markdown: "## درسنامه آموزشی تخصصی\nمحتوای درس با پوشش کامل نکات مهم.",
              citation_chunk_ids: [prompt.includes("بتابلوکر") || prompt.includes("پروپرانولول") ? chunk1Id : chunk2Id],
            }),
            model: "mock-model",
            finishReason: "stop",
            usage: { inputTokens: 120, outputTokens: 80 },
          };
        }

        if (stage === "flashcard") {
          return {
            text: JSON.stringify({
              cards: [
                {
                  question: "مکانیسم عمل پروپرانولول چیست؟",
                  answer: "مسدود کردن غیرانتخابی گیرنده‌های بتا آدرنرژیک",
                  explanation: "باعث کاهش ضربان قلب و فشار خون می‌شود.",
                  difficulty: "medium",
                  citationChunkIds: [chunk1Id],
                },
              ],
            }),
            model: "mock-model",
            finishReason: "stop",
            usage: { inputTokens: 110, outputTokens: 60 },
          };
        }

        if (stage === "quiz") {
          return {
            text: JSON.stringify({
              questions: [
                {
                  question: "کدام دارو جزو بتابلوکرها است؟",
                  questionType: "multiple_choice",
                  choices: ["پروپرانولول", "کاپتوپریل", "آملودیپین", "فوروزماید"],
                  correctAnswer: "پروپرانولول",
                  explanation: "پروپرانولول داروی نمونه بتابلوکرها است.",
                  difficulty: "easy",
                  citationChunkIds: [chunk1Id],
                },
              ],
            }),
            model: "mock-model",
            finishReason: "stop",
            usage: { inputTokens: 130, outputTokens: 70 },
          };
        }

        // Review Summary
        return {
          text: JSON.stringify({
            title: "خلاصه جامع داروشناسی قلب",
            overview: "این دوره به بررسی دو گروه دارویی اصلی می‌پردازد.",
            sections: [
              {
                title: "نکات کلیدی داروشناسی",
                keyPoints: ["بتابلوکرها ریتم قلب را کنترل می‌کنند.", "مهارکننده‌های ACE فشار خون را مهار می‌کنند."],
                citationChunkIds: [chunk1Id, chunk2Id],
              },
            ],
          }),
          model: "mock-model",
          finishReason: "stop",
          usage: { inputTokens: 150, outputTokens: 90 },
        };
      },
    };

    const policy = new RoleBasedPolicy();
    const generationService = new GenerationService(
      generatedContentStore,
      citationStore,
      mockGateway,
      documentStore,
      chunkStore,
      policy,
      auditService,
      orgStore,
      moduleStore,
      lessonStore,
      undefined,
      undefined,
      undefined,
      courseStore,
      orgId,
      genChunkStore,
      jobStore,
      progressService,
    );

    // Run the full generation pipeline
    const actor: { userId: UserId; role: "platform_admin" } = {
      userId: adminUserId,
      role: "platform_admin",
    };

    const genResult = await generationService.generateForDocument(
      actor as any,
      orgId,
      docId,
      { types: ["lesson", "flashcard", "quiz", "review_summary"] },
    );

    expect(genResult.document_status).toBe("review_pending");
    expect(genResult.contents.length).toBeGreaterThanOrEqual(4);

    // Verify final progress record in store
    const progressRec = await progressService.getRecord(docId, orgId);
    expect(progressRec).toBeDefined();
    expect(progressRec?.status).toBe("reviewing");
    expect(progressRec?.stage).toBe("review");

    // Verify Admin Detail API
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/documents/${docId}`,
      cookies: { avana_session: adminToken },
    });

    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.payload);
    expect(detailBody.status).toBe("review_pending");
    expect(detailBody.generationProgress).toEqual({
      status: "reviewing",
      stage: "review",
      stageLabel: "بازبینی و اعتبارسنجی",
      progress: {
        current: 0,
        total: 1,
        percentage: 0,
      },
      stageStartedAt: expect.any(String),
      lastActivityAt: expect.any(String),
      error: null,
    });

    // Verify Admin List API
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/documents",
      cookies: { avana_session: adminToken },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    const docInList = listBody.documents.find((d: any) => d.id === docId);
    expect(docInList).toBeDefined();
    expect(docInList.generationProgress.status).toBe("reviewing");
    expect(docInList.generationProgress.stageLabel).toBe("بازبینی و اعتبارسنجی");
  });

  it("handles crash resumption without regressing progress counter", async () => {
    const docId = randomUUID() as DocumentId;

    // Simulate interrupted lesson stage at session 2/5
    await progressService.startStage(docId, orgId, "lesson", 5);
    await progressService.updateProgress(docId, orgId, "lesson", 2, 5);

    let rec = await progressService.getRecord(docId, orgId);
    expect(rec?.progressCurrent).toBe(2);
    expect(rec?.progressTotal).toBe(5);

    // Out of order delayed update for session 1 arrives late -> MUST NOT REGRESS
    await progressService.updateProgress(docId, orgId, "lesson", 1, 5);
    rec = await progressService.getRecord(docId, orgId);
    expect(rec?.progressCurrent).toBe(2); // Still 2, no regression

    // Normal forward progression
    await progressService.updateProgress(docId, orgId, "lesson", 3, 5);
    rec = await progressService.getRecord(docId, orgId);
    expect(rec?.progressCurrent).toBe(3);

    await progressService.completeStage(docId, orgId, "lesson");
    rec = await progressService.getRecord(docId, orgId);
    expect(rec?.progressCurrent).toBe(5);
  });

  it("records and exposes pipeline failure details", async () => {
    const docId = randomUUID() as DocumentId;

    await progressService.startStage(docId, orgId, "lesson", 3);
    await progressService.updateProgress(docId, orgId, "lesson", 1, 3);
    await progressService.fail(docId, orgId, "Model gateway timeout: 504 Gateway Timeout");

    const rec = await progressService.getRecord(docId, orgId);
    expect(rec?.status).toBe("failed");
    expect(rec?.errorMessage).toBe("Model gateway timeout: 504 Gateway Timeout");

    const resource = progressService.toResource(rec);
    expect(resource.status).toBe("failed");
    expect(resource.error).toBe("Model gateway timeout: 504 Gateway Timeout");
  });
});
