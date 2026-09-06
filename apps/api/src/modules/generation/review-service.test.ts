/**
 * PR6-6 ReviewService unit tests.
 *
 * Uses in-memory stores + InMemoryGenerationQueue.
 *
 * Covers:
 * - reviewQueue: lists draft/edited content, excludes accepted/rejected
 * - getContentForReview: returns content + source chunks + citations + metadata
 * - accept: draft → accepted, materializes lesson (idempotent), audit emitted
 * - reject: requires reason, draft/edited → rejected, audit emitted
 * - edit: draft/edited → edited, preserves citations/previous payload, audit
 * - regenerate: async via queue (202), marks regenerating, audit emitted
 * - authorization: student cannot accept/reject/edit/regenerate (403)
 * - non-disclosing not_found for cross-org content
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type GeneratedContentId,
  type DocumentChunkId,
  RoleBasedPolicy,
} from "@avana/domain";
import { ReviewService } from "./review-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "./test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../learning/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "./generation-queue.js";
import type {
  GeneratedContentRecord,
  GeneratedContentCitationRecord,
} from "./generation-store.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../learning/learning-store.js";
import type { LessonPayload } from "@avana/domain";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
  courseId: CourseId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    sha256: "b".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 1,
    status: "review_pending",
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
  count = 2,
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

function makeContent(
  overrides: Partial<GeneratedContentRecord> & { id: GeneratedContentId },
  organizationId: OrganizationId,
  documentId: DocumentId,
  courseId: CourseId,
): GeneratedContentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    documentId,
    courseId,
    type: "lesson",
    status: "draft",
    payload: {
      kind: "lesson",
      title: "AI Lesson",
      contentMarkdown: "# Generated",
      citationChunkIds: [],
    },
    promptVersion: "v1",
    model: "mock-1",
    tokenUsage: { inputTokens: 10, outputTokens: 20 },
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
    ...overrides,
  };
}

describe("ReviewService", () => {
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let jobStore: InMemoryGenerationJobStore;
  let queue: InMemoryGenerationQueue;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: ReviewService;
  let seededChunks: DocumentChunkRecord[];

  const editor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "course_editor",
  };
  const student: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };
  const organizationId = randomUUID() as OrganizationId;
  const courseId = randomUUID() as CourseId;
  const documentId = randomUUID() as DocumentId;

  function seedContent(
    overrides?: Partial<GeneratedContentRecord>,
  ): GeneratedContentRecord {
    const record = makeContent(
      { id: randomUUID() as GeneratedContentId, ...overrides },
      organizationId,
      documentId,
      courseId,
    );
    contentStore.insert(record);
    return record;
  }

  beforeEach(() => {
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    jobStore = new InMemoryGenerationJobStore();
    queue = new InMemoryGenerationQueue(jobStore);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    // Seed document + chunks for citation lookups.
    documentStore.insert(
      makeDocument({ id: documentId }, organizationId, courseId),
    );
    seededChunks = makeChunks(documentId, organizationId, 2);
    chunkStore.createMany(seededChunks);

    service = new ReviewService(
      contentStore,
      citationStore,
      documentStore,
      chunkStore,
      moduleStore,
      lessonStore,
      new RoleBasedPolicy(),
      queue,
      auditService,
    );
  });

  describe("reviewQueue", () => {
    it("lists draft and edited content pending review", async () => {
      seedContent(); // draft
      seedContent({ status: "edited" });
      seedContent({ status: "accepted" });
      seedContent({ status: "rejected" });

      const result = await service.reviewQueue(
        editor,
        organizationId,
        courseId,
        "req-1",
      );
      expect(result.pending).toHaveLength(2);
      const statuses = result.pending.map((p) => p.status).sort();
      expect(statuses).toEqual(["draft", "edited"]);
    });

    it("allows a student to view the review queue", async () => {
      seedContent();
      const result = await service.reviewQueue(
        student,
        organizationId,
        courseId,
        "req-1",
      );
      expect(result.pending).toHaveLength(1);
    });
  });

  describe("getContentForReview", () => {
    it("returns content with citations, source chunks, and metadata", async () => {
      const content = seedContent();
      const citation: GeneratedContentCitationRecord = {
        generatedContentId: content.id,
        documentChunkId: seededChunks[0].id,
      };
      citationStore.insert(citation);

      const result = await service.getContentForReview(
        editor,
        organizationId,
        content.id,
        "req-1",
      );

      expect(result.content.id).toBe(content.id);
      expect(result.content.status).toBe("draft");
      expect(result.content.citations).toEqual([seededChunks[0].id]);
      expect(result.source_chunks).toHaveLength(1);
      expect(result.source_chunks[0].content).toBe("Chunk content 1");
      expect(result.generation.model).toBe("mock-1");
    });

    it("throws not_found for a cross-organization content", async () => {
      const content = seedContent();
      const otherOrg = randomUUID() as OrganizationId;
      await expect(
        service.getContentForReview(editor, otherOrg, content.id, "req-1"),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("acceptContent", () => {
    it("accepts a draft lesson and materializes it into the Learning Core", async () => {
      const content = seedContent();
      const result = await service.acceptContent(
        editor,
        organizationId,
        content.id,
      );

      expect(result.status).toBe("accepted");
      expect(result.materialized_lesson_id).toBeDefined();

      // Lesson materialized as published upon review acceptance.
      const lessons = lessonStore.getAll();
      expect(lessons).toHaveLength(1);
      expect(lessons[0].publicationStatus).toBe("published");
      expect(lessons[0].title).toBe("AI Lesson");
      expect(lessons[0].contentMarkdown).toBe("# Generated");

      // Content persisted as accepted with review metadata.
      const stored = contentStore.getAll()[0];
      expect(stored.status).toBe("accepted");
      expect(stored.acceptedBy).toBe(editor.userId);
      expect(stored.reviewedBy).toBe(editor.userId);
      expect(stored.materializedLessonId).toBe(result.materialized_lesson_id);

      // Audit emitted.
      const events = await auditStore.listAll();
      expect(events.map((e) => e.action)).toContain("content.accepted");
    });

    it("is idempotent — accepting twice does not duplicate lessons", async () => {
      const content = seedContent();
      await service.acceptContent(editor, organizationId, content.id);
      const second = await service.acceptContent(
        editor,
        organizationId,
        content.id,
      );

      expect(second.status).toBe("accepted");
      expect(lessonStore.getAll()).toHaveLength(1);
    });

    it("rejects accepting content in a non-draft/edited state", async () => {
      const content = seedContent({ status: "rejected" });
      await expect(
        service.acceptContent(editor, organizationId, content.id),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("throws forbidden for a student accepting content", async () => {
      const content = seedContent();
      await expect(
        service.acceptContent(student, organizationId, content.id),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  describe("rejectContent", () => {
    it("rejects a draft with a reason and emits audit", async () => {
      const content = seedContent();
      const result = await service.rejectContent(
        editor,
        organizationId,
        content.id,
        "Factually incorrect",
      );

      expect(result.status).toBe("rejected");

      const stored = contentStore.getAll()[0];
      expect(stored.status).toBe("rejected");
      expect(stored.reviewedBy).toBe(editor.userId);
      expect(stored.reviewReason).toBe("Factually incorrect");

      const events = await auditStore.listAll();
      expect(events.map((e) => e.action)).toContain("content.rejected");
    });

    it("requires a rejection reason", async () => {
      const content = seedContent();
      await expect(
        service.rejectContent(editor, organizationId, content.id, ""),
      ).rejects.toMatchObject({ code: "bad_request" });
    });
  });

  describe("editContent", () => {
    it("edits a draft, preserves citations, and stores previous payload", async () => {
      const content = seedContent();
      citationStore.insert({
        generatedContentId: content.id,
        documentChunkId: seededChunks[0].id,
      });

      const newPayload: LessonPayload = {
        kind: "lesson",
        title: "Edited Lesson",
        contentMarkdown: "# Edited",
        citationChunkIds: [seededChunks[0].id as DocumentChunkId],
      };
      const result = await service.editContent(
        editor,
        organizationId,
        content.id,
        { payload: newPayload },
      );

      expect(result.content.status).toBe("edited");
      expect((result.content.payload as LessonPayload).title).toBe(
        "Edited Lesson",
      );

      const stored = contentStore.getAll()[0];
      expect(stored.status).toBe("edited");
      expect((stored.payload as LessonPayload).title).toBe("Edited Lesson");
      expect(stored.editedBy).toBe(editor.userId);
      expect(stored.editedAt).toBeDefined();

      // Previous payload preserved.
      expect(stored.previousPayload).toBeDefined();
      expect((stored.previousPayload as LessonPayload).title).toBe("AI Lesson");

      // Citations preserved.
      expect(result.content.citations).toEqual([seededChunks[0].id]);

      const events = await auditStore.listAll();
      expect(events.map((e) => e.action)).toContain("content.edited");
    });

    it("throws forbidden for a student editing content", async () => {
      const content = seedContent();
      const payload: LessonPayload = {
        kind: "lesson",
        title: "x",
        contentMarkdown: "y",
        citationChunkIds: [],
      };
      await expect(
        service.editContent(student, organizationId, content.id, { payload }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  describe("regenerateContent", () => {
    it("marks content regenerating and enqueues an async job", async () => {
      const content = seedContent();
      const result = await service.regenerateContent(
        editor,
        organizationId,
        content.id,
      );

      expect(result.status).toBe("regenerating");
      expect(result.job_id).toBeDefined();

      const stored = contentStore.getAll()[0];
      expect(stored.status).toBe("regenerating");

      // A generation job was enqueued.
      expect(jobStore.getAll()).toHaveLength(1);

      const events = await auditStore.listAll();
      expect(events.map((e) => e.action)).toContain("content.regenerated");
    });

    it("throws conflict when content is already regenerating", async () => {
      const content = seedContent({ status: "regenerating" });
      await expect(
        service.regenerateContent(editor, organizationId, content.id),
      ).rejects.toMatchObject({ code: "conflict" });
    });
  });

  describe("reviewQueue grouping by source document", () => {
    it("Test 1: single document with lesson, MCQ, and flashcards produces exactly one group", async () => {
      // Create 1 document
      const doc = makeDocument({ id: randomUUID() as DocumentId, originalName: "pharmacology-ch12.pdf" }, organizationId, courseId);
      await documentStore.create(doc);

      // Create 3 generated contents with different types for this document
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, type: "lesson", status: "draft" }, organizationId, doc.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, type: "quiz", status: "draft" }, organizationId, doc.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, type: "flashcard", status: "draft" }, organizationId, doc.id, courseId));

      const res = await service.reviewQueue(editor, organizationId, courseId, "req-test-1");

      expect(res.groups).toBeDefined();
      expect(res.groups).toHaveLength(1);
      expect(res.groups![0].document?.id).toBe(doc.id);
      expect(res.groups![0].document?.filename).toBe("pharmacology-ch12.pdf");
      expect(res.groups![0].items).toHaveLength(3);
      expect(res.groups![0].stats).toEqual({
        total: 3,
        pending: 3,
        approved: 0,
        rejected: 0,
        needsRevision: 0,
      });
    });

    it("Test 2: two documents with multiple review items produce exactly two groups", async () => {
      const docA = makeDocument({ id: randomUUID() as DocumentId, originalName: "docA.pdf" }, organizationId, courseId);
      const docB = makeDocument({ id: randomUUID() as DocumentId, originalName: "docB.pdf" }, organizationId, courseId);
      await documentStore.create(docA);
      await documentStore.create(docB);

      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, type: "lesson", status: "draft" }, organizationId, docA.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, type: "flashcard", status: "draft" }, organizationId, docA.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, type: "quiz", status: "draft" }, organizationId, docB.id, courseId));

      const res = await service.reviewQueue(editor, organizationId, courseId, "req-test-2");

      expect(res.groups).toHaveLength(2);
      const groupDocIds = res.groups!.map((g) => g.document?.id);
      expect(groupDocIds).toContain(docA.id);
      expect(groupDocIds).toContain(docB.id);
    });

    it("Test 3: review item without document_id belongs to Unknown Source group without wrong attribution", async () => {
      // Content with null documentId
      await contentStore.create({
        ...makeContent({ id: randomUUID() as GeneratedContentId, status: "draft" }, organizationId, "" as DocumentId, courseId),
        documentId: null,
      });

      const res = await service.reviewQueue(editor, organizationId, courseId, "req-test-3");

      expect(res.groups).toHaveLength(1);
      expect(res.groups![0].document).toBeNull();
      expect(res.groups![0].items).toHaveLength(1);
    });

    it("Test 4: status aggregation correctly tallies total, pending, approved, and rejected", async () => {
      const doc = makeDocument({ id: randomUUID() as DocumentId, originalName: "stats-test.pdf" }, organizationId, courseId);
      await documentStore.create(doc);

      // pending x 2 (1 draft, 1 edited), approved x 1 (accepted), rejected x 1 (rejected)
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "draft" }, organizationId, doc.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "edited" }, organizationId, doc.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "accepted" }, organizationId, doc.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "rejected" }, organizationId, doc.id, courseId));

      const res = await service.reviewQueue(editor, organizationId, courseId, "req-test-4");

      expect(res.groups).toHaveLength(1);
      expect(res.groups![0].stats).toEqual({
        total: 4,
        pending: 2,
        approved: 1,
        rejected: 1,
        needsRevision: 1,
      });
      // items array only contains the pending items
      expect(res.groups![0].items).toHaveLength(2);
    });

    it("Test 5: pending filter excludes documents with 0 pending review items", async () => {
      const docA = makeDocument({ id: randomUUID() as DocumentId, originalName: "docA-has-pending.pdf" }, organizationId, courseId);
      const docB = makeDocument({ id: randomUUID() as DocumentId, originalName: "docB-all-done.pdf" }, organizationId, courseId);
      await documentStore.create(docA);
      await documentStore.create(docB);

      // Doc A: 1 accepted, 1 pending
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "accepted" }, organizationId, docA.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "draft" }, organizationId, docA.id, courseId));

      // Doc B: 1 accepted, 1 rejected (0 pending)
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "accepted" }, organizationId, docB.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "rejected" }, organizationId, docB.id, courseId));

      const res = await service.reviewQueue(editor, organizationId, courseId, "req-test-5");

      expect(res.groups).toHaveLength(1);
      expect(res.groups![0].document?.id).toBe(docA.id);
    });

    it("Test 6: pagination is performed at the Group/Document level", async () => {
      const doc1 = makeDocument({ id: randomUUID() as DocumentId, originalName: "doc1.pdf" }, organizationId, courseId);
      const doc2 = makeDocument({ id: randomUUID() as DocumentId, originalName: "doc2.pdf" }, organizationId, courseId);
      const doc3 = makeDocument({ id: randomUUID() as DocumentId, originalName: "doc3.pdf" }, organizationId, courseId);
      await documentStore.create(doc1);
      await documentStore.create(doc2);
      await documentStore.create(doc3);

      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "draft" }, organizationId, doc1.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "draft" }, organizationId, doc2.id, courseId));
      await contentStore.create(makeContent({ id: randomUUID() as GeneratedContentId, status: "draft" }, organizationId, doc3.id, courseId));

      // Page 1, limit 2 groups
      const page1 = await service.reviewQueue(editor, organizationId, courseId, "req-pag-1", { page: 1, limit: 2 });
      expect(page1.groups).toHaveLength(2);
      expect(page1.pagination?.total).toBe(3);
      expect(page1.pagination?.totalPages).toBe(2);
      expect(page1.pagination?.page).toBe(1);

      // Page 2, limit 2 groups
      const page2 = await service.reviewQueue(editor, organizationId, courseId, "req-pag-2", { page: 2, limit: 2 });
      expect(page2.groups).toHaveLength(1);
      expect(page2.pagination?.page).toBe(2);
    });

    it("Test 7: text search matches document filename and content title", async () => {
      const docCardio = makeDocument({ id: randomUUID() as DocumentId, originalName: "cardiology-basics.pdf" }, organizationId, courseId);
      const docNeuro = makeDocument({ id: randomUUID() as DocumentId, originalName: "neurology-basics.pdf" }, organizationId, courseId);
      await documentStore.create(docCardio);
      await documentStore.create(docNeuro);

      await contentStore.create(makeContent({
        id: randomUUID() as GeneratedContentId,
        status: "draft",
        payload: { kind: "lesson", title: "Heart Rate Regulation", contentMarkdown: "# Heart", citationChunkIds: [] },
      }, organizationId, docCardio.id, courseId));

      await contentStore.create(makeContent({
        id: randomUUID() as GeneratedContentId,
        status: "draft",
        payload: { kind: "lesson", title: "Synaptic Transmission", contentMarkdown: "# Synapse", citationChunkIds: [] },
      }, organizationId, docNeuro.id, courseId));

      // Search by document name "cardio"
      const resDocSearch = await service.reviewQueue(editor, organizationId, courseId, "req-s-1", { search: "cardio" });
      expect(resDocSearch.groups).toHaveLength(1);
      expect(resDocSearch.groups![0].document?.id).toBe(docCardio.id);

      // Search by item title "synaptic"
      const resItemSearch = await service.reviewQueue(editor, organizationId, courseId, "req-s-2", { search: "synaptic" });
      expect(resItemSearch.groups).toHaveLength(1);
      expect(resItemSearch.groups![0].document?.id).toBe(docNeuro.id);
    });
  });
});
