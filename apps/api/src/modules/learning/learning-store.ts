/**
 * Learning store abstractions.
 *
 * Decouples module, lesson, and progress data access from the database.
 * Follows the PR-8/PR-9 store pattern (CourseStore, OrganizationStore).
 *
 * Stores are read-only for learning consumption. No CRUD here —
 * module/lesson CRUD will be introduced with admin/content management.
 */

import type {
  CourseId,
  DocumentChunkId,
  DocumentId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type ModuleRecord = {
  id: ModuleId;
  courseId: CourseId;
  documentId?: DocumentId | null;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type LessonRecord = {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  contentType: string;
  contentMarkdown: string;
  sortOrder: number;
  estimatedMinutes: number | null;
  publicationStatus: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type LessonProgressRecord = {
  id: string;
  userId: UserId;
  lessonId: LessonId;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// AI Learning Engine records (PR6-1)
// ---------------------------------------------------------------------------

/**
 * Document lifecycle states (see SPRINT_06 proposal §4.5).
 */
export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "pending_validation"
  | "validating"
  | "pending_extraction"
  | "extracting"
  | "pending_chunking"
  | "chunking"
  | "extracted"
  | "pending_generation"
  | "generating"
  | "review_pending"
  | "ready"
  | "failed";

export type DocumentRecord = {
  id: DocumentId;
  organizationId: OrganizationId;
  courseId: CourseId | null;
  ownerUserId: UserId;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  pageCount: number | null;
  status: DocumentStatus;
  errorCode: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DocumentChunkRecord = {
  id: DocumentChunkId;
  documentId: DocumentId;
  organizationId: OrganizationId;
  sequence: number;
  heading: string | null;
  content: string;
  startPage: number;
  endPage: number;
  tokenEstimate: number;
  contentHash: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Store interfaces
// ---------------------------------------------------------------------------

export interface ModuleStore {
  /** List all active (non-deleted) modules for a course, ordered by sort_order. */
  listByCourse(courseId: CourseId): Promise<ModuleRecord[]>;

  /** Find an active module by document ID. */
  findByDocument(documentId: DocumentId): Promise<ModuleRecord | undefined>;

  /** Find a module by ID. */
  findById(moduleId: ModuleId): Promise<ModuleRecord | undefined>;

  /** Insert a new module record. */
  create(module: ModuleRecord): Promise<ModuleRecord>;

  /** Update an existing module record completely. */
  update(module: ModuleRecord): Promise<ModuleRecord>;

  /** Soft-delete (archive) a module. */
  delete(moduleId: ModuleId): Promise<void>;
}

export interface LessonStore {
  /** List all active (non-deleted) lessons for a module, ordered by sort_order. */
  listByModule(moduleId: ModuleId): Promise<LessonRecord[]>;

  /** Batch load lessons for multiple modules. */
  listByModules(moduleIds: ModuleId[]): Promise<LessonRecord[]>;

  /** Find a lesson by ID. */
  findById(lessonId: LessonId): Promise<LessonRecord | undefined>;

  /** Insert a new lesson record. */
  create(lesson: LessonRecord): Promise<LessonRecord>;

  /** Update an existing lesson record completely. */
  update(lesson: LessonRecord): Promise<LessonRecord>;

  /** Soft-delete a lesson. */
  delete(lessonId: LessonId): Promise<void>;
}

export interface DocumentStore {
  /**
   * Find an active document by ID, scoped to an organization.
   * Returns undefined if the document doesn't exist, is soft-deleted,
   * or belongs to another organization (non-disclosing).
   */
  findByIdForOrganization(
    id: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentRecord | undefined>;

  /**
   * Find an active document by ID, scoped to an organization and owner.
   * Used for "my uploads" reads.
   */
  findByIdForOwner(
    id: DocumentId,
    organizationId: OrganizationId,
    ownerUserId: UserId,
  ): Promise<DocumentRecord | undefined>;

  /** List active documents for an organization, optionally scoped to a course. */
  listByOrganization(
    organizationId: OrganizationId,
    courseId?: CourseId,
  ): Promise<DocumentRecord[]>;

  /** List active documents uploaded by a user within an organization. */
  listByOwner(
    organizationId: OrganizationId,
    ownerUserId: UserId,
  ): Promise<DocumentRecord[]>;

  /** Find an active document by content hash (duplicate-upload detection). */
  findByOrganizationAndSha256(
    organizationId: OrganizationId,
    sha256: string,
  ): Promise<DocumentRecord | undefined>;

  /** Insert a new document record. */
  create(document: DocumentRecord): Promise<DocumentRecord>;

  /** Update an existing document record completely. */
  update(document: DocumentRecord): Promise<DocumentRecord>;

  /** Soft-delete a document. */
  delete(documentId: DocumentId): Promise<void>;
}

export interface DocumentChunkStore {
  /** List all chunks for a document, ordered by sequence. */
  listByDocument(documentId: DocumentId): Promise<DocumentChunkRecord[]>;

  /** Find a chunk by ID, scoped to an organization. */
  findByIdForOrganization(
    id: DocumentChunkId,
    organizationId: OrganizationId,
  ): Promise<DocumentChunkRecord | undefined>;

  /** Insert new chunk records in bulk. */
  createMany(chunks: DocumentChunkRecord[]): Promise<DocumentChunkRecord[]>;

  /** Delete all chunks for a document (used on regeneration/cleanup). */
  deleteByDocument(documentId: DocumentId): Promise<void>;
}

export interface ProgressStore {
  /** Get all lesson progress records for a user within a course. */
  listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<LessonProgressRecord[]>;

  /** Get progress for a specific lesson for a user. */
  findByUserAndLesson(
    userId: UserId,
    lessonId: LessonId,
  ): Promise<LessonProgressRecord | undefined>;

  /**
   * Upsert a lesson progress record.
   * Creates a new record if one doesn't exist for the user+lesson pair,
   * otherwise updates the existing record.
   */
  upsert(record: LessonProgressRecord): Promise<LessonProgressRecord>;

  /** Count total unique completed lessons for a user across all courses. */
  countCompletedByUser(userId: UserId): Promise<number>;
}
