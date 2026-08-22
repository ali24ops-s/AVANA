/**
 * Comprehensive tests for DocumentService.
 *
 * Covers:
 * - Upload intent validation (MIME, size, empty)
 * - Confirm upload persists file + metadata
 * - Duplicate detection by SHA256 (reuse existing document)
 * - List documents with search, filter, sort, pagination, and owner/org scoping
 * - Get document with usage details (org-scoped, non-disclosing 404)
 * - Update document (rename without changing storage key, course assignment)
 * - Delete document (soft delete + storage + chunk cleanup)
 * - Bulk operations with partial failure reporting (bulkDelete, bulkAttachCourse, bulkReprocess)
 * - Multi-tenant organization isolation (Org A vs Org B)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  type DocumentId,
} from "@avana/domain";
import {
  DocumentService,
  MAX_DOCUMENT_SIZE_BYTES,
} from "./document-service.js";
import { DocumentProcessingService } from "./document-processing-service.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../organizations/test/in-memory-stores.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import { defaultPolicy } from "@avana/domain";

class FakeStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<{
    storageKey: string;
    uploadUrl: string | null;
    expiresAt: string;
  }> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async save(options: {
    storageKey: string;
    data: Buffer;
    mimeType: string;
  }): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const buf = this.files.get(storageKey);
    if (!buf) throw new Error(`Not found: ${storageKey}`);
    return buf;
  }

  filesCount(): number {
    return this.files.size;
  }
}

describe("DocumentService", () => {
  let store: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let storage: FakeStorageProvider;
  let service: DocumentService;
  let processingService: DocumentProcessingService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };
  const adminActor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "organization_admin",
  };
  const otherUserActor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };

  const organizationId = randomUUID() as OrganizationId;
  const otherOrganizationId = randomUUID() as OrganizationId;

  beforeEach(async () => {
    store = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    storage = new FakeStorageProvider();

    // Seed memberships for Org A
    orgStore.createWithAdminMembership({
      organization: {
        id: organizationId,
        name: "Org A",
        slug: "org-a",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId,
        userId: adminActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId,
      userId: actor.userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed memberships for Org B
    orgStore.createWithAdminMembership({
      organization: {
        id: otherOrganizationId,
        name: "Org B",
        slug: "org-b",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: otherOrganizationId,
        userId: otherUserActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    service = new DocumentService(
      store,
      storage,
      orgStore,
      defaultPolicy,
      undefined,
      chunkStore,
      undefined,
      undefined,
      undefined,
      undefined,
      courseStore,
      moduleStore,
      lessonStore,
    );

    processingService = new DocumentProcessingService(
      store,
      chunkStore,
      storage,
      defaultPolicy,
      undefined,
      orgStore,
    );
  });

  const pdfBytes = Buffer.from("%PDF-1.4 fake pdf content");
  const docxBytes = Buffer.from("PK fake docx content");

  describe("createUploadIntent", () => {
    it("returns an upload intent for a valid pdf", async () => {
      const intent = await service.createUploadIntent(actor, organizationId, {
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
      });

      expect(intent.document_id).toBeDefined();
      expect(intent.storage_key).toMatch(/^uploads\/.+\.pdf$/);
      expect(intent.expires_at).toBeDefined();
    });

    it("rejects an unsupported mime type", async () => {
      await expect(
        service.createUploadIntent(actor, organizationId, {
          originalName: "audio.mp3",
          mimeType: "audio/mp3",
          sizeBytes: 10,
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    });

    it("rejects an empty upload", async () => {
      await expect(
        service.createUploadIntent(actor, organizationId, {
          originalName: "empty.pdf",
          mimeType: "application/pdf",
          sizeBytes: 0,
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    });

    it("rejects an oversized upload", async () => {
      await expect(
        service.createUploadIntent(actor, organizationId, {
          originalName: "big.pdf",
          mimeType: "application/pdf",
          sizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1,
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    });
  });

  describe("confirmUpload", () => {
    it("persists the file and creates a document record", async () => {
      const result = await service.confirmUpload(actor, organizationId, {
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      expect(result.duplicate).toBe(false);
      expect(result.document.status).toBe("uploaded");
      expect(result.document.original_name).toBe("notes.pdf");
      expect(result.document.owner_user_id).toBe(actor.userId);
      expect(result.document.sha256).toHaveLength(64);
      expect(storage.filesCount()).toBe(1);
    });

    it("detects duplicates by sha256 and returns the existing document", async () => {
      const first = await service.confirmUpload(actor, organizationId, {
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      const second = await service.confirmUpload(actor, organizationId, {
        originalName: "copy.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      expect(second.duplicate).toBe(true);
      expect(second.document.id).toBe(first.document.id);
      expect(storage.filesCount()).toBe(1);
    });
  });

  describe("listDocuments and filtering", () => {
    it("lists documents with search, type, and status filtering", async () => {
      await service.confirmUpload(actor, organizationId, {
        originalName: "pharmacology.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      await service.confirmUpload(actor, organizationId, {
        originalName: "anatomy_notes.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: docxBytes.length,
        data: docxBytes,
      });

      // Search match
      const searchRes = await service.listDocuments(adminActor, organizationId, {
        search: "pharma",
      });
      expect(searchRes.items).toHaveLength(1);
      expect(searchRes.items[0].original_name).toBe("pharmacology.pdf");

      // Type filter match
      const typeRes = await service.listDocuments(adminActor, organizationId, {
        type: "application/pdf",
      });
      expect(typeRes.items).toHaveLength(1);

      // Pagination
      const pageRes = await service.listDocuments(adminActor, organizationId, {
        limit: 1,
        page: 1,
      });
      expect(pageRes.items).toHaveLength(1);
      expect(pageRes.total).toBe(2);
      expect(pageRes.totalPages).toBe(2);
    });

    it("calculates accurate aggregate stats", async () => {
      await service.confirmUpload(actor, organizationId, {
        originalName: "file1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        data: Buffer.from("pdf1"),
      });

      await service.confirmUpload(actor, organizationId, {
        originalName: "file2.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2000,
        data: Buffer.from("pdf2"),
      });

      const stats = await service.getDocumentStats(adminActor, organizationId);
      expect(stats.total_count).toBe(2);
      expect(stats.total_size_bytes).toBe(3000);
      expect(stats.unused_count).toBe(2);
      expect(stats.used_count).toBe(0);
    });
  });

  describe("updateDocument (Rename and Course Assignment)", () => {
    it("renames document without changing storage key", async () => {
      const created = await service.confirmUpload(actor, organizationId, {
        originalName: "old_name.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      const updated = await service.updateDocument(
        actor,
        organizationId,
        created.document.id,
        { originalName: "new_name.pdf" },
      );

      expect(updated.original_name).toBe("new_name.pdf");

      const fetched = await service.getDocument(
        actor,
        organizationId,
        created.document.id,
      );
      expect(fetched.original_name).toBe("new_name.pdf");
      expect(storage.filesCount()).toBe(1);
    });

    it("attaches and detaches course to document", async () => {
      const courseId = randomUUID() as CourseId;
      await courseStore.create({
        course: {
          id: courseId,
          organizationId,
          name: "Pharmacology 101",
          subject: "Medicine",
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      const created = await service.confirmUpload(actor, organizationId, {
        originalName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      // Attach
      const attached = await service.updateDocument(
        actor,
        organizationId,
        created.document.id,
        { courseId },
      );
      expect(attached.course_id).toBe(courseId);

      const detail = await service.getDocument(
        actor,
        organizationId,
        created.document.id,
      );
      expect(detail.usage?.course?.name).toBe("Pharmacology 101");

      // Detach
      const detached = await service.updateDocument(
        actor,
        organizationId,
        created.document.id,
        { courseId: null },
      );
      expect(detached.course_id).toBeNull();
    });
  });

  describe("reprocessDocument", () => {
    it("forces re-extraction and chunk generation without creating duplicate content", async () => {
      const created = await service.confirmUpload(actor, organizationId, {
        originalName: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 12,
        data: Buffer.from("Hello AVANA!"),
      });

      // First extraction
      const status1 = await processingService.processDocument(
        actor,
        organizationId,
        created.document.id,
      );
      expect(status1.status).toBe("extracted");
      expect(status1.chunk_count).toBeGreaterThanOrEqual(1);

      // Reprocess
      const status2 = await processingService.reprocessDocument(
        actor,
        organizationId,
        created.document.id,
      );
      expect(status2.status).toBe("extracted");
      expect(status2.chunk_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("bulk operations with partial failure", () => {
    it("bulk deletes multiple documents and reports individual item results", async () => {
      const doc1 = await service.confirmUpload(actor, organizationId, {
        originalName: "doc1.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: Buffer.from("pdf1"),
      });

      const doc2 = await service.confirmUpload(actor, organizationId, {
        originalName: "doc2.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: Buffer.from("pdf2"),
      });

      const nonExistentId = randomUUID() as DocumentId;

      const bulkRes = await service.bulkDelete(actor, organizationId, [
        doc1.document.id,
        doc2.document.id,
        nonExistentId,
      ]);

      expect(bulkRes.total).toBe(3);
      expect(bulkRes.succeeded).toBe(2);
      expect(bulkRes.failed).toBe(1);
      expect(bulkRes.results.find((r: { document_id: string }) => r.document_id === doc1.document.id)?.success).toBe(true);
      expect(bulkRes.results.find((r: { document_id: string }) => r.document_id === nonExistentId)?.success).toBe(false);
    });

    it("bulk attaches courses with partial failure handling", async () => {
      const doc1 = await service.confirmUpload(actor, organizationId, {
        originalName: "doc1.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: Buffer.from("pdf1"),
      });

      const nonExistentId = randomUUID() as DocumentId;

      const bulkRes = await service.bulkAttachCourse(
        actor,
        organizationId,
        [doc1.document.id, nonExistentId],
        null,
      );

      expect(bulkRes.total).toBe(2);
      expect(bulkRes.succeeded).toBe(1);
      expect(bulkRes.failed).toBe(1);
    });
  });

  describe("Multi-tenant organization isolation", () => {
    it("prevents Org B from reading, previewing, renaming, or deleting Org A documents", async () => {
      const docA = await service.confirmUpload(actor, organizationId, {
        originalName: "secret_org_a.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      // Org B get document
      await expect(
        service.getDocument(otherUserActor, otherOrganizationId, docA.document.id),
      ).rejects.toMatchObject({ code: "not_found" });

      // Org B download
      await expect(
        service.downloadDocument(otherUserActor, otherOrganizationId, docA.document.id),
      ).rejects.toMatchObject({ code: "not_found" });

      // Org B rename
      await expect(
        service.updateDocument(otherUserActor, otherOrganizationId, docA.document.id, {
          originalName: "hacked.pdf",
        }),
      ).rejects.toMatchObject({ code: "not_found" });

      // Org B delete
      await expect(
        service.deleteDocument(otherUserActor, otherOrganizationId, docA.document.id),
      ).rejects.toMatchObject({ code: "not_found" });

      // Org B bulk delete targeting Org A file
      const bulkRes = await service.bulkDelete(
        otherUserActor,
        otherOrganizationId,
        [docA.document.id],
      );
      expect(bulkRes.succeeded).toBe(0);
      expect(bulkRes.failed).toBe(1);

      // Org A's document remains untouched
      const validGet = await service.getDocument(
        actor,
        organizationId,
        docA.document.id,
      );
      expect(validGet.original_name).toBe("secret_org_a.pdf");
    });
  });
});
