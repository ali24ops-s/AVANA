/**
 * Framework-independent ID primitives for AVANA.
 *
 * - Runtime validation helpers are exported (no framework dependencies).
 * - Type branding prevents mixing unrelated IDs at compile time.
 */

type Brand<K, T> = K & { readonly __brand?: T };

export type UUID = Brand<string, "uuid">;

export function isUUID(value: string): value is UUID {
  // RFC 4122 version-agnostic UUID format
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseUUID(value: string, fieldName = "id"): UUID {
  if (!isUUID(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as UUID;
}

export type UserId = Brand<UUID, "userId">;
export type OrganizationId = Brand<UUID, "organizationId">;
export type CourseId = Brand<UUID, "courseId">;
export type ModuleId = Brand<UUID, "moduleId">;
export type LessonId = Brand<UUID, "lessonId">;
export type DocumentId = Brand<UUID, "documentId">;
export type DocumentChunkId = Brand<UUID, "documentChunkId">;
export type GeneratedContentId = Brand<UUID, "generatedContentId">;
export type GenerationJobId = Brand<UUID, "generationJobId">;
export type FlashcardId = Brand<UUID, "flashcardId">;
export type FlashcardReviewId = Brand<UUID, "flashcardReviewId">;
export type QuizId = Brand<UUID, "quizId">;
export type QuizQuestionId = Brand<UUID, "quizQuestionId">;
export type QuizAttemptId = Brand<UUID, "quizAttemptId">;
export type ContentPackId = Brand<UUID, "contentPackId">;
export type ContentPackItemId = Brand<UUID, "contentPackItemId">;
export type ContentPackUsageId = Brand<UUID, "contentPackUsageId">;

export function asUserId(id: UUID): UserId {
  return id as UserId;
}

export function asOrganizationId(id: UUID): OrganizationId {
  return id as OrganizationId;
}

export function asCourseId(id: UUID): CourseId {
  return id as CourseId;
}

export function asModuleId(id: UUID): ModuleId {
  return id as ModuleId;
}

export function asLessonId(id: UUID): LessonId {
  return id as LessonId;
}

export function asDocumentId(id: UUID): DocumentId {
  return id as DocumentId;
}

export function asDocumentChunkId(id: UUID): DocumentChunkId {
  return id as DocumentChunkId;
}

export function asGeneratedContentId(id: UUID): GeneratedContentId {
  return id as GeneratedContentId;
}

export function asGenerationJobId(id: UUID): GenerationJobId {
  return id as GenerationJobId;
}

export function asFlashcardId(id: UUID): FlashcardId {
  return id as FlashcardId;
}

export function asFlashcardReviewId(id: UUID): FlashcardReviewId {
  return id as FlashcardReviewId;
}

export function asQuizId(id: UUID): QuizId {
  return id as QuizId;
}

export function asQuizQuestionId(id: UUID): QuizQuestionId {
  return id as QuizQuestionId;
}

export function asQuizAttemptId(id: UUID): QuizAttemptId {
  return id as QuizAttemptId;
}

export function isCourseId(value: string): value is CourseId {
  return isUUID(value);
}

export function isModuleId(value: string): value is ModuleId {
  return isUUID(value);
}

export function isLessonId(value: string): value is LessonId {
  return isUUID(value);
}

export function isDocumentId(value: string): value is DocumentId {
  return isUUID(value);
}

export function isDocumentChunkId(value: string): value is DocumentChunkId {
  return isUUID(value);
}

export function isGeneratedContentId(
  value: string,
): value is GeneratedContentId {
  return isUUID(value);
}

export function isGenerationJobId(value: string): value is GenerationJobId {
  // Generation job ids come from our own queue (crypto.randomUUID) or BullMQ.
  // Accept any well-formed hex UUID shape, without the RFC-4122 version/variant
  // nibble constraints that `isUUID` enforces.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function isFlashcardId(value: string): value is FlashcardId {
  return isUUID(value);
}

export function isFlashcardReviewId(value: string): value is FlashcardReviewId {
  return isUUID(value);
}

export function isQuizId(value: string): value is QuizId {
  return isUUID(value);
}

export function isQuizQuestionId(value: string): value is QuizQuestionId {
  return isUUID(value);
}

export function isQuizAttemptId(value: string): value is QuizAttemptId {
  return isUUID(value);
}

export function parseCourseId(value: string, fieldName = "courseId"): CourseId {
  if (!isCourseId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as CourseId;
}

export function parseModuleId(value: string, fieldName = "moduleId"): ModuleId {
  if (!isModuleId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as ModuleId;
}

export function parseLessonId(value: string, fieldName = "lessonId"): LessonId {
  if (!isLessonId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as LessonId;
}

export function parseDocumentId(
  value: string,
  fieldName = "documentId",
): DocumentId {
  if (!isDocumentId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as DocumentId;
}

export function parseDocumentChunkId(
  value: string,
  fieldName = "documentChunkId",
): DocumentChunkId {
  if (!isDocumentChunkId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as DocumentChunkId;
}

export function parseGeneratedContentId(
  value: string,
  fieldName = "generatedContentId",
): GeneratedContentId {
  if (!isGeneratedContentId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as GeneratedContentId;
}

export function parseGenerationJobId(
  value: string,
  fieldName = "generationJobId",
): GenerationJobId {
  if (!isGenerationJobId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as GenerationJobId;
}

export function parseFlashcardId(
  value: string,
  fieldName = "flashcardId",
): FlashcardId {
  if (!isFlashcardId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as FlashcardId;
}

export function parseFlashcardReviewId(
  value: string,
  fieldName = "flashcardReviewId",
): FlashcardReviewId {
  if (!isFlashcardReviewId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as FlashcardReviewId;
}

export function parseQuizId(value: string, fieldName = "quizId"): QuizId {
  if (!isQuizId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as QuizId;
}

export function parseQuizQuestionId(
  value: string,
  fieldName = "quizQuestionId",
): QuizQuestionId {
  if (!isQuizQuestionId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as QuizQuestionId;
}

export function parseQuizAttemptId(
  value: string,
  fieldName = "quizAttemptId",
): QuizAttemptId {
  if (!isQuizAttemptId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as QuizAttemptId;
}

export function asContentPackId(id: UUID): ContentPackId {
  return id as ContentPackId;
}

export function asContentPackItemId(id: UUID): ContentPackItemId {
  return id as ContentPackItemId;
}

export function asContentPackUsageId(id: UUID): ContentPackUsageId {
  return id as ContentPackUsageId;
}

export function isContentPackId(value: string): value is ContentPackId {
  return isUUID(value);
}

export function isContentPackItemId(value: string): value is ContentPackItemId {
  return isUUID(value);
}

export function isContentPackUsageId(value: string): value is ContentPackUsageId {
  return isUUID(value);
}

export function parseContentPackId(
  value: string,
  fieldName = "contentPackId",
): ContentPackId {
  if (!isContentPackId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as ContentPackId;
}

export function parseContentPackItemId(
  value: string,
  fieldName = "contentPackItemId",
): ContentPackItemId {
  if (!isContentPackItemId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as ContentPackItemId;
}

export function parseContentPackUsageId(
  value: string,
  fieldName = "contentPackUsageId",
): ContentPackUsageId {
  if (!isContentPackUsageId(value)) {
    throw new Error(`Invalid UUID for ${fieldName}`);
  }
  return value as ContentPackUsageId;
}

