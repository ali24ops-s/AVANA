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

    it("throws forbidden for a student viewing the queue", async () => {
      await expect(
        service.reviewQueue(student, organizationId, courseId, "req-1"),
      ).rejects.toMatchObject({ code: "forbidden" });
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
});
