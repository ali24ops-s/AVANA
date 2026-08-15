import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  char,
  timestamp,
  jsonb,
  text,
  integer,
  boolean,
  numeric,
  primaryKey,
  foreignKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";

/**
 * PR-6 baseline schema for AVANA.
 *
 * Covers the Identity, Tenancy, and Courses domains plus audit logging
 * as defined by the Technical Blueprint and ADR 0003.
 *
 * All tables use UUID primary keys (defaultRandom), UTC timestamps with
 * timezone, and explicit foreign-key constraints with named indexes.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    emailIdx: uniqueIndex("idx_users_email").on(table.email),
  }),
);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_organizations_slug").on(table.slug),
  }),
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("student"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orgUserIdx: uniqueIndex("idx_org_memberships_org_user").on(
      table.organizationId,
      table.userId,
    ),
    orgIdx: index("idx_org_memberships_org").on(table.organizationId),
    userIdx: index("idx_org_memberships_user").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }),
    examDate: timestamp("exam_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("idx_courses_org").on(table.organizationId),
  }),
);

export const courseMemberships = pgTable(
  "course_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("student"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    courseUserIdx: uniqueIndex("idx_course_memberships_course_user").on(
      table.courseId,
      table.userId,
    ),
    courseIdx: index("idx_course_memberships_course").on(table.courseId),
    userIdx: index("idx_course_memberships_user").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Operations / Audit
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id"),
    organizationId: uuid("organization_id"),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    actorFk: foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: "fk_audit_logs_actor",
    }),
    orgFk: foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "fk_audit_logs_org",
    }),
    entityIdx: index("idx_audit_logs_entity").on(
      table.entityType,
      table.entityId,
    ),
    actionIdx: index("idx_audit_logs_action").on(table.action),
    createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Learning Core (Sprint 2)
// ---------------------------------------------------------------------------

/**
 * Modules table.
 *
 * A module is a major topic within a course (e.g. "Drug Classifications").
 * Modules have an explicit sort_order for sequencing.
 */
export const modules = pgTable(
  "modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    courseOrderIdx: index("idx_modules_course_order").on(
      table.courseId,
      table.sortOrder,
    ),
  }),
);

/**
 * Lessons table.
 *
 * A lesson is a single learning unit inside a module.
 * Content is stored as markdown in content_markdown to allow future
 * content type columns (content_video, content_quiz, etc.) without
 * breaking the schema.
 */
// ---------------------------------------------------------------------------
// Schema exports for Drizzle ORM
// ---------------------------------------------------------------------------

export { sql };

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 50 })
      .notNull()
      .default("markdown"),
    contentMarkdown: text("content_markdown").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes"),
    publicationStatus: varchar("publication_status", { length: 20 })
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    moduleOrderIdx: index("idx_lessons_module_order").on(
      table.moduleId,
      table.sortOrder,
    ),
    publicationStatusCheck: check(
      "chk_lessons_publication_status",
      sql`${table.publicationStatus} IN ('draft', 'published')`,
    ),
  }),
);

/**
 * Lesson progress table.
 *
 * Tracks which lessons a user has completed.
 * UNIQUE(user_id, lesson_id) ensures one progress record per user per lesson.
 */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userLessonIdx: uniqueIndex("idx_lesson_progress_user_lesson").on(
      table.userId,
      table.lessonId,
    ),
    userIdx: index("idx_lesson_progress_user").on(table.userId),
    lessonIdx: index("idx_lesson_progress_lesson").on(table.lessonId),
  }),
);

// ---------------------------------------------------------------------------
// Auth (PR-7)
// ---------------------------------------------------------------------------

/**
 * Auth identities table.
 *
 * Links a verified external identity (from the identity adapter) to a local
 * user record. One user may have multiple auth identities (e.g., Google + email).
 */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 100 }).notNull(),
    providerSubject: varchar("provider_subject", { length: 500 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    providerSubjectIdx: uniqueIndex("idx_auth_identities_provider_subject").on(
      table.provider,
      table.providerSubject,
    ),
    userIdx: index("idx_auth_identities_user").on(table.userId),
  }),
);

/**
 * Sessions table.
 *
 * Server-controlled browser sessions. Tokens are stored hashed (SHA-256)
 * so the raw token is never persisted.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("idx_sessions_token_hash").on(table.tokenHash),
    userIdx: index("idx_sessions_user").on(table.userId),
    expiresAtIdx: index("idx_sessions_expires_at").on(table.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// AI Learning Engine (PR6-1)
// ---------------------------------------------------------------------------

/**
 * Documents table.
 *
 * The uploaded original and its lifecycle state. Every record is
 * organization-scoped; ownership is tracked via owner_user_id.
 *
 * UNIQUE(organization_id, sha256) enables duplicate-upload detection.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    pageCount: integer("page_count"),
    status: varchar("status", { length: 30 }).notNull().default("uploaded"),
    errorCode: varchar("error_code", { length: 100 }),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgHashIdx: uniqueIndex("idx_documents_org_hash").on(
      table.organizationId,
      table.sha256,
    ),
    orgCourseIdx: index("idx_documents_org_course").on(
      table.organizationId,
      table.courseId,
    ),
    ownerUserIdx: index("idx_documents_owner_user").on(table.ownerUserId),
    statusIdx: index("idx_documents_status").on(table.status),
  }),
);

/**
 * Document chunks table.
 *
 * Semantic chunks produced by the chunking stage; the citation basis
 * for all AI output. organization_id is denormalized for scoped reads.
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    heading: varchar("heading", { length: 500 }),
    content: text("content").notNull(),
    startPage: integer("start_page").notNull().default(1),
    endPage: integer("end_page").notNull().default(1),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    docSequenceIdx: uniqueIndex("idx_document_chunks_doc_sequence").on(
      table.documentId,
      table.sequence,
    ),
    documentIdx: index("idx_document_chunks_document").on(table.documentId),
    orgHashIdx: index("idx_document_chunks_org_hash").on(
      table.organizationId,
      table.contentHash,
    ),
  }),
);

/**
 * Generated contents table.
 *
 * Every AI-produced draft item, regardless of type
 * (lesson, flashcard batch, quiz, recommendation).
 */
