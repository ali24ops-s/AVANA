/**
 * Document business logic.
 *
 * Coordinates the DocumentStore (metadata) and StorageProvider (files) for
 * the document upload pipeline. Follows the existing service pattern:
 * - Thin layer coordinating stores
 * - Authorization delegated to the domain policy layer
 * - No HTTP concerns
 * - Audit events emitted for mutations
 */

import { createHash, randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentId,
  type OrganizationId,
  type UserId,
  defaultPolicy,
  DomainError,
  auditDocumentUploaded,
  auditDocumentDeleted,
} from "@avana/domain";
import type {
  DocumentRecord,
  DocumentStatus,
  DocumentStore,
  DocumentChunkStore,
} from "../learning/learning-store.js";
import type {
  OrganizationStore,
  MembershipRecord,
} from "../organizations/organization-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { GenerationJobStore } from "../generation/generation-jobs-store.js";
import type { FlashcardStore, QuizStore } from "../study/study-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import type { AuditService } from "../../observability/audit-service.js";

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

/** Max accepted upload size in bytes (50 MB). */
export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;

/** Allowed MIME types and their canonical form. */
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/vnd.ms-powerpoint", // ppt
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "application/json",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
};

/**
 * Resolve canonical MIME type from name and provided MIME type.
 */
export function normalizeMimeType(originalName: string, mimeType: string): string {
  const norm = mimeType.toLowerCase().trim();
  if (ALLOWED_MIME_TYPES.has(norm)) {
    return norm;
  }
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === "ppt") return "application/vnd.ms-powerpoint";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  if (ext === "txt") return "text/plain";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "csv") return "text/csv";
  if (ext === "json") return "application/json";
  return norm;
}

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

