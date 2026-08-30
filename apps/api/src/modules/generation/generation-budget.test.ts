// @ts-nocheck
import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentChunkId,
  type DocumentId,
  type OrganizationId,
  RoleBasedPolicy,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import { MockModelGateway } from "./gateway/mock.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "./test/in-memory-stores.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../learning/learning-store.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";

function makeDoc(
  id: DocumentId,
  organizationId: OrganizationId,
  pageCount: number,
  sizeBytes: number,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: `lecture_${pageCount}p.pdf`,
    mimeType: "application/pdf",
    sizeBytes,
    sha256: "a".repeat(64),
    storageKey: `uploads/${id}.pdf`,
    pageCount,
    status: "extracted",
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
  chunkCount: number,
  tokensPerChunk = 500,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: chunkCount }, (_, i) => ({
    id: `chunk-${documentId}-${i + 1}` as DocumentChunkId,
    documentId,
    organizationId,
    sequence: i,
    heading: `سرفصل بخش ${i + 1}`,
    content: `محتوای متنی آموزشی چانک شماره ${i + 1} شامل مفاهیم علمی، جداول مقایسه‌ای و نکات تشخیصی-درمانی.`,
    startPage: i + 1,
    endPage: i + 1,
    tokenEstimate: tokensPerChunk,
    contentHash: `hash-${i}`,
    createdAt: now,
  }));
}

describe("GenerationService Adaptive Generation Budgeting (Phase 2)", () => {
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: GenerationService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "organization_admin",
  };
  const orgId = randomUUID() as OrganizationId;

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

  it("A) Very Small Document (1 page, 1 chunk, 350 tokens) receives a compact 1-topic budget", async () => {
    const docId = randomUUID() as DocumentId;
    await documentStore.create(makeDoc(docId, orgId, 1, 1024));
    const chunks = makeChunks(docId, orgId, 1, 350);
    await chunkStore.createMany(chunks);

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson", "flashcard", "quiz"],
    });

    expect(result.contents).toHaveLength(3);
    const lesson = result.contents.find((c) => c.type === "lesson");
    const flashcard = result.contents.find((c) => c.type === "flashcard");
    const quiz = result.contents.find((c) => c.type === "quiz");

    expect(lesson).toBeDefined();
    const lessonPayload = lesson!.payload as {
      outline?: Array<{ title: string }>;
      sessions?: Array<{ title: string }>;
    };
    expect(lessonPayload.outline).toHaveLength(1);
    expect(lessonPayload.sessions).toHaveLength(1);

    expect(flashcard).toBeDefined();
    const flashcardPayload = flashcard!.payload as {
      cards?: Array<{ question: string }>;
    };
    // 1 topic × 3 cards = 3 cards
    expect(flashcardPayload.cards).toBeDefined();
    expect(flashcardPayload.cards!.length).toBeGreaterThanOrEqual(2);
    expect(flashcardPayload.cards!.length).toBeLessThanOrEqual(4);

    expect(quiz).toBeDefined();
    const quizPayload = quiz!.payload as {
      questions?: Array<{ question: string }>;
    };
    expect(quizPayload.questions).toBeDefined();
    expect(quizPayload.questions!.length).toBeGreaterThanOrEqual(1);
    expect(quizPayload.questions!.length).toBeLessThanOrEqual(3);

    // Citations
    expect(lesson!.citations).toContain(chunks[0].id);
    expect(flashcard!.citations).toContain(chunks[0].id);
    expect(quiz!.citations).toContain(chunks[0].id);
  });

  it("B) Current 6-Page Document (6 pages, 6 chunks, 3,000 tokens) receives 2-4 sessions budget", async () => {
    const docId = randomUUID() as DocumentId;
    await documentStore.create(makeDoc(docId, orgId, 6, 6144));
    const chunks = makeChunks(docId, orgId, 6, 500);
    await chunkStore.createMany(chunks);

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson", "flashcard", "quiz"],
    });

    const lesson = result.contents.find((c) => c.type === "lesson");
    const flashcard = result.contents.find((c) => c.type === "flashcard");
    const quiz = result.contents.find((c) => c.type === "quiz");

    const lessonPayload = lesson!.payload as {
      outline?: Array<{ title: string }>;
      sessions?: Array<{ title: string }>;
    };
    expect(lessonPayload.outline!.length).toBeGreaterThanOrEqual(2);
    expect(lessonPayload.outline!.length).toBeLessThanOrEqual(4);
    expect(lessonPayload.sessions!.length).toBe(lessonPayload.outline!.length);

    const flashcardPayload = flashcard!.payload as {
      cards?: Array<{ question: string }>;
    };
    expect(flashcardPayload.cards!.length).toBeGreaterThanOrEqual(8);

    const quizPayload = quiz!.payload as {
      questions?: Array<{ question: string }>;
    };
    expect(quizPayload.questions!.length).toBeGreaterThanOrEqual(6);

    // All chunks remain eligible for routing
    for (const chunk of chunks) {
      expect(lesson!.citations).toContain(chunk.id);
    }
  });

  it("C) Medium Document (20 pages, 20 chunks, 10,000 tokens) scales to at least 8 sessions (Coverage-Driven Policy)", async () => {
    const docId = randomUUID() as DocumentId;
    await documentStore.create(makeDoc(docId, orgId, 20, 20480));
    const chunks = makeChunks(docId, orgId, 20, 500);
    await chunkStore.createMany(chunks);

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson", "flashcard", "quiz"],
    });

    const lesson = result.contents.find((c) => c.type === "lesson");
    const flashcard = result.contents.find((c) => c.type === "flashcard");
    const quiz = result.contents.find((c) => c.type === "quiz");

    const lessonPayload = lesson!.payload as {
      outline?: Array<{ title: string }>;
      sessions?: Array<{ title: string }>;
    };
    expect(lessonPayload.outline!.length).toBeGreaterThanOrEqual(8);
    expect(lessonPayload.outline!.length).toBeLessThanOrEqual(12);
    expect(lessonPayload.sessions!.length).toBe(lessonPayload.outline!.length);

    const flashcardPayload = flashcard!.payload as {
      cards?: Array<{ question: string }>;
    };
    // 8+ topics × 10+ cards/topic = at least 80 flashcards
    expect(flashcardPayload.cards!.length).toBeGreaterThanOrEqual(80);

    const quizPayload = quiz!.payload as {
      questions?: Array<{ question: string }>;
    };
    // 8+ topics × 10+ questions/topic = at least 80 questions
    expect(quizPayload.questions!.length).toBeGreaterThanOrEqual(80);

    // All chunks routed
    for (const chunk of chunks) {
      expect(lesson!.citations).toContain(chunk.id);
    }
  });

  it("D) Large Document (50 pages, 50 chunks, 25,000 tokens) scales to at least 10 sessions", async () => {
    const docId = randomUUID() as DocumentId;
    await documentStore.create(makeDoc(docId, orgId, 50, 51200));
    const chunks = makeChunks(docId, orgId, 50, 500);
    await chunkStore.createMany(chunks);

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
    });

    const lesson = result.contents.find((c) => c.type === "lesson");
    const lessonPayload = lesson!.payload as {
      outline?: Array<{ title: string }>;
      sessions?: Array<{ title: string }>;
    };
    expect(lessonPayload.outline!.length).toBeGreaterThanOrEqual(10);
    expect(lessonPayload.outline!.length).toBeLessThanOrEqual(14);
    expect(lessonPayload.sessions!.length).toBe(lessonPayload.outline!.length);
  });
});