export const generatedContents = pgTable(
  "generated_contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    payload: jsonb("payload").notNull().default({}),
    promptVersion: varchar("prompt_version", { length: 50 }),
    model: varchar("model", { length: 100 }),
    tokenUsage: jsonb("token_usage"),
    generationKey: varchar("generation_key", { length: 255 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    editedBy: uuid("edited_by").references(() => users.id),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    previousPayload: jsonb("previous_payload"),
    materializedLessonId: uuid("materialized_lesson_id").references(
      () => lessons.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgDocTypeIdx: index("idx_generated_contents_org_doc_type").on(
      table.organizationId,
      table.documentId,
      table.type,
    ),
    orgCourseStatusIdx: index("idx_generated_contents_org_course_status").on(
      table.organizationId,
      table.courseId,
      table.status,
    ),
    statusIdx: index("idx_generated_contents_status").on(table.status),
  }),
);

/**
 * Generated content citations join table.
 *
 * Records which source chunks support each generated item — the
 * enforcement point for the source-grounded principle.
 */
export const generatedContentCitations = pgTable(
  "generated_content_citations",
  {
    generatedContentId: uuid("generated_content_id")
      .notNull()
      .references(() => generatedContents.id, { onDelete: "cascade" }),
    documentChunkId: uuid("document_chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.generatedContentId, table.documentChunkId],
      name: "pk_generated_content_citations",
    }),
    chunkIdx: index("idx_generated_content_citations_chunk").on(
      table.documentChunkId,
    ),
  }),
);

/**
 * Generation jobs table (PR6-5).
 *
 * Domain/application lifecycle tracking for asynchronous AI generation.
 * This is intentionally NOT a mirror of BullMQ — it stores only the
 * minimal lifecycle fields needed for job status reads, retries, and
 * failure recovery. It remains valid even if the queue implementation
 * changes in the future. `job_id` is the BullMQ job id (nullable so the
 * table is meaningful even before/without a queue).
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 100 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("queued"),
    generationKey: varchar("generation_key", { length: 255 }),
    jobId: varchar("job_id", { length: 100 }),
    attempts: integer("attempts").notNull().default(0),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgStatusIdx: index("idx_generation_jobs_org_status").on(
      table.organizationId,
      table.status,
    ),
    documentIdx: index("idx_generation_jobs_document").on(table.documentId),
    jobIdIdx: index("idx_generation_jobs_job_id").on(table.jobId),
  }),
);

/**
 * Flashcards table.
 *
 * Accepted flashcards, materialized at acceptance from generated_contents
 * of type 'flashcard'.
 */
export const flashcards = pgTable(
  "flashcards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    generatedContentId: uuid("generated_content_id").references(
      () => generatedContents.id,
    ),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    explanation: text("explanation"),
    cardType: varchar("card_type", { length: 30 })
      .notNull()
      .default("definition"),
    difficulty: varchar("difficulty", { length: 10 })
      .notNull()
      .default("medium"),
    dueAt: timestamp("due_at", { withTimezone: true }).defaultNow().notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: numeric("ease_factor", { precision: 5, scale: 2 })
      .notNull()
      .default("2.5"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgCourseIdx: index("idx_flashcards_org_course").on(
      table.organizationId,
      table.courseId,
    ),
    documentIdx: index("idx_flashcards_document").on(table.documentId),
    dueAtIdx: index("idx_flashcards_due_at").on(table.dueAt),
  }),
);

/**
 * Flashcard reviews table.
 *
 * Immutable spaced-repetition review history (FSRS-style).
 */
export const flashcardReviews = pgTable(
  "flashcard_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flashcardId: uuid("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: varchar("rating", { length: 10 }).notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reactionMs: integer("reaction_ms"),
  },
  (table) => ({
    cardUserTimeIdx: index("idx_flashcard_reviews_card_user_time").on(
      table.flashcardId,
      table.userId,
      table.reviewedAt,
    ),
    userTimeIdx: index("idx_flashcard_reviews_user_time").on(
      table.userId,
      table.reviewedAt,
    ),
  }),
);

/**
 * Quizzes table.
 *
 * Accepted quizzes.
 */
export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgCourseIdx: index("idx_quizzes_org_course").on(
      table.organizationId,
      table.courseId,
    ),
  }),
);

/**
 * Quiz questions table.
 *
 * Questions belonging to a quiz.
 */
export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    generatedContentId: uuid("generated_content_id").references(
      () => generatedContents.id,
    ),
    question: text("question").notNull(),
    questionType: varchar("question_type", { length: 30 })
      .notNull()
      .default("multiple_choice"),
    choices: jsonb("choices"),
    correctAnswer: jsonb("correct_answer").notNull(),
    explanation: text("explanation"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    quizOrderIdx: index("idx_quiz_questions_quiz_order").on(
      table.quizId,
      table.sortOrder,
    ),
  }),
);

/**
 * Quiz attempts table.
 *
 * One row per student attempt at a quiz, plus per-question answers.
 */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    answers: jsonb("answers").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    quizUserTimeIdx: index("idx_quiz_attempts_quiz_user_time").on(
      table.quizId,
      table.userId,
      table.completedAt,
    ),
    userTimeIdx: index("idx_quiz_attempts_user_time").on(
      table.userId,
      table.completedAt,
    ),
  }),
);