export type DocumentResource = {
  id: DocumentId;
  organization_id: OrganizationId;
  course_id: string | null;
  owner_user_id: UserId;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: DocumentStatus;
  error_code: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

export type UploadIntentResponse = {
  document_id: DocumentId;
  storage_key: string;
  upload_url: string | null;
  expires_at: string;
};

/**
 * Validate a document upload's metadata (name, mime type, size).
 *
 * Rejects unsupported MIME types and empty uploads. Size is validated against
 * MAX_DOCUMENT_SIZE_BYTES.
 */
export function validateUploadMetadata(input: {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}): void {
  if (!input.originalName || input.originalName.trim().length === 0) {
    throw new DomainError("bad_request", "File name is required");
  }
  if (input.originalName.length > 255) {
    throw new DomainError(
      "bad_request",
      "File name must not exceed 255 characters",
    );
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new DomainError(
      "bad_request",
      `Unsupported file type: ${input.mimeType}. Accepted: pdf, ppt/pptx, doc/docx`,
    );
  }
  if (input.sizeBytes <= 0) {
    throw new DomainError("bad_request", "Cannot upload an empty file");
  }
  if (input.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    throw new DomainError("bad_request", "File exceeds the 50 MB maximum size");
  }
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function toDocumentResource(doc: DocumentRecord): DocumentResource {
  return {
    id: doc.id,
    organization_id: doc.organizationId,
    course_id: doc.courseId,
    owner_user_id: doc.ownerUserId,
    original_name: doc.originalName,
    mime_type: doc.mimeType,
    size_bytes: doc.sizeBytes,
    sha256: doc.sha256,
    status: doc.status,
    error_code: doc.errorCode,
    retry_count: doc.retryCount,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

export class DocumentService {
  constructor(
    private readonly store: DocumentStore,
    private readonly storageProvider: StorageProvider,
    private readonly organizationStore: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly auditService?: AuditService,
    private readonly chunkStore?: DocumentChunkStore,
    private readonly generatedContentStore?: GeneratedContentStore,
    private readonly generationJobStore?: GenerationJobStore,
    private readonly flashcardStore?: FlashcardStore,
    private readonly quizStore?: QuizStore,
  ) {}

  /**
   * Resolve the actor's membership in an organization (non-disclosing 404).
   */
  private async requireMembership(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<MembershipRecord> {
    const membership = await this.organizationStore.findMembership(
      organizationId,
      actor.userId,
    );
    if (!membership) {
      throw new DomainError("not_found", "Organization not found");
    }
    return membership;
  }

  /**
   * Resolve the actor's scoped role and authorize an action within an org.
   */
  private async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: "document:upload" | "document:read",
  ): Promise<void> {
    const membership = await this.requireMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role };
    const context: AuthContext = { organizationId };
    this.policy.require(action, scopedActor, context);
  }

  /**
   * Begin an upload intent for a new document.
   *
   * Validates metadata and authorization up front, then returns a storage key
   * the client can upload to. No metadata row is created until the upload is
   * confirmed (confirmUpload).
   */
  async createUploadIntent(
    actor: Actor,
    organizationId: OrganizationId,
    input: { originalName: string; mimeType: string; sizeBytes: number },
  ): Promise<UploadIntentResponse> {
    await this.authorize(actor, organizationId, "document:upload");

    const mimeType = normalizeMimeType(input.originalName, input.mimeType);
    validateUploadMetadata({
      originalName: input.originalName,
      mimeType,
      sizeBytes: input.sizeBytes,
    });

    const documentId = randomUUID() as DocumentId;
    const extension = MIME_TO_EXTENSION[mimeType] ?? "bin";
    const storageKey = `uploads/${documentId}.${extension}`;

    const intent = await this.storageProvider.createUpload({
      storageKey,
      mimeType,
    });

    return {
      document_id: documentId,
      storage_key: intent.storageKey,
      upload_url: intent.uploadUrl,
      expires_at: intent.expiresAt,
    };
  }

  /**
   * Confirm an upload by persisting the file and creating a document record.
   *
   * Authorization: requires document:upload.
   *
   * Duplicate detection: if another active document in the same organization
   * already has the same SHA256, no duplicate processing work is created and
   * the existing document is returned (200), not a new record (201).
   */
  async confirmUpload(
    actor: Actor,
    organizationId: OrganizationId,
    input: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      data: Buffer;
      courseId?: string | null;
    },
  ): Promise<{ document: DocumentResource; duplicate: boolean }> {
    await this.authorize(actor, organizationId, "document:upload");

    const mimeType = normalizeMimeType(input.originalName, input.mimeType);
    validateUploadMetadata({
      originalName: input.originalName,
      mimeType,
      sizeBytes: input.sizeBytes,
    });

    const sha256 = sha256Hex(input.data);

    // Duplicate detection: same org + same sha256 → reuse existing document.
    const existing = await this.store.findByOrganizationAndSha256(
      organizationId,
      sha256,
    );
    if (existing) {
      return { document: toDocumentResource(existing), duplicate: true };
    }

    const documentId = randomUUID() as DocumentId;
    const extension = MIME_TO_EXTENSION[mimeType] ?? "bin";
    const storageKey = `uploads/${documentId}.${extension}`;

    // Persist the file through the storage provider first.
    await this.storageProvider.save({
      storageKey,
      data: input.data,
      mimeType,
    });

    const now = new Date().toISOString();
    const record: DocumentRecord = {
      id: documentId,
      organizationId,
      courseId: input.courseId ? (input.courseId as CourseId) : null,
      ownerUserId: actor.userId,
      originalName: input.originalName,
      mimeType,
      sizeBytes: input.sizeBytes,
      sha256,
      storageKey,
      pageCount: null,
      status: "uploaded",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.store.create(record);

    if (this.auditService) {
      await this.auditService.emit([
        auditDocumentUploaded(actor.userId, organizationId, documentId, {
          courseId: input.courseId ?? "",
          ownerUserId: actor.userId,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256,
        }),
      ]);
    }

    return { document: toDocumentResource(record), duplicate: false };
  }

  /**
   * List documents in an organization.
   *
   * Authorization: requires document:read. If userId is provided, results are
   * scoped to that user's uploads ("my uploads").
   */
  async listDocuments(
    actor: Actor,
    organizationId: OrganizationId,
    ownerUserId?: UserId,
  ): Promise<DocumentResource[]> {
    await this.authorize(actor, organizationId, "document:read");

    const docs = ownerUserId
      ? await this.store.listByOwner(organizationId, ownerUserId)
      : await this.store.listByOrganization(organizationId);

    return docs.map(toDocumentResource);
  }

  /**
   * Get a single document, scoped to the organization.
   *
   * Authorization: requires document:read. Returns non-disclosing 404 if the
   * document does not exist or belongs to another organization.
   */
  async getDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentResource> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    return toDocumentResource(doc);
  }

  /**
   * Soft-delete a document and remove its file from storage.
   *
   * Authorization: requires document:read (delete is owner/content action;
   * the policy layer governs role restrictions). Non-disclosing 404 if the
   * document does not exist or belongs to another organization.
   */
  async deleteDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<void> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    // Remove the file from storage (best-effort; idempotent).
    await this.storageProvider.delete(doc.storageKey);

    // Clean up extracted chunks for this document.
    if (this.chunkStore) {
      await this.chunkStore.deleteByDocument(documentId);
    }

    // Clean up unaccepted generated content drafts.
    if (this.generatedContentStore) {
      await this.generatedContentStore.deleteByDocument(documentId, organizationId);
    }

    // Clean up generation jobs for this document.
    if (this.generationJobStore) {
      await this.generationJobStore.deleteByDocument(documentId, organizationId);
    }

    // Clean up associated flashcards and quizzes if stores are available.
    if (this.flashcardStore) {
      await this.flashcardStore.deleteByDocument(documentId, organizationId);
    }
    if (this.quizStore) {
      await this.quizStore.deleteByDocument(documentId, organizationId);
    }

    // Soft-delete the metadata row.
    await this.store.delete(documentId);

    if (this.auditService) {
      await this.auditService.emit([
        auditDocumentDeleted(
          actor.userId,
          organizationId,
          documentId,
          doc.courseId ?? "",
        ),
      ]);
    }
  }
}
