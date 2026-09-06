/**
 * Stage 5: High-Density Review Summary Generation Mandatory Regression Tests.
 *
 * Verifies:
 * 1. Stage 5 generation type exists and is enabled in the domain.
 * 2. Single Source of Truth: Prompt Registry and Generation Service parity for Stage 5.
 * 3. End-to-end Review Summary generation creates valid draft with structured payload.
 * 4. Citation integrity: Grounded on real document chunk IDs.
 * 5. Reading-time behavior: Target and estimated reading minutes are respected.
 * 6. Pipeline Type Set: Valid generation types are strictly [lesson, flashcard, quiz, review_summary].
 */

import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  Actor,
  CourseId,
  DocumentChunkId,
  DocumentId,
  OrganizationId,
  ReviewSummaryPayload,
  UserId,
  ReviewSummaryGenerationInput,
  GenerationJobId,
} from "@avana/domain";
import {
  ALL_GENERATION_TYPES,
  ENABLED_GENERATION_TYPES,
  RoleBasedPolicy,
  isGenerationTypeEnabled,
  validateReviewSummaryInput,
  getReviewSummaryConfig,
  DomainError,
} from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import {
  REVIEW_SUMMARY_SYSTEM_PROMPT,
  buildReviewSummaryUserPrompt,
  getPromptRegistry,
  getReviewSummaryTemplate,
} from "../modules/generation/prompt-registry.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";

class SpyModelGateway extends MockModelGateway {
  public recordedMessages: Array<{ role: string; content: string }> = [];
  public lastRequestedSchemaType?: string;
  public reviewSummaryResponseOverride?: string;
  public reviewSummaryCallCount = 0;

  override async complete(req: {
    promptVersion: string;
    messages: Array<{ role: string; content: string }>;
    jsonSchema?: { type: string };
    correlationId?: string;
    organizationId?: string;
    documentId?: string;
  }) {
    if (req.jsonSchema?.type === "review_summary") {
      this.reviewSummaryCallCount++;
      this.recordedMessages = req.messages || [];
      this.lastRequestedSchemaType = req.jsonSchema?.type;
      if (this.reviewSummaryResponseOverride !== undefined) {
        return {
          text: this.reviewSummaryResponseOverride,
          model: "spy-model",
          usage: { inputTokens: 100, outputTokens: 100 },
        };
      }
    }
    return super.complete(req);
  }
}
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { DocumentRecord, DocumentChunkRecord } from "../modules/learning/learning-store.js";

