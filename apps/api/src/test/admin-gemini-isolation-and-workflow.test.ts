import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type ModuleId,
  type OrganizationId,
  type UserId,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryGenerationChunkStore,
} from "../modules/generation/generation-chunk-store.js";
import {
  InMemoryGenerationProgressStore,
} from "../modules/generation/generation-progress-store.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "../modules/generation/gateway/types.js";
import {
  GenerationService,
  InMemoryGenerationQueue,
  ReviewService,
} from "../modules/generation/index.js";
import { processGenerationJob } from "../modules/generation/generation-processor.js";
import type { Job } from "bullmq";

describe("Admin Content Generation = Gemini ONLY Guarantee", () => {
  const systemOrgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const adminUser = randomUUID() as UserId;
  const studentUser = randomUUID() as UserId;

  const adminActor: Actor = { userId: adminUser, role: "platform_admin" };
  const studentActor: Actor = { userId: studentUser, role: "student" };

  let lessonStore: InMemoryLessonStore;
  let moduleStore: InMemoryModuleStore;
  let courseStore: InMemoryCourseStore;
  let organizationStore: InMemoryOrganizationStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let generationChunkStore: InMemoryGenerationChunkStore;
  let generationProgressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;

  let courseId: CourseId;
  let moduleId: ModuleId;
  let documentId: DocumentId;

  // Mock Gemini Gateway Tracker
  let geminiCalls: CompletionRequest[] = [];
  let geminiMockGateway: ModelGateway;

  // Mock DeepSeek (OpenRouter) Gateway Tracker
  let deepseekCalls: CompletionRequest[] = [];
  let deepseekMockGateway: ModelGateway;

  beforeEach(async () => {
    geminiCalls = [];
    deepseekCalls = [];

    geminiMockGateway = {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      complete: vi.fn().mockImplementation(async (req: CompletionRequest): Promise<CompletionResult> => {
        geminiCalls.push(req);
        // Dispatch mock JSON responses
        const promptText = req.messages.map((m) => m.content).join("\n");
        if (req.stage === "planning" || (req.jsonSchema && (req.jsonSchema as any).type === "content_plan")) {
          return {
            text: JSON.stringify({
              kind: "content_plan",
              syllabus: ["مقدمه", "فصل ۱"],
              majorConcepts: ["مفاهیم پایه"],
              highYieldFacts: ["نکته ۱"],
              sessionBlueprints: [
                {
                  index: 0,
                  title: "جلسه اول: کلیات",
                  description: "آشنایی با مبانی",
                  coreConcepts: ["مفهوم ۱"],
                  relevantChunkIds: ["chunk-1"],
                  estimatedMinutes: 10,
                },
                {
                  index: 1,
                  title: "جلسه دوم: فارماکوکینتیک",
                  description: "مباحث پیشرفته",
                  coreConcepts: ["مفهوم ۲"],
                  relevantChunkIds: ["chunk-1"],
                  estimatedMinutes: 15,
                },
              ],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 50, outputTokens: 100 },
            finishReason: "stop",
          };
        }
        if (req.stage === "review_summary" || (req.jsonSchema && (req.jsonSchema as any).type === "review_summary")) {
          return {
            text: JSON.stringify({
              kind: "review_summary",
              title: "خلاصه جامع فصل",
              overview: "مرور کلی و اهداف فصل اول",
              sections: [
                {
                  title: "جمع‌بندی فصل",
                  summaryMarkdown: "توضیحات کامل جمع‌بندی با Gemini.",
                  keyPoints: ["نکته کلیدی ۱", "نکته کلیدی ۲"],
                  citationChunkIds: ["chunk-1"],
                },
              ],
              finalTakeaways: ["جمع‌بندی نهایی"],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 50, outputTokens: 100 },
            finishReason: "stop",
          };
        }
        if (req.stage === "flashcard" || promptText.includes("flashcard")) {
          return {
            text: JSON.stringify({
              flashcards: [
                { front: "پرسش فلش‌کارت Gemini", back: "پاسخ فلش‌کارت Gemini", citationChunkIds: ["chunk-1"] },
              ],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 30, outputTokens: 60 },
            finishReason: "stop",
          };
        }
        if (req.stage === "quiz" || promptText.includes("quiz")) {
          return {
            text: JSON.stringify({
              quizzes: [
                {
                  question: "سؤال آزمون Gemini؟",
                  options: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
                  correctOptionIndex: 0,
                  explanation: "توضیح پاسخ",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 30, outputTokens: 60 },
            finishReason: "stop",
          };
        }
        if (req.stage === "lesson" || promptText.includes("lesson")) {
          return {
            text: JSON.stringify({
              title: "درس تولیدشده توسط Gemini",
              contentMarkdown: "# درس رسمی\nمحتوای درس با Gemini.",
              citationChunkIds: ["chunk-1"],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 40, outputTokens: 80 },
            finishReason: "stop",
          };
        }
        return {
          text: JSON.stringify({ success: true }),
          model: "gemini-3.5-flash-lite",
          usage: { inputTokens: 10, outputTokens: 20 },
          finishReason: "stop",
        };
      }),
    };

    deepseekMockGateway = {
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash-0731",
      complete: vi.fn().mockImplementation(async (req: CompletionRequest): Promise<CompletionResult> => {
        deepseekCalls.push(req);
        const promptText = req.messages.map((m) => m.content).join("\n");
        if (req.jsonSchema && (req.jsonSchema as any).type === "content_plan") {
          return {
            text: JSON.stringify({
              kind: "content_plan",
              syllabus: ["عمومی"],
              majorConcepts: ["مفاهیم"],
              highYieldFacts: ["نکات"],
              sessionBlueprints: [
                {
                  index: 0,
                  title: "جلسه عمومی",
                  description: "توضیحات",
                  coreConcepts: ["مفهوم ۱"],
                  relevantChunkIds: ["chunk-1"],
                  estimatedMinutes: 10,
                },
              ],
            }),
            model: "deepseek/deepseek-v4-flash-0731",
            usage: { inputTokens: 50, outputTokens: 100 },
            finishReason: "stop",
          };
        }
        if (promptText.includes("lesson") || (req.jsonSchema as any)?.type === "lesson_batch") {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 0,
                  title: "درس DeepSeek Batch",
                  contentMarkdown: "# درس عمومی با DeepSeek",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            }),
            model: "deepseek/deepseek-v4-flash-0731",
            usage: { inputTokens: 40, outputTokens: 80 },
            finishReason: "stop",
          };
        }
        return {
          text: JSON.stringify({
            results: [{ sessionIndex: 0, title: "محتوای عمومی", contentMarkdown: "# محتوا", citationChunkIds: ["chunk-1"] }],
          }),
          model: "deepseek/deepseek-v4-flash-0731",
          usage: { inputTokens: 10, outputTokens: 20 },
          finishReason: "stop",
        };
      }),
    };

    lessonStore = new InMemoryLessonStore();
    moduleStore = new InMemoryModuleStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(organizationStore);
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    generationChunkStore = new InMemoryGenerationChunkStore();
    generationProgressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(generationProgressStore);
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();

    await organizationStore.createWithAdminMembership({
      organization: {
        id: systemOrgId,
        name: "AVANA Official",
        slug: "avana-official",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-admin",
        organizationId: systemOrgId,
        userId: adminUser,
        role: "platform_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    organizationStore.addMembership({
      id: "mem-student",
      organizationId: systemOrgId,
      userId: studentUser,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی ۱ رسمی",
        subject: "پزشکی",
        examDate: null,
        isOfficial: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل اول",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    documentId = randomUUID() as DocumentId;
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      filename: "official-chapter.pdf",
      storageKey: "official/doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      pageCount: 5,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await documentChunkStore.createMany([
      {
        id: "chunk-1" as any,
        documentId,
        chunkIndex: 0,
        content: "محتوای علمی رسمی داروسازی و مبانی فارماکولوژی.",
        pageNumber: 1,
        tokenCount: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  function createServices() {
    const adminService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      geminiMockGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      organizationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      systemOrgId,
      generationChunkStore,
      generationJobStore,
      progressService,
    );

    const userService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      deepseekMockGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      organizationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      systemOrgId,
      generationChunkStore,
      generationJobStore,
      progressService,
    );

    return { adminService, userService };
  }

  // -------------------------------------------------------------------------
  // A — Admin Initial Generation: Gemini ONLY, no DeepSeek
  // -------------------------------------------------------------------------
  it("Scenario A: Admin initial generation strictly uses Gemini and zero DeepSeek calls", async () => {
    const { adminService } = createServices();

    const result = await adminService.generateForDocument(adminActor, systemOrgId, documentId, {
      types: ["lesson", "flashcard", "quiz"],
      courseId,
      generationContext: "admin",
    });

    expect(result.contents.length).toBeGreaterThan(0);
    expect(geminiCalls.length).toBeGreaterThanOrEqual(1);
    expect(deepseekCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // B — Admin Regenerate via ReviewService + BullMQ Worker: Gemini ONLY
  // -------------------------------------------------------------------------
  it("Scenario B: Admin regenerate via ReviewService and Worker processor executes strictly with Gemini", async () => {
    const { adminService, userService } = createServices();

    // 1. Initial draft created
    await adminService.generateForDocument(adminActor, systemOrgId, documentId, {
      types: ["lesson"],
      courseId,
      generationContext: "admin",
    });
    geminiCalls = [];

    const existingDrafts = await generatedContentStore.listByDocument(documentId, systemOrgId);
    const lessonDraft = existingDrafts.find((d) => d.type === "lesson");
    expect(lessonDraft).toBeDefined();

    // 2. Queue wired with both services
    const queue = new InMemoryGenerationQueue(generationJobStore, {
      adminGenerationService: adminService,
      userGenerationService: userService,
    });

    const reviewService = new ReviewService(
      generatedContentStore,
      generatedContentCitationStore,
      documentStore,
      documentChunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      queue,
    );

    // 3. Admin clicks "Regenerate"
    const regenResult = await reviewService.regenerateContent(adminActor, systemOrgId, lessonDraft!.id);
    expect(regenResult.status).toBe("regenerating");

    // 4. Simulate BullMQ worker processing the regenerate job
    const mockBullJob = {
      id: regenResult.job_id,
      data: {
        actorUserId: adminActor.userId,
        actorRole: adminActor.role,
        organizationId: systemOrgId,
        documentId,
        courseId,
        types: ["lesson"],
        generationContext: "admin",
        force: true,
      },
    } as unknown as Job;

    await processGenerationJob(mockBullJob, {
      adminGenerationService: adminService,
      userGenerationService: userService,
      generationJobStore,
    });

    // Verify Gemini was called for regenerate and DeepSeek was NEVER called
    expect(geminiCalls.length).toBeGreaterThanOrEqual(1);
    expect(deepseekCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // C — Admin Continue after Partial Generation: Loads Cache + Gemini ONLY
  // -------------------------------------------------------------------------
  it("Scenario C: Admin continue after partial generation reuses cached chunks and completes remaining with Gemini", async () => {
    const { adminService, userService } = createServices();

    // 1. Pre-populate partial cached chunk for session 0 in generation_chunks
    await generationChunkStore.upsert({
      id: randomUUID() as any,
      organizationId: systemOrgId,
      documentId,
      courseId,
      stage: "lesson",
      chunkIndex: 0,
      chunkKey: "lesson:0",
      status: "completed",
      payload: {
        title: "درس جلسه اول (از کش لود شده)",
        contentMarkdown: "# محتوای کش شده",
        citationChunkIds: ["chunk-1"],
      },
      tokenUsage: { inputTokens: 40, outputTokens: 80 },
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: null,
      completedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create job record in jobStore
    const jobId = "job-continue-admin" as any;
    await generationJobStore.create({
      id: jobId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: null,
      jobId,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    });

    // 2. Run Generation via Processor with context=admin
    const mockBullJob = {
      id: jobId,
      data: {
        actorUserId: adminActor.userId,
        actorRole: adminActor.role,
        organizationId: systemOrgId,
        documentId,
        courseId,
        types: ["lesson"],
        generationContext: "admin",
      },
    } as unknown as Job;

    await processGenerationJob(mockBullJob, {
      adminGenerationService: adminService,
      userGenerationService: userService,
      generationJobStore,
    });

    // Session 1 generated with Gemini, zero DeepSeek calls
    expect(geminiCalls.length).toBeGreaterThanOrEqual(1);
    expect(deepseekCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // D — Admin Retry after Gemini error: Gemini ONLY, never DeepSeek
  // -------------------------------------------------------------------------
  it("Scenario D: Admin retry after Gemini error retries with Gemini and never falls back to DeepSeek", async () => {
    let attempts = 0;
    const failingGeminiGateway: ModelGateway = {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      complete: vi.fn().mockImplementation(async (req: CompletionRequest): Promise<CompletionResult> => {
        geminiCalls.push(req);
        attempts++;
        if (attempts === 1) {
          throw new DomainError("service_unavailable", "Gemini 503 transient error");
        }
        if (req.jsonSchema && (req.jsonSchema as any).type === "content_plan") {
          return {
            text: JSON.stringify({
              kind: "content_plan",
              syllabus: ["مقدمه"],
              majorConcepts: ["مفاهیم"],
              highYieldFacts: ["نکات"],
              sessionBlueprints: [{ index: 0, title: "جلسه ۱", description: "", coreConcepts: [], relevantChunkIds: ["chunk-1"], estimatedMinutes: 10 }],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 50, outputTokens: 100 },
            finishReason: "stop",
          };
        }
        return {
          text: JSON.stringify({
            title: "درس تولیدشده پس از retry",
            contentMarkdown: "# محتوا",
            citationChunkIds: ["chunk-1"],
          }),
          model: "gemini-3.5-flash-lite",
          usage: { inputTokens: 40, outputTokens: 80 },
          finishReason: "stop",
        };
      }),
    };

    const adminService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      failingGeminiGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      organizationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      systemOrgId,
      generationChunkStore,
      generationJobStore,
    );

    // First attempt fails on Gemini
    await expect(
      adminService.generateForDocument(adminActor, systemOrgId, documentId, {
        types: ["lesson"],
        courseId,
        generationContext: "admin",
      }),
    ).rejects.toThrow("Gemini 503");

    expect(deepseekCalls.length).toBe(0);

    // Second attempt (retry) succeeds with Gemini
    await adminService.generateForDocument(adminActor, systemOrgId, documentId, {
      types: ["lesson"],
      courseId,
      generationContext: "admin",
    });

    expect(geminiCalls.length).toBe(3);
    expect(deepseekCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // E — Gemini Quota / Rate-limit: Propagates error, zero DeepSeek fallback
  // -------------------------------------------------------------------------
  it("Scenario E: Gemini 429 quota error propagates as DomainError with zero DeepSeek fallback", async () => {
    const quotaGeminiGateway: ModelGateway = {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      complete: vi.fn().mockImplementation(async (req: CompletionRequest) => {
        geminiCalls.push(req);
        throw new DomainError("rate_limit_exceeded", "Gemini quota exceeded (429)");
      }),
    };

    const adminService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      quotaGeminiGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      organizationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      systemOrgId,
      generationChunkStore,
      generationJobStore,
    );

    await expect(
      adminService.generateForDocument(adminActor, systemOrgId, documentId, {
        types: ["lesson"],
        courseId,
        generationContext: "admin",
      }),
    ).rejects.toThrow("Gemini quota exceeded");

    expect(deepseekCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // F, G, H — Admin Stage 2 (Lessons), Stage 3 (Flashcards), Stage 4 (Quizzes)
  // -------------------------------------------------------------------------
  it("Scenario F, G, H: Admin Stage 2, 3, 4 strictly call Gemini without DeepSeek Batching", async () => {
    const { adminService } = createServices();

    await adminService.generateForDocument(adminActor, systemOrgId, documentId, {
      types: ["lesson", "flashcard", "quiz"],
      courseId,
      generationContext: "admin",
    });

    // Assert that every request made went to Gemini
    expect(geminiCalls.length).toBeGreaterThanOrEqual(4); // Stage 1 planning + 2 lessons + flashcard + quiz
    expect(deepseekCalls.length).toBe(0);

    for (const call of geminiCalls) {
      expect(call.jsonSchema).not.toEqual({ type: "lesson_batch" });
      expect(call.jsonSchema).not.toEqual({ type: "flashcard_batch" });
      expect(call.jsonSchema).not.toEqual({ type: "quiz_batch" });
    }
  });

  // -------------------------------------------------------------------------
  // I — Admin Review Summary: Gemini ONLY
  // -------------------------------------------------------------------------
  it("Scenario I: Admin review summary strictly uses Gemini", async () => {
    const { adminService } = createServices();

    // First generate lessons so Stage 5 review summary has prerequisite lessons
    await adminService.generateForDocument(adminActor, systemOrgId, documentId, {
      types: ["lesson"],
      courseId,
      generationContext: "admin",
    });
    geminiCalls = [];

    const summary = await adminService.generateReviewSummaryDirect(
      adminActor,
      systemOrgId,
      documentId,
      {
        courseId,
        generationContext: "admin",
      },
    );

    expect(summary.type).toBe("review_summary");
    expect(geminiCalls.length).toBe(1);
    expect(deepseekCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // J — Public Regression: Public generation continues to use DeepSeek Batching
  // -------------------------------------------------------------------------
  it("Scenario J: Public generation strictly routes to OpenRouter/DeepSeek and preserves batching", async () => {
    const { adminService, userService } = createServices();

    const jobId = "job-public-student" as any;
    await generationJobStore.create({
      id: jobId,
      organizationId: systemOrgId,
      documentId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: null,
      jobId,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    });

    const mockBullJob = {
      id: jobId,
      data: {
        actorUserId: studentActor.userId,
        actorRole: studentActor.role,
        organizationId: systemOrgId,
        documentId,
        courseId,
        types: ["lesson"],
        generationContext: "public",
      },
    } as unknown as Job;

    await processGenerationJob(mockBullJob, {
      adminGenerationService: adminService,
      userGenerationService: userService,
      generationJobStore,
    });

    expect(deepseekCalls.length).toBeGreaterThanOrEqual(1);
    expect(geminiCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // K — Central Invariant Guard: Fails immediately if Admin context is passed to DeepSeek gateway
  // -------------------------------------------------------------------------
  it("Scenario K: Central guard throws immediately when generationContext='admin' is passed to a DeepSeek service", async () => {
    const { userService } = createServices();

    // Attempting to run with generationContext: "admin" on userService (which has DeepSeek gateway)
    await expect(
      userService.generateForDocument(adminActor, systemOrgId, documentId, {
        types: ["lesson"],
        courseId,
        generationContext: "admin",
      }),
    ).rejects.toThrow("Admin generation invariant violation");

    // Also verify generateReviewSummaryDirect guard
    await expect(
      userService.generateReviewSummaryDirect(adminActor, systemOrgId, documentId, {
        courseId,
        generationContext: "admin",
      }),
    ).rejects.toThrow("Admin generation invariant violation");
  });
});
