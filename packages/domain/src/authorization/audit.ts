/**
 * Audit-event helpers for organization and membership mutations.
 *
 * Per PR-8 acceptance criteria, audit events must be recorded for:
 * - Organization creation
 * - Organization update
 * - Organization deletion
 * - Membership creation
 * - Membership role change
 * - Membership removal
 *
 * These helpers produce structured audit event payloads that can be
 * persisted to the `audit_logs` table by the API layer.
 *
 * The helpers are framework-independent and serializable.
 */

import type {
  UserId,
  OrganizationId,
  CourseId,
  ModuleId,
  LessonId,
  DocumentId,
  GeneratedContentId,
  FlashcardId,
  QuizId,
} from "../ids.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
  | "org.created"
  | "org.updated"
  | "org.deleted"
  | "membership.created"
  | "membership.role_changed"
  | "membership.removed"
  | "course.created"
  | "course.updated"
  | "course.archived"
  | "module.created"
  | "module.updated"
  | "module.deleted"
  | "lesson.created"
  | "lesson.updated"
  | "lesson.published"
  | "lesson.deleted"
  | "lesson.completed"
  | "lesson.progress_updated"
  | "document.uploaded"
  | "document.processed"
  | "document.failed"
  | "document.deleted"
  | "content.generated"
  | "content.accepted"
  | "content.rejected"
  | "content.regenerated"
  | "content.edited"
  | "generation.failed"
  | "flashcard.reviewed"
  | "quiz.attempted";

export type AuditEntityType =
  | "organization"
  | "organization_membership"
  | "course"
  | "module"
  | "lesson"
  | "lesson_progress"
  | "document"
  | "document_chunk"
  | "generated_content"
  | "flashcard"
  | "flashcard_review"
  | "quiz"
  | "quiz_attempt";

/**
 * Structured audit event payload.
 */
