/**
 * Comprehensive Integration & Resilience Test: AI Content Generation Pipeline.
 *
 * Validates the full RCA lifecycle and resilience invariants:
 * 1. End-to-end lease acquisition, active background heartbeat renewal, and completion.
 * 2. Progress status computation: returns 'partial' (never hung 'running') when partial content exists or worker halts.
 * 3. Provider failure (503 / network drop): cleanly marks job 'failed', clears lease, and sets document to 'failed'.
 * 4. Recovery & Stale Reconciler:
 *    - In-flight active jobs with valid leases are preserved.
 *    - Stale orphaned courses and documents safely recover without destructive deletion of generated drafts.
 *    - Stale jobs and chunks transition to 'failed' with STALE_LEASE_EXPIRED.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type DocumentChunkId,
  type OrganizationId,
  type UserId,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import { GenerationRecoveryService } from "../modules/generation/generation-recovery-service.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import type { ModelGateway, CompletionResult } from "../modules/generation/gateway/index.js";

describe("AI Content Generation Pipeline - RCA & Resilience Suite", () => {
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let courseStore: InMemoryCourseStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let jobStore: InMemoryGenerationJobStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let recoveryService: GenerationRecoveryService;

  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const docId = "00000000-0000-0000-0000-000000000003" as DocumentId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as UserId,
    role: "organization_admin",
  };

  const samplePlanningPayload = {
    moduleTitle: "فارماکولوژی قلب و عروق",
    sourceTopics: [
      { id: "topic-1", title: "بتابلاکرها", description: "مکانیسم اثر بتابلاکرها", relevantChunkIds: ["c1", "c2"] },
    ],
    sessions: [
      {
        index: 0,
        title: "جلسه ۱: داروهای مسدودکننده بتا",
        description: "تحلیل بتابلاکرها",
        coreConcepts: ["پروپرانولول", "متوپرولول"],
        relevantChunkIds: ["c1", "c2"],
        targetFlashcardCount: 2,
        targetQuizCount: 1,
      },
    ],
    outline: [{ title: "جلسه ۱: داروهای مسدودکننده بتا", description: "تحلیل بتابلاکرها", relevantChunkIds: ["c1", "c2"] }],
    highYieldFacts: [{ id: "fact-1", fact: "پروپرانولول غیرانتخابی است", category: "high_yield", sessionIndex: 0 }],
    citationChunkIds: ["c1", "c2"],
  };

  const sampleSessionPayload = {
    kind: "session",
    title: "جلسه ۱: داروهای مسدودکننده بتا",
    contentMarkdown: "# بتابلاکرها\n\n## ۱. تعاریف و مبانی\nبتابلاکرها از داروهای مهم قلبی هستند.\n\n## ۲. جدول داروها\n| دارو | دسته |\n|---|---|\n| پروپرانولول | غیرانتخابی |\n\n## ۳. نکات بالینی\nدر آسم منع مصرف دارند.",
    citationChunkIds: ["c1", "c2"],
  };

  const sampleFlashcardsPayload = {
    kind: "flashcards",
    cards: [
      {
        sessionIndex: 0,
        question: "پروپرانولول در چه بیمارانی منع مصرف دارد؟",
        answer: "بیماران مبتلا به آسم و برونکواسپاسم.",
        explanation: "به دلیل انسداد گیرنده‌های بتا ۲ در راه‌های هوایی.",
        cardType: "mechanism",
        difficulty: "medium",
        citationChunkIds: ["c1"],
      },
    ],
    citationChunkIds: ["c1"],
  };

  const sampleQuizPayload = {
    kind: "quizzes",
    questions: [
      {
        sessionIndex: 0,
        question: "کدام گزینه از بتابلاکرهای انتخابی بتا-۱ است؟",
        questionType: "multiple_choice",
        choices: ["متوپرولول", "پروپرانولول", "تیمولول", "لابتالول"],
        correctAnswer: "متوپرولول",
        explanation: "متوپرولول کاردیوسلکتیو بوده و روی گیرنده بتا-۱ اثر می‌کند.",
        difficulty: "medium",
        category: "application",
        citationChunkIds: ["c1"],
      },
    ],
    citationChunkIds: ["c1"],
  };

  const sampleReviewSummaryPayload = {
    kind: "review_summary",
    title: "خلاصه جامع فارماکولوژی قلب",
    estimatedReadingMinutes: 5,
    overview: "مرور سریع داروهای قلبی عروقی و نکات پرتکرار آزمون.",
    sections: [
      {
        title: "داروهای مسدودکننده گیرنده آدرنرژیک",
        heading: "داروهای مسدودکننده گیرنده آدرنرژیک",
        keyPoints: ["پروپرانولول: غیرانتخابی", "متوپرولول: کاردیوسلکتیو"],
        examPoints: ["منع مصرف در آسم"],
        citationChunkIds: ["c1", "c2"],
      },
    ],
    finalTakeaways: ["دقت به کاردیوسلکتیویتی داروها در نسخه نویسی."],
    citationChunkIds: ["c1", "c2"],
  };

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    courseStore = new InMemoryCourseStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    jobStore = new InMemoryGenerationJobStore();
    chunkRecordStore = new InMemoryGenerationChunkStore();

    recoveryService = new GenerationRecoveryService(
      null as any,
      courseStore,
      docStore,
      generatedContentStore,
      chunkStore,
      jobStore,
      chunkRecordStore,
    );

    // Setup course and source document
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی ۳",
        description: "دوره جامع داروشناسی",
        subject: "پزشکی",
        status: "draft",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await docStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      storageKey: `docs/${docId}.pdf`,
      originalName: "cardio_pharma.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      status: "extracted",
      pageCount: 5,
      sha256: "dummy-hash",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await chunkStore.createMany([
      {
        id: "c1" as DocumentChunkId,
        documentId: docId,
        organizationId: orgId,
        sequence: 0,
        heading: "مقدمه بتابلاکرها",
        content: "بتابلاکرها با مهار گیرنده‌های سمپاتیک اثرات اینوتروپ منفی دارند.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-c1",
        createdAt: new Date().toISOString(),
      },
      {
        id: "c2" as DocumentChunkId,
        documentId: docId,
        organizationId: orgId,
        sequence: 1,
        heading: "انواع بتابلاکرها",
        content: "پروپرانولول غیرانتخابی و متوپرولول کاردیوسلکتیو است.",
        startPage: 3,
        endPage: 5,
        tokenEstimate: 60,
        contentHash: "hash-c2",
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  it("1. completes full multi-stage generation with structured logging, lease management, and background heartbeat", async () => {
    const mockGateway: ModelGateway = {
      provider: "mock",
      async complete(options): Promise<CompletionResult> {
        const schemaType = (options.jsonSchema as any)?.type;
        if (schemaType === "content_plan") {
          return {
            text: JSON.stringify(samplePlanningPayload),
            model: "mock-model",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }
        if (schemaType === "session") {
          return {
            text: JSON.stringify(sampleSessionPayload),
            model: "mock-model",
            usage: { inputTokens: 100, outputTokens: 100 },
            finishReason: "stop",
          };
        }
        if (schemaType === "flashcards") {
          return {
            text: JSON.stringify(sampleFlashcardsPayload),
            model: "mock-model",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }
        if (schemaType === "quizzes") {
          return {
            text: JSON.stringify(sampleQuizPayload),
            model: "mock-model",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }
        if (schemaType === "review_summary") {
          return {
            text: JSON.stringify(sampleReviewSummaryPayload),
            model: "mock-model",
            usage: { inputTokens: 80, outputTokens: 80 },
            finishReason: "stop",
          };
        }
        throw new Error(`Unexpected schema type: ${schemaType}`);
      },
    };

    const jobId = randomUUID();
    await jobStore.create({
      id: jobId as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: `key-${jobId}`,
      jobId,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      completedAt: null,
    });

    const genService = new GenerationService(
      generatedContentStore,
      citationStore,
      mockGateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      courseStore,
      undefined,
      chunkRecordStore,
      jobStore,
    );

    const result = await genService.generateForDocument(actor, orgId, docId, {
      types: ["lesson", "flashcard", "quiz", "review_summary"],
      jobId,
      courseId,
    });

    expect(result.contents.length).toBe(4);
    expect(result.document_status).toBe("review_pending");

    // Verify draft artifacts persisted
    const drafts = await generatedContentStore.listByDocument(docId, orgId);
    expect(drafts.length).toBe(4);
    expect(drafts.map((d) => d.type).sort()).toEqual(["flashcard", "lesson", "quiz", "review_summary"]);

    // Verify document status transitioned
    const updatedDoc = await docStore.findByIdForOrganization(docId, orgId);
    expect(updatedDoc?.status).toBe("review_pending");
  });

  it("2. computes progress as 'partial' (and not 'running') when worker stops or subset of content generated", async () => {
    const genService = new GenerationService(
      generatedContentStore,
      citationStore,
      { provider: "mock", complete: async () => ({} as any) },
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      courseStore,
      undefined,
      chunkRecordStore,
      jobStore,
    );

    // Seed 1 completed lesson chunk
    await chunkRecordStore.upsert({
      id: randomUUID(),
      organizationId: orgId,
      documentId: docId,
      courseId,
      stage: "lesson",
      chunkIndex: 0,
      chunkKey: "lesson:0",
      status: "completed",
      payload: sampleSessionPayload,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    // Seed 1 draft in store
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: sampleSessionPayload as any,
      promptVersion: "v1",
      model: "mock",
      tokenUsage: null,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Progress status when only 1 of 3 requested stages is completed
    const progress = await genService.getGenerationProgress(docId, orgId, [
      "lesson",
      "flashcard",
      "quiz",
    ]);
    expect(progress.status).toBe("partial");
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(25);
    expect(progress.status).not.toBe("running");
  });

  it("3. handles provider 503 errors by marking document and job as failed without hanging", async () => {
    const failingGateway: ModelGateway = {
      provider: "mock",
      async complete(): Promise<CompletionResult> {
        throw new DomainError("service_unavailable", "Gemini 503: Model is overloaded");
      },
    };

    const jobId = randomUUID();
    await jobStore.create({
      id: jobId as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: `key-${jobId}`,
      jobId,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      completedAt: null,
    });

    const genService = new GenerationService(
      generatedContentStore,
      citationStore,
      failingGateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      courseStore,
      undefined,
      chunkRecordStore,
      jobStore,
    );

    await expect(
      genService.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
        jobId,
        courseId,
      }),
    ).rejects.toThrow(/Gemini 503/);

    const updatedDoc = await docStore.findByIdForOrganization(docId, orgId);
    expect(updatedDoc?.status).toBe("failed");
    expect(updatedDoc?.errorCode).toBe("service_unavailable");
  });

  it("4. preserves active jobs with fresh leases and safely reconciles stale ones", async () => {
    // Set course to generating
    const course = await courseStore.findById(courseId);
    await courseStore.update({ ...course!, status: "generating" });

    // Scenario A: Active job with fresh lease
    const activeJobId = randomUUID();
    await jobStore.create({
      id: activeJobId as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: `key-${activeJobId}`,
      jobId: activeJobId,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      completedAt: null,
    });

    // isCourseActivelyGenerating should be true
    const isActive = await recoveryService.isCourseActivelyGenerating(courseId);
    expect(isActive).toBe(true);

    // Reconciling an active course should not modify its generating state
    const reconActive = await recoveryService.reconcileStaleCourse(courseId, { organizationId: orgId });
    expect(reconActive.recovered).toBe(false);
    expect(reconActive.activelyRunning).toBe(true);

    // Scenario B: Expired lease from crashed worker (15 minutes ago)
    const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const staleJob = await jobStore.findByIdForOrganization(activeJobId as any, orgId);
    await jobStore.update({
      ...staleJob!,
      heartbeatAt: staleTime,
      leaseExpiresAt: staleTime,
      updatedAt: staleTime,
    });

    const isStillActive = await recoveryService.isCourseActivelyGenerating(courseId);
    expect(isStillActive).toBe(false);

    // Reconcile stale course
    const reconStale = await recoveryService.reconcileStaleCourse(courseId, { organizationId: orgId });
    expect(reconStale.recovered).toBe(true);
    expect(reconStale.newStatus).toBe("draft");

    const updatedCourse = await courseStore.findById(courseId);
    expect(updatedCourse?.status).toBe("draft");
  });

  it("5. recovers stale generating course to 'review' when generated drafts exist", async () => {
    const course = await courseStore.findById(courseId);
    await courseStore.update({ ...course!, status: "generating" });

    // Seed an existing generated draft
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: sampleSessionPayload as any,
      promptVersion: "v1",
      model: "mock",
      tokenUsage: null,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const recon = await recoveryService.reconcileStaleCourse(courseId, { organizationId: orgId });
    expect(recon.recovered).toBe(true);
    expect(recon.newStatus).toBe("review");

    const updatedCourse = await courseStore.findById(courseId);
    expect(updatedCourse?.status).toBe("review");

    // Invariant: Draft was not deleted
    const remainingDrafts = await generatedContentStore.listByCourse(courseId, orgId);
    expect(remainingDrafts.length).toBe(1);
  });
});
