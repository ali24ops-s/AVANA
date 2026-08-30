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
    globalRole: varchar("global_role", { length: 50 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  },
  (table) => ({
    emailIdx: uniqueIndex("idx_users_email").on(table.email),
    globalRoleIdx: index("idx_users_global_role").on(table.globalRole),
  }),
);

export const emailVerificationCodes = pgTable(
  "email_verification_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => ({
    userIdx: index("idx_email_verification_codes_user").on(table.userId),
    activeIdx: index("idx_email_verification_codes_active").on(
      table.userId,
      table.expiresAt,
    ),
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
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
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
    courseDocumentUniqueIdx: uniqueIndex("idx_modules_course_document_unique").on(
      table.courseId,
      table.documentId,
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
    qualityScore: integer("quality_score"),
    qualityLevel: varchar("quality_level", { length: 20 }),
    qualityReport: jsonb("quality_report"),
    qualityAnalyzedAt: timestamp("quality_analyzed_at", { withTimezone: true }),
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
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
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
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    generatedContentId: uuid("generated_content_id").references(
      () => generatedContents.id,
    ),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
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
    lessonIdx: index("idx_flashcards_lesson").on(table.lessonId),
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
 * User Flashcard Schedules table.
 *
 * Stores current per-user SRS scheduling state for each flashcard.
 */
export const userFlashcardSchedules = pgTable(
  "user_flashcard_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flashcardId: uuid("flashcard_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: numeric("ease_factor", { precision: 5, scale: 2 })
      .notNull()
      .default("2.5"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    reviewCount: integer("review_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCardUniqueIdx: uniqueIndex("idx_user_flashcard_schedules_user_card").on(
      table.userId,
      table.flashcardId,
    ),
    userDueIdx: index("idx_user_flashcard_schedules_user_due").on(
      table.userId,
      table.dueAt,
    ),
    cardIdx: index("idx_user_flashcard_schedules_card").on(table.flashcardId),
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
      .references(() => documents.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    topic: varchar("topic", { length: 255 }),
    difficulty: varchar("difficulty", { length: 20 }).default("medium"),
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
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    topic: varchar("topic", { length: 255 }),
    difficulty: varchar("difficulty", { length: 20 }).default("medium"),
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
    lessonIdx: index("idx_quiz_questions_lesson").on(table.lessonId),
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
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    answers: jsonb("answers").notNull().default({}),
    questionIds: jsonb("question_ids"),
    topic: varchar("topic", { length: 255 }),
    difficulty: varchar("difficulty", { length: 20 }),
    status: varchar("status", { length: 20 }).notNull().default("in_progress"),
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

// ---------------------------------------------------------------------------
// AI Study Assistant (Conversations & History)
// ---------------------------------------------------------------------------

/**
 * Study Conversations table.
 *
 * Tracks individual AI study assistant conversation threads for a user,
 * scoped optionally to a specific course and lesson.
 */
export const studyConversations = pgTable(
  "study_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_study_conversations_user").on(table.userId),
    lessonIdx: index("idx_study_conversations_lesson").on(table.lessonId),
    userUpdatedIdx: index("idx_study_conversations_user_updated").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

/**
 * Study Conversation Messages table.
 *
 * Individual turns (user, assistant, system) within a study conversation.
 */
export const studyConversationMessages = pgTable(
  "study_conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => studyConversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    tokenUsage: jsonb("token_usage"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    convOrderIdx: index("idx_study_conv_messages_conv_order").on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Study Sessions & Active Time Tracking (PR6-10)
// ---------------------------------------------------------------------------

/**
 * Study Sessions table.
 *
 * Tracks active learning sessions across lessons, flashcards, exams,
 * AI tutor interactions, and documents to accurately calculate real
 * active educational study time without idle background counting.
 */
export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityType: varchar("activity_type", { length: 50 }).notNull(),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    moduleId: uuid("module_id").references(() => modules.id, {
      onDelete: "set null",
    }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_study_sessions_user").on(table.userId),
    activityTypeIdx: index("idx_study_sessions_activity_type").on(
      table.activityType,
    ),
    startedAtIdx: index("idx_study_sessions_started_at").on(table.startedAt),
    endedAtIdx: index("idx_study_sessions_ended_at").on(table.endedAt),
    userStartedIdx: index("idx_study_sessions_user_started").on(
      table.userId,
      table.startedAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Flashcard Study Sessions & Snapshot Resume
// ---------------------------------------------------------------------------

/**
 * Flashcard Study Sessions table.
 *
 * Stores active and completed flashcard study sessions with aggregate progress
 * so users can resume unfinished sessions across page refreshes, browser restarts,
 * and device switches.
 */
export const flashcardStudySessions = pgTable(
  "flashcard_study_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    mode: varchar("mode", { length: 50 }).notNull().default("daily"),
    customMode: varchar("custom_mode", { length: 50 }),
    status: varchar("status", { length: 30 }).notNull().default("in_progress"),
    totalCards: integer("total_cards").notNull().default(0),
    completedCards: integer("completed_cards").notNull().default(0),
    currentIndex: integer("current_index").notNull().default(0),
    currentCardId: uuid("current_card_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStatusIdx: index("idx_fss_user_status").on(
      table.userId,
      table.status,
    ),
    userLastActivityIdx: index("idx_fss_user_last_activity").on(
      table.userId,
      table.lastActivityAt,
    ),
    orgUserIdx: index("idx_fss_org_user").on(
      table.organizationId,
      table.userId,
    ),
  }),
);

/**
 * Flashcard Study Session Cards table (Ordered Snapshot).
 *
 * Immutable snapshot of selected flashcards with their sequence order.
 * Tracks per-card status within the specific study session.
 */
export const flashcardStudySessionCards = pgTable(
  "flashcard_study_session_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => flashcardStudySessions.id, { onDelete: "cascade" }),
    flashcardId: uuid("flashcard_id").references(() => flashcards.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    status: varchar("status", { length: 30 }).notNull().default("unseen"),
    rating: varchar("rating", { length: 20 }),
    reactionMs: integer("reaction_ms"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionOrderIdx: index("idx_fss_cards_session_order").on(
      table.sessionId,
      table.sortOrder,
    ),
    flashcardIdx: index("idx_fss_cards_flashcard").on(table.flashcardId),
  }),
);

// ---------------------------------------------------------------------------
// Content Packs & Library
// ---------------------------------------------------------------------------

/**
 * Content Packs table.
 *
 * Immutable, shareable collection of 4 AI-generated educational contents
 * (lesson, flashcard, quiz, review_summary) published to the public Avana Library.
 */
export const contentPacks = pgTable(
  "content_packs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorUserId: uuid("creator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    sourceDocumentId: uuid("source_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    subject: varchar("subject", { length: 255 }),
    status: varchar("status", { length: 30 }).notNull().default("published"),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    activeSourceDocUniqueIdx: uniqueIndex(
      "idx_content_packs_active_source_doc",
    )
      .on(table.sourceDocumentId)
      .where(
        sql`${table.status} = 'published' AND ${table.deletedAt} IS NULL AND ${table.sourceDocumentId} IS NOT NULL`,
      ),
    statusUsageIdx: index("idx_content_packs_status_usage").on(
      table.status,
      table.usageCount,
    ),
    subjectStatusIdx: index("idx_content_packs_subject_status").on(
      table.subject,
      table.status,
    ),
    creatorIdx: index("idx_content_packs_creator").on(table.creatorUserId),
    sourceDocIdx: index("idx_content_packs_source_doc").on(
      table.sourceDocumentId,
    ),
  }),
);

/**
 * Content Pack Items table.
 *
 * Stores immutable payload snapshots of each of the 4 accepted contents.
 * Serving public library details and add-to-course materialization NEVER
 * depends on generated_contents.
 */
export const contentPackItems = pgTable(
  "content_pack_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentPackId: uuid("content_pack_id")
      .notNull()
      .references(() => contentPacks.id, { onDelete: "cascade" }),
    contentType: varchar("content_type", { length: 30 }).notNull(),
    sourceGeneratedContentId: uuid("source_generated_content_id").references(
      () => generatedContents.id,
      { onDelete: "set null" },
    ),
    payloadSnapshot: jsonb("payload_snapshot").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    packTypeIdx: uniqueIndex("idx_content_pack_items_pack_type").on(
      table.contentPackId,
      table.contentType,
    ),
  }),
);

/**
 * Content Pack Usages table.
 *
 * Tracks installations of content packs into student courses.
 * UNIQUE(content_pack_id, user_id, target_course_id) ensures one installation
 * per user per course.
 */
export const contentPackUsages = pgTable(
  "content_pack_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentPackId: uuid("content_pack_id")
      .notNull()
      .references(() => contentPacks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetCourseId: uuid("target_course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    targetModuleId: uuid("target_module_id").references(() => modules.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCourseUniqueIdx: uniqueIndex("idx_content_pack_usages_pack_user_course").on(
      table.contentPackId,
      table.userId,
      table.targetCourseId,
    ),
    userPackIdx: index("idx_content_pack_usages_user_pack").on(
      table.contentPackId,
      table.userId,
    ),
    targetCourseIdx: index("idx_content_pack_usages_target_course").on(
      table.targetCourseId,
    ),
  }),
);


