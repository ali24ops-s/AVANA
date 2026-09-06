/**
 * PR6-4 GenerationService unit tests.
 *
 * Uses in-memory stores + MockModelGateway.
 *
 * Covers:
 * - Happy path: extracted → generating → review_pending, drafts persisted with citations
 * - Conflict guard: non-extracted document rejected
 * - Citation writes: every generated content has citationChunkIds mapped to real chunks
 * - Idempotency: two identical calls with same generationKey must not duplicate drafts
 * - Audit events emitted
 * - Non-disclosing not_found for missing/cross-org documents
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type GeneratedContentId,
  RoleBasedPolicy,
  DomainError,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import { MockModelGateway } from "./gateway/index.js";
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

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 1,
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
  count = 3,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID() as DocumentChunkRecord["id"],
    documentId,
    organizationId,
    sequence: i + 1,
    heading: `Heading ${i + 1}`,
    content: `Chunk content ${i + 1}`,
    startPage: 1,
    endPage: 1,
    tokenEstimate: 10,
    contentHash: `hash-${i}`,
    createdAt: now,
  }));
}

describe("GenerationService", () => {
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: GenerationService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };
  const organizationId = randomUUID() as OrganizationId;

  beforeEach(() => {
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    service = new GenerationService(
      contentStore,
      citationStore,
      new MockModelGateway(),
      documentStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );
  });

  describe("generateForDocument", () => {
    it("generates a lesson draft and transitions to review_pending", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId);
      await chunkStore.createMany(chunks);

      const result = await service.generateForDocument(
        actor,
        organizationId,
        docId,
        {},
      );

      expect(result.document_status).toBe("review_pending");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].type).toBe("lesson");
      expect(result.contents[0].status).toBe("draft");

      // Persistent draft.
      const stored = contentStore.getAll();
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe("draft");

      // Citations written.
      const citations = citationStore.getAll();
      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].documentChunkId).toBeDefined();

      // Document status updated in store.
      const updated = await documentStore.findByIdForOrganization(
        docId,
        organizationId,
      );
      expect(updated?.status).toBe("review_pending");
    });

    it("rejects non-extracted documents with conflict", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument(
        { id: docId, status: "uploaded" },
        organizationId,
      );
      await documentStore.create(doc);

      await expect(
        service.generateForDocument(actor, organizationId, docId, {}),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("rejects a document with no chunks", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);

      await expect(
        service.generateForDocument(actor, organizationId, docId, {}),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("grounds every artifact to real source chunks", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const result = await service.generateForDocument(
        actor,
        organizationId,
        docId,
        {},
      );

            const chunkIdSet = new Set<string>(chunks.map((c) => c.id));
      const payload = result.contents[0].payload as {
        citationChunkIds: string[];
      };
      expect(payload.citationChunkIds.length).toBeGreaterThan(0);
      for (const id of payload.citationChunkIds) {
        expect(chunkIdSet.has(id)).toBe(true);
      }
    });

    it("does not create duplicate drafts with the same generation key", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const key = "doc:lesson:v1";
      const input = { generationKey: key };

      await service.generateForDocument(actor, organizationId, docId, input);
      await service.generateForDocument(actor, organizationId, docId, input);

      const stored = contentStore.getAll();
      expect(stored).toHaveLength(1);
    });

    it("emits content.generated audit events", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      await service.generateForDocument(actor, organizationId, docId, {});

      const events = await auditStore.listAll();
      expect(events.map((e) => e.action)).toContain("content.generated");
    });

    it("throws not_found for a missing document", async () => {
      await expect(
        service.generateForDocument(
          actor,
          organizationId,
          randomUUID() as DocumentId,
          {},
        ),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("throws not_found for a document in another organization", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);

      const otherOrg = randomUUID() as OrganizationId;
      await expect(
        service.generateForDocument(actor, otherOrg, docId, {}),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("listByDocument", () => {
    it("lists generated content for a document", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 1);
      await chunkStore.createMany(chunks);

      await service.generateForDocument(actor, organizationId, docId, {});
      const listed = await service.listByDocument(actor, organizationId, docId);

      expect(listed).toHaveLength(1);
      expect(listed[0].citations.length).toBeGreaterThan(0);
    });
  });

  describe("getGeneratedContent", () => {
    it("returns a single generated content with citations", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 1);
      await chunkStore.createMany(chunks);

      const result = await service.generateForDocument(
        actor,
        organizationId,
        docId,
        {},
      );
      const contentId = result.contents[0].id;

      const content = await service.getGeneratedContent(
        actor,
        organizationId,
        docId,
        contentId,
      );
      expect(content.id).toBe(contentId);
      expect(content.citations.length).toBeGreaterThan(0);
    });

    it("throws not_found for an unknown content id", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 1);
      await chunkStore.createMany(chunks);

      await expect(
        service.getGeneratedContent(
          actor,
          organizationId,
          docId,
          randomUUID() as GeneratedContentId,
        ),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("Coverage Report & Failure Persistence", () => {
    it("attaches full coverageReport and generates GFM comparison tables", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 20 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 20);
      await chunkStore.createMany(chunks);

      const result = await service.generateForDocument(
        actor,
        organizationId,
        docId,
        { types: ["lesson", "flashcard", "quiz"] },
      );

      const lessonContent = result.contents.find((c) => c.type === "lesson");
      expect(lessonContent).toBeDefined();

      const payload = lessonContent!.payload as {
        kind: "lesson";
        sessions: Array<{ title: string; contentMarkdown: string }>;
        coverageReport?: {
          sourceTopicsIdentified: unknown[];
          majorConceptsCovered: unknown[];
          flashcardCoverage: { totalCards: number; coveragePct: number };
          quizCoverage: { totalQuestions: number; coveragePct: number };
        };
      };

      expect(payload.coverageReport).toBeDefined();
      expect(payload.coverageReport!.sourceTopicsIdentified.length).toBeGreaterThanOrEqual(8);
      expect(payload.coverageReport!.majorConceptsCovered.length).toBeGreaterThanOrEqual(8);
      expect(payload.coverageReport!.flashcardCoverage.totalCards).toBeGreaterThanOrEqual(80);
      expect(payload.coverageReport!.quizCoverage.totalQuestions).toBeGreaterThanOrEqual(80);

      // Verify Markdown GFM tables in generated sessions
      const hasTable = payload.sessions.some((s) => s.contentMarkdown.includes("|---|"));
      expect(hasTable).toBe(true);
    });

    it("persists status failed and errorCode when generation throws", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 1);
      await chunkStore.createMany(chunks);

      const failingGateway = {
        provider: "mock" as const,
        complete: async () => {
          throw new DomainError("rate_limit_exceeded", "Free tier daily quota exceeded");
        },
      };

      const failingService = new GenerationService(
        contentStore,
        citationStore,
        failingGateway,
        documentStore,
        chunkStore,
        new RoleBasedPolicy(),
        auditService,
      );

      await expect(
        failingService.generateForDocument(actor, organizationId, docId, { types: ["lesson"] }),
      ).rejects.toMatchObject({ code: "rate_limit_exceeded" });

      const updatedDoc = await documentStore.findByIdForOrganization(docId, organizationId);
      expect(updatedDoc!.status).toBe("failed");
      expect(updatedDoc!.errorCode).toBe("rate_limit_exceeded");
      expect(updatedDoc!.retryCount).toBe(1);
    });

    it("regression: Stage 2 isolates session chunks and never sends full document chunks for invalid/empty relevantChunkIds", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await documentStore.create(doc);
      // Create 5 distinct chunks
      const chunks = makeChunks(docId, organizationId, 5);
      await chunkStore.createMany(chunks);

      const capturedRequests: Array<{ prompt: string; schemaType?: string }> = [];

      const spyGateway = {
        provider: "mock" as const,
        model: "mock-spy",
        complete: async (req: any) => {
          const userMsg = req.messages.find((m: any) => m.role === "user")?.content ?? "";
          const schemaType = req.jsonSchema?.type;
          capturedRequests.push({ prompt: userMsg, schemaType });

          if (schemaType === "content_plan") {
            return {
              text: JSON.stringify({
                kind: "content_plan",
                moduleTitle: "فارماکولوژی",
                sessions: [
                  {
                    index: 0,
                    title: "جلسه ۱: داروهای بتا ۱",
                    description: "شرح بتا ۱",
                    relevantChunkIds: [chunks[0].id, chunks[1].id], // Only chunks 0 and 1
                  },
                  {
                    index: 1,
                    title: "جلسه ۲: بدون چانک معتبر",
                    description: "بدون چانک",
                    relevantChunkIds: [], // Empty / invalid chunk IDs
                  },
                ],
              }),
              model: "mock-spy",
              usage: { inputTokens: 50, outputTokens: 50 },
              finishReason: "stop",
            };
          }

          if (schemaType === "session") {
            return {
              text: JSON.stringify({
                kind: "session",
                title: "جلسه ۱: داروهای بتا ۱",
                contentMarkdown: "# جلسه ۱\n\nمحتوای آموزشی کامل.",
                citationChunkIds: [chunks[0].id],
              }),
              model: "mock-spy",
              usage: { inputTokens: 50, outputTokens: 50 },
              finishReason: "stop",
            };
          }

          return {
            text: JSON.stringify({ kind: "mock" }),
            model: "mock-spy",
            usage: { inputTokens: 10, outputTokens: 10 },
            finishReason: "stop",
          };
        },
      };

      const spyService = new GenerationService(
        contentStore,
        citationStore,
        spyGateway as any,
        documentStore,
        chunkStore,
        new RoleBasedPolicy(),
        auditService,
      );

      const res = await spyService.generateForDocument(actor, organizationId, docId, {
        types: ["lesson"],
      });

      // Filter Stage 2 requests (schemaType === "session")
      const stage2Requests = capturedRequests.filter((r) => r.schemaType === "session");

      // 1. Exactly 1 request was sent to Model Gateway (for session 1). Session 2 was skipped because of empty chunk IDs.
      expect(stage2Requests.length).toBe(1);

      // 2. Session 1 prompt MUST only contain chunk 0 and chunk 1, and MUST NOT contain chunk 2, 3, 4
      const session1Prompt = stage2Requests[0].prompt;
      expect(session1Prompt).toContain(chunks[0].id);
      expect(session1Prompt).toContain(chunks[1].id);
      expect(session1Prompt).not.toContain(chunks[2].id);
      expect(session1Prompt).not.toContain(chunks[3].id);
      expect(session1Prompt).not.toContain(chunks[4].id);

      // 3. Document chunks for chunks 2, 3, 4 were never sent to any Stage 2 request
      stage2Requests.forEach((req) => {
        expect(req.prompt).not.toContain(chunks[2].id);
        expect(req.prompt).not.toContain(chunks[3].id);
        expect(req.prompt).not.toContain(chunks[4].id);
      });

      // 4. In generated lesson content, session 2 was preserved as diagnostic placeholder without sending full document
      const lesson = res.contents.find((c) => c.type === "lesson");
      expect(lesson).toBeDefined();
      const payload = lesson!.payload as any;
      expect(payload.sessions.length).toBe(2);
      expect(payload.sessions[0].title).toBe("جلسه ۱: داروهای بتا ۱");
      expect(payload.sessions[1].title).toBe("جلسه ۲: بدون چانک معتبر");
      expect(payload.sessions[1].contentMarkdown).toContain("خطای انتساب منبع");
    });
  });

  describe("Decoupled Selective Content Generation Suite (6 RCA Scenarios)", () => {
    it("Scenario 1: types = ['flashcard'] -> zero lesson LLM calls, zero lesson chunks, flashcards succeed directly from source chunks + blueprint", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 1 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const capturedCalls: Array<{ stage?: string; prompt: string; schemaType?: string }> = [];
      const spyGateway = {
        provider: "mock" as const,
        model: "mock-model",
        complete: async (req: any) => {
          const schemaType = req.jsonSchema?.type;
          capturedCalls.push({
            stage: req.stage,
            prompt: req.messages?.find((m: any) => m.role === "user")?.content || "",
            schemaType,
          });

          if (schemaType === "content_plan") {
            return {
              text: JSON.stringify({
                kind: "content_plan",
                moduleTitle: "فارماکولوژی",
                outline: [{ title: "مبحث ۱", description: "توضیح ۱" }],
                sourceTopics: [{ id: "t1", title: "مبحث ۱", description: "توضیح ۱", relevantChunkIds: [chunks[0].id] }],
                sessions: [
                  {
                    index: 0,
                    title: "جلسه ۱: مبحث ۱",
                    description: "توضیح جلسه ۱",
                    coreConcepts: [{ id: "c1", name: "مفهوم ۱", description: "توضیح مفهوم ۱" }],
                    relevantChunkIds: [chunks[0].id, chunks[1].id],
                    targetFlashcardCount: 3,
                    targetQuizCount: 2,
                  },
                ],
              }),
              model: "mock-spy",
              usage: { inputTokens: 50, outputTokens: 50 },
              finishReason: "stop",
            };
          }

          if (schemaType === "flashcards") {
            return {
              text: JSON.stringify({
                kind: "flashcards",
                cards: [
                  {
                    question: "داروی بتا ۱ چیست؟",
                    answer: "پاسخ بتا ۱",
                    cardType: "mechanism",
                    difficulty: "medium",
                    citationChunkIds: [chunks[0].id],
                  },
                ],
              }),
              model: "mock-spy",
              usage: { inputTokens: 40, outputTokens: 40 },
              finishReason: "stop",
            };
          }

          return {
            text: JSON.stringify({ kind: "mock" }),
            model: "mock-spy",
            usage: { inputTokens: 10, outputTokens: 10 },
            finishReason: "stop",
          };
        },
      };

      const chunkRecordStore = new InMemoryGenerationChunkStore();
      const selectiveService = new GenerationService(
        contentStore,
        citationStore,
        spyGateway as any,
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

      const res = await selectiveService.generateForDocument(actor, organizationId, docId, {
        types: ["flashcard"],
      });

      // 1. Zero lesson calls made to LLM gateway
      const lessonCalls = capturedCalls.filter(
        (c) => c.stage === "lesson" || c.schemaType === "session" || c.schemaType === "sessions_batch",
      );
      expect(lessonCalls.length).toBe(0);

      // 2. Flashcard call was made and grounded in session blueprint and chunk context
      const flashcardCalls = capturedCalls.filter((c) => c.stage === "flashcard" || c.schemaType === "flashcards");
      expect(flashcardCalls.length).toBe(1);
      expect(flashcardCalls[0].prompt).toContain(chunks[0].id);
      expect(flashcardCalls[0].prompt).toContain("جلسه ۱: مبحث ۱");
      expect(flashcardCalls[0].prompt).toContain("مفهوم ۱");

      // 3. Zero generation_chunks with stage "lesson" created in store
      const persistedChunks = await chunkRecordStore.listByDocument(docId, organizationId);
      const lessonChunks = persistedChunks.filter((c) => c.stage === "lesson");
      expect(lessonChunks.length).toBe(0);
      const flashcardChunks = persistedChunks.filter((c) => c.stage === "flashcard");
      expect(flashcardChunks.length).toBe(1);

      // 4. Output contains ONLY flashcard
      expect(res.contents.length).toBe(1);
      expect(res.contents[0].type).toBe("flashcard");
    });

    it("Scenario 2: types = ['lesson'] -> preserves full Lesson generation behavior", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 2 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const mockGateway = new MockModelGateway();
      const chunkRecordStore = new InMemoryGenerationChunkStore();
      const testService = new GenerationService(
        contentStore,
        citationStore,
        mockGateway,
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

      const res = await testService.generateForDocument(actor, organizationId, docId, {
        types: ["lesson"],
      });

      expect(res.contents.length).toBe(1);
      expect(res.contents[0].type).toBe("lesson");

      const persistedChunks = await chunkRecordStore.listByDocument(docId, organizationId);
      const lessonChunks = persistedChunks.filter((c) => c.stage === "lesson");
      expect(lessonChunks.length).toBeGreaterThanOrEqual(1);
    });

    it("Scenario 3: types = ['lesson', 'flashcard'] -> generates both Lesson and Flashcards, with Flashcard consuming Lesson context", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 2 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const mockGateway = new MockModelGateway();
      const chunkRecordStore = new InMemoryGenerationChunkStore();
      const testService = new GenerationService(
        contentStore,
        citationStore,
        mockGateway,
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

      const res = await testService.generateForDocument(actor, organizationId, docId, {
        types: ["lesson", "flashcard"],
      });

      expect(res.contents.length).toBe(2);
      const types = res.contents.map((c) => c.type);
      expect(types).toContain("lesson");
      expect(types).toContain("flashcard");

      const persistedChunks = await chunkRecordStore.listByDocument(docId, organizationId);
      expect(persistedChunks.some((c) => c.stage === "lesson")).toBe(true);
      expect(persistedChunks.some((c) => c.stage === "flashcard")).toBe(true);
    });

    it("Scenario 4: types = ['flashcard', 'quiz'] -> generates Flashcard and Quiz with ZERO Lesson calls and ZERO Lesson chunks", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 3 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 3);
      await chunkStore.createMany(chunks);

      const capturedStages: string[] = [];
      const spyGateway = {
        provider: "mock" as const,
        model: "mock-model",
        complete: async (req: any) => {
          if (req.stage) capturedStages.push(req.stage);
          const schemaType = req.jsonSchema?.type;
          if (schemaType === "content_plan") {
            return {
              text: JSON.stringify({
                kind: "content_plan",
                moduleTitle: "فارماکولوژی",
                outline: [{ title: "مبحث ۱", description: "توضیح ۱" }],
                sourceTopics: [{ id: "t1", title: "مبحث ۱", description: "توضیح ۱", relevantChunkIds: [chunks[0].id] }],
                sessions: [
                  {
                    index: 0,
                    title: "جلسه ۱",
                    description: "توضیح ۱",
                    coreConcepts: [{ id: "c1", name: "مفهوم ۱", description: "توضیح ۱" }],
                    relevantChunkIds: [chunks[0].id],
                    targetFlashcardCount: 2,
                    targetQuizCount: 2,
                  },
                ],
              }),
              model: "mock-spy",
              usage: { inputTokens: 50, outputTokens: 50 },
              finishReason: "stop",
            };
          }
          if (schemaType === "flashcards") {
            return {
              text: JSON.stringify({
                kind: "flashcards",
                cards: [{ question: "سؤال ۱", answer: "پاسخ ۱", citationChunkIds: [chunks[0].id] }],
              }),
              model: "mock-spy",
              usage: { inputTokens: 20, outputTokens: 20 },
              finishReason: "stop",
            };
          }
          if (schemaType === "quizzes" || schemaType === "quiz") {
            return {
              text: JSON.stringify({
                kind: "quiz",
                questions: [
                  {
                    question: "کدام گزینه صحیح است؟",
                    choices: ["الف", "ب", "ج", "د"],
                    correctAnswer: "الف",
                    explanation: "توضیح",
                    citationChunkIds: [chunks[0].id],
                  },
                ],
              }),
              model: "mock-spy",
              usage: { inputTokens: 20, outputTokens: 20 },
              finishReason: "stop",
            };
          }
          return {
            text: JSON.stringify({ kind: "mock" }),
            model: "mock-spy",
            usage: { inputTokens: 10, outputTokens: 10 },
            finishReason: "stop",
          };
        },
      };

      const chunkRecordStore = new InMemoryGenerationChunkStore();
      const testService = new GenerationService(
        contentStore,
        citationStore,
        spyGateway as any,
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

      const res = await testService.generateForDocument(actor, organizationId, docId, {
        types: ["flashcard", "quiz"],
      });

      // No "lesson" stage was invoked
      expect(capturedStages).not.toContain("lesson");
      expect(capturedStages).toContain("planning");
      expect(capturedStages).toContain("flashcard");
      expect(capturedStages).toContain("quiz");

      // Zero lesson chunks in DB
      const chunksInStore = await chunkRecordStore.listByDocument(docId, organizationId);
      expect(chunksInStore.some((c) => c.stage === "lesson")).toBe(false);

      // Contents has only flashcard and quiz
      expect(res.contents.length).toBe(2);
      const outputTypes = res.contents.map((c) => c.type);
      expect(outputTypes).toContain("flashcard");
      expect(outputTypes).toContain("quiz");
      expect(outputTypes).not.toContain("lesson");
    });

    it("Scenario 5: Persistence -> Flashcard-only mode persists ONLY flashcard in generatedContentStore", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 2 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const mockGateway = new MockModelGateway();
      const chunkRecordStore = new InMemoryGenerationChunkStore();
      const testService = new GenerationService(
        contentStore,
        citationStore,
        mockGateway,
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

      await testService.generateForDocument(actor, organizationId, docId, {
        types: ["flashcard"],
      });

      const allDrafts = await contentStore.listByDocument(docId, organizationId);
      expect(allDrafts.length).toBe(1);
      expect(allDrafts[0].type).toBe("flashcard");
      expect(allDrafts.some((d) => d.type === "lesson")).toBe(false);
    });

    it("Scenario 6: Resumability -> pre-existing lesson chunks from prior run do NOT cause unwanted Lesson generation/materialization in new Flashcard-only run", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId, pageCount: 2 }, organizationId);
      await documentStore.create(doc);
      const chunks = makeChunks(docId, organizationId, 2);
      await chunkStore.createMany(chunks);

      const chunkRecordStore = new InMemoryGenerationChunkStore();
      // Pre-seed an old lesson chunk from an earlier execution
      await chunkRecordStore.upsert({
        id: randomUUID(),
        organizationId,
        documentId: docId,
        courseId: doc.courseId,
        stage: "lesson",
        chunkIndex: 0,
        chunkKey: "lesson:0",
        status: "completed",
        payload: { title: "درس قدیمی", contentMarkdown: "# درس قدیمی", citationChunkIds: [chunks[0].id] },
        attempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const mockGateway = new MockModelGateway();
      const testService = new GenerationService(
        contentStore,
        citationStore,
        mockGateway,
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

      const res = await testService.generateForDocument(actor, organizationId, docId, {
        types: ["flashcard"],
      });

      // Output must be ONLY flashcard
      expect(res.contents.length).toBe(1);
      expect(res.contents[0].type).toBe("flashcard");

      // Store must contain ONLY flashcard draft
      const drafts = await contentStore.listByDocument(docId, organizationId);
      expect(drafts.length).toBe(1);
      expect(drafts[0].type).toBe("flashcard");
      expect(drafts.some((d) => d.type === "lesson")).toBe(false);
    });
  });
});

