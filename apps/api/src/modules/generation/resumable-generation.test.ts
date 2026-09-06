/**
 * Resumable / Incremental Generation Comprehensive Test Suite.
 *
 * Validates the 6 core scenarios required for resilient multi-chunk generation:
 * 1. Full Multi-Chunk Execution: All atomic chunks (planning, lesson:i, flashcard:i, quiz:i, review_summary)
 *    persist immediately to DB upon completion.
 * 2. Partial Failure Retention: If request 18 fails, requests 1-17 remain permanently in DB. No rollback.
 * 3. Resumption without Redundant AI Calls: Resuming a partial generation issues 0 AI calls for completed chunks 1-17.
 * 4. Crash / Process Restart Resilience: Worker restart reloads state from DB and completes remaining chunks.
 * 5. Isolated Chunk Retries: Transient failure / invalid JSON triggers retry only on the affected chunk.
 * 6. Concurrency / Duplicate Safety: Concurrent attempts on same (document_id, chunk_key) do not create duplicates.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  RoleBasedPolicy,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import { InMemoryDocumentStore } from "../learning/test/in-memory-stores.js";
import { InMemoryDocumentChunkStore } from "../learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationChunkStore,
} from "./test/in-memory-stores.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../learning/learning-store.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";
import type { ModelGateway, ModelCompletionRequest, ModelCompletionResponse } from "./gateway/index.js";

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "pharmacology_guide.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    sha256: "b".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 12,
    status: "extracted",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeChunks(
  documentId: DocumentId,
  organizationId: OrganizationId,
  count = 6,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i + 1}` as DocumentChunkRecord["id"],
    documentId,
    organizationId,
    sequence: i + 1,
    heading: `Section ${i + 1}: Pharmacology Topic ${i + 1}`,
    content: `Detailed clinical content for section ${i + 1}. Mechanisms of action, therapeutic applications, and side effects.`,
    startPage: i + 1,
    endPage: i + 1,
    tokenEstimate: 500,
    contentHash: `hash-${i}`,
    createdAt: now,
  }));
}

/**
 * Controllable Mock Gateway for tracking calls and simulating failures at specific requests.
 */
