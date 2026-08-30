/**
 * Document processing service.
 *
 * Orchestrates the text extraction pipeline for a single document:
 *   1. Load the uploaded document (metadata + file bytes).
 *   2. Select the extractor by MIME type.
 *   3. Extract text.
 *   4. Chunk into `document_chunks`.
 *   5. Persist chunks and update the document status.
 *
 * Status lifecycle (PR6-3):
 *   uploaded → extracting → extracted
 *   uploaded/extracting → failed   (with error_code + retry_count)
 *
 * Worker readiness:
 *   `processDocument` is the single entry point a BullMQ worker will call
 *   later. It requires no request context, so a worker can invoke it unchanged.
 *   No queues are implemented in this PR.
 *
 * Authorization is delegated to the calling layer (routes/worker), consistent
 * with the existing service pattern.
 */

import {
  type Actor,
  type AuthContext,
  type AuthorizationPolicy,
  type DocumentId,
  type OrganizationId,
  DomainError,
  auditDocumentProcessed,
  auditDocumentFailed,
} from "@avana/domain";
import type {
  DocumentRecord,
  DocumentStore,
  DocumentChunkStore,
} from "../learning/learning-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import {
  selectExtractor,
  buildChunks,
  type ExtractionResult,
} from "./extraction/index.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