export type AuditEvent = {
  /** The user who performed the action. */
  actorId: UserId | null;
  /** The organization scope (nullable for cross-org actions). */
  organizationId: OrganizationId | null;
  /** The action performed. */
  action: AuditAction;
  /** The type of entity being mutated. */
  entityType: AuditEntityType;
  /** The ID of the entity being mutated. */
  entityId: string;
  /** Additional context (e.g., previous role, new role). */
  details?: Record<
    string,
    string | number | boolean | readonly string[] | null | undefined
  >;
  /** When the event occurred (UTC ISO). */
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utcNow(): string {
  return new Date().toISOString();
}

/**
 * Create an audit event for organization creation.
 */
export function auditOrgCreated(
  actorId: UserId,
  organizationId: OrganizationId,
  name: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "org.created",
    entityType: "organization",
    entityId: organizationId,
    details: { name },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for organization update.
 */
export function auditOrgUpdated(
  actorId: UserId,
  organizationId: OrganizationId,
  changes: Record<string, string | number | boolean | null | undefined>,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "org.updated",
    entityType: "organization",
    entityId: organizationId,
    details: changes,
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for organization deletion.
 */
export function auditOrgDeleted(
  actorId: UserId,
  organizationId: OrganizationId,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "org.deleted",
    entityType: "organization",
    entityId: organizationId,
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for membership creation.
 */
export function auditMembershipCreated(
  actorId: UserId,
  organizationId: OrganizationId,
  membershipId: string,
  targetUserId: string,
  role: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "membership.created",
    entityType: "organization_membership",
    entityId: membershipId,
    details: { targetUserId, role },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for membership role change.
 */
export function auditMembershipRoleChanged(
  actorId: UserId,
  organizationId: OrganizationId,
  membershipId: string,
  previousRole: string,
  newRole: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "membership.role_changed",
    entityType: "organization_membership",
    entityId: membershipId,
    details: { previousRole, newRole },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for membership removal.
 */
export function auditMembershipRemoved(
  actorId: UserId,
  organizationId: OrganizationId,
  membershipId: string,
  targetUserId: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "membership.removed",
    entityType: "organization_membership",
    entityId: membershipId,
    details: { targetUserId },
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// Course audit helpers
// ---------------------------------------------------------------------------

/**
 * Create an audit event for course creation.
 */
export function auditCourseCreated(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: string,
  title: string,
  subject: string | null,
  examAt: string | null,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "course.created",
    entityType: "course",
    entityId: courseId,
    details: { title, subject, exam_at: examAt },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for course update.
 */
export function auditCourseUpdated(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: string,
  changes: Record<string, string | number | boolean | null | undefined>,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "course.updated",
    entityType: "course",
    entityId: courseId,
    details: changes,
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for course archiving.
 */
export function auditCourseArchived(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "course.archived",
    entityType: "course",
    entityId: courseId,
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// Module audit helpers (PR5-D4)
// ---------------------------------------------------------------------------

export function auditModuleCreated(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
  title: string,
  description: string | null,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "module.created",
    entityType: "module",
    entityId: moduleId,
    details: { course_id: courseId, title, description },
    createdAt: utcNow(),
  };
}

export function auditModuleUpdated(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
  changes: Record<string, string | number | boolean | null | undefined>,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "module.updated",
    entityType: "module",
    entityId: moduleId,
    details: { course_id: courseId, ...changes },
    createdAt: utcNow(),
  };
}

export function auditModuleDeleted(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "module.deleted",
    entityType: "module",
    entityId: moduleId,
    details: { course_id: courseId },
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// Learning content audit helpers (PR5-A)
// ---------------------------------------------------------------------------

export function auditLessonCreated(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
  lessonId: LessonId,
  title: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "lesson.created",
    entityType: "lesson",
    entityId: lessonId,
    details: {
      course_id: courseId,
      module_id: moduleId,
      title,
      publication_status: "draft",
    },
    createdAt: utcNow(),
  };
}

export function auditLessonUpdated(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
  lessonId: LessonId,
  changedFields: readonly string[],
  contentMetadata?: { length: number; hash: string },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "lesson.updated",
    entityType: "lesson",
    entityId: lessonId,
    details: {
      course_id: courseId,
      module_id: moduleId,
      changed_fields: changedFields,
      content_length: contentMetadata?.length,
      content_sha256: contentMetadata?.hash,
    },
    createdAt: utcNow(),
  };
}

export function auditLessonPublished(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
  lessonId: LessonId,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "lesson.published",
    entityType: "lesson",
    entityId: lessonId,
    details: { course_id: courseId, module_id: moduleId },
    createdAt: utcNow(),
  };
}

export function auditLessonDeleted(
  actorId: UserId,
  organizationId: OrganizationId,
  courseId: CourseId,
  moduleId: ModuleId,
  lessonId: LessonId,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "lesson.deleted",
    entityType: "lesson",
    entityId: lessonId,
    details: { course_id: courseId, module_id: moduleId },
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// Learning Core audit helpers (Sprint 2)
// ---------------------------------------------------------------------------

/**
 * Create an audit event for lesson completion.
 */
export function auditLessonCompleted(
  actorId: UserId,
  organizationId: OrganizationId,
  lessonId: LessonId,
  courseId: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "lesson.completed",
    entityType: "lesson_progress",
    entityId: lessonId,
    details: { course_id: courseId },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for lesson progress update (e.g., unmark complete).
 */
export function auditLessonProgressUpdated(
  actorId: UserId,
  organizationId: OrganizationId,
  lessonId: LessonId,
  courseId: string,
  completed: boolean,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "lesson.progress_updated",
    entityType: "lesson_progress",
    entityId: lessonId,
    details: { course_id: courseId, completed },
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// AI Learning Engine document audit helpers (PR6-1)
// ---------------------------------------------------------------------------

/**
 * Create an audit event for a document upload.
 *
 * Audit payloads never include file contents — only metadata.
 */
export function auditDocumentUploaded(
  actorId: UserId,
  organizationId: OrganizationId,
  documentId: DocumentId,
  details: {
    courseId: string;
    ownerUserId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "document.uploaded",
    entityType: "document",
    entityId: documentId,
    details: {
      course_id: details.courseId,
      owner_user_id: details.ownerUserId,
      original_name: details.originalName,
      mime_type: details.mimeType,
      size_bytes: details.sizeBytes,
      sha256: details.sha256,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a document processing milestone
 * (e.g., extraction/chunking completed, status transition).
 */
export function auditDocumentProcessed(
  actorId: UserId,
  organizationId: OrganizationId,
  documentId: DocumentId,
  details: {
    previousStatus: string;
    newStatus: string;
    pageCount?: number | null;
    chunkCount?: number | null;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "document.processed",
    entityType: "document",
    entityId: documentId,
    details: {
      previous_status: details.previousStatus,
      new_status: details.newStatus,
      page_count: details.pageCount ?? null,
      chunk_count: details.chunkCount ?? null,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a document processing failure.
 */
export function auditDocumentFailed(
  actorId: UserId,
  organizationId: OrganizationId,
  documentId: DocumentId,
  details: {
    errorCode: string;
    retryCount: number;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "document.failed",
    entityType: "document",
    entityId: documentId,
    details: {
      error_code: details.errorCode,
      retry_count: details.retryCount,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a document deletion (soft delete).
 */
export function auditDocumentDeleted(
  actorId: UserId,
  organizationId: OrganizationId,
  documentId: DocumentId,
  courseId: string,
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "document.deleted",
    entityType: "document",
    entityId: documentId,
    details: { course_id: courseId },
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// AI Learning Engine generation audit helpers (PR6-4)
// ---------------------------------------------------------------------------

/**
 * Create an audit event for a generated content draft being produced.
 *
 * Audit payloads never include AI payload bodies or chunk text — only IDs,
 * counts, and metadata.
 */
export function auditContentGenerated(
  actorId: UserId,
  organizationId: OrganizationId,
  contentId: GeneratedContentId,
  details: {
    documentId: string;
    type: string;
    model: string;
    promptVersion: string;
    sourceChunkCount: number;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "content.generated",
    entityType: "generated_content",
    entityId: contentId,
    details: {
      document_id: details.documentId,
      type: details.type,
      model: details.model,
      prompt_version: details.promptVersion,
      source_chunk_count: details.sourceChunkCount,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a generated content acceptance (future PR).
 */
export function auditContentAccepted(
  actorId: UserId,
  organizationId: OrganizationId,
  contentId: GeneratedContentId,
  details: {
    documentId: string;
    type: string;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "content.accepted",
    entityType: "generated_content",
    entityId: contentId,
    details: {
      document_id: details.documentId,
      type: details.type,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a generated content rejection (future PR).
 */
export function auditContentRejected(
  actorId: UserId,
  organizationId: OrganizationId,
  contentId: GeneratedContentId,
  details: {
    documentId: string;
    type: string;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "content.rejected",
    entityType: "generated_content",
    entityId: contentId,
    details: {
      document_id: details.documentId,
      type: details.type,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a generated content regeneration (future PR).
 */
export function auditContentRegenerated(
  actorId: UserId,
  organizationId: OrganizationId,
  contentId: GeneratedContentId,
  details: {
    documentId: string;
    type: string;
    generationKey: string;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "content.regenerated",
    entityType: "generated_content",
    entityId: contentId,
    details: {
      document_id: details.documentId,
      type: details.type,
      generation_key: details.generationKey,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a generated content edit by a reviewer.
 *
 * Audit payloads include only metadata (IDs, changed-field markers), never
 * the full AI payload body.
 */
export function auditContentEdited(
  actorId: UserId,
  organizationId: OrganizationId,
  contentId: GeneratedContentId,
  details: {
    documentId: string;
    type: string;
    changedFields: readonly string[];
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "content.edited",
    entityType: "generated_content",
    entityId: contentId,
    details: {
      document_id: details.documentId,
      type: details.type,
      changed_fields: details.changedFields,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a generation attempt that failed.
 */
export function auditGenerationFailed(
  actorId: UserId,
  organizationId: OrganizationId,
  documentId: DocumentId,
  details: {
    type: string;
    errorCode: string;
    retryCount: number;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "generation.failed",
    entityType: "document",
    entityId: documentId,
    details: {
      type: details.type,
      error_code: details.errorCode,
      retry_count: details.retryCount,
    },
    createdAt: utcNow(),
  };
}

// ---------------------------------------------------------------------------
// Study consumption audit helpers (PR6-7)
// ---------------------------------------------------------------------------

/**
 * Create an audit event for a flashcard review submission.
 *
 * Records the rating and reaction time. Never includes card content.
 */
export function auditFlashcardReviewed(
  actorId: UserId,
  organizationId: OrganizationId,
  flashcardId: FlashcardId,
  details: {
    courseId: string;
    rating: string;
    reactionMs: number | null;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "flashcard.reviewed",
    entityType: "flashcard_review",
    entityId: flashcardId,
    details: {
      course_id: details.courseId,
      rating: details.rating,
      reaction_ms: details.reactionMs ?? null,
    },
    createdAt: utcNow(),
  };
}

/**
 * Create an audit event for a quiz attempt submission.
 *
 * Records the score and question count. Never includes question answers.
 */
export function auditQuizAttempted(
  actorId: UserId,
  organizationId: OrganizationId,
  quizId: QuizId,
  details: {
    courseId: string;
    attemptId: string;
    score: number;
    correct: number;
    total: number;
  },
): AuditEvent {
  return {
    actorId,
    organizationId,
    action: "quiz.attempted",
    entityType: "quiz_attempt",
    entityId: quizId,
    details: {
      course_id: details.courseId,
      attempt_id: details.attemptId,
      score: details.score,
      correct: details.correct,
      total: details.total,
    },
    createdAt: utcNow(),
  };
}
