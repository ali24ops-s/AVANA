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
  });
});
