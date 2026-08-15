/**
 * Generated content store abstractions (PR6-4).
 *
 * Decouples generated-content and citation data access from the database,
 * following the existing store pattern (DocumentStore/DocumentChunkStore).
 *
 * Interfaces are implemented by in-memory stores (for tests) and Drizzle
 * stores (for production).
 */

import type {
  CourseId,
  DocumentChunkId,
  DocumentId,
  GeneratedContentId,
  LessonId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import type {
  GeneratedContentType,
  GeneratedContentStatus,
  GeneratedContentPayload,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * Token usage recorded by the model gateway.
 */
export type TokenUsageRecord = {
  inputTokens: number;
  outputTokens: number;
};

/**
 * A single AI-generated artifact (lesson/flashcard/quiz/recommendation draft).
 */
export type GeneratedContentRecord = {
  id: GeneratedContentId;
  organizationId: OrganizationId;
  documentId: DocumentId;
  courseId: CourseId;
  type: GeneratedContentType;
  status: GeneratedContentStatus;
  payload: GeneratedContentPayload;
  promptVersion: string | null;
  model: string | null;
  tokenUsage: TokenUsageRecord | null;
  generationKey: string | null;
  acceptedAt: string | null;
  acceptedBy: UserId | null;
  reviewedBy: UserId | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  editedBy: UserId | null;
  editedAt: string | null;
  previousPayload: GeneratedContentPayload | null;
  materializedLessonId: LessonId | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/**
 * A citation linking a generated content to a source document chunk.
 */
export type GeneratedContentCitationRecord = {
  generatedContentId: GeneratedContentId;
  documentChunkId: DocumentChunkId;
};

// ---------------------------------------------------------------------------
// Store interfaces
// ---------------------------------------------------------------------------

export interface GeneratedContentStore {
  /**
   * Find a generated content by ID, scoped to an organization.
   * Returns undefined for missing/cross-org/soft-deleted rows (non-disclosing).
   */
  findByIdForOrganization(
    id: GeneratedContentId,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord | undefined>;

  /**
   * List generated contents for a document within an organization.
   */
  listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord[]>;

  /**
   * List generated contents for a course within an organization, optionally
   * filtered by status (the review_pending read path).
   */
  listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
    status?: GeneratedContentStatus,
  ): Promise<GeneratedContentRecord[]>;

  /**
   * Find an existing draft by its idempotency key.
   * Used to prevent duplicate drafts on worker redelivery.
   */
  findByGenerationKey(
    documentId: DocumentId,
    type: GeneratedContentType,
    generationKey: string,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord | undefined>;

  /**
   * Insert a new generated content record.
   */
  create(record: GeneratedContentRecord): Promise<GeneratedContentRecord>;

  /**
   * Update an existing generated content record completely.
   * Used by the review workflow (accept/reject/edit/regenerate) to persist
   * status transitions and review metadata.
   */
  update(record: GeneratedContentRecord): Promise<GeneratedContentRecord>;

  /**
   * Soft-delete all generated contents for a document.
   */
  deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void>;

  /**
   * Soft-delete any unaccepted drafts / regenerating records for a document and type.
   * Used during regeneration so older drafts do not linger in the review queue.
   */
  deleteDraftsByDocumentAndType(
    documentId: DocumentId,
    type: GeneratedContentType,
    organizationId: OrganizationId,
  ): Promise<void>;
}

export interface GeneratedContentCitationStore {
  /**
   * Insert new citation rows in bulk.
   */
  createMany(
    citations: GeneratedContentCitationRecord[],
  ): Promise<GeneratedContentCitationRecord[]>;

  /**
   * List citations for a generated content.
   */
  listByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<GeneratedContentCitationRecord[]>;

  /**
   * List citations for multiple generated contents (bulk load).
   */
  listByGeneratedContents(
    generatedContentIds: GeneratedContentId[],
  ): Promise<GeneratedContentCitationRecord[]>;
}
