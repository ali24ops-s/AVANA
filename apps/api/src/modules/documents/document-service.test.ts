/**
 * PR6-2 tests for DocumentService.
 *
 * Covers the upload pipeline business logic:
 * - Upload intent validation (MIME, size, empty)
 * - Confirm upload persists file + metadata
 * - Duplicate detection by SHA256 (reuse existing document)
 * - List documents (scoped to owner)
 * - Get document (org-scoped, non-disclosing 404)
 * - Delete document (soft delete + storage removal)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { type Actor, type OrganizationId } from "@avana/domain";
import {
  DocumentService,
  MAX_DOCUMENT_SIZE_BYTES,
} from "./document-service.js";
import { InMemoryDocumentStore } from "../learning/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../organizations/test/in-memory-stores.js";
import type { StorageProvider } from "../storage/storage-provider.js";

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
  let orgStore: InMemoryOrganizationStore;
  let storage: FakeStorageProvider;
  let service: DocumentService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "student",
  };
  const organizationId = randomUUID() as OrganizationId;

  beforeEach(async () => {
    store = new InMemoryDocumentStore();
    orgStore = new InMemoryOrganizationStore();
    storage = new FakeStorageProvider();

    // Seed a membership for the actor in the org.
    orgStore.createWithAdminMembership({
      organization: {
        id: organizationId,
        name: "Test Org",
        slug: "test-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId,
        userId: actor.userId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    service = new DocumentService(store, storage, orgStore);
  });

  const pdfBytes = Buffer.from("%PDF-1.4 fake pdf content");

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
      // No duplicate file should be stored.
      expect(storage.filesCount()).toBe(1);
    });

    it("rejects unsupported mime type on confirm", async () => {
      await expect(
        service.confirmUpload(actor, organizationId, {
          originalName: "notes.exe",
          mimeType: "application/octet-stream",
          sizeBytes: pdfBytes.length,
          data: pdfBytes,
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
      expect(storage.filesCount()).toBe(0);
    });
  });

  describe("listDocuments", () => {
    it("lists only the actor's uploads", async () => {
      await service.confirmUpload(actor, organizationId, {
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      const docs = await service.listDocuments(
        actor,
        organizationId,
        actor.userId,
      );
      expect(docs).toHaveLength(1);
      expect(docs[0].original_name).toBe("a.pdf");
    });
  });

  describe("getDocument", () => {
    it("returns a document scoped to the organization", async () => {
      const created = await service.confirmUpload(actor, organizationId, {
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      const doc = await service.getDocument(
        actor,
        organizationId,
        created.document.id,
      );
      expect(doc.id).toBe(created.document.id);
    });

    it("returns non-disclosing 404 for a document in another org", async () => {
      const created = await service.confirmUpload(actor, organizationId, {
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      const otherOrg = randomUUID() as OrganizationId;
      await expect(
        service.getDocument(actor, otherOrg, created.document.id),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("deleteDocument", () => {
    it("soft-deletes the document and removes the file", async () => {
      const created = await service.confirmUpload(actor, organizationId, {
        originalName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.length,
        data: pdfBytes,
      });

      await service.deleteDocument(actor, organizationId, created.document.id);

      expect(storage.filesCount()).toBe(0);

      await expect(
        service.getDocument(actor, organizationId, created.document.id),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });
});