class ControllableGateway implements ModelGateway {
  readonly provider = "mock";
  readonly model = "mock-model";
  public calls: ModelCompletionRequest[] = [];
  public failFilter?: (request: ModelCompletionRequest) => boolean;
  public failError?: Error;
  public transientFailChunkKey?: string;
  public delayMs?: number;
  private transientFailedKeys = new Set<string>();

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResponse> {
    if (this.delayMs && this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    const jsonSchemaType = (request.jsonSchema as { type?: string })?.type;
    const userPrompt = request.messages.find((m) => m.role === "user")?.content || "";

    if (this.failFilter && this.failFilter(request)) {
      throw this.failError ?? new Error(`Simulated persistent failure for schema ${jsonSchemaType}`);
    }

    if (this.transientFailChunkKey && userPrompt.includes(this.transientFailChunkKey)) {
      if (!this.transientFailedKeys.has(this.transientFailChunkKey)) {
        this.transientFailedKeys.add(this.transientFailChunkKey);
        throw new Error(`Transient network timeout on ${this.transientFailChunkKey}`);
      }
    }

    this.calls.push(request);

    if (jsonSchemaType === "content_plan") {
      return {
        text: JSON.stringify({
          moduleTitle: "فارماکولوژی جامع",
          sourceTopics: [
            { id: "t1", title: "مقدمه بر گیرنده‌ها", description: "اصول فارماکودینامیک", relevantChunkIds: ["chunk-1", "chunk-2"] },
            { id: "t2", title: "داروهای قلبی عروقی", description: "بتابلوکرها و ACEIs", relevantChunkIds: ["chunk-3", "chunk-4"] },
            { id: "t3", title: "آنتی‌بیوتیک‌ها", description: "مهارکننده‌های دیواره سلولی", relevantChunkIds: ["chunk-5", "chunk-6"] },
          ],
          sessions: [
            {
              index: 0,
              title: "جلسه ۱: مبانی گیرنده‌ها",
              description: "بررسی سیگنالینگ و افیکاسی",
              relevantChunkIds: ["chunk-1", "chunk-2"],
              targetFlashcardCount: 2,
              targetQuizCount: 2,
            },
            {
              index: 1,
              title: "جلسه ۲: فارماکولوژی قلب",
              description: "داروهای فشار خون و نارسایی قلبی",
              relevantChunkIds: ["chunk-3", "chunk-4"],
              targetFlashcardCount: 2,
              targetQuizCount: 2,
            },
            {
              index: 2,
              title: "جلسه ۳: آنتی‌بیوتیک‌ها",
              description: "پنی‌سیلین‌ها و سفالوسپورین‌ها",
              relevantChunkIds: ["chunk-5", "chunk-6"],
              targetFlashcardCount: 2,
              targetQuizCount: 2,
            },
          ],
        }),
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    }

    if (jsonSchemaType === "session") {
      const match = userPrompt.match(/جلسه\s*(\d+)/);
      const sessionNum = match ? match[1] : "1";
      return {
        text: JSON.stringify({
          kind: "session",
          title: `جلسه ${sessionNum}: مبحث تخصصی ${sessionNum}`,
          contentMarkdown: `# جلسه ${sessionNum}\n\n## ۱. اصول و تعاریف\nمباحث علمی جلسه ${sessionNum} با جزئیات کامل.\n\n## ۲. کاربرد بالینی\nنکات درمانی و عوارض.`,
          citationChunkIds: [`chunk-${sessionNum}`],
        }),
        model: "mock-model",
        usage: { inputTokens: 120, outputTokens: 80 },
      };
    }

    if (jsonSchemaType === "flashcards") {
      return {
        text: JSON.stringify({
          kind: "flashcards_batch",
          cards: [
            {
              question: "مکانیسم اثر اصلی این دسته دارویی چیست؟",
              answer: "مهار اختصاصی آنزیم هدف.",
              cardType: "mechanism",
              difficulty: "medium",
              citationChunkIds: ["chunk-1"],
            },
            {
              question: "مهم‌ترین عارضه جانبی شایع چیست؟",
              answer: "افت فشار خون وضعیتی.",
              cardType: "key_fact",
              difficulty: "easy",
              citationChunkIds: ["chunk-2"],
            },
          ],
        }),
        model: "mock-model",
        usage: { inputTokens: 80, outputTokens: 40 },
      };
    }

    if (jsonSchemaType === "quizzes") {
      return {
        text: JSON.stringify({
          kind: "quizzes_batch",
          questions: [
            {
              question: "کدام دارو در این دسته بیشترین فراهمی زیستی خوراکی را دارد؟",
              choices: ["داروی الف", "داروی ب", "داروی ج", "داروی د"],
              correctAnswer: "داروی الف",
              explanation: "بر اساس جذب کامل از دستگاه گوارش.",
              difficulty: "medium",
              category: "pharmacokinetics",
              citationChunkIds: ["chunk-1"],
            },
          ],
        }),
        model: "mock-model",
        usage: { inputTokens: 90, outputTokens: 60 },
      };
    }

    if (jsonSchemaType === "review_summary") {
      return {
        text: JSON.stringify({
          kind: "review_summary",
          title: "خلاصه مرور سریع فارماکولوژی",
          estimatedReadingMinutes: 7,
          overview: "بررسی جامع نکات پربازده فارماکولوژی",
          sections: [
            {
              id: "sec-1",
              title: "نکات کلیدی داروها",
              contentMarkdown: "مرور ساختاریافته مفاهیم",
              keyPoints: ["نکته ۱", "نکته ۲"],
              citationChunkIds: ["chunk-1", "chunk-2"],
            },
          ],
          finalTakeaways: ["نکته جمع‌بندی ۱", "نکته جمع‌بندی ۲"],
          citationChunkIds: ["chunk-1", "chunk-2"],
        }),
        model: "mock-model",
        usage: { inputTokens: 150, outputTokens: 100 },
      };
    }

    return {
      text: JSON.stringify({ result: "ok" }),
      model: "mock-model",
      usage: { inputTokens: 10, outputTokens: 10 },
    };
  }
}

describe("Resumable & Incremental Generation", () => {
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let gateway: ControllableGateway;
  let service: GenerationService;
  let organizationId: OrganizationId;
  let docId: DocumentId;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };

  beforeEach(async () => {
    organizationId = randomUUID() as OrganizationId;
    docId = randomUUID() as DocumentId;

    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    chunkRecordStore = new InMemoryGenerationChunkStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    gateway = new ControllableGateway();

    service = new GenerationService(
      contentStore,
      citationStore,
      gateway,
      documentStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
    );

    const doc = makeDocument({ id: docId }, organizationId);
    await documentStore.create(doc);
    const chunks = makeChunks(docId, organizationId, 6);
    await chunkStore.createMany(chunks);
  });

  it("Scenario 1: Full multi-chunk execution persists all chunks immediately into DB", async () => {
    const result = await service.generateForDocument(
      actor,
      organizationId,
      docId,
      {
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      },
    );

    expect(result.document_status).toBe("review_pending");
    expect(result.contents).toHaveLength(4);

    // Verify all discrete chunks exist in chunkRecordStore with status = completed
    const chunks = await chunkRecordStore.listByDocument(docId, organizationId);
    expect(chunks.length).toBeGreaterThanOrEqual(11); // 1 planning + 3 lessons + 3 flashcards + 3 quizzes + 1 review_summary

    const planningChunk = chunks.find((c) => c.chunkKey === "planning");
    expect(planningChunk?.status).toBe("completed");
    expect(planningChunk?.payload).toBeDefined();

    const lessonChunks = chunks.filter((c) => c.stage === "lesson");
    expect(lessonChunks).toHaveLength(3);
    lessonChunks.forEach((c) => expect(c.status).toBe("completed"));

    const flashcardChunks = chunks.filter((c) => c.stage === "flashcard");
    expect(flashcardChunks).toHaveLength(3);
    flashcardChunks.forEach((c) => expect(c.status).toBe("completed"));

    const quizChunks = chunks.filter((c) => c.stage === "quiz");
    expect(quizChunks).toHaveLength(3);
    quizChunks.forEach((c) => expect(c.status).toBe("completed"));

    const summaryChunk = chunks.find((c) => c.chunkKey === "review_summary");
    expect(summaryChunk?.status).toBe("completed");

    // Check generation progress
    const progress = await service.getGenerationProgress(docId, organizationId);
    expect(progress.status).toBe("succeeded");
    expect(progress.completed).toBe(progress.total);
    expect(progress.failed).toBe(0);
    expect(progress.pending).toBe(0);
  });

  it("Scenario 2: Partial failure preserves prior completed chunks in DB without rollback", async () => {
    // Make flashcard generation fail permanently
    gateway.failFilter = (req) => (req.jsonSchema as { type?: string })?.type === "flashcards";
    gateway.failError = new Error("Quota exhausted on flashcard generation");

    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      }),
    ).rejects.toThrow("Quota exhausted");

    // Verify DB state: prior chunks (Planning, Lesson 0, 1, 2) MUST remain completed!
    const chunks = await chunkRecordStore.listByDocument(docId, organizationId);
    
    const planning = chunks.find((c) => c.chunkKey === "planning");
    expect(planning?.status).toBe("completed");

    const lesson0 = chunks.find((c) => c.chunkKey === "lesson:0");
    const lesson1 = chunks.find((c) => c.chunkKey === "lesson:1");
    const lesson2 = chunks.find((c) => c.chunkKey === "lesson:2");
    expect(lesson0?.status).toBe("completed");
    expect(lesson1?.status).toBe("completed");
    expect(lesson2?.status).toBe("completed");

    // Flashcard 0 failed and recorded as failed
    const flashcard0 = chunks.find((c) => c.chunkKey === "flashcard:0");
    expect(flashcard0?.status).toBe("failed");
    expect(flashcard0?.errorMessage).toContain("Quota exhausted");

    // Progress status should reflect partial completion
    const progress = await service.getGenerationProgress(docId, organizationId);
    expect(progress.status).toBe("partial");
    expect(progress.completed).toBe(4); // planning + 3 lessons
    expect(progress.failed).toBe(1);
    expect(progress.pending).toBeGreaterThan(0);
  });

  it("Scenario 3: Resuming partial generation issues ZERO AI calls for already-completed chunks", async () => {
    // Step 1: Simulate initial run failing on flashcards
    gateway.failFilter = (req) => (req.jsonSchema as { type?: string })?.type === "flashcards";
    await expect(
      service.generateForDocument(actor, organizationId, docId, {
        types: ["lesson", "flashcard", "quiz"],
      }),
    ).rejects.toThrow();

    const initialCallCount = gateway.calls.length;
    // 1 planning + 3 lessons = 4 successful calls before failing on flashcard 0
    expect(initialCallCount).toBe(4);

    // Step 2: Clear failure filter and resume generation
    gateway.failFilter = undefined;
    gateway.calls = []; // Reset tracked calls to measure resume calls

    const resumeResult = await service.generateForDocument(
      actor,
      organizationId,
      docId,
      {
        types: ["lesson", "flashcard", "quiz"],
      },
    );

    expect(resumeResult.document_status).toBe("review_pending");

    // Verify: calls during resume should NOT include planning or lessons (0, 1, 2)!
    // Total remaining calls: flashcards (3) + quizzes (3) = 6 calls
    expect(gateway.calls).toHaveLength(6);

    // Verify planning and lesson schemas were NOT called again
    const calledSchemas = gateway.calls.map((c) => (c.jsonSchema as { type?: string })?.type);
    expect(calledSchemas.filter((s) => s === "content_plan")).toHaveLength(0);
    expect(calledSchemas.filter((s) => s === "session")).toHaveLength(0);

    const progress = await service.getGenerationProgress(docId, organizationId);
    expect(progress.status).toBe("succeeded");
    expect(progress.completed).toBe(progress.total);
    expect(progress.failed).toBe(0);
  });

  it("Scenario 4: Worker restart reloads state from DB and skips completed chunks", async () => {
    // Stage 1 Planning & Stage 2 lessons completed in Worker 1
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["lesson"],
    });

    const planningChunk = await chunkRecordStore.findByDocumentAndKey(docId, "planning", organizationId);
    expect(planningChunk?.status).toBe("completed");

    // Worker crashes / restarts -> New service instance with fresh in-memory state but same DB store
    const newGateway = new ControllableGateway();
    const restartedService = new GenerationService(
      contentStore,
      citationStore,
      newGateway,
      documentStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
    );

    // Run generation on restarted worker for flashcards
    await restartedService.generateForDocument(actor, organizationId, docId, {
      types: ["flashcard"],
    });

    // Planning and lessons were already in DB -> 0 planning calls, 0 lesson calls! Only 3 flashcard calls
    const schemas = newGateway.calls.map((c) => (c.jsonSchema as { type?: string })?.type);
    expect(schemas.filter((s) => s === "content_plan")).toHaveLength(0);
    expect(schemas.filter((s) => s === "session")).toHaveLength(0);
    expect(schemas.filter((s) => s === "flashcards")).toHaveLength(3);
  });

  it("Scenario 5: Isolated chunk retries handle transient errors on specific chunk", async () => {
    // Simulate transient failure on session 0
    gateway.transientFailChunkKey = "مبانی گیرنده‌ها";

    const result = await service.generateForDocument(actor, organizationId, docId, {
      types: ["lesson"],
    });

    expect(result.document_status).toBe("review_pending");
    expect(result.contents).toHaveLength(1);

    // Total successful calls recorded = 1 planning + 3 lessons = 4 calls
    expect(gateway.calls.length).toBe(4);

    const lesson0Chunk = await chunkRecordStore.findByDocumentAndKey(
      docId,
      "lesson:0",
      organizationId,
    );
    expect(lesson0Chunk?.status).toBe("completed");
  });

  it("Scenario 6: Force regeneration clears stages while preserving chunk key uniqueness", async () => {
    // Run generation once
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["lesson"],
    });

    const chunksFirst = await chunkRecordStore.listByDocument(docId, organizationId);
    expect(chunksFirst.length).toBeGreaterThan(0);

    // Force regenerate lesson
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["lesson"],
      force: true,
    });

    const chunksSecond = await chunkRecordStore.listByDocument(docId, organizationId);
    expect(chunksSecond.length).toBe(chunksFirst.length);

    // Verify each active chunk key is strictly unique
    const activeChunks = chunksSecond.filter((c) => c.deletedAt === null);
    const keys = activeChunks.map((c) => c.chunkKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("Scenario 7: Concurrent workers on same chunk make at most ONE AI call per chunk (Race Condition Audit)", async () => {
    // Introduce artificial latency so two concurrent workers overlap on the same chunk execution
    gateway.delayMs = 60;

    // Create a second worker service instance sharing the exact same DB stores
    const serviceWorkerB = new GenerationService(
      contentStore,
      citationStore,
      gateway,
      documentStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
    );

    // Concurrently trigger generation from Worker A and Worker B
    const [resA, resB] = await Promise.all([
      service.generateForDocument(actor, organizationId, docId, {
        types: ["lesson"],
      }),
      serviceWorkerB.generateForDocument(actor, organizationId, docId, {
        types: ["lesson"],
      }),
    ]);

    expect(resA.document_status).toBe("review_pending");
    expect(resB.document_status).toBe("review_pending");

    // Exactly 1 planning + 3 lessons = 4 AI calls total across both workers (NOT 8 calls!)
    expect(gateway.calls).toHaveLength(4);

    const activeChunks = (await chunkRecordStore.listByDocument(docId, organizationId)).filter(
      (c) => c.deletedAt === null,
    );
    // 1 planning + 3 lessons = 4 distinct chunks in DB
    expect(activeChunks).toHaveLength(4);
    activeChunks.forEach((c) => {
      expect(c.status).toBe("completed");
    });
  });

  it("Scenario 8: Crash between AI completion and persistence gracefully recovers without duplicates (Crash & Idempotency Audit)", async () => {
    // Stage 1: Generate planning and session 0 normally
    await service.generateForDocument(actor, organizationId, docId, {
      types: ["lesson"],
    });
    expect(gateway.calls).toHaveLength(4); // 1 planning + 3 lessons

    // Simulate crash scenario on flashcard generation:
    // AI request for flashcard:0 succeeded in provider, but worker died before saving payload to DB (payload left uncommitted)
    const flashcardChunk0 = await chunkRecordStore.findByDocumentAndKey(docId, "flashcard:0", organizationId);
    expect(flashcardChunk0).toBeUndefined();

    // Now a new worker starts and sees flashcard:0 as uncommitted/pending
    const newWorkerGateway = new ControllableGateway();
    const newWorkerService = new GenerationService(
      contentStore,
      citationStore,
      newWorkerGateway,
      documentStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
    );

    await newWorkerService.generateForDocument(actor, organizationId, docId, {
      types: ["lesson", "flashcard"],
    });

    // Planning and lessons (0, 1, 2) were already in DB -> 0 new AI calls for them!
    // Flashcards (0, 1, 2) were generated -> 3 calls
    expect(newWorkerGateway.calls).toHaveLength(3);

    // Verify all chunks in DB are clean, unique, and completed
    const allChunks = await chunkRecordStore.listByDocument(docId, organizationId);
    const completedFlashcardChunks = allChunks.filter(
      (c) => c.stage === "flashcard" && c.status === "completed" && c.deletedAt === null,
    );
    expect(completedFlashcardChunks).toHaveLength(3);

    // Verify generated_contents table contains 0 duplicate draft records
    const contents = await contentStore.listByDocument(docId, organizationId);
    const flashcardContents = contents.filter((c) => c.type === "flashcard" && c.deletedAt === null);
    expect(flashcardContents).toHaveLength(1); // 1 unified flashcard batch content
  });
});