function makeDoc(id: DocumentId, orgId: OrganizationId, courseId: CourseId): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    organizationId: orgId,
    courseId,
    ownerUserId: "00000000-0000-0000-0000-000000000001" as UserId,
    originalName: "cardiovascular-pharmacology.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024 * 1024,
    sha256: "a".repeat(64),
    storageKey: `uploads/${id}.pdf`,
    pageCount: 15,
    status: "extracted",
    qualityScore: null,
    qualityLevel: null,
    qualityReport: null,
    qualityAnalyzedAt: null,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function makeChunks(
  documentId: DocumentId,
  organizationId: OrganizationId,
  count = 4,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i + 1}` as DocumentChunkId,
    documentId,
    organizationId,
    sequence: i + 1,
    heading: `بخش ${i + 1}: مباحث بالینی و فارماکولوژی`,
    content: `محتوای تخصصی داروشناسی قلبی عروقی و مکانیسم عمل دسته دارویی ${i + 1}`,
    startPage: i * 3 + 1,
    endPage: (i + 1) * 3,
    tokenEstimate: 500,
    contentHash: `hash-${i + 1}`,
    createdAt: now,
  }));
}

describe("Stage 5: High-Density Review Summary Regression Tests", () => {
  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as UserId,
    role: "organization_admin",
  };

  it("Test 1 — Stage 5 generation exists and is enabled in the domain", () => {
    expect(isGenerationTypeEnabled("review_summary")).toBe(true);
    expect(ENABLED_GENERATION_TYPES).toContain("review_summary");
    expect(ALL_GENERATION_TYPES).toContain("review_summary");
  });

  it("Test 2 — Prompt Registry parity: Single Source of Truth for Stage 5", () => {
    const registry = getPromptRegistry();
    const stage5Prompt = registry.find((p) => p.id === "review-summary");

    expect(stage5Prompt).toBeDefined();
    expect(stage5Prompt?.name).toBe("High-Density Review Summary Generation («خلاصه مروری»)");
    expect(stage5Prompt?.category).toBe("Review Summary");
    expect(stage5Prompt?.systemPrompt).toBe(REVIEW_SUMMARY_SYSTEM_PROMPT);
    expect(stage5Prompt?.userPrompt).toBe(getReviewSummaryTemplate());
    expect(stage5Prompt?.variables).toContain("targetReadingMinutes");
    expect(stage5Prompt?.variables).toContain("chunkContext");
    expect(stage5Prompt?.variables).toContain("availableChunkIds");
    expect(stage5Prompt?.status).toBe("active");
  });

  it("Test 3 — Review Summary generation produces valid draft and payload structure", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));
    const chunks = makeChunks(docId, orgId, 4);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    const service = new GenerationService(
      genStore,
      citStore,
      new MockModelGateway(),
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    const result = await service.generateForDocument(
      actor,
      orgId,
      docId,
      { types: ["review_summary"] },
    );

    expect(result.contents).toHaveLength(1);
    const summaryItem = result.contents[0];
    expect(summaryItem.type).toBe("review_summary");
    expect(summaryItem.status).toBe("draft");
    expect(summaryItem.document_id).toBe(docId);

    const payload = summaryItem.payload as unknown as ReviewSummaryPayload;
    expect(payload.kind).toBe("review_summary");
    expect(payload.title).toBeTruthy();
    expect(payload.overview).toBeTruthy();
    expect(payload.sections.length).toBeGreaterThan(0);
    expect(payload.sections[0].title).toBeTruthy();
    expect(payload.sections[0].keyPoints.length).toBeGreaterThan(0);
    expect(payload.finalTakeaways.length).toBeGreaterThan(0);
  });

  it("Test 4 — Citation integrity: Grounded on real document chunks", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));
    const chunks = makeChunks(docId, orgId, 3);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    const validChunkIds = new Set(chunks.map((c) => c.id));

    const service = new GenerationService(
      genStore,
      citStore,
      new MockModelGateway(),
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    const result = await service.generateForDocument(
      actor,
      orgId,
      docId,
      { types: ["review_summary"] },
    );

    const payload = result.contents[0].payload as unknown as ReviewSummaryPayload;
    expect(payload.citationChunkIds.length).toBeGreaterThan(0);
    payload.citationChunkIds.forEach((id) => {
      expect(validChunkIds.has(id as DocumentChunkId)).toBe(true);
    });

    const storedCitations = await citStore.listByGeneratedContent(result.contents[0].id);
    expect(storedCitations.length).toBe(payload.citationChunkIds.length);
  });

  it("Test 5 — Reading-time behavior: Target and estimated reading minutes are respected", async () => {
    const prompt = buildReviewSummaryUserPrompt({
      docName: "cardiovascular-pharmacology.pdf",
      targetReadingMinutes: 12,
      minReadingMinutes: 10,
      maxReadingMinutes: 15,
      chunkContext: "[Chunk ID: chunk-1] Overview text",
      chunkIdList: ["chunk-1"],
    });

    expect(prompt).toContain("10–15 minute review");
    expect(prompt).toContain("~12 minutes");
  });

  it("Test 6 — Pipeline Type Set: Valid generation types are strictly [lesson, flashcard, quiz, review_summary]", () => {
    const expectedTypes = ["lesson", "flashcard", "quiz", "review_summary"];
    expect(ALL_GENERATION_TYPES).toEqual(expectedTypes);
    expect(ENABLED_GENERATION_TYPES).toEqual(expectedTypes);

    // Assert that 'recommendation' is not part of the active generation pipeline
    expect(ALL_GENERATION_TYPES).not.toContain("recommendation");
    expect(ENABLED_GENERATION_TYPES).not.toContain("recommendation");
  });

  it("Test 7 — Stage 1 planning and Stage 2 lessons genuinely reach Stage 5 prompt", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const spyGateway = new SpyModelGateway();

    await docStore.create(makeDoc(docId, orgId, courseId));
    const chunks = makeChunks(docId, orgId, 4);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    const service = new GenerationService(
      genStore,
      citStore,
      spyGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    await service.generateForDocument(actor, orgId, docId, {
      types: ["review_summary"],
    });

    // Verify spy model recorded the prompt sent for review_summary
    expect(spyGateway.recordedMessages.length).toBeGreaterThan(0);
    const userMessage =
      spyGateway.recordedMessages.find((m) => m.role === "user")?.content ?? "";

    // Test 1 requirement: Stage 1 data reaches Stage 5
    expect(userMessage).toContain("STAGE 1: CURRICULUM PLANNING & BLUEPRINT");
    expect(userMessage).toContain("[SOURCE TOPICS]");
    expect(userMessage).toContain("[PLANNED SESSIONS]");
    expect(userMessage).toContain("[CORE CONCEPTS]");
    expect(userMessage).toContain("[HIGH-YIELD FACTS]");

    // Test 2 requirement: Stage 2 lessons reach Stage 5 mapped to session IDs
    expect(userMessage).toContain("STAGE 2: GENERATED EDUCATIONAL LESSONS");
    expect(userMessage).toContain("### Lesson for Session [session-1]");

    // Test 3 requirement: Stage isolation — no flashcards or quizzes in Stage 5 prompt
    expect(userMessage).not.toContain("flashcards_batch");
    expect(userMessage).not.toContain("quizzes_batch");
    expect(userMessage).not.toContain("study_recommendations");
  });

  it("Test 8 — Missing planning fails explicitly with STAGE5_MISSING_PLANNING", () => {
    const invalidInput: ReviewSummaryGenerationInput = {
      documentId: "doc-1",
      planning: {
        sourceTopics: [],
        sessions: [], // Empty sessions
        coreConcepts: [],
        highYieldFacts: [],
      },
      lessons: [
        {
          sessionId: "session-1",
          sessionOrder: 0,
          title: "درس اول",
          contentMarkdown: "محتوای درس",
          citationChunkIds: ["chunk-1"],
        },
      ],
      sourceChunks: [{ id: "chunk-1", text: "متن نمونه" }],
      generationContext: {
        targetMinutes: 10,
        minMinutes: 8,
        maxMinutes: 12,
        language: "fa",
        audience: "pharmacy_students",
      },
    };

    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(DomainError);
    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(
      "STAGE5_MISSING_PLANNING",
    );
  });

  it("Test 9 — Missing lessons fails explicitly with STAGE5_MISSING_LESSONS", () => {
    const invalidInput: ReviewSummaryGenerationInput = {
      documentId: "doc-1",
      planning: {
        sourceTopics: [
          { id: "top-1", title: "مبحث اول", chunkIds: ["chunk-1"] },
        ],
        sessions: [
          {
            id: "session-1",
            order: 0,
            title: "جلسه اول",
            relevantChunkIds: ["chunk-1"],
            coreConceptIds: [],
          },
        ],
        coreConcepts: [],
        highYieldFacts: [],
      },
      lessons: [], // Missing lessons!
      sourceChunks: [{ id: "chunk-1", text: "متن نمونه" }],
      generationContext: {
        targetMinutes: 10,
        minMinutes: 8,
        maxMinutes: 12,
        language: "fa",
        audience: "pharmacy_students",
      },
    };

    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(DomainError);
    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(
      "STAGE5_MISSING_LESSONS",
    );
  });

  it("Test 10 — Invalid session reference fails with STAGE5_INVALID_SESSION_REFERENCE", () => {
    const invalidInput: ReviewSummaryGenerationInput = {
      documentId: "doc-1",
      planning: {
        sourceTopics: [
          { id: "top-1", title: "مبحث اول", chunkIds: ["chunk-1"] },
        ],
        sessions: [
          {
            id: "session-1",
            order: 0,
            title: "جلسه اول",
            relevantChunkIds: ["chunk-1"],
            coreConceptIds: [],
          },
        ],
        coreConcepts: [],
        highYieldFacts: [],
      },
      lessons: [
        {
          sessionId: "session-999-nonexistent", // Unknown session!
          sessionOrder: 999,
          title: "درس نامعتبر",
          contentMarkdown: "محتوا",
          citationChunkIds: ["chunk-1"],
        },
      ],
      sourceChunks: [{ id: "chunk-1", text: "متن نمونه" }],
      generationContext: {
        targetMinutes: 10,
        minMinutes: 8,
        maxMinutes: 12,
        language: "fa",
        audience: "pharmacy_students",
      },
    };

    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(DomainError);
    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(
      "STAGE5_INVALID_SESSION_REFERENCE",
    );
  });

  it("Test 11 — Invalid chunk reference fails with STAGE5_INVALID_CHUNK_REFERENCE", () => {
    const invalidInput: ReviewSummaryGenerationInput = {
      documentId: "doc-1",
      planning: {
        sourceTopics: [
          { id: "top-1", title: "مبحث اول", chunkIds: ["chunk-1"] },
        ],
        sessions: [
          {
            id: "session-1",
            order: 0,
            title: "جلسه اول",
            relevantChunkIds: ["chunk-ghost-nonexistent"], // Unknown chunk!
            coreConceptIds: [],
          },
        ],
        coreConcepts: [],
        highYieldFacts: [],
      },
      lessons: [
        {
          sessionId: "session-1",
          sessionOrder: 0,
          title: "درس اول",
          contentMarkdown: "محتوا",
          citationChunkIds: ["chunk-1"],
        },
      ],
      sourceChunks: [{ id: "chunk-1", text: "متن نمونه" }],
      generationContext: {
        targetMinutes: 10,
        minMinutes: 8,
        maxMinutes: 12,
        language: "fa",
        audience: "pharmacy_students",
      },
    };

    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(DomainError);
    expect(() => validateReviewSummaryInput(invalidInput)).toThrow(
      "STAGE5_INVALID_CHUNK_REFERENCE",
    );
  });

  it("Test 12 — Missing upstream lessons in generateReviewSummaryDirect fails with STAGE5_MISSING_LESSONS and does NOT invoke Stage 1 or Stage 2", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const spyGateway = new SpyModelGateway();

    await docStore.create(makeDoc(docId, orgId, courseId));
    const chunks = makeChunks(docId, orgId, 2);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    const service = new GenerationService(
      genStore,
      citStore,
      spyGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    const extractSpy = vi.spyOn(service as any, "extractContentPlan");
    const batchSpy = vi.spyOn(service as any, "generateSessionsBatched");

    // Call direct generation when NO lessons exist in genStore
    await expect(
      service.generateReviewSummaryDirect(actor, orgId, docId),
    ).rejects.toThrow("STAGE5_MISSING_LESSONS");

    // Assert that Stage 5 did NOT manufacture its upstream inputs
    expect(extractSpy).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();
    expect(spyGateway.recordedMessages).toHaveLength(0);
  });

  it("Test 13 — Direct generation succeeds when Stage 1 + Stage 2 exist and does NOT invoke Stage 1 or Stage 2 generation", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const spyGateway = new SpyModelGateway();

    await docStore.create(makeDoc(docId, orgId, courseId));
    const chunks = makeChunks(docId, orgId, 2);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    const service = new GenerationService(
      genStore,
      citStore,
      spyGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    // 1. Generate lesson via the orchestrator (generateForDocument)
    await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
    });

    // 2. Reset gateway recording and spy on upstream methods
    spyGateway.recordedMessages = [];
    const extractSpy = vi.spyOn(service as any, "extractContentPlan");
    const batchSpy = vi.spyOn(service as any, "generateSessionsBatched");

    // 3. Call direct generation
    const directResult = await service.generateReviewSummaryDirect(
      actor,
      orgId,
      docId,
      { force: true },
    );
    expect(directResult.type).toBe("review_summary");

    // Assert upstream methods were NOT called during direct generation
    expect(extractSpy).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();

    // Assert that prompt sent to model contains Stage 1 + Stage 2
    const directPrompt =
      spyGateway.recordedMessages.find((m) => m.role === "user")?.content ?? "";
    expect(directPrompt).toContain("STAGE 1: CURRICULUM PLANNING & BLUEPRINT");
    expect(directPrompt).toContain("STAGE 2: GENERATED EDUCATIONAL LESSONS");
    expect(directPrompt).toContain(
      "SOURCE CHUNKS (FACTUAL GROUND TRUTH & CITATIONS)",
    );
  });

  it("Test 14 — Missing planning in persisted lesson fails with STAGE5_MISSING_PLANNING", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const spyGateway = new SpyModelGateway();

    await docStore.create(makeDoc(docId, orgId, courseId));
    const chunks = makeChunks(docId, orgId, 2);
    for (const chunk of chunks) {
      await chunkStore.create(chunk);
    }

    // Seed a lesson with empty outline and no coverageReport
    const now = new Date().toISOString();
    await genStore.create({
      id: randomUUID() as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "درس بدون طرح درس",
        outline: [],
        sessions: [
          {
            title: "جلسه ۱",
            contentMarkdown: "محتوا",
            citationChunkIds: ["chunk-1"],
          },
        ],
        contentMarkdown: "محتوا",
        citationChunkIds: ["chunk-1"],
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 100, outputTokens: 100 },
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const service = new GenerationService(
      genStore,
      citStore,
      spyGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    await expect(
      service.generateReviewSummaryDirect(actor, orgId, docId),
    ).rejects.toThrow("STAGE5_MISSING_PLANNING");
  });

  it("Test 15 — Adaptive budget is wired: scales reading minutes with document complexity", () => {
    const smallDocBudget = getReviewSummaryConfig({
      chunkCount: 2,
      totalTokens: 400,
    });
    const largeDocBudget = getReviewSummaryConfig({
      chunkCount: 30,
      totalTokens: 30000,
    });

    expect(smallDocBudget.targetReadingMinutes).toBeLessThan(
      largeDocBudget.targetReadingMinutes,
    );
    expect(smallDocBudget.maxSections).toBeLessThan(largeDocBudget.maxSections);

    const smallPrompt = buildReviewSummaryUserPrompt({
      documentId: "small-doc",
      planning: {
        sourceTopics: [],
        sessions: [
          {
            id: "session-1",
            order: 0,
            title: "مقدمه",
            relevantChunkIds: ["c1"],
            coreConceptIds: [],
          },
        ],
        coreConcepts: [],
        highYieldFacts: [],
      },
      lessons: [
        {
          sessionId: "session-1",
          sessionOrder: 0,
          title: "مقدمه",
          contentMarkdown: "درس",
          citationChunkIds: ["c1"],
        },
      ],
      sourceChunks: [{ id: "c1", text: "متن کوتاه" }],
      generationContext: {
        targetMinutes: smallDocBudget.targetReadingMinutes,
        minMinutes: smallDocBudget.minReadingMinutes,
        maxMinutes: smallDocBudget.maxReadingMinutes,
        targetWordBudget: smallDocBudget.targetWordBudget,
        maxSections: smallDocBudget.maxSections,
        language: "fa",
        audience: "pharmacy_students",
      },
    });

    expect(smallPrompt).toContain(
      `Target Reading Minutes: ${smallDocBudget.targetReadingMinutes}`,
    );
    expect(smallPrompt).toContain(
      `Target Word Budget: ~${smallDocBudget.targetWordBudget} words`,
    );
  });

  describe("C3 — Removal of Fake JSON Fallback in Stage 5", () => {
    async function setupStage5Fixture() {
      const docId = randomUUID() as DocumentId;
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const spyGateway = new SpyModelGateway();

      await docStore.create(makeDoc(docId, orgId, courseId));
      const chunks = makeChunks(docId, orgId, 2);
      for (const chunk of chunks) {
        await chunkStore.create(chunk);
      }

      const service = new GenerationService(
        genStore,
        citStore,
        spyGateway,
        docStore,
        chunkStore,
        new RoleBasedPolicy(),
        auditService,
      );

      // Generate prerequisites (Stage 1 + Stage 2)
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
      });

      return { docId, docStore, chunkStore, genStore, citStore, spyGateway, service };
    }

    it("Test A — malformed JSON: fails with STAGE5_INVALID_MODEL_JSON and nothing persisted", async () => {
      const { docId, genStore, spyGateway, service } = await setupStage5Fixture();

      // Model returns malformed JSON
      spyGateway.reviewSummaryResponseOverride = '{ "title": "خلاصه مروری", "sections":';

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_MODEL_JSON");

      // Verify no review_summary was persisted
      const contents = await genStore.listByDocument(docId, orgId);
      const reviewSummaries = contents.filter((c) => c.type === "review_summary");
      expect(reviewSummaries).toHaveLength(0);
    });

    it("Test B — empty response: fails with STAGE5_INVALID_MODEL_JSON and nothing persisted", async () => {
      const { docId, genStore, spyGateway, service } = await setupStage5Fixture();

      // Model returns empty string
      spyGateway.reviewSummaryResponseOverride = "";

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_MODEL_JSON");

      const contents = await genStore.listByDocument(docId, orgId);
      const reviewSummaries = contents.filter((c) => c.type === "review_summary");
      expect(reviewSummaries).toHaveLength(0);
    });

    it("Test C — syntactically valid but structurally invalid JSON (empty sections): fails and inserts no placeholders", async () => {
      const { docId, genStore, spyGateway, service } = await setupStage5Fixture();

      // Model returns valid JSON but empty sections array
      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        title: "خلاصه مروری",
        overview: "توضیحات کلی",
        sections: [],
      });

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_MODEL_JSON");

      const contents = await genStore.listByDocument(docId, orgId);
      const reviewSummaries = contents.filter((c) => c.type === "review_summary");
      expect(reviewSummaries).toHaveLength(0);
    });

    it("Test D — missing required section fields: fails with STAGE5_INVALID_MODEL_JSON", async () => {
      const { docId, genStore, spyGateway, service } = await setupStage5Fixture();

      // Model returns section with empty title and empty keyPoints
      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        title: "خلاصه مروری",
        overview: "توضیحات کلی",
        sections: [
          {
            title: "",
            keyPoints: [],
          },
        ],
      });

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_MODEL_JSON");

      const contents = await genStore.listByDocument(docId, orgId);
      const reviewSummaries = contents.filter((c) => c.type === "review_summary");
      expect(reviewSummaries).toHaveLength(0);
    });

    it("Test E — valid payload still succeeds and persists properly", async () => {
      const { docId, genStore, spyGateway, service } = await setupStage5Fixture();

      // Genuine valid model output
      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه مروری معتبر و جامع",
        estimatedReadingMinutes: 12,
        overview: "خلاصه کاملاً تخصصی و علمی از مبحث مربوطه.",
        sections: [
          {
            title: "بخش اول: مفاهیم و مکانیسم‌های کلیدی",
            keyPoints: ["نکته تخصصی اول فارماکولوژی", "نکته تخصصی دوم بالینی"],
            comparisons: [
              {
                conceptA: "داروی آلفا",
                conceptB: "داروی بتا",
                keyDifferences: "تفاوت در فارماکوکینتیک",
              },
            ],
            citationChunkIds: ["chunk-1"],
          },
        ],
        finalTakeaways: ["جمع‌بندی نهایی و نکات برتر آزمونی"],
        citationChunkIds: ["chunk-1"],
      });

      const result = await service.generateReviewSummaryDirect(actor, orgId, docId, {
        force: true,
      });
      expect(result.type).toBe("review_summary");

      const contents = await genStore.listByDocument(docId, orgId);
      const reviewSummaries = contents.filter((c) => c.type === "review_summary");
      expect(reviewSummaries).toHaveLength(1);
      expect((reviewSummaries[0].payload as any).title).toBe("خلاصه مروری معتبر و جامع");
      expect((reviewSummaries[0].payload as any).sections).toHaveLength(1);
    });

    it("Test F — no fake fallback strings: invalid model output never manufactures placeholder educational content", async () => {
      const { docId, genStore, spyGateway, service } = await setupStage5Fixture();

      const forbiddenStrings = [
        "نکات کلیدی مبحث آموزشی",
        "جمعبندی نکات کلیدی مبحث",
        "جمع‌بندی نکات کلیدی مبحث",
        "نکات و مفاهیم اصلی",
      ];

      const malformedOutputs = [
        '{ "title": "خلاصه مروری", "sections":',
        "",
        JSON.stringify({ title: "خلاصه مروری", sections: [] }),
        JSON.stringify({
          title: "خلاصه مروری",
          sections: [{ title: "", keyPoints: [] }],
        }),
      ];

      for (const output of malformedOutputs) {
        spyGateway.reviewSummaryResponseOverride = output;
        try {
          await service.generateReviewSummaryDirect(actor, orgId, docId, { force: true });
        } catch (err: any) {
          // Assert error itself doesn't construct fake content
          for (const forbidden of forbiddenStrings) {
            expect(err.message).not.toContain(forbidden);
          }
        }
      }

      // Assert no records in store contain the forbidden placeholder strings
      const allContents = await genStore.listByDocument(docId, orgId);
      const summaryContents = allContents.filter((c) => c.type === "review_summary");
      expect(summaryContents).toHaveLength(0);

      const serializedStore = JSON.stringify(allContents);
      for (const forbidden of forbiddenStrings) {
        expect(serializedStore).not.toContain(forbidden);
      }
    });
  });

  describe("I1 — Stage 5 Citation Integrity", () => {
    async function setupStage5CitationFixture(chunkCount = 4) {
      const docId = randomUUID() as DocumentId;
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const spyGateway = new SpyModelGateway();

      await docStore.create(makeDoc(docId, orgId, courseId));
      const chunks = makeChunks(docId, orgId, chunkCount);
      for (const chunk of chunks) {
        await chunkStore.create(chunk);
      }

      const service = new GenerationService(
        genStore,
        citStore,
        spyGateway,
        docStore,
        chunkStore,
        new RoleBasedPolicy(),
        auditService,
      );

      // Generate prerequisites (Stage 1 + Stage 2)
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
      });

      return { docId, docStore, chunkStore, genStore, citStore, spyGateway, service, chunks };
    }

    it("A. Valid section citations: preserves citations and persists successfully", async () => {
      const { docId, genStore, citStore, spyGateway, service } =
        await setupStage5CitationFixture(3);

      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه معتبر مستند",
        estimatedReadingMinutes: 10,
        overview: "بررسی جامع و مستند به سرفصل‌ها.",
        sections: [
          {
            title: "بخش اول",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1"],
          },
          {
            title: "بخش دوم",
            keyPoints: ["نکته ۲"],
            citationChunkIds: ["chunk-2"],
          },
        ],
        finalTakeaways: ["جمع‌بندی پایانی"],
        citationChunkIds: ["chunk-1", "chunk-2"],
      });

      const result = await service.generateReviewSummaryDirect(actor, orgId, docId, {
        force: true,
      });
      expect(result.type).toBe("review_summary");

      const contents = await genStore.listByDocument(docId, orgId);
      const summaries = contents.filter((c) => c.type === "review_summary");
      expect(summaries).toHaveLength(1);

      const payload = summaries[0].payload as ReviewSummaryPayload;
      expect(payload.sections[0].citationChunkIds).toEqual(["chunk-1"]);
      expect(payload.sections[1].citationChunkIds).toEqual(["chunk-2"]);
      expect(payload.citationChunkIds).toEqual(["chunk-1", "chunk-2"]);

      const storedCitations = await citStore.listByGeneratedContent(summaries[0].id);
      expect(storedCitations.map((c) => c.documentChunkId).sort()).toEqual([
        "chunk-1",
        "chunk-2",
      ]);
    });

    it("B. Unknown section citation: fails explicitly and persists nothing", async () => {
      const { docId, genStore, citStore, spyGateway, service } =
        await setupStage5CitationFixture(3);

      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه نامعتبر",
        estimatedReadingMinutes: 10,
        overview: "بررسی کلی.",
        sections: [
          {
            title: "بخش با چانک جعلی",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-that-does-not-exist"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      });

      const initialCitCount = citStore.getAll().length;

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_SECTION_CITATION");

      const contents = await genStore.listByDocument(docId, orgId);
      expect(contents.filter((c) => c.type === "review_summary")).toHaveLength(0);
      expect(citStore.getAll()).toHaveLength(initialCitCount);
    });

    it("C. Empty citation: section with empty citations fails explicitly without fallback to all chunks", async () => {
      const { docId, genStore, citStore, spyGateway, service } =
        await setupStage5CitationFixture(3);

      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه بدون ارجاع",
        estimatedReadingMinutes: 10,
        overview: "بررسی بدون ارجاع.",
        sections: [
          {
            title: "بخش بدون ارجاع",
            keyPoints: ["نکته ۱"],
            citationChunkIds: [],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      });

      const initialCitCount = citStore.getAll().length;

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_SECTION_CITATION");

      const contents = await genStore.listByDocument(docId, orgId);
      expect(contents.filter((c) => c.type === "review_summary")).toHaveLength(0);
      expect(citStore.getAll()).toHaveLength(initialCitCount);
    });

    it("D. Mixed valid/invalid citations: fails explicitly without silently keeping valid only", async () => {
      const { docId, genStore, spyGateway, service } =
        await setupStage5CitationFixture(3);

      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه با ارجاع ترکیبی",
        estimatedReadingMinutes: 10,
        overview: "بررسی ترکیبی.",
        sections: [
          {
            title: "بخش ترکیبی",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1", "fake-chunk"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      });

      await expect(
        service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
      ).rejects.toThrow("STAGE5_INVALID_SECTION_CITATION");

      const contents = await genStore.listByDocument(docId, orgId);
      expect(contents.filter((c) => c.type === "review_summary")).toHaveLength(0);
    });

    it("E. Multiple sections: preserves section-specific mapping and does not merge into sections", async () => {
      const { docId, genStore, citStore, spyGateway, service } =
        await setupStage5CitationFixture(4);

      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه با بخش‌های مجزا",
        estimatedReadingMinutes: 12,
        overview: "بررسی تفکیکی بخش‌ها.",
        sections: [
          {
            title: "بخش اول",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1"],
          },
          {
            title: "بخش دوم",
            keyPoints: ["نکته ۲"],
            citationChunkIds: ["chunk-2"],
          },
          {
            title: "بخش سوم",
            keyPoints: ["نکته ۳"],
            citationChunkIds: ["chunk-3"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      });

      await service.generateReviewSummaryDirect(actor, orgId, docId, { force: true });

      const contents = await genStore.listByDocument(docId, orgId);
      const summary = contents.find((c) => c.type === "review_summary");
      expect(summary).toBeDefined();

      const payload = summary?.payload as ReviewSummaryPayload;
      // Section-level citations must remain strictly isolated
      expect(payload.sections[0].citationChunkIds).toEqual(["chunk-1"]);
      expect(payload.sections[1].citationChunkIds).toEqual(["chunk-2"]);
      expect(payload.sections[2].citationChunkIds).toEqual(["chunk-3"]);

      // Top-level must contain the deduplicated union
      expect(payload.citationChunkIds).toEqual(["chunk-1", "chunk-2", "chunk-3"]);

      // Relational persistence must record the union of citations
      const stored = await citStore.listByGeneratedContent(summary!.id);
      expect(stored.map((s) => s.documentChunkId).sort()).toEqual([
        "chunk-1",
        "chunk-2",
        "chunk-3",
      ]);
    });

    it("F. No fallback-to-all-chunks regression test: citations are strictly derived from section content", async () => {
      // Document has 5 chunks
      const { docId, genStore, citStore, spyGateway, service } =
        await setupStage5CitationFixture(5);

      // Model only cites chunk-1 for its section
      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه تک‌مرجع",
        estimatedReadingMinutes: 10,
        overview: "فقط متکی بر چانک ۱.",
        sections: [
          {
            title: "بخش متمرکز",
            keyPoints: ["نکته مربوط به چانک ۱"],
            citationChunkIds: ["chunk-1"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      });

      await service.generateReviewSummaryDirect(actor, orgId, docId, { force: true });

      const contents = await genStore.listByDocument(docId, orgId);
      const summary = contents.find((c) => c.type === "review_summary");
      expect(summary).toBeDefined();

      const payload = summary?.payload as ReviewSummaryPayload;
      // Must NOT contain chunks 2, 3, 4, 5
      expect(payload.citationChunkIds).toEqual(["chunk-1"]);
      expect(payload.citationChunkIds).not.toContain("chunk-2");
      expect(payload.citationChunkIds).not.toContain("chunk-3");
      expect(payload.citationChunkIds).not.toContain("chunk-4");
      expect(payload.citationChunkIds).not.toContain("chunk-5");

      const stored = await citStore.listByGeneratedContent(summary!.id);
      expect(stored.map((s) => s.documentChunkId)).toEqual(["chunk-1"]);
    });
  });

  describe("C1 — Async Review Summary Regeneration", () => {
    async function setupC1Fixture(chunkCount = 4) {
      const docId = randomUUID() as DocumentId;
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();
      const jobStore = new InMemoryGenerationJobStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const spyGateway = new SpyModelGateway();

      await docStore.create(makeDoc(docId, orgId, courseId));
      const chunks = makeChunks(docId, orgId, chunkCount);
      for (const chunk of chunks) {
        await chunkStore.create(chunk);
      }

      const queue = new InMemoryGenerationQueue(jobStore);

      const genService = new GenerationService(
        genStore,
        citStore,
        spyGateway,
        docStore,
        chunkStore,
        new RoleBasedPolicy(),
        auditService,
      );

      queue.setGenerationService(genService);

      const reviewService = new ReviewService(
        genStore,
        citStore,
        docStore,
        chunkStore,
        undefined,
        undefined,
        new RoleBasedPolicy(),
        queue,
        auditService,
      );

      // Seed initial generation of Stage 2 lessons and Stage 5 review summary
      await genService.generateForDocument(actor, orgId, docId, {
        types: ["lesson", "review_summary"],
      });

      return {
        docId,
        docStore,
        chunkStore,
        genStore,
        citStore,
        jobStore,
        queue,
        spyGateway,
        genService,
        reviewService,
        chunks,
      };
    }

    async function waitForJob(
      jobStore: InMemoryGenerationJobStore,
      jobId: GenerationJobId,
      organizationId: OrganizationId = orgId,
    ) {
      for (let i = 0; i < 50; i++) {
        const job = await jobStore.findByIdForOrganization(jobId, organizationId);
        if (job && (job.status === "succeeded" || job.status === "failed")) {
          return job;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`Job ${jobId} timed out`);
    }

    it("Test A — Existing accepted Review Summary + normal generation retains duplicate-generation protection", async () => {
      const { docId, genStore, genService } = await setupC1Fixture();

      // Mark initial review summary as accepted
      const contents = await genStore.listByDocument(docId, orgId);
      const initialSummary = contents.find((c) => c.type === "review_summary")!;
      await genStore.update({
        ...initialSummary,
        status: "accepted",
        updatedAt: new Date().toISOString(),
      });

      // Normal generation request without force/regen
      await expect(
        genService.generateForDocument(actor, orgId, docId, {
          types: ["review_summary"],
        }),
      ).rejects.toThrow("تمام محتواهای درخواستی از قبل برای این فایل وجود دارند.");

      // Ensure no additional review summary was created
      const currentSummaries = (await genStore.listByDocument(docId, orgId)).filter(
        (c) => c.type === "review_summary" && c.deletedAt === null,
      );
      expect(currentSummaries).toHaveLength(1);
    });

    it("Test B — Existing accepted Review Summary + explicit regeneration actually invokes Stage 5", async () => {
      const { docId, genStore, jobStore, spyGateway, reviewService } = await setupC1Fixture();

      // Mark initial review summary as accepted
      const contents = await genStore.listByDocument(docId, orgId);
      const initialSummary = contents.find((c) => c.type === "review_summary")!;
      await genStore.update({
        ...initialSummary,
        status: "accepted",
        updatedAt: new Date().toISOString(),
      });

      const initialCallCount = spyGateway.reviewSummaryCallCount;

      // Request explicit regeneration via ReviewService
      const regenResult = await reviewService.regenerateContent(
        actor,
        orgId,
        initialSummary.id,
      );
      expect(regenResult.status).toBe("regenerating");
      expect(regenResult.job_id).toBeDefined();

      // Await async queue execution
      const job = await waitForJob(jobStore, regenResult.job_id);
      expect(job.status).toBe("succeeded");

      // Verify the Stage 5 model gateway was actually invoked for regeneration
      expect(spyGateway.reviewSummaryCallCount).toBeGreaterThan(initialCallCount);
      expect(spyGateway.lastRequestedSchemaType).toBe("review_summary");
    });

    it("Test C — Regeneration persists fresh content and replaces previous draft", async () => {
      const { docId, genStore, jobStore, spyGateway, reviewService } = await setupC1Fixture();

      const contents = await genStore.listByDocument(docId, orgId);
      const initialSummary = contents.find((c) => c.type === "review_summary")!;

      // Distinct payload for fresh generation
      spyGateway.reviewSummaryResponseOverride = JSON.stringify({
        kind: "review_summary",
        title: "خلاصه بازتولید شده کاملاً جدید و متمایز",
        estimatedReadingMinutes: 14,
        overview: "نمای کلی از مبحث بازتولید شده.",
        sections: [
          {
            title: "بخش نوسازی‌شده",
            keyPoints: ["نکته بازتولید شده اول", "نکته بازتولید شده دوم"],
            citationChunkIds: ["chunk-1"],
          },
        ],
        finalTakeaways: ["نکته پایانی جدید"],
        citationChunkIds: ["chunk-1"],
      });

      const regenResult = await reviewService.regenerateContent(
        actor,
        orgId,
        initialSummary.id,
      );
      const job = await waitForJob(jobStore, regenResult.job_id);
      expect(job.status).toBe("succeeded");

      // Check persisted review summaries
      const activeSummaries = (await genStore.listByDocument(docId, orgId)).filter(
        (c) => c.type === "review_summary" && c.deletedAt === null,
      );
      // Previous draft is soft-deleted, new draft is active
      expect(activeSummaries).toHaveLength(1);
      const activePayload = activeSummaries[0].payload as ReviewSummaryPayload;
      expect(activePayload.title).toBe("خلاصه بازتولید شده کاملاً جدید و متمایز");
      expect(activePayload.sections[0].title).toBe("بخش نوسازی‌شده");
      expect(activeSummaries[0].id).not.toBe(initialSummary.id);
    });

    it("Test D — Regeneration failure preserves C3 error handling and records job failure", async () => {
      const { docId, genStore, jobStore, spyGateway, reviewService } = await setupC1Fixture();

      const contents = await genStore.listByDocument(docId, orgId);
      const initialSummary = contents.find((c) => c.type === "review_summary")!;

      // Override with malformed JSON
      spyGateway.reviewSummaryResponseOverride = "{ malformed: json";

      const regenResult = await reviewService.regenerateContent(
        actor,
        orgId,
        initialSummary.id,
      );
      const job = await waitForJob(jobStore, regenResult.job_id);

      // Job must be failed with domain error, not falsely reported succeeded
      expect(job.status).toBe("failed");
      expect(job.errorMessage).toContain("STAGE5_INVALID_MODEL_JSON");

      // No fake placeholder summary created or persisted
      const currentSummaries = await genStore.listByDocument(docId, orgId);
      for (const s of currentSummaries) {
        expect(JSON.stringify(s.payload)).not.toContain("نکات کلیدی مبحث آموزشی");
      }
    });

    it("Test E — Only Review Summary is regenerated (no lessons, flashcards, or quizzes)", async () => {
      const { docId, genStore, jobStore, reviewService } = await setupC1Fixture();

      const initialContents = await genStore.listByDocument(docId, orgId);
      const initialLessons = initialContents.filter((c) => c.type === "lesson");
      const initialSummary = initialContents.find((c) => c.type === "review_summary")!;

      const regenResult = await reviewService.regenerateContent(
        actor,
        orgId,
        initialSummary.id,
      );
      const job = await waitForJob(jobStore, regenResult.job_id);
      expect(job.status).toBe("succeeded");

      const finalContents = await genStore.listByDocument(docId, orgId);
      const finalLessons = finalContents.filter((c) => c.type === "lesson");
      const finalFlashcards = finalContents.filter((c) => c.type === "flashcard");
      const finalQuizzes = finalContents.filter((c) => c.type === "quiz");

      // Lesson count did not change
      expect(finalLessons).toHaveLength(initialLessons.length);
      // Flashcards & quizzes were not touched
      expect(finalFlashcards).toHaveLength(0);
      expect(finalQuizzes).toHaveLength(0);
    });

    it("Test F — Existing Stage 1 + Stage 2 artifacts are reused without re-generation", async () => {
      const { docId, genStore, jobStore, genService, reviewService } = await setupC1Fixture();

      const initialContents = await genStore.listByDocument(docId, orgId);
      const initialSummary = initialContents.find((c) => c.type === "review_summary")!;

      // Spy on Stage 1 and Stage 2 generation methods
      const extractPlanSpy = vi.spyOn(genService as any, "extractContentPlan");
      const generateSessionsSpy = vi.spyOn(genService as any, "generateSessionsBatched");

      const regenResult = await reviewService.regenerateContent(
        actor,
        orgId,
        initialSummary.id,
      );
      const job = await waitForJob(jobStore, regenResult.job_id);
      expect(job.status).toBe("succeeded");

      // Invariant: Stage 5 regeneration must NOT rerun Stage 1 planning or Stage 2 batched sessions
      expect(extractPlanSpy).not.toHaveBeenCalled();
      expect(generateSessionsSpy).not.toHaveBeenCalled();
    });
  });

  describe("Stale Planning Cache Invalidation & Diagnostic Error Reporting", () => {
    it("Test 11b — STAGE5_INVALID_CHUNK_REFERENCE diagnostic error includes documentId, sessionId, generationId, and chunkId", () => {
      const invalidInput: ReviewSummaryGenerationInput = {
        documentId: "doc-diag-123",
        generationId: "gen-diag-456",
        planning: {
          sourceTopics: [
            { id: "top-1", title: "مبحث اول", chunkIds: ["chunk-valid-1"] },
          ],
          sessions: [
            {
              id: "session-diag-789",
              order: 0,
              title: "جلسه اول: پاتوفیزیولوژی",
              relevantChunkIds: ["chunk-ghost-999"], // Unknown chunk!
              coreConceptIds: [],
            },
          ],
          coreConcepts: [],
          highYieldFacts: [],
        },
        lessons: [
          {
            sessionId: "session-diag-789",
            sessionOrder: 0,
            title: "درس اول",
            contentMarkdown: "محتوای علمی",
            citationChunkIds: ["chunk-valid-1"],
          },
        ],
        sourceChunks: [{ id: "chunk-valid-1", text: "متن نمونه" }],
        generationContext: {
          targetMinutes: 10,
          minMinutes: 8,
          maxMinutes: 12,
          language: "fa",
          audience: "pharmacy_students",
        },
      };

      try {
        validateReviewSummaryInput(invalidInput);
        expect.unreachable("Should have thrown DomainError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(DomainError);
        expect(err.message).toContain("STAGE5_INVALID_CHUNK_REFERENCE");
        expect(err.message).toContain("doc-diag-123");
        expect(err.message).toContain("session-diag-789");
        expect(err.message).toContain("gen-diag-456");
        expect(err.message).toContain("chunk-ghost-999");
      }
    });

    it("Test 16 — Stale Planning Cache Invalidation: Automatically detects stale planning cache after re-chunking and completes Stage 5 cleanly", async () => {
      const docId = randomUUID() as DocumentId;
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const spyGateway = new SpyModelGateway();

      await docStore.create(makeDoc(docId, orgId, courseId));

      // 1. Initial chunk set (Set A)
      const chunksSetA: DocumentChunkRecord[] = [
        {
          id: "chunk-a-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "بخش اول قدیم",
          content: "محتوای قدیمی بخش اول",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 500,
          contentHash: "hash-a-1",
          createdAt: new Date().toISOString(),
        },
        {
          id: "chunk-a-2" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 2,
          heading: "بخش دوم قدیم",
          content: "محتوای قدیمی بخش دوم",
          startPage: 3,
          endPage: 4,
          tokenEstimate: 500,
          contentHash: "hash-a-2",
          createdAt: new Date().toISOString(),
        },
      ];
      for (const c of chunksSetA) {
        await chunkStore.create(c);
      }

      const service = new GenerationService(
        genStore,
        citStore,
        spyGateway,
        docStore,
        chunkStore,
        new RoleBasedPolicy(),
        auditService,
      );

      // Run initial generation to populate Stage 1 planning cache with Set A chunk IDs
      await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
      });

      // 2. Re-chunking occurs: Document chunks replaced with Set B (new UUIDs)
      await chunkStore.deleteByDocument(docId);
      const chunksSetB: DocumentChunkRecord[] = [
        {
          id: "chunk-b-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "بخش اول جدید",
          content: "محتوای جدید و دقیق بخش اول",
          startPage: 1,
          endPage: 2,
          tokenEstimate: 500,
          contentHash: "hash-b-1",
          createdAt: new Date().toISOString(),
        },
        {
          id: "chunk-b-2" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 2,
          heading: "بخش دوم جدید",
          content: "محتوای جدید و دقیق بخش دوم",
          startPage: 3,
          endPage: 4,
          tokenEstimate: 500,
          contentHash: "hash-b-2",
          createdAt: new Date().toISOString(),
        },
      ];
      for (const c of chunksSetB) {
        await chunkStore.create(c);
      }

      // 3. Trigger full generation with review_summary
      // The service must detect that the cached Stage 1 planning references chunk-a-*,
      // invalidate the stale cache, re-plan against chunk-b-*, and succeed!
      const genResult = await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson", "review_summary"],
        force: true,
      });

      const summary = genResult.contents.find((c) => c.type === "review_summary");
      expect(summary).toBeDefined();
      const payload = summary!.payload as ReviewSummaryPayload;
      expect(payload.kind).toBe("review_summary");

      // Verify that all citations are grounded on Set B chunks ONLY
      const validSetB = new Set(["chunk-b-1", "chunk-b-2"]);
      expect(payload.citationChunkIds.length).toBeGreaterThan(0);
      for (const cit of payload.citationChunkIds) {
        expect(validSetB.has(cit)).toBe(true);
        expect(cit).not.toContain("chunk-a-");
      }
    });

    describe("Automatic Stale Dependency Rebuild & Currency Invariants", () => {
      it("Test A — Normal cache hit: unchanged document reuses valid planning and lesson without regeneration", async () => {
        const docId = randomUUID() as DocumentId;
        const docStore = new InMemoryDocumentStore();
        const chunkStore = new InMemoryDocumentChunkStore();
        const genStore = new InMemoryGeneratedContentStore();
        const citStore = new InMemoryGeneratedContentCitationStore();
        const auditStore = new InMemoryAuditStore();
        const auditService = new AuditService(auditStore);
        const spyGateway = new SpyModelGateway();

        await docStore.create(makeDoc(docId, orgId, courseId));
        const chunkA = {
          id: "chunk-a-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "عنوان ۱",
          content: "متن ۱",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-a-1",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkA);

        const service = new GenerationService(
          genStore,
          citStore,
          spyGateway,
          docStore,
          chunkStore,
          new RoleBasedPolicy(),
          auditService,
        );

        // 1. Initial generation of lesson
        await service.generateForDocument(actor, orgId, docId, {
          types: ["lesson"],
        });

        const extractSpy = vi.spyOn(service as any, "extractContentPlan");
        const batchSpy = vi.spyOn(service as any, "generateSessionsBatched");

        // 2. Summary generation on unchanged document
        const summary = await service.generateReviewSummaryDirect(actor, orgId, docId, { force: true });

        expect(summary).toBeDefined();
        expect(extractSpy).not.toHaveBeenCalled();
        expect(batchSpy).not.toHaveBeenCalled();

        const payload = summary.payload as ReviewSummaryPayload;
        expect(payload.kind).toBe("review_summary");
        expect(payload.citationChunkIds).toContain("chunk-a-1");
      });

      it("Test B — Stale planning + lesson: automatically detects stale dependency, regenerates planning + lesson on Set B, and produces clean summary", async () => {
        const docId = randomUUID() as DocumentId;
        const docStore = new InMemoryDocumentStore();
        const chunkStore = new InMemoryDocumentChunkStore();
        const genStore = new InMemoryGeneratedContentStore();
        const citStore = new InMemoryGeneratedContentCitationStore();
        const auditStore = new InMemoryAuditStore();
        const auditService = new AuditService(auditStore);
        const spyGateway = new SpyModelGateway();

        await docStore.create(makeDoc(docId, orgId, courseId));

        // 1. Initial chunks Set A
        const chunkA = {
          id: "chunk-a-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "قدیم",
          content: "متن قدیمی منبع",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-a",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkA);

        const service = new GenerationService(
          genStore,
          citStore,
          spyGateway,
          docStore,
          chunkStore,
          new RoleBasedPolicy(),
          auditService,
        );

        // Generate lesson on Set A
        await service.generateForDocument(actor, orgId, docId, {
          types: ["lesson"],
        });

        // Verify initial lesson references chunk-a-1
        const initialContents = await genStore.listByDocument(docId, orgId);
        const initialLesson = initialContents.find((c) => c.type === "lesson");
        expect(initialLesson).toBeDefined();
        expect((initialLesson!.payload as LessonPayload).citationChunkIds).toContain("chunk-a-1");

        // 2. Document is re-chunked to Set B
        await chunkStore.deleteByDocument(docId);
        const chunkB1 = {
          id: "chunk-b-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "جدید ۱",
          content: "متن جدید ۱",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-b-1",
          createdAt: new Date().toISOString(),
        };
        const chunkB2 = {
          id: "chunk-b-2" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 2,
          heading: "جدید ۲",
          content: "متن جدید ۲",
          startPage: 2,
          endPage: 2,
          tokenEstimate: 500,
          contentHash: "hash-b-2",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkB1);
        await chunkStore.create(chunkB2);

        // 3. Request Summary generation
        const summary = await service.generateReviewSummaryDirect(actor, orgId, docId, { force: true });
        expect(summary).toBeDefined();

        const summaryPayload = summary.payload as ReviewSummaryPayload;
        expect(summaryPayload.kind).toBe("review_summary");

        // Assert all summary citations are in Set B and no chunk-a references exist
        const validSetB = new Set(["chunk-b-1", "chunk-b-2"]);
        for (const cit of summaryPayload.citationChunkIds) {
          expect(validSetB.has(cit)).toBe(true);
          expect(cit).not.toContain("chunk-a-");
        }

        // Assert that the lesson was regenerated in DB and its citations are in Set B
        const updatedContents = await genStore.listByDocument(docId, orgId);
        const updatedLesson = updatedContents.find((c) => c.type === "lesson" && c.deletedAt === null);
        expect(updatedLesson).toBeDefined();
        const updatedLessonPayload = updatedLesson!.payload as LessonPayload;
        for (const cit of updatedLessonPayload.citationChunkIds) {
          expect(validSetB.has(cit)).toBe(true);
          expect(cit).not.toContain("chunk-a-");
        }
      });

      it("Test C — Stale lesson only: regenerates Lesson B using current chunk set without reusing stale Lesson A", async () => {
        const docId = randomUUID() as DocumentId;
        const docStore = new InMemoryDocumentStore();
        const chunkStore = new InMemoryDocumentChunkStore();
        const genStore = new InMemoryGeneratedContentStore();
        const citStore = new InMemoryGeneratedContentCitationStore();
        const auditStore = new InMemoryAuditStore();
        const auditService = new AuditService(auditStore);
        const spyGateway = new SpyModelGateway();

        await docStore.create(makeDoc(docId, orgId, courseId));

        // Current chunks
        const chunkB = {
          id: "chunk-b-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "مبحث اصلی",
          content: "متن معتبر منبع",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-b",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkB);

        // Stale lesson in store citing chunk-a-1
        const staleLessonRecord: GeneratedContentRecord = {
          id: randomUUID() as GeneratedContentId,
          organizationId: orgId,
          documentId: docId,
          courseId: courseId,
          type: "lesson",
          status: "draft",
          payload: {
            kind: "lesson",
            title: "درس قدیمی",
            sessions: [
              {
                title: "جلسه قدیمی",
                contentMarkdown: "محتوای قدیمی",
                citationChunkIds: ["chunk-a-1"],
              },
            ],
            contentMarkdown: "محتوا",
            citationChunkIds: ["chunk-a-1"],
          },
          promptVersion: "v1",
          model: "mock",
          tokenUsage: { inputTokens: 100, outputTokens: 50 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        await genStore.create(staleLessonRecord);

        const service = new GenerationService(
          genStore,
          citStore,
          spyGateway,
          docStore,
          chunkStore,
          new RoleBasedPolicy(),
          auditService,
        );

        // Request Summary
        const summary = await service.generateReviewSummaryDirect(actor, orgId, docId, { force: true });
        expect(summary).toBeDefined();

        const summaryPayload = summary.payload as ReviewSummaryPayload;
        expect(summaryPayload.citationChunkIds).toContain("chunk-b-1");
        expect(summaryPayload.citationChunkIds).not.toContain("chunk-a-1");

        // Stale lesson must not be in active draft
        const allLessons = (await genStore.listByDocument(docId, orgId)).filter((c) => c.type === "lesson" && c.deletedAt === null);
        expect(allLessons.length).toBe(1);
        expect((allLessons[0].payload as LessonPayload).citationChunkIds).toContain("chunk-b-1");
      });

      it("Test D — Regeneration failure: if lesson regeneration fails, errors cleanly and never generates summary from stale lesson", async () => {
        const docId = randomUUID() as DocumentId;
        const docStore = new InMemoryDocumentStore();
        const chunkStore = new InMemoryDocumentChunkStore();
        const genStore = new InMemoryGeneratedContentStore();
        const citStore = new InMemoryGeneratedContentCitationStore();
        const auditStore = new InMemoryAuditStore();
        const auditService = new AuditService(auditStore);

        // Failing gateway
        const failingGateway = {
          async complete(): Promise<never> {
            throw new Error("Provider simulated network failure");
          },
        };

        await docStore.create(makeDoc(docId, orgId, courseId));
        const chunkB = {
          id: "chunk-b-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "مبحث اصلی",
          content: "متن معتبر منبع",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-b",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkB);

        // Stale lesson citing chunk-a-1
        const staleLessonRecord: GeneratedContentRecord = {
          id: randomUUID() as GeneratedContentId,
          organizationId: orgId,
          documentId: docId,
          courseId: courseId,
          type: "lesson",
          status: "draft",
          payload: {
            kind: "lesson",
            title: "درس قدیمی",
            sessions: [
              {
                title: "جلسه قدیمی",
                contentMarkdown: "محتوای قدیمی",
                citationChunkIds: ["chunk-a-1"],
              },
            ],
            contentMarkdown: "محتوا",
            citationChunkIds: ["chunk-a-1"],
          },
          promptVersion: "v1",
          model: "mock",
          tokenUsage: { inputTokens: 100, outputTokens: 50 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };
        await genStore.create(staleLessonRecord);

        const service = new GenerationService(
          genStore,
          citStore,
          failingGateway as any,
          docStore,
          chunkStore,
          new RoleBasedPolicy(),
          auditService,
        );

        await expect(
          service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
        ).rejects.toThrow("Provider simulated network failure");

        // Verify summary was NOT created
        const contents = await genStore.listByDocument(docId, orgId);
        const summary = contents.find((c) => c.type === "review_summary");
        expect(summary).toBeUndefined();
      });

      it("Test E — Concurrent request: two concurrent summary requests after re-extraction maintain consistency without corrupted cache", async () => {
        const docId = randomUUID() as DocumentId;
        const docStore = new InMemoryDocumentStore();
        const chunkStore = new InMemoryDocumentChunkStore();
        const genStore = new InMemoryGeneratedContentStore();
        const citStore = new InMemoryGeneratedContentCitationStore();
        const auditStore = new InMemoryAuditStore();
        const auditService = new AuditService(auditStore);
        const spyGateway = new SpyModelGateway();

        await docStore.create(makeDoc(docId, orgId, courseId));

        // Initial chunk set A
        const chunkA = {
          id: "chunk-a-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "قدیم",
          content: "متن قدیم",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-a",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkA);

        const service = new GenerationService(
          genStore,
          citStore,
          spyGateway,
          docStore,
          chunkStore,
          new RoleBasedPolicy(),
          auditService,
        );

        await service.generateForDocument(actor, orgId, docId, {
          types: ["lesson"],
        });

        // Re-chunk to Set B
        await chunkStore.deleteByDocument(docId);
        const chunkB = {
          id: "chunk-b-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "جدید",
          content: "متن جدید",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 500,
          contentHash: "hash-b",
          createdAt: new Date().toISOString(),
        };
        await chunkStore.create(chunkB);

        // Run concurrent summary requests
        const [res1, res2] = await Promise.all([
          service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
          service.generateReviewSummaryDirect(actor, orgId, docId, { force: true }),
        ]);

        expect(res1).toBeDefined();
        expect(res2).toBeDefined();

        const p1 = res1.payload as ReviewSummaryPayload;
        const p2 = res2.payload as ReviewSummaryPayload;
        expect(p1.citationChunkIds).toContain("chunk-b-1");
        expect(p1.citationChunkIds).not.toContain("chunk-a-1");
        expect(p2.citationChunkIds).toContain("chunk-b-1");
        expect(p2.citationChunkIds).not.toContain("chunk-a-1");

        // Verify final stored lesson
        const contents = await genStore.listByDocument(docId, orgId);
        const activeLessons = contents.filter((c) => c.type === "lesson" && c.deletedAt === null);
        expect(activeLessons.length).toBe(1);
        expect((activeLessons[0].payload as LessonPayload).citationChunkIds).toContain("chunk-b-1");
      });
    });
  });
});

