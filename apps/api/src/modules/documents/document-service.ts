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
  ModuleStore,
  LessonStore,
} from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type {
  OrganizationStore,
  MembershipRecord,
} from "../organizations/organization-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { GenerationJobStore } from "../generation/generation-jobs-store.js";
import type { FlashcardStore, QuizStore } from "../study/study-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { DocumentProcessingService } from "./document-processing-service.js";
import type {
  DocumentDetailResource,
  DocumentQualityLevel,
  BulkOperationResponse,
  BulkOperationItemResult,
} from "@avana/contracts";

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

export type DocumentListFilter = {
  search?: string;
  status?: DocumentStatus;
  type?: string; // mime type prefix, e.g. "application/pdf"
  courseId?: string;
  used?: "used" | "unused";
  sort?: "newest" | "oldest" | "largest" | "smallest" | "name" | "updated";
  page?: number;
  limit?: number;
};

export type DocumentListPage = {
  items: DocumentResource[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type DocumentStats = {
  total_count: number;
  total_size_bytes: number;
  status_counts: Record<string, number>;
  used_count: number;
  unused_count: number;
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

function mapDocumentStatus(status: DocumentRecord["status"]): import("@avana/contracts").DocumentStatus {
  if (status === "processing") return "extracting";
  return status as import("@avana/contracts").DocumentStatus;
}

function toDocumentResource(doc: DocumentRecord): import("@avana/contracts").DocumentResource {
  return {
    id: doc.id,
    organization_id: doc.organizationId,
    course_id: doc.courseId,
    owner_user_id: doc.ownerUserId,
    original_name: doc.originalName,
    mime_type: doc.mimeType,
    size_bytes: doc.sizeBytes,
    sha256: doc.sha256,
    status: mapDocumentStatus(doc.status),
    error_code: doc.errorCode,
    retry_count: doc.retryCount,
    quality_score: doc.qualityScore ?? null,
    quality_level: (doc.qualityLevel as DocumentQualityLevel | null) ?? null,
    quality_report: doc.qualityReport ?? null,
    quality_analyzed_at: doc.qualityAnalyzedAt ?? null,
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
    private readonly courseStore?: CourseStore,
    private readonly moduleStore?: ModuleStore,
    private readonly lessonStore?: LessonStore,
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
   * Resolve the actor's role in an organization (returns null if not a member).
   */
  private async getMembershipRole(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<string | null> {
    const membership = await this.organizationStore.findMembership(
      organizationId,
      actor.userId,
    );
    return membership?.role ?? null;
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
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
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
   * List documents in an organization with optional filters and pagination.
   *
   * Authorization: requires document:read.
   * - organization_admin / course_editor: see all org documents
   * - student: sees only their own uploads
   */
  /**
   * List documents in an organization with optional filters and pagination.
   *
   * Authorization: requires document:read.
   * - organization_admin / course_editor: see all org documents
   * - student: sees only their own uploads
   */
  async listDocuments(
    actor: Actor,
    organizationId: OrganizationId,
    filters: DocumentListFilter | string = {},
  ): Promise<DocumentListPage> {
    await this.authorize(actor, organizationId, "document:read");

    const parsedFilters: DocumentListFilter =
      typeof filters === "string" ? {} : (filters || {});

    const role = await this.getMembershipRole(actor, organizationId);
    const isPrivileged =
      role === "organization_admin" ||
      role === "course_editor" ||
      role === "teacher" ||
      role === "platform_admin" ||
      role === "support_agent";

    // Fetch the full list — filtering will be applied in-memory for now.
    const allDocs = isPrivileged
      ? await this.store.listByOrganization(organizationId)
      : await this.store.listByOwner(organizationId, actor.userId);

    let docs = allDocs;

    // If a string was passed (legacy ownerUserId filter)
    if (typeof filters === "string") {
      docs = docs.filter((d) => d.ownerUserId === filters);
    }

    // --- server-side filtering ---
    if (typeof parsedFilters.search === "string") {
      const q = parsedFilters.search.toLowerCase().trim();
      if (q.length > 0) {
        docs = docs.filter((d) => d.originalName.toLowerCase().includes(q));
      }
    }
    if (parsedFilters.status) {
      docs = docs.filter((d) => d.status === parsedFilters.status);
    }
    if (parsedFilters.type) {
      const typeLower = parsedFilters.type.toLowerCase();
      docs = docs.filter((d) => d.mimeType.toLowerCase().startsWith(typeLower));
    }
    if (parsedFilters.courseId) {
      docs = docs.filter((d) => d.courseId === parsedFilters.courseId);
    }
    if (parsedFilters.used === "used") {
      docs = docs.filter((d) => d.courseId !== null);
    } else if (parsedFilters.used === "unused") {
      docs = docs.filter((d) => d.courseId === null);
    }

    // --- sorting ---
    const sort = parsedFilters.sort ?? "newest";
    docs = [...docs].sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.createdAt.localeCompare(a.createdAt);
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "largest":
          return b.sizeBytes - a.sizeBytes;
        case "smallest":
          return a.sizeBytes - b.sizeBytes;
        case "name":
          return a.originalName.localeCompare(b.originalName);
        case "updated":
          return b.updatedAt.localeCompare(a.updatedAt);
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });

    // --- pagination ---
    const limit = Math.min(Math.max(parsedFilters.limit ?? 25, 1), 100);
    const page = Math.max(parsedFilters.page ?? 1, 1);
    const total = docs.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const pageItems = docs.slice(start, start + limit);

    return {
      items: pageItems.map(toDocumentResource),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Return aggregate statistics for documents in an organization.
   */
  async getDocumentStats(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<DocumentStats> {
    await this.authorize(actor, organizationId, "document:read");

    const role = await this.getMembershipRole(actor, organizationId);
    const isPrivileged =
      role === "organization_admin" ||
      role === "course_editor" ||
      role === "teacher" ||
      role === "platform_admin" ||
      role === "support_agent";

    const docs = isPrivileged
      ? await this.store.listByOrganization(organizationId)
      : await this.store.listByOwner(organizationId, actor.userId);

    const statusCounts: Record<string, number> = {};
    let totalSize = 0;
    let usedCount = 0;

    for (const doc of docs) {
      statusCounts[doc.status] = (statusCounts[doc.status] ?? 0) + 1;
      totalSize += doc.sizeBytes;
      if (doc.courseId) usedCount++;
    }

    return {
      total_count: docs.length,
      total_size_bytes: totalSize,
      status_counts: statusCounts,
      used_count: usedCount,
      unused_count: docs.length - usedCount,
    };
  }

  /**
   * Read document bytes for download/preview (org-scoped).
   */
  async downloadDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<{ data: Buffer; mimeType: string; originalName: string }> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    const data = await this.storageProvider.read(doc.storageKey);
    return { data, mimeType: doc.mimeType, originalName: doc.originalName };
  }

  /**
   * Get a single document, scoped to the organization, enriched with full usage hierarchy.
   *
   * Authorization: requires document:read. Returns non-disclosing 404 if the
   * document does not exist or belongs to another organization.
   */
  async getDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentDetailResource> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    // Resolve linked course information
    let courseInfo: { id: string; name: string } | null = null;
    if (doc.courseId && this.courseStore) {
      const course = await this.courseStore.findByIdForUser(
        doc.courseId as CourseId,
        actor.userId,
      );
      if (course) {
        courseInfo = { id: course.id, name: course.name };
      }
    }

    // Resolve linked module information
    const moduleList: Array<{ id: string; title: string }> = [];
    let lessonCount = 0;
    if (this.moduleStore) {
      const mod = await this.moduleStore.findByDocument(documentId);
      if (mod) {
        moduleList.push({ id: mod.id, title: mod.title });
        if (this.lessonStore) {
          const lessons = await this.lessonStore.listByModule(mod.id);
          lessonCount = lessons.length;
        }
      }
    }

    // Count chunks
    let chunkCount = 0;
    if (this.chunkStore) {
      const chunks = await this.chunkStore.listByDocument(documentId);
      chunkCount = chunks.length;
    }

    // Count flashcards
    let flashcardCount = 0;
    if (this.flashcardStore) {
      if (doc.courseId) {
        const cards = await this.flashcardStore.listByCourse(doc.courseId, organizationId);
        flashcardCount = cards.filter((c) => c.documentId === documentId).length;
      } else {
        const cards = await this.flashcardStore.listByOrganization(organizationId);
        flashcardCount = cards.filter((c) => c.documentId === documentId).length;
      }
    }

    // Count quizzes
    let quizCount = 0;
    if (this.quizStore) {
      if (doc.courseId) {
        const qz = await this.quizStore.listByCourse(doc.courseId, organizationId);
        quizCount = qz.filter((q) => q.documentId === documentId).length;
      } else {
        const qz = await this.quizStore.listByOrganization(organizationId);
        quizCount = qz.filter((q) => q.documentId === documentId).length;
      }
    }

    // Count generated content drafts
    let generatedContentCount = 0;
    if (this.generatedContentStore) {
      const contents = await this.generatedContentStore.listByDocument(documentId, organizationId);
      generatedContentCount = contents.length;
    }

    return {
      ...toDocumentResource(doc),
      storage_key: doc.storageKey,
      page_count: doc.pageCount,
      usage: {
        course: courseInfo,
        modules: moduleList,
        lessons_count: lessonCount,
        flashcards_count: flashcardCount,
        quizzes_count: quizCount,
        chunks_count: chunkCount,
        generated_contents_count: generatedContentCount,
      },
    };
  }

  /**
   * Update a document's metadata (original_name, course_id).
   * Renaming does NOT mutate the storage_key to keep physical storage and references stable.
   */
  async updateDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    input: { originalName?: string; courseId?: string | null },
  ): Promise<DocumentResource> {
    await this.authorize(actor, organizationId, "document:read");

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    let updated = false;
    let newOriginalName = doc.originalName;
    let newCourseId = doc.courseId;

    if (input.originalName !== undefined) {
      const trimmed = input.originalName.trim();
      if (!trimmed) {
        throw new DomainError("bad_request", "File name cannot be empty");
      }
      if (trimmed.length > 255) {
        throw new DomainError("bad_request", "File name must not exceed 255 characters");
      }
      newOriginalName = trimmed;
      updated = true;
    }

    if (input.courseId !== undefined) {
      if (input.courseId === null) {
        newCourseId = null;
        updated = true;
      } else {
        if (this.courseStore) {
          const course = await this.courseStore.findByIdForUser(
            input.courseId as CourseId,
            actor.userId,
          );
          if (!course || course.organizationId !== organizationId) {
            throw new DomainError("bad_request", "Course does not belong to this organization");
          }
        }
        newCourseId = input.courseId as CourseId;
        updated = true;
      }
    }

    if (updated) {
      const updatedRecord: DocumentRecord = {
        ...doc,
        originalName: newOriginalName,
        courseId: newCourseId,
        updatedAt: new Date().toISOString(),
      };
      await this.store.update(updatedRecord);
      return toDocumentResource(updatedRecord);
    }

    return toDocumentResource(doc);
  }

  /**
   * Delete a document bypassing organization membership checks (Admin only).
   */
  async adminDeleteDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<void> {
    if (actor.role !== "platform_admin") {
      throw new DomainError("forbidden", "Only platform admins can use this operation");
    }

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    // Remove the file from storage (best-effort; idempotent).
    await this.storageProvider.delete(doc.storageKey);

    // Clean up extracted chunks for this document (source-owned data).
    if (this.chunkStore) {
      await this.chunkStore.deleteByDocument(documentId);
    }

    // Clean up unaccepted generated content drafts (drafts, regenerating, edited, rejected).
    // Accepted contents (including accepted review summaries) remain intact.
    if (this.generatedContentStore) {
      await this.generatedContentStore.deleteDraftsByDocument(documentId, organizationId);
    }

    // Clean up generation jobs for this document.
    if (this.generationJobStore) {
      await this.generationJobStore.deleteByDocument(documentId, organizationId);
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

  /**
   * Download a document bypassing organization membership checks (Admin only).
   * Streams the document instead of loading it entirely into memory.
   */
  async adminDownloadDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<{ stream: NodeJS.ReadableStream; sizeBytes: number; mimeType: string; originalName: string }> {
    if (actor.role !== "platform_admin") {
      throw new DomainError("forbidden", "Only platform admins can use this operation");
    }

    const doc = await this.store.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    try {
      let stream: NodeJS.ReadableStream;
      if (this.storageProvider.readStream) {
        stream = await this.storageProvider.readStream(doc.storageKey);
      } else {
        const data = await this.storageProvider.read(doc.storageKey);
        // Fallback for providers that don't implement stream
        const { Readable } = await import("node:stream");
        stream = Readable.from(data);
      }

      return {
        stream,
        sizeBytes: doc.sizeBytes,
        mimeType: doc.mimeType,
        originalName: doc.originalName,
      };
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "ENOENT") {
        throw new DomainError("not_found", "Document file not found in storage");
      }
      throw err;
    }
  }

  /**
   * Soft-delete a document and remove its file from storage and source-owned data (chunks).
   *
   * Authorization: requires document:read. Non-disclosing 404 if the
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

    // Clean up extracted chunks for this document (source-owned data).
    if (this.chunkStore) {
      await this.chunkStore.deleteByDocument(documentId);
    }

    // Clean up unaccepted generated content drafts (drafts, regenerating, edited, rejected).
    // Accepted contents (including accepted review summaries) remain intact.
    if (this.generatedContentStore) {
      await this.generatedContentStore.deleteDraftsByDocument(documentId, organizationId);
    }

    // Clean up generation jobs for this document.
    if (this.generationJobStore) {
      await this.generationJobStore.deleteByDocument(documentId, organizationId);
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

  /**
   * Bulk delete documents with partial-failure reporting.
   */
  async bulkDelete(
    actor: Actor,
    organizationId: OrganizationId,
    documentIds: DocumentId[],
  ): Promise<BulkOperationResponse> {
    await this.authorize(actor, organizationId, "document:read");

    const results: BulkOperationItemResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const docId of documentIds) {
      try {
        await this.deleteDocument(actor, organizationId, docId);
        results.push({ document_id: docId, success: true });
        succeeded++;
      } catch (err) {
        failed++;
        const code =
          err instanceof DomainError
            ? err.code
            : "delete_failed";
        const message = err instanceof Error ? err.message : "Failed to delete document";
        results.push({
          document_id: docId,
          success: false,
          error: { code, message },
        });
      }
    }

    return {
      request_id: randomUUID(),
      total: documentIds.length,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Bulk attach / move documents to a course with partial-failure reporting.
   */
  async bulkAttachCourse(
    actor: Actor,
    organizationId: OrganizationId,
    documentIds: DocumentId[],
    courseId: CourseId | null,
  ): Promise<BulkOperationResponse> {
    await this.authorize(actor, organizationId, "document:read");

    const results: BulkOperationItemResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const docId of documentIds) {
      try {
        await this.updateDocument(actor, organizationId, docId, { courseId });
        results.push({ document_id: docId, success: true });
        succeeded++;
      } catch (err) {
        failed++;
        const code =
          err instanceof DomainError
            ? err.code
            : "update_failed";
        const message = err instanceof Error ? err.message : "Failed to attach course";
        results.push({
          document_id: docId,
          success: false,
          error: { code, message },
        });
      }
    }

    return {
      request_id: randomUUID(),
      total: documentIds.length,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Bulk reprocess documents with partial-failure reporting.
   */
  async bulkReprocess(
    actor: Actor,
    organizationId: OrganizationId,
    documentIds: DocumentId[],
    processingService: DocumentProcessingService,
  ): Promise<BulkOperationResponse> {
    await this.authorize(actor, organizationId, "document:read");

    const results: BulkOperationItemResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const docId of documentIds) {
      try {
        await processingService.reprocessDocument(actor, organizationId, docId);
        results.push({ document_id: docId, success: true });
        succeeded++;
      } catch (err) {
        failed++;
        const code =
          err instanceof DomainError
            ? err.code
            : "reprocess_failed";
        const message = err instanceof Error ? err.message : "Failed to reprocess document";
        results.push({
          document_id: docId,
          success: false,
          error: { code, message },
        });
      }
    }

    return {
      request_id: randomUUID(),
      total: documentIds.length,
      succeeded,
      failed,
      results,
    };
  }
}
