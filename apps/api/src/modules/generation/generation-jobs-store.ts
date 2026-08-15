/**
 * Generation job store abstraction (PR6-5).
 *
 * Decouples generation job lifecycle data access from the database, following
 * the existing store pattern (GeneratedContentStore/DocumentStore).
 *
 * The job lifecycle (queued/running/succeeded/failed) is intentionally kept
 * separate from the generated-content lifecycle (draft/accepted/...) and the
 * document lifecycle. This table is a domain/application tracking table, NOT
 * a mirror of BullMQ — it stores only the minimal lifecycle fields needed for
 * status reads, retry accounting, and failure recovery. It remains valid even
 * if the queue implementation changes.
 *
 * Interfaces are implemented by in-memory stores (for tests) and Drizzle
 * stores (for production).
 */

import type {
  CourseId,
  DocumentId,
  GenerationJobId,
  OrganizationId,
} from "@avana/domain";
import type { GenerationJobStatus } from "@avana/domain";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * A single AI generation job lifecycle record.
 */
export type GenerationJobRecord = {
  id: GenerationJobId;
  organizationId: OrganizationId;
  documentId: DocumentId;
  courseId: CourseId;
  type: string;
  status: GenerationJobStatus;
  generationKey: string | null;
  /** The queue implementation's job id (BullMQ). Nullable + optional. */
  jobId: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  deletedAt: string | null;
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface GenerationJobStore {
  /**
   * Find a generation job by ID, scoped to an organization.
   * Returns undefined for missing/cross-org/soft-deleted rows (non-disclosing).
   */
  findByIdForOrganization(
    id: GenerationJobId,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord | undefined>;

  /**
   * List generation jobs for a document within an organization.
   */
  listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord[]>;

  /**
   * Find an existing job by its idempotency key + type + document.
   * Used to prevent duplicate job rows on duplicate submission/redelivery.
   */
  findByGenerationKey(
    documentId: DocumentId,
    type: string,
    generationKey: string,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord | undefined>;

  /**
   * Insert a new generation job record (status queued).
   */
  create(record: GenerationJobRecord): Promise<GenerationJobRecord>;

  /**
   * Update a generation job record (status transitions, attempts, errors).
   */
  update(record: GenerationJobRecord): Promise<GenerationJobRecord>;

  /**
   * Soft delete all generation jobs for a document in an organization.
   */
  deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void>;
}
