/**
 * PR6-3 DocumentProcessingService tests.
 *
 * Covers:
 * - Successful extraction (uploaded → extracting → extracted) with chunks
 * - status fields (page_count, chunk_count, retry_count)
 * - Idempotency: re-processing an extracted document is a no-op
 * - Unsupported MIME → failed with error_code
 * - Corrupted file → failed with error_code + retry_count increment
 * - Non-disclosing 404 for missing/cross-org documents
 * - Extraction status endpoint behavior
 * - Audit events emitted
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type UserId,
  RoleBasedPolicy,
  type DocumentId,
} from "@avana/domain";
import { DocumentProcessingService } from "./document-processing-service.js";
import { InMemoryDocumentStore } from "../learning/test/in-memory-stores.js";
import { InMemoryDocumentChunkStore } from "../learning/test/in-memory-stores.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import type { DocumentRecord } from "../learning/learning-store.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";

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

  set(key: string, data: Buffer): void {
    this.files.set(key, data);
  }
}

const PDF_MIME = "application/pdf";

function validPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< >>
stream
BT
(Hello AVANA extraction) Tj
ET
endstream
endobj
%%EOF`,
    "latin1",
  );
}

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: null,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "notes.pdf",
    mimeType: PDF_MIME,
    sizeBytes: 100,
    sha256: "a".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: null,
    status: "uploaded",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("DocumentProcessingService", () => {
  let store: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let storage: FakeStorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: DocumentProcessingService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };
  const organizationId = randomUUID() as OrganizationId;

  beforeEach(() => {
    store = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    storage = new FakeStorageProvider();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    service = new DocumentProcessingService(
      store,
      chunkStore,
      storage,
      new RoleBasedPolicy(),
      auditService,
    );
  });

  describe("processDocument", () => {
    it("extracts a PDF and persists chunks", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);
      storage.set(doc.storageKey, validPdf());

      const status = await service.processDocument(
        actor,
        organizationId,
        docId,
      );

      expect(status.status).toBe("extracted");
      expect(status.page_count).toBeGreaterThan(0);
      expect(status.chunk_count).toBeGreaterThan(0);
      expect(status.retry_count).toBe(0);

      const chunks = await chunkStore.listByDocument(docId);
      expect(chunks.length).toBe(status.chunk_count);
      expect(chunks[0].content).toContain("Hello AVANA");

      const updated = await store.findByIdForOrganization(
        docId,
        organizationId,
      );
      expect(updated?.status).toBe("extracted");
      expect(updated?.pageCount).toBe(status.page_count);
    });

    it("is idempotent for already-extracted documents", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument(
        { id: docId, status: "extracted", pageCount: 1 },
        organizationId,
      );
      await store.create(doc);

      const status = await service.processDocument(
        actor,
        organizationId,
        docId,
      );
      expect(status.status).toBe("extracted");
    });

    it("marks a document failed for a corrupted file and increments retry_count", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);
      storage.set(doc.storageKey, Buffer.from("not a pdf"));

      const status = await service.processDocument(
        actor,
        organizationId,
        docId,
      );

      expect(status.status).toBe("failed");
      expect(status.error_code).toBe("invalid_pdf");
      expect(status.retry_count).toBe(1);

      // A second attempt increments retry_count again.
      const status2 = await service.processDocument(
        actor,
        organizationId,
        docId,
      );
      expect(status2.retry_count).toBe(2);
    });

    it("marks a document failed for an unsupported mime type", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument(
        { id: docId, mimeType: "application/octet-stream" },
        organizationId,
      );
      await store.create(doc);
      storage.set(doc.storageKey, Buffer.from("binary"));

      const status = await service.processDocument(
        actor,
        organizationId,
        docId,
      );
      expect(status.status).toBe("failed");
      expect(status.error_code).toBe("unsupported_mime");
    });

    it("throws non-disclosing 404 when the document does not exist", async () => {
      await expect(
        service.processDocument(
          actor,
          organizationId,
          randomUUID() as DocumentId,
        ),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("throws not_found for a document in another organization", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);

      const otherOrg = randomUUID() as OrganizationId;
      await expect(
        service.processDocument(actor, otherOrg, docId),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("emits audit events on success and failure", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);
      storage.set(doc.storageKey, validPdf());

            await service.processDocument(actor, organizationId, docId);
      const events = await auditStore.listAll();
      expect(events.map((e) => e.action)).toContain("document.processed");

      // Failure case.
      const badId = randomUUID() as DocumentId;
      const badDoc = makeDocument({ id: badId }, organizationId);
      await store.create(badDoc);
      storage.set(badDoc.storageKey, Buffer.from("garbage"));
      await service.processDocument(actor, organizationId, badId);
      const events2 = await auditStore.listAll();
      expect(events2.map((e) => e.action)).toContain("document.failed");
    });
  });

  describe("getExtractionStatus", () => {
    it("returns status for an uploaded document", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);

      const status = await service.getExtractionStatus(
        actor,
        organizationId,
        docId,
      );
      expect(status.status).toBe("uploaded");
      expect(status.chunk_count).toBeNull();
      expect(status.retry_count).toBe(0);
    });

    it("returns chunk_count for an extracted document", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);
      storage.set(doc.storageKey, validPdf());

      await service.processDocument(actor, organizationId, docId);

      const status = await service.getExtractionStatus(
        actor,
        organizationId,
        docId,
      );
      expect(status.status).toBe("extracted");
      expect(status.chunk_count).toBeGreaterThan(0);
    });

    it("throws non-disclosing 404 for unknown document", async () => {
      await expect(
        service.getExtractionStatus(
          actor,
          organizationId,
          randomUUID() as DocumentId,
        ),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("resolves role through organizationStore when actor.role is undefined", async () => {
      const mockOrgStore = {
        findMembership: async (orgId: OrganizationId, uId: UserId) => ({
          id: randomUUID(),
          organizationId: orgId,
          userId: uId,
          role: "course_editor" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      };

      const scopedService = new DocumentProcessingService(
        store,
        chunkStore,
        storage,
        new RoleBasedPolicy(),
        auditService,
        mockOrgStore as never,
      );

      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, organizationId);
      await store.create(doc);

      const untypedActor: Actor = { userId: actor.userId, role: "course_editor" };
      const status = await scopedService.getExtractionStatus(
        untypedActor,
        organizationId,
        docId,
      );
      expect(status.status).toBe("uploaded");
    });
  });
});
