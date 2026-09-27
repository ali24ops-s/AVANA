/**
 * Generation / Resume / Regenerate Audit Invariants Test Suite.
 *
 * Covers:
 * - Test A: Scope immutability (Lesson-only request stays lesson-only on resume, 0 flashcards/quizzes/summary)
 * - Test B: Partial success preservation (10 lessons, 6 complete, 7th fails -> 0 duplicate calls for 1-6, 7-10 generated)
 * - Test C: Non-destructive partial lesson continuation (content from earlier sessions retained in final output)
 * - Test D: Stage resumption with prior stage context loaded from DB (Lesson complete, Flashcards fail -> Lessons skipped, context loaded, Flashcards finished)
 * - Test E: Completed generation idempotency
 * - Test F: Provider network failure preservation (midway failure leaves DB chunks intact for resume)
 * - Test G: Worker restart / process crash resilience
 * - Test H: Scope isolation between different generation attempts on the same document
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type GeneratedContentType,
  RoleBasedPolicy,
} from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import { InMemoryDocumentStore, InMemoryDocumentChunkStore } from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationChunkStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationProgressStore } from "../modules/generation/generation-progress-store.js";
import type { DocumentRecord, DocumentChunkRecord } from "../modules/learning/learning-store.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { ModelGateway, ModelCompletionRequest, ModelCompletionResponse } from "../modules/generation/gateway/index.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import { GenerationQueryService } from "../modules/generation/services/generation-query-service.js";
import { GenerationContentStatusService } from "../modules/generation/services/generation-content-status-service.js";

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "medical_pharmacology.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    sha256: "a".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 10,
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
  count = 10,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i + 1}` as DocumentChunkRecord["id"],
    documentId,
    organizationId,
    sequence: i + 1,
    heading: `فصل ${i + 1}: مبحث فارماکولوژی ${i + 1}`,
    content: `محتوای آموزشی کامل مربوط به مبحث شماره ${i + 1}. مکانیسم اثر داروها، فارماکوکینتیک، عوارض جانبی و تداخلات دارویی.`,
    startPage: i + 1,
    endPage: i + 1,
    tokenEstimate: 400,
    contentHash: `hash-${i}`,
    createdAt: now,
  }));
}

class ControllableAuditGateway implements ModelGateway {
  readonly provider = "mock";
  readonly model = "mock-gemini";
  public calls: ModelCompletionRequest[] = [];
  public failFilter?: (request: ModelCompletionRequest) => boolean;
  public failError?: Error;

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResponse> {
    this.calls.push(request);

    if (this.failFilter && this.failFilter(request)) {
      throw this.failError ?? new Error("Simulated provider failure");
    }

    const schemaType = (request.jsonSchema as { type?: string })?.type;

    if (schemaType === "content_plan") {
      const prompt = request.messages[1]?.content ?? "";
      // Generate 10 sessions plan
      const sessions = Array.from({ length: 10 }, (_, i) => ({
        index: i,
        title: `جلسه ${i + 1}: فارماکولوژی بخش ${i + 1}`,
        description: `توضیحات مبحث جلسه ${i + 1}`,
        relevantChunkIds: [`chunk-${i + 1}`],
        coreConcepts: [{ id: `concept-${i + 1}`, name: `مفهوم ${i + 1}`, category: "mechanism", description: "شرح" }],
        targetFlashcardCount: 2,
        targetQuizCount: 1,
      }));

      return {
        text: JSON.stringify({
          moduleTitle: "دوره جامع فارماکولوژی بالینی",
          sourceTopics: sessions.map((s) => ({
            id: `topic-${s.index + 1}`,
            title: s.title,
            description: s.description,
            category: "major_topic",
            relevantChunkIds: s.relevantChunkIds,
          })),
          sessions,
          outline: sessions.map((s) => ({ title: s.title, description: s.description })),
          citationChunkIds: ["chunk-1", "chunk-2"],
        }),
        usage: { inputTokens: 200, outputTokens: 300 },
      };
    }

    if (schemaType === "session") {
      const prompt = request.messages[1]?.content ?? "";
      let sessionIndex = 0;
      const match = prompt.match(/"index":\s*(\d+)/);
      if (match) {
        sessionIndex = parseInt(match[1], 10);
      }
      return {
        text: JSON.stringify({
          kind: "session",
          title: `جلسه ${sessionIndex + 1}: فارماکولوژی بخش ${sessionIndex + 1}`,
          contentMarkdown: `## جلسه ${sessionIndex + 1}: فارماکولوژی بخش ${sessionIndex + 1}\n\nمتن درس جلسه ${sessionIndex + 1} با جزئیات علمی کامل و مستندات منبع.`,
          citationChunkIds: [`chunk-${sessionIndex + 1}`],
        }),
        usage: { inputTokens: 150, outputTokens: 250 },
      };
    }

    if (schemaType === "flashcards") {
      const prompt = request.messages[1]?.content ?? "";
      let sessionIndex = 0;
      const match = prompt.match(/"index":\s*(\d+)/);
      if (match) {
        sessionIndex = parseInt(match[1], 10);
      }
      return {
        text: JSON.stringify({
          cards: [
            {
              question: `سوال فلش‌کارت جلسه ${sessionIndex + 1}`,
              answer: `پاسخ فلش‌کارت جلسه ${sessionIndex + 1}`,
              explanation: "توضیح تکمیلی",
              cardType: "mechanism",
              difficulty: "medium",
              citationChunkIds: [`chunk-${sessionIndex + 1}`],
              sessionIndex,
            },
          ],
          citationChunkIds: [`chunk-${sessionIndex + 1}`],
        }),
        usage: { inputTokens: 100, outputTokens: 120 },
      };
    }

    if (schemaType === "quiz") {
      const prompt = request.messages[1]?.content ?? "";
      let sessionIndex = 0;
      const match = prompt.match(/"index":\s*(\d+)/);
      if (match) {
        sessionIndex = parseInt(match[1], 10);
      }
      return {
        text: JSON.stringify({
          questions: [
            {
              sessionIndex,
              question: `سوال تستی جلسه ${sessionIndex + 1}؟`,
              questionType: "multiple_choice",
              choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
              correctAnswer: "گزینه الف",
              explanation: "توضیح پاسخ صحیح",
              difficulty: "medium",
              category: "داروشناسی",
              citationChunkIds: [`chunk-${sessionIndex + 1}`],
            },
          ],
          citationChunkIds: [`chunk-${sessionIndex + 1}`],
        }),
        usage: { inputTokens: 120, outputTokens: 140 },
      };
    }

    if (schemaType === "review_summary") {
      return {
        text: JSON.stringify({
          title: "خلاصه جامع مروری",
          estimatedReadingMinutes: 10,
          overview: "نمای کلی مباحث",
          sections: [
            {
              title: "بخش ۱",
              keyPoints: ["نکته ۱", "نکته ۲"],
            },
          ],
          finalTakeaways: ["نتیجه نهایی"],
          citationChunkIds: ["chunk-1"],
        }),
        usage: { inputTokens: 180, outputTokens: 200 },
      };
    }

    return { text: "{}", usage: { inputTokens: 10, outputTokens: 10 } };
  }
}

describe("Generation / Resume / Regenerate Audit Invariants", () => {
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let generationChunkStore: InMemoryGenerationChunkStore;
  let jobStore: InMemoryGenerationJobStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let queryService: GenerationQueryService;
  let contentStatusService: GenerationContentStatusService;
  let auditService: AuditService;
  let gateway: ControllableAuditGateway;
  let service: GenerationService;

  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const docId = "00000000-0000-0000-0000-000000000003" as DocumentId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as Actor["userId"],
    role: "organization_admin",
  };

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    generationChunkStore = new InMemoryGenerationChunkStore();
    jobStore = new InMemoryGenerationJobStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    auditService = new AuditService(new InMemoryAuditStore());
    gateway = new ControllableAuditGateway();

    const policy = new RoleBasedPolicy({
      organization_admin: ["content:generate", "content:review", "content:regenerate"],
    });

    queryService = new GenerationQueryService(
      docStore,
      generationChunkStore,
      progressService,
      jobStore,
      undefined,
      policy,
    );

    contentStatusService = new GenerationContentStatusService(
      docStore,
      contentStore,
      progressService,
      queryService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policy,
      jobStore,
    );

    service = new GenerationService(
      contentStore,
      citationStore,
      gateway,
      docStore,
      chunkStore,
      policy,
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      generationChunkStore,
      jobStore,
      progressService,
      undefined,
      queryService,
      contentStatusService,
    );

    await docStore.create(makeDocument({ id: docId, courseId }, orgId));
    await chunkStore.createMany(makeChunks(docId, orgId, 10));
  });

  it("Test A: User selects ONLY Lesson -> failure midway -> Regenerate executes ONLY Lesson (0 flashcards, 0 quizzes, 0 summary)", async () => {
    // 1. Initial generation requested for ONLY lesson
    const jobId1 = randomUUID();
    await jobStore.create({
      id: jobId1 as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: `doc:${docId}:job1`,
      jobId: jobId1,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    // Simulate failure at session 2
    gateway.failFilter = (req) => {
      const isSession = (req.jsonSchema as any)?.type === "session";
      return isSession && req.messages[1]?.content.includes('"index": 2');
    };

    let initialError: unknown;
    try {
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
        jobId: jobId1,
        generationKey: `doc:${docId}:job1`,
      });
    } catch (err) {
      initialError = err;
    }
    expect(initialError).toBeDefined();

    // Verify content status recovers requested_types = ["lesson"]
    const statusBefore = await service.getDocumentContentStatus(actor, orgId, docId, courseId);
    expect(statusBefore.requested_types).toEqual(["lesson"]);
    expect(statusBefore.lesson.generated).toBe(false);

    // 2. Regenerate / Resume with the recovered intent
    gateway.failFilter = undefined;
    gateway.calls = []; // reset calls

    const jobId2 = randomUUID();
    await jobStore.create({
      id: jobId2 as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: statusBefore.requested_types!.join(","),
      status: "queued",
      generationKey: `doc:${docId}:job2`,
      jobId: jobId2,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    const res = await service.generateForDocument(actor, orgId, docId, {
      types: statusBefore.requested_types,
      jobId: jobId2,
      generationKey: `doc:${docId}:job2`,
    });

    expect(res.contents.length).toBe(1);
    expect(res.contents[0].type).toBe("lesson");

    // Invariant: ZERO calls to flashcards, quiz, or review_summary
    const nonLessonCalls = gateway.calls.filter((c) => {
      const t = (c.jsonSchema as any)?.type;
      return t === "flashcards" || t === "quiz" || t === "review_summary";
    });
    expect(nonLessonCalls.length).toBe(0);

    const allDrafts = await contentStore.listByDocument(docId, orgId);
    expect(allDrafts.length).toBe(1);
    expect(allDrafts[0].type).toBe("lesson");
  });

  it("Test B: 10 Lessons, Sessions 1–6 complete, Session 7 fails -> Regenerate makes 0 duplicate calls for 1–6 and generates 7–10", async () => {
    const jobId1 = randomUUID();
    await jobStore.create({
      id: jobId1 as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: `doc:${docId}:b1`,
      jobId: jobId1,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    // Fail on session 6 (index 6 = 7th session)
    gateway.failFilter = (req) => {
      const isSession = (req.jsonSchema as any)?.type === "session";
      return isSession && req.messages[1]?.content.includes('"index": 6');
    };

    try {
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
        jobId: jobId1,
        generationKey: `doc:${docId}:b1`,
      });
    } catch {
      // Expected failure on session 7
    }

    // Verify chunks 0..5 are completed in DB
    const chunksAfterFail = await generationChunkStore.listByDocument(docId, orgId);
    const completedSessionChunks = chunksAfterFail.filter(
      (c) => c.stage === "lesson" && c.status === "completed",
    );
    expect(completedSessionChunks.length).toBe(6);

    // Save session titles/hashes to verify identity preservation
    const savedTitlesBefore = completedSessionChunks.map((c) => (c.payload as any).title);

    // 2. Now resume generation (gateway failure resolved)
    gateway.failFilter = undefined;
    gateway.calls = []; // reset call tracker

    const jobId2 = randomUUID();
    await jobStore.create({
      id: jobId2 as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: `doc:${docId}:b2`,
      jobId: jobId2,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      jobId: jobId2,
      generationKey: `doc:${docId}:b2`,
    });

    expect(result.contents.length).toBe(1);
    const lessonDraft = result.contents[0];
    const payload = lessonDraft.payload as { sessions: Array<{ title: string; contentMarkdown: string }> };

    // Invariant: Final lesson has EXACTLY 10 logical sessions, 0 duplicates
    expect(payload.sessions.length).toBe(10);
    const uniqueTitles = new Set(payload.sessions.map((s) => s.title));
    expect(uniqueTitles.size).toBe(10);

    // Invariant: Sessions 1..6 titles match previous completed items
    for (let i = 0; i < 6; i++) {
      expect(payload.sessions[i].title).toBe(savedTitlesBefore[i]);
    }

    // Invariant: ONLY 4 session AI calls were made during resumption (sessions 7, 8, 9, 10)
    const resumeSessionCalls = gateway.calls.filter(
      (c) => (c.jsonSchema as any)?.type === "session",
    );
    expect(resumeSessionCalls.length).toBe(4);
  });

  it("Test C: Partial session output preserved and merged seamlessly into final lesson draft without data loss", async () => {
    // Pre-populate session chunks 0, 1, 2 in DB directly with unique content markers
    const now = new Date().toISOString();
    await generationChunkStore.upsert({
      id: randomUUID(),
      organizationId: orgId,
      documentId: docId,
      courseId,
      stage: "planning",
      chunkIndex: 0,
      chunkKey: "planning",
      status: "completed",
      payload: {
        moduleTitle: "فارماکولوژی قلب و عروق",
        contentPlan: {
          sessions: [
            { index: 0, title: "جلسه ۱: بتابلوکرها", description: "شرح ۱", relevantChunkIds: ["chunk-1"], coreConcepts: [] },
            { index: 1, title: "جلسه ۲: مهارکننده‌های ACE", description: "شرح ۲", relevantChunkIds: ["chunk-2"], coreConcepts: [] },
            { index: 2, title: "جلسه ۳: دیورتیک‌ها", description: "شرح ۳", relevantChunkIds: ["chunk-3"], coreConcepts: [] },
          ],
        },
        outline: [
          { title: "جلسه ۱: بتابلوکرها", description: "شرح ۱" },
          { title: "جلسه ۲: مهارکننده‌های ACE", description: "شرح ۲" },
          { title: "جلسه ۳: دیورتیک‌ها", description: "شرح ۳" },
        ],
        model: "mock-model",
        usage: { inputTokens: 100, outputTokens: 100 },
        citationChunkIds: ["chunk-1"],
      },
      tokenUsage: { inputTokens: 100, outputTokens: 100 },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    await generationChunkStore.upsert({
      id: randomUUID(),
      organizationId: orgId,
      documentId: docId,
      courseId,
      stage: "lesson",
      chunkIndex: 0,
      chunkKey: "lesson:0",
      status: "completed",
      payload: {
        title: "جلسه ۱: بتابلوکرها",
        contentMarkdown: "## جلسه ۱: بتابلوکرها\n\nنکات اختصاصی پروپرانولول و متوپرولول (محتوای ذخیره‌شده از قبل).",
        citationChunkIds: ["chunk-1"],
      },
      tokenUsage: { inputTokens: 50, outputTokens: 50 },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    // Session 1 is pending/failed
    // Session 2 is completed
    await generationChunkStore.upsert({
      id: randomUUID(),
      organizationId: orgId,
      documentId: docId,
      courseId,
      stage: "lesson",
      chunkIndex: 2,
      chunkKey: "lesson:2",
      status: "completed",
      payload: {
        title: "جلسه ۳: دیورتیک‌ها",
        contentMarkdown: "## جلسه ۳: دیورتیک‌ها\n\nنکات اختصاصی فوروزماید و هیدروکلروتیازید (محتوای ذخیره‌شده از قبل).",
        citationChunkIds: ["chunk-3"],
      },
      tokenUsage: { inputTokens: 50, outputTokens: 50 },
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    gateway.calls = [];

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      generationKey: `doc:${docId}:test-c`,
    });

    const payload = result.contents[0].payload as {
      contentMarkdown: string;
      sessions: Array<{ title: string; contentMarkdown: string }>;
    };

    expect(payload.sessions.length).toBe(3);
    // Invariant: Retained previously completed text verbatim in final master markdown
    expect(payload.contentMarkdown).toContain("نکات اختصاصی پروپرانولول و متوپرولول");
    expect(payload.contentMarkdown).toContain("نکات اختصاصی فوروزماید و هیدروکلروتیازید");

    // Only session 1 was generated via LLM call
    const sessionCalls = gateway.calls.filter((c) => (c.jsonSchema as any)?.type === "session");
    expect(sessionCalls.length).toBe(1);
  });

  it("Test D: Lessons + Flashcards requested -> Lessons complete, Flashcards fail -> Resume skips lessons, loads lesson context, and completes flashcards", async () => {
    // 1. Initial generation of lessons and flashcards
    const jobId1 = randomUUID();
    await jobStore.create({
      id: jobId1 as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson,flashcard",
      status: "running",
      generationKey: `doc:${docId}:d1`,
      jobId: jobId1,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    // Lessons succeed, but flashcards fail
    gateway.failFilter = (req) => {
      return (req.jsonSchema as any)?.type === "flashcards";
    };

    try {
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson", "flashcard"],
        jobId: jobId1,
        generationKey: `doc:${docId}:d1`,
      });
    } catch {
      // Expected flashcard failure
    }

    // Lessons are completed in chunk store
    const lessonChunks = await generationChunkStore.listByDocument(docId, orgId);
    const completedLessonChunks = lessonChunks.filter(
      (c) => c.stage === "lesson" && c.status === "completed",
    );
    expect(completedLessonChunks.length).toBe(10);

    // 2. Resume generation for flashcards
    gateway.failFilter = undefined;
    gateway.calls = [];

    const jobId2 = randomUUID();
    await jobStore.create({
      id: jobId2 as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "flashcard",
      status: "queued",
      generationKey: `doc:${docId}:d2`,
      jobId: jobId2,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    const res = await service.generateForDocument(actor, orgId, docId, {
      types: ["flashcard"],
      jobId: jobId2,
      generationKey: `doc:${docId}:d2`,
    });

    expect(res.contents.length).toBe(1);
    expect(res.contents[0].type).toBe("flashcard");

    // Invariant: ZERO AI calls made for lessons during flashcard resume
    const lessonCalls = gateway.calls.filter((c) => (c.jsonSchema as any)?.type === "session");
    expect(lessonCalls.length).toBe(0);

    // Invariant: ZERO AI calls made for quizzes or review summary
    const unrequestedCalls = gateway.calls.filter((c) => {
      const t = (c.jsonSchema as any)?.type;
      return t === "quiz" || t === "review_summary";
    });
    expect(unrequestedCalls.length).toBe(0);
  });

  it("Test E: Completed generation does not re-generate completed items on idempotent redelivery", async () => {
    // 1. Fully generate lesson
    const key = `doc:${docId}:idem-1`;
    await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      generationKey: key,
    });

    gateway.calls = []; // reset calls

    // 2. Re-trigger identical generation
    const res2 = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      generationKey: key,
    });

    expect(res2.contents.length).toBe(1);
    // Invariant: 0 AI calls made on idempotent delivery
    expect(gateway.calls.length).toBe(0);
  });

  it("Test F: Provider network error midway leaves DB state intact for seamless continuation", async () => {
    // Fail on session 4 due to network error
    gateway.failFilter = (req) => {
      const isSession = (req.jsonSchema as any)?.type === "session";
      return isSession && req.messages[1]?.content.includes('"index": 4');
    };
    gateway.failError = new Error("ECONNRESET: Provider connection reset by peer");

    try {
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
        generationKey: `doc:${docId}:net-fail`,
      });
    } catch {
      // Expected
    }

    // Sessions 0..3 are completed in DB
    const chunks = await generationChunkStore.listByDocument(docId, orgId);
    const completedBefore = chunks.filter((c) => c.stage === "lesson" && c.status === "completed");
    expect(completedBefore.length).toBe(4);

    // Retry does not delete chunks 0..3
    gateway.failFilter = undefined;
    gateway.calls = [];

    const res = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      generationKey: `doc:${docId}:net-resume`,
    });

    expect(res.contents.length).toBe(1);
    const sessionCalls = gateway.calls.filter((c) => (c.jsonSchema as any)?.type === "session");
    // Only the remaining 6 sessions were called
    expect(sessionCalls.length).toBe(6);
  });

  it("Test G: Worker restart reloads DB state as single source of truth without duplicate work", async () => {
    // Worker 1 runs and generates 5 sessions, then crashes
    gateway.failFilter = (req) => {
      const isSession = (req.jsonSchema as any)?.type === "session";
      return isSession && req.messages[1]?.content.includes('"index": 5');
    };

    try {
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
        generationKey: `doc:${docId}:worker-crash`,
      });
    } catch {
      // Crash simulation
    }

    // Fresh worker instance starts up with same stores
    const freshGateway = new ControllableAuditGateway();
    const freshService = new GenerationService(
      contentStore,
      citationStore,
      freshGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy({ organization_admin: ["content:generate", "content:review"] }),
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      generationChunkStore,
      jobStore,
      progressService,
      undefined,
      queryService,
      contentStatusService,
    );

    const res = await freshService.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      generationKey: `doc:${docId}:fresh-worker`,
    });

    expect(res.contents.length).toBe(1);
    const sessionCalls = freshGateway.calls.filter((c) => (c.jsonSchema as any)?.type === "session");
    // Sessions 0..4 were reused from DB; only sessions 5..9 were generated
    expect(sessionCalls.length).toBe(5);
  });

  it("Test H: Scope isolation between different generation attempts on the same document", async () => {
    // Job A: User requested ["lesson"]
    const jobAId = randomUUID();
    await jobStore.create({
      id: jobAId as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "failed",
      generationKey: `doc:${docId}:jobA`,
      jobId: jobAId,
      attempts: 1,
      errorCode: "SIMULATED_FAIL",
      errorMessage: "Fail in Job A",
      createdAt: new Date(Date.now() - 10000).toISOString(),
      updatedAt: new Date(Date.now() - 10000).toISOString(),
      startedAt: new Date(Date.now() - 10000).toISOString(),
      completedAt: new Date(Date.now() - 10000).toISOString(),
      deletedAt: null,
    });

    // Content status reflects latest Job A intent as ["lesson"]
    const statusA = await service.getDocumentContentStatus(actor, orgId, docId, courseId);
    expect(statusA.requested_types).toEqual(["lesson"]);

    // Resume Job A with its explicit intent
    gateway.calls = [];
    const resA = await service.generateForDocument(actor, orgId, docId, {
      types: statusA.requested_types,
      jobId: jobAId,
      generationKey: `doc:${docId}:resume-jobA`,
    });

    expect(resA.contents.length).toBe(1);
    expect(resA.contents[0].type).toBe("lesson");

    // Flashcards and quizzes were NEVER called
    const extraCalls = gateway.calls.filter((c) => {
      const t = (c.jsonSchema as any)?.type;
      return t === "flashcards" || t === "quiz";
    });
    expect(extraCalls.length).toBe(0);
  });
});