export type DocumentExtractionStatus = {
  document_id: DocumentId;
  organization_id: OrganizationId;
  status: DocumentRecord["status"];
  page_count: number | null;
  chunk_count: number | null;
  error_code: string | null;
  retry_count: number;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DocumentProcessingService {
  constructor(
    private readonly store: DocumentStore,
    private readonly chunkStore: DocumentChunkStore,
    private readonly storageProvider: StorageProvider,
    private readonly policy: AuthorizationPolicy,
    private readonly auditService?: AuditService,
    private readonly organizationStore?: OrganizationStore,
  ) {}

  /**
   * Authorize a document processing action within an organization.
   */
  private async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: "document:read",
  ): Promise<void> {
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("forbidden", "Forbidden");
      }
      const scopedActor = { ...actor, role: membership.role as Actor["role"] };
      const context: AuthContext = { organizationId };
      this.policy.require(action, scopedActor, context);
      return;
    }
    const context: AuthContext = { organizationId };
    this.policy.require(action, actor, context);
  }

  /**
   * Resolve the document scoped to the organization (non-disclosing 404).
   */
  private async requireDocument(
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentRecord> {
    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }
    return doc;
  }

  /**
   * Process a document through the extraction pipeline.
   *
   * This is the worker-ready entry point. It is idempotent with respect to
   * already-extracted documents: re-processing an `extracted` document is a
   * no-op that returns its current status.
   *
   * @param actor          the actor (or worker) triggering processing
   * @param organizationId org scope
   * @param documentId     document to process
   */
  async processDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentExtractionStatus> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.requireDocument(organizationId, documentId);

    // Idempotency: already extracted → return current status.
    if (doc.status === "extracted") {
      const chunkCount = (await this.chunkStore.listByDocument(documentId))
        .length;
      return this.toStatus(doc, chunkCount);
    }

    const now = new Date().toISOString();
    const previousStatus = doc.status;

    // Transition to extracting.
    await this.store.update({ ...doc, status: "extracting", updatedAt: now });

    try {
      // Load the file bytes.
      const data = await this.storageProvider.read(doc.storageKey);

      // Select + run the extractor.
      const extractor = selectExtractor(doc.mimeType);
      const result: ExtractionResult = await extractor.extract({
        data,
        mimeType: doc.mimeType,
        originalName: doc.originalName,
      });

      // Analyze Quality
      const { QualityAnalyzer } = await import("./extraction/quality-analyzer.js");
      const qualityReport = QualityAnalyzer.analyze(result);

      // Build and persist chunks.
      const chunks = buildChunks(documentId, organizationId, result.pages, 1);

      // Replace any prior chunks (idempotent regeneration).
      await this.chunkStore.deleteByDocument(documentId);
      if (chunks.length > 0) {
        await this.chunkStore.createMany(chunks);
      }

      const updated: DocumentRecord = {
        ...doc,
        status: "extracted",
        pageCount: result.pages.length,
        qualityScore: qualityReport.score,
        qualityLevel: qualityReport.level,
        qualityReport,
        qualityAnalyzedAt: new Date().toISOString(),
        errorCode: null,
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      };
      await this.store.update(updated);

      if (this.auditService) {
        await this.auditService.emit([
          auditDocumentProcessed(actor.userId, organizationId, documentId, {
            previousStatus,
            newStatus: "extracted",
            pageCount: updated.pageCount,
            chunkCount: chunks.length,
          }),
        ]);
      }

      return this.toStatus(updated, chunks.length);
    } catch (err) {
      const errorCode = this.resolveErrorCode(err);
      const failed: DocumentRecord = {
        ...doc,
        status: "failed",
        errorCode,
        retryCount: (doc.retryCount ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.store.update(failed);

      if (this.auditService) {
        await this.auditService.emit([
          auditDocumentFailed(actor.userId, organizationId, documentId, {
            errorCode,
            retryCount: failed.retryCount,
          }),
        ]);
      }

      return this.toStatus(failed, null);
    }
  }

  /**
   * Re-process a document through the extraction pipeline, resetting status and
   * regenerating chunks even if it was previously extracted or failed.
   */
  async reprocessDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentExtractionStatus> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.requireDocument(organizationId, documentId);

    const now = new Date().toISOString();
    const previousStatus = doc.status;

    // Transition to extracting.
    await this.store.update({ ...doc, status: "extracting", updatedAt: now });

    try {
      // Load the file bytes.
      const data = await this.storageProvider.read(doc.storageKey);

      // Select + run the extractor.
      const extractor = selectExtractor(doc.mimeType);
      const result: ExtractionResult = await extractor.extract({
        data,
        mimeType: doc.mimeType,
        originalName: doc.originalName,
      });

      // Build and persist chunks.
      const chunks = buildChunks(documentId, organizationId, result.pages, 1);

      // Replace prior chunks cleanly.
      await this.chunkStore.deleteByDocument(documentId);
      if (chunks.length > 0) {
        await this.chunkStore.createMany(chunks);
      }

      const updated: DocumentRecord = {
        ...doc,
        status: "extracted",
        pageCount: result.pages.length,
        errorCode: null,
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      };
      await this.store.update(updated);

      if (this.auditService) {
        await this.auditService.emit([
          auditDocumentProcessed(actor.userId, organizationId, documentId, {
            previousStatus,
            newStatus: "extracted",
            pageCount: updated.pageCount,
            chunkCount: chunks.length,
          }),
        ]);
      }

      return this.toStatus(updated, chunks.length);
    } catch (err) {
      const errorCode = this.resolveErrorCode(err);
      const failed: DocumentRecord = {
        ...doc,
        status: "failed",
        errorCode,
        retryCount: (doc.retryCount ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.store.update(failed);

      if (this.auditService) {
        await this.auditService.emit([
          auditDocumentFailed(actor.userId, organizationId, documentId, {
            errorCode,
            retryCount: failed.retryCount,
          }),
        ]);
      }

      return this.toStatus(failed, null);
    }
  }

  /**
   * Get the current extraction status for a document.
   */
  async getExtractionStatus(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentExtractionStatus> {
    await this.authorize(actor, organizationId, "document:read");
    const doc = await this.requireDocument(organizationId, documentId);
    const chunkCount =
      doc.status === "extracted" || doc.status === "failed"
        ? (await this.chunkStore.listByDocument(documentId)).length
        : null;
    return this.toStatus(doc, chunkCount);
  }

  /**
   * Map an error to a stable error code.
   */
  private resolveErrorCode(err: unknown): string {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string"
    ) {
      return (err as { code: string }).code;
    }
    return "extraction_failed";
  }

  private toStatus(
    doc: DocumentRecord,
    chunkCount: number | null,
  ): DocumentExtractionStatus {
    return {
      document_id: doc.id,
      organization_id: doc.organizationId,
      status: doc.status,
      page_count: doc.pageCount,
      chunk_count: chunkCount,
      error_code: doc.errorCode,
      retry_count: doc.retryCount,
      updated_at: doc.updatedAt,
    };
  }
}
