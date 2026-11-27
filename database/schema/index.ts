/* eslint-disable no-secrets/no-secrets */
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
  date,
  primaryKey,
  foreignKey,
  uniqueIndex,
  index,
  check,
  bigint,
  type AnyPgColumn,
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
    phoneNumber: varchar("phone_number", { length: 20 }),
    major: varchar("major", { length: 50 }),
    university: varchar("university", { length: 255 }),
    faculty: varchar("faculty", { length: 255 }),
    department: varchar("department", { length: 255 }),
    teacherStatus: varchar("teacher_status", { length: 20 })
      .notNull()
      .default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  },
  (table) => ({
    emailIdx: uniqueIndex("idx_users_email").on(table.email),
    phoneIdx: uniqueIndex("idx_users_phone_number").on(table.phoneNumber),
    majorIdx: index("idx_users_major").on(table.major),
    universityIdx: index("idx_users_university").on(table.university),
    departmentIdx: index("idx_users_department").on(table.department),
    globalRoleIdx: index("idx_users_global_role").on(table.globalRole),
    teacherStatusIdx: index("idx_users_teacher_status").on(table.teacherStatus),
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
    channel: varchar("channel", { length: 20 }).default("email").notNull(),
    target: varchar("target", { length: 320 }),
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
    channelIdx: index("idx_email_verification_codes_channel").on(
      table.userId,
      table.channel,
    ),
  }),
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("idx_password_reset_tokens_hash").on(
      table.tokenHash,
    ),
    userIdx: index("idx_password_reset_tokens_user").on(table.userId),
    expiresAtIdx: index("idx_password_reset_tokens_expires_at").on(
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
    slug: varchar("slug", { length: 255 }),
    description: text("description"),
    subject: varchar("subject", { length: 255 }),
    status: varchar("status", { length: 30 }).notNull().default("published"),
    isOfficial: boolean("is_official").notNull().default(false),
    examDate: timestamp("exam_date", { withTimezone: true }),
    examScope: jsonb("exam_scope"),
    targetAcademicFields: jsonb("target_academic_fields")
      .$type<string[]>()
      .default([]),
    version: integer("version").notNull().default(1),
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
    officialStatusIdx: index("idx_courses_official_status").on(
      table.isOfficial,
      table.status,
    ),
    orgStatusIdx: index("idx_courses_org_status").on(
      table.organizationId,
      table.status,
    ),
    slugIdx: uniqueIndex("idx_courses_slug")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL AND ${table.slug} IS NOT NULL`),
  }),
);

export const courseSlugRedirects = pgTable(
  "course_slug_redirects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    courseIdx: index("idx_course_slug_redirects_course").on(table.courseId),
    slugIdx: uniqueIndex("idx_course_slug_redirects_slug").on(table.slug),
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
    examDate: timestamp("exam_date", { withTimezone: true }),
    examScope: jsonb("exam_scope"),
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
    userExamIdx: index("idx_course_memberships_user_exam").on(
      table.userId,
      table.examDate,
    ),
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
 * SubCourseGroups table.
 *
 * Categorization/grouping for chapters (modules) within a course.
 */
export const subCourseGroups = pgTable(
  "sub_course_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
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
    courseOrderIdx: index("idx_sub_course_groups_course_order").on(
      table.courseId,
      table.sortOrder,
    ),
    courseGroupUniqueIdx: uniqueIndex("idx_sub_course_groups_course_id").on(
      table.courseId,
      table.id,
    ),
  }),
);

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
    subCourseGroupId: uuid("sub_course_group_id").references(
      () => subCourseGroups.id,
      {
        onDelete: "set null",
      },
    ),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    previewLessonId: uuid("preview_lesson_id"),
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
    previewLessonIdx: index("idx_modules_preview_lesson").on(
      table.previewLessonId,
    ),
    subCourseGroupIdx: index("idx_modules_sub_course_group").on(
      table.subCourseGroupId,
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
    reference: text("reference"),
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
 * Registered User Devices table.
 *
 * Tracks up to 1 mobile and 1 desktop device per user.
 * The device_id is a server-generated random identifier stored in an HttpOnly cookie.
 */
export const userDevices = pgTable(
  "user_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 64 }).notNull(),
    deviceType: varchar("device_type", { length: 20 }).notNull(),
    deviceName: varchar("device_name", { length: 255 }),
    userAgent: text("user_agent"),
    lastIp: varchar("last_ip", { length: 64 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userDeviceTypeUniqueIdx: uniqueIndex("idx_user_devices_user_type_active")
      .on(table.userId, table.deviceType)
      .where(sql`${table.revokedAt} IS NULL`),
    userDeviceIdUniqueIdx: uniqueIndex("idx_user_devices_user_device_active")
      .on(table.userId, table.deviceId)
      .where(sql`${table.revokedAt} IS NULL`),
    deviceIdIdx: index("idx_user_devices_device_id").on(table.deviceId),
    userIdx: index("idx_user_devices_user").on(table.userId),
  }),
);

/**
 * Sessions table.
 *
 * Server-controlled browser sessions. Tokens are stored hashed (SHA-256)
 * so the raw token is never persisted.
 * Single active session for regular users is enforced atomically at the application layer.
 * Platform admins are permitted concurrent multi-device sessions.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    deviceId: uuid("device_id").references(() => userDevices.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: varchar("revocation_reason", { length: 50 }),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("idx_sessions_token_hash").on(table.tokenHash),
    userIdx: index("idx_sessions_user").on(table.userId),
    expiresAtIdx: index("idx_sessions_expires_at").on(table.expiresAt),
    userRevokedIdx: index("idx_sessions_user_revoked").on(
      table.userId,
      table.revokedAt,
    ),
    deviceIdx: index("idx_sessions_device").on(table.deviceId),
  }),
);

/**
 * Authentication Attempts table.
 *
 * Logs authentication attempts from new/blocked devices, especially
 * when the device limit is reached, for audit and account sharing detection.
 */
export const authenticationAttempts = pgTable(
  "authentication_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    email: varchar("email", { length: 320 }).notNull(),
    deviceType: varchar("device_type", { length: 20 }).notNull(),
    deviceId: varchar("device_id", { length: 64 }),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    result: varchar("result", { length: 50 }).notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_auth_attempts_user").on(table.userId),
    emailIdx: index("idx_auth_attempts_email").on(table.email),
    createdAtIdx: index("idx_auth_attempts_created_at").on(table.createdAt),
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
    orgCourseHashIdx: uniqueIndex("idx_documents_org_course_hash")
      .on(table.organizationId, table.courseId, table.sha256)
      .where(sql`${table.courseId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    orgUnattachedHashIdx: uniqueIndex("idx_documents_org_unattached_hash")
      .on(table.organizationId, table.sha256)
      .where(sql`${table.courseId} IS NULL AND ${table.deletedAt} IS NULL`),
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
 * (lesson, flashcard batch, quiz, review_summary).
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
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    questionPatternId: uuid("question_pattern_id"),
    questionPatternVersion: integer("question_pattern_version"),
  },
  (table) => ({
    orgStatusIdx: index("idx_generation_jobs_org_status").on(
      table.organizationId,
      table.status,
    ),
    documentIdx: index("idx_generation_jobs_document").on(table.documentId),
    jobIdIdx: index("idx_generation_jobs_job_id").on(table.jobId),
    statusHeartbeatIdx: index("idx_generation_jobs_status_heartbeat").on(
      table.status,
      table.heartbeatAt,
    ),
    questionPatternIdx: index("idx_generation_jobs_question_pattern").on(
      table.questionPatternId,
    ),
  }),
);

/**
 * Generation job sources join table (Multi-source Unified Generation MVP).
 *
 * Links multiple source documents to a single generation job with an explicit
 * ordering sequence and semantic role (order_index = 0 represents the primary document).
 */
export const generationJobSources = pgTable(
  "generation_job_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    generationJobId: uuid("generation_job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("primary_notes"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    jobDocUniqueIdx: uniqueIndex("idx_gen_job_sources_job_doc").on(
      table.generationJobId,
      table.documentId,
    ),
    jobOrderIdx: index("idx_gen_job_sources_job_order").on(
      table.generationJobId,
      table.orderIndex,
    ),
    docIdx: index("idx_gen_job_sources_doc").on(table.documentId),
  }),
);

export type GenerationJobSourceRecord = typeof generationJobSources.$inferSelect;
export type NewGenerationJobSourceRecord = typeof generationJobSources.$inferInsert;

/**
 * Source packs table (Source Pack MVP).
 *
 * Persistent grouping of course documents into named Source Packs,
 * designating semantic roles (primary_notes, question_template, primary_reference, supplementary_reference)
 * for unified content generation.
 */
export const sourcePacks = pgTable(
  "source_packs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull().default("پک منابع جدید"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgCourseIdx: index("idx_source_packs_org_course").on(
      table.organizationId,
      table.courseId,
    ),
    courseIdx: index("idx_source_packs_course").on(table.courseId),
  }),
);

export type SourcePackRecord = typeof sourcePacks.$inferSelect;
export type NewSourcePackRecord = typeof sourcePacks.$inferInsert;

/**
 * Source pack documents join table.
 *
 * Links documents to a source pack with explicit semantic role
 * and deterministic display/processing ordering.
 */
export const sourcePackDocuments = pgTable(
  "source_pack_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourcePackId: uuid("source_pack_id")
      .notNull()
      .references(() => sourcePacks.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("supplementary_reference"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    packDocUniqueIdx: uniqueIndex("idx_source_pack_docs_pack_doc").on(
      table.sourcePackId,
      table.documentId,
    ),
    packRoleIdx: index("idx_source_pack_docs_pack_role").on(
      table.sourcePackId,
      table.role,
    ),
    docIdx: index("idx_source_pack_docs_doc").on(table.documentId),
  }),
);

export type SourcePackDocumentRecord = typeof sourcePackDocuments.$inferSelect;
export type NewSourcePackDocumentRecord = typeof sourcePackDocuments.$inferInsert;


/**
 * Generation chunks table (PR Resumable / Incremental Generation).
 *
 * Tracks atomic AI generation chunks (planning, session lessons,
 * session flashcards, session quizzes, review summary) with immediate
 * persistence and resumption capabilities.
 */
export const generationChunks = pgTable(
  "generation_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "cascade",
    }),
    generationJobId: uuid("generation_job_id").references(
      () => generationJobs.id,
      { onDelete: "set null" },
    ),
    stage: varchar("stage", { length: 50 }).notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    chunkKey: varchar("chunk_key", { length: 100 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    payload: jsonb("payload"),
    tokenUsage: jsonb("token_usage"),
    attempts: integer("attempts").notNull().default(0),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    docChunkKeyIdx: uniqueIndex("idx_generation_chunks_doc_key")
      .on(table.documentId, table.chunkKey)
      .where(sql`${table.deletedAt} IS NULL`),
    docStageIdx: index("idx_generation_chunks_doc_stage").on(
      table.documentId,
      table.stage,
    ),
    jobIdx: index("idx_generation_chunks_job").on(table.generationJobId),
    statusHeartbeatIdx: index("idx_generation_chunks_status_heartbeat").on(
      table.status,
      table.heartbeatAt,
    ),
  }),
);

/**
 * Document Generation Progress table.
 *
 * Persists granular AI Generation Pipeline status, stage, and numeric progress
 * per document for the Admin panel and live monitoring.
 */
export const documentGenerationProgress = pgTable(
  "document_generation_progress",
  {
    documentId: uuid("document_id")
      .primaryKey()
      .references(() => documents.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 30 }).notNull().default("idle"),
    stage: varchar("stage", { length: 50 }),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    stageStartedAt: timestamp("stage_started_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orgIdx: index("idx_doc_gen_progress_org").on(table.organizationId),
    statusIdx: index("idx_doc_gen_progress_status").on(table.status),
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
      { onDelete: "set null" },
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
      { onDelete: "set null" },
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    quizOrderIdx: index("idx_quiz_questions_quiz_order").on(
      table.quizId,
      table.sortOrder,
    ),
    activeQuizOrderIdx: index("idx_quiz_questions_active_quiz_order")
      .on(table.quizId, table.sortOrder)
      .where(sql`${table.deletedAt} IS NULL`),
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
    questionSnapshot: jsonb("question_snapshot"),
    metrics: jsonb("metrics"),
    topic: varchar("topic", { length: 1024 }),
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
    userStartedIdx: index("idx_quiz_attempts_user_started").on(
      table.userId,
      table.startedAt,
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
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending_review"),
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

/**
 * Course Publications table.
 *
 * Immutable, reviewable publication snapshots of user-generated courses
 * submitted for Avana Library distribution.
 */
export const coursePublications = pgTable(
  "course_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    creatorUserId: uuid("creator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    subject: varchar("subject", { length: 255 }),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending_review"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    snapshot: jsonb("snapshot").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    courseStatusIdx: index("idx_course_publications_course_status").on(
      table.courseId,
      table.status,
    ),
    statusIdx: index("idx_course_publications_status").on(table.status),
    creatorIdx: index("idx_course_publications_creator").on(
      table.creatorUserId,
    ),
    courseVersionUniqueIdx: uniqueIndex(
      "idx_course_publications_course_version",
    )
      .on(table.courseId, table.version)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export type CoursePublication = typeof coursePublications.$inferSelect;
export type NewCoursePublication = typeof coursePublications.$inferInsert;

/**
 * Course Draft Sessions table.
 *
 * Scopes in-flight educational content drafts (manual edits, AI regeneration, content repairs).
 * Invariant: Maximum 1 active draft session per course.
 */
export const courseDraftSessions = pgTable(
  "course_draft_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    baseCourseVersion: integer("base_course_version").notNull(),
    source: varchar("source", { length: 50 }).notNull(), // 'manual' | 'ai_regeneration' | 'content_repair'
    status: varchar("status", { length: 30 }).notNull().default("draft"), // 'draft' | 'validating' | 'ready' | 'publishing' | 'published' | 'discarded' | 'failed'
    title: varchar("title", { length: 255 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    courseStatusIdx: index("idx_draft_sessions_course_status").on(
      table.courseId,
      table.status,
    ),
    singleActiveDraftIdx: uniqueIndex("idx_single_active_draft_per_course")
      .on(table.courseId)
      .where(
        sql`${table.status} IN ('draft', 'validating', 'ready', 'publishing')`,
      ),
  }),
);

export type CourseDraftSession = typeof courseDraftSessions.$inferSelect;
export type NewCourseDraftSession = typeof courseDraftSessions.$inferInsert;

/**
 * Course Draft Changes table.
 *
 * Granular mutations within a draft session.
 * Invariant: Exactly one latest Intended State per (session, entity_type, entity_id).
 */
export const courseDraftChanges = pgTable(
  "course_draft_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftSessionId: uuid("draft_session_id")
      .notNull()
      .references(() => courseDraftSessions.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 50 }).notNull(), // 'module' | 'lesson' | 'flashcard' | 'quiz' | 'quiz_question' | 'sub_course_group' | 'course_metadata'
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 20 }).notNull(), // 'create' | 'update' | 'delete' | 'reorder'
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order"),
    payload: jsonb("payload").notNull(), // { before, after, patch }
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionEntityUniqueIdx: uniqueIndex("idx_draft_changes_session_entity").on(
      table.draftSessionId,
      table.entityType,
      table.entityId,
    ),
    sessionIdx: index("idx_draft_changes_session").on(table.draftSessionId),
    courseIdx: index("idx_draft_changes_course").on(table.courseId),
  }),
);

export type CourseDraftChange = typeof courseDraftChanges.$inferSelect;
export type NewCourseDraftChange = typeof courseDraftChanges.$inferInsert;

/**
 * Course Releases table.
 *
 * Monotonically increasing releases of official courses.
 * Invariant: Complete, self-contained snapshot manifest for deterministic audit and rollback.
 */
export const courseReleases = pgTable(
  "course_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    baseVersion: integer("base_version").notNull(),
    draftSessionId: uuid("draft_session_id").references(
      () => courseDraftSessions.id,
      { onDelete: "set null" },
    ),
    changesSummary: jsonb("changes_summary").notNull(),
    manifest: jsonb("manifest").notNull(), // ReleaseManifestEntry[]
    publishedBy: uuid("published_by")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    courseVersionUniqueIdx: uniqueIndex(
      "idx_course_releases_course_version",
    ).on(table.courseId, table.versionNumber),
    coursePublishedAtIdx: index("idx_course_releases_course_published").on(
      table.courseId,
      table.publishedAt,
    ),
  }),
);

export type CourseRelease = typeof courseReleases.$inferSelect;
export type NewCourseRelease = typeof courseReleases.$inferInsert;

// ---------------------------------------------------------------------------
// Monetization, Subscriptions, and Entitlements
// ---------------------------------------------------------------------------

/**
 * Products table.
 *
 * All sellable catalog items (subscriptions, content packs, courses).
 * Prices are strictly in integer Tomans.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("toman"),
    targetType: varchar("target_type", { length: 50 }),
    targetId: uuid("target_id"),
    durationDays: integer("duration_days"),
    active: boolean("active").notNull().default(true),
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
    typeActiveIdx: index("idx_products_type_active").on(
      table.type,
      table.active,
    ),
    targetIdx: index("idx_products_target").on(
      table.targetType,
      table.targetId,
    ),
    codeIdx: uniqueIndex("idx_products_code").on(table.code),
  }),
);

/**
 * Orders table.
 *
 * Purchase intents created before initiating a payment transaction.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("toman"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStatusIdx: index("idx_orders_user_status").on(
      table.userId,
      table.status,
    ),
    orderNumberIdx: uniqueIndex("idx_orders_order_number").on(
      table.orderNumber,
    ),
    productIdx: index("idx_orders_product").on(table.productId),
  }),
);

/**
 * Payments table.
 *
 * Payment transactions linked to orders and verified via payment gateways.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("toman"),
    gateway: varchar("gateway", { length: 50 }).notNull().default("zarinpal"),
    authority: varchar("authority", { length: 255 }),
    transactionId: varchar("transaction_id", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),
    rawCallbackMetadata: jsonb("raw_callback_metadata"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    trackingNumber: varchar("tracking_number", { length: 100 }),
    sourceCardLast4: varchar("source_card_last4", { length: 4 }),
    payerName: varchar("payer_name", { length: 255 }),
    receiptUrl: varchar("receipt_url", { length: 500 }),
    initialValidationResult: jsonb("initial_validation_result"),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orderIdx: index("idx_payments_order").on(table.orderId),
    authorityIdx: index("idx_payments_authority").on(table.authority),
    userStatusIdx: index("idx_payments_user_status").on(
      table.userId,
      table.status,
    ),
    transactionIdx: index("idx_payments_transaction").on(table.transactionId),
    trackingNumberIdx: index("idx_payments_tracking_number").on(
      table.trackingNumber,
    ),
    c2cLookupIdx: index("idx_payments_c2c_lookup").on(
      table.gateway,
      table.status,
    ),
  }),
);

/**
 * User Subscriptions table.
 *
 * Business record and subscription history for billing tracking.
 */
export const userSubscriptions = pgTable(
  "user_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStatusIdx: index("idx_user_subs_user_status").on(
      table.userId,
      table.status,
      table.expiresAt,
    ),
    productIdx: index("idx_user_subs_product").on(table.productId),
  }),
);

/**
 * User Entitlements table.
 *
 * Single runtime access ledger for all resource access:
 * - subscription (resource_id is null)
 * - content_pack (resource_id is content_pack_id, expires_at is null for lifetime)
 * - course (resource_id is course_id, expires_at is null for lifetime)
 */
export const userEntitlements = pgTable(
  "user_entitlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    resourceId: uuid("resource_id"),
    sourceType: varchar("source_type", { length: 50 })
      .notNull()
      .default("purchase"),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    resourceIdCheck: check(
      "chk_user_entitlements_resource_id",
      sql`(${table.resourceType} = 'subscription' AND ${table.resourceId} IS NULL) OR (${table.resourceType} IN ('course', 'content_pack', 'content', 'special_exam') AND ${table.resourceId} IS NOT NULL)`,
    ),
    lifetimeUniqueIdx: uniqueIndex("idx_user_entitlements_lifetime_unique")
      .on(table.userId, table.resourceType, table.resourceId)
      .where(sql`${table.expiresAt} IS NULL AND ${table.resourceId} IS NOT NULL`),
    subscriptionLifetimeUniqueIdx: uniqueIndex(
      "idx_user_entitlements_subscription_lifetime_unique",
    )
      .on(table.userId, table.resourceType)
      .where(
        sql`${table.expiresAt} IS NULL AND ${table.resourceType} = 'subscription'`,
      ),
    lookupIdx: index("idx_user_entitlements_lookup").on(
      table.userId,
      table.resourceType,
      table.resourceId,
      table.expiresAt,
    ),
    userExpiresIdx: index("idx_user_entitlements_user_expires").on(
      table.userId,
      table.expiresAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Blog & Content CMS (PR-Blog)
// ---------------------------------------------------------------------------

export const blogCategories = pgTable(
  "blog_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_blog_categories_slug").on(table.slug),
    sortIdx: index("idx_blog_categories_sort").on(table.sortOrder, table.name),
  }),
);

export const blogTags = pgTable(
  "blog_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_blog_tags_slug").on(table.slug),
    nameIdx: uniqueIndex("idx_blog_tags_name").on(table.name),
  }),
);

export const blogPosts = pgTable(
  "blog_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    featuredImage: text("featured_image"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => blogCategories.id, {
      onDelete: "set null",
    }),
    viewCount: integer("view_count").notNull().default(0),
    readingTimeMinutes: integer("reading_time_minutes").notNull().default(5),
    seoTitle: varchar("seo_title", { length: 255 }),
    seoDescription: text("seo_description"),
    canonicalUrl: varchar("canonical_url", { length: 500 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_blog_posts_slug").on(table.slug),
    statusPublishedIdx: index("idx_blog_posts_status_published").on(
      table.status,
      table.publishedAt,
    ),
    categoryStatusIdx: index("idx_blog_posts_category_status").on(
      table.categoryId,
      table.status,
    ),
    authorIdx: index("idx_blog_posts_author").on(table.authorId),
    createdIdx: index("idx_blog_posts_created").on(table.createdAt),
  }),
);

export const blogPostTags = pgTable(
  "blog_post_tags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => blogPosts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => blogTags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.tagId] }),
    tagIdx: index("idx_blog_post_tags_tag").on(table.tagId),
    postIdx: index("idx_blog_post_tags_post").on(table.postId),
  }),
);

export type BlogCategory = typeof blogCategories.$inferSelect;
export type NewBlogCategory = typeof blogCategories.$inferInsert;
export type BlogTag = typeof blogTags.$inferSelect;
export type NewBlogTag = typeof blogTags.$inferInsert;
export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
export type BlogPostTag = typeof blogPostTags.$inferSelect;

// ---------------------------------------------------------------------------
// Content Export & Import System (Migration 0030)
// ---------------------------------------------------------------------------

export const contentImportBatches = pgTable(
  "content_import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 100 }).notNull().default("unknown"),
    formatVersion: integer("format_version").notNull().default(1),
    packageChecksum: char("package_checksum", { length: 64 }),
    manifest: jsonb("manifest").notNull().default({}),
    stats: jsonb("stats").notNull().default({}),
    status: varchar("status", { length: 30 }).notNull().default("completed"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("idx_content_import_batches_org").on(
      table.organizationId,
      table.createdAt,
    ),
  }),
);

export const importedEntities = pgTable(
  "imported_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").references(() => contentImportBatches.id, {
      onDelete: "set null",
    }),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    exportId: varchar("export_id", { length: 255 }).notNull(),
    targetEntityId: uuid("target_entity_id").notNull(),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    naturalKey: varchar("natural_key", { length: 500 }),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orgTypeExportIdx: uniqueIndex("uq_imported_entities_org_type_export").on(
      table.organizationId,
      table.entityType,
      table.exportId,
    ),
    targetIdx: index("idx_imported_entities_target").on(
      table.entityType,
      table.targetEntityId,
    ),
    hashIdx: index("idx_imported_entities_hash").on(
      table.organizationId,
      table.entityType,
      table.contentHash,
    ),
    naturalIdx: index("idx_imported_entities_natural").on(
      table.organizationId,
      table.entityType,
      table.naturalKey,
    ),
  }),
);

export type ContentImportBatch = typeof contentImportBatches.$inferSelect;
export type NewContentImportBatch = typeof contentImportBatches.$inferInsert;
export type ImportedEntity = typeof importedEntities.$inferSelect;
export type NewImportedEntity = typeof importedEntities.$inferInsert;

// ---------------------------------------------------------------------------
// Notifications System
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    actionUrl: varchar("action_url", { length: 512 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_notifications_user_created").on(
      table.userId,
      table.createdAt,
    ),
    userUnreadIdx: index("idx_notifications_user_unread").on(
      table.userId,
      table.isRead,
    ),
    idempotencyIdx: uniqueIndex("idx_notifications_idempotency").on(
      table.idempotencyKey,
    ),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ---------------------------------------------------------------------------
// Lesson Annotations & Text Interactions (Highlights, Notes & Content Reports)
// ---------------------------------------------------------------------------

export const lessonAnnotations = pgTable(
  "lesson_annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(), // "highlight" | "note"
    selectedText: text("selected_text").notNull(),
    prefix: text("prefix"),
    suffix: text("suffix"),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    color: varchar("color", { length: 30 }).default("default").notNull(),
    noteText: text("note_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userLessonIdx: index("idx_lesson_annotations_user_lesson").on(
      table.userId,
      table.lessonId,
    ),
  }),
);

export type LessonAnnotation = typeof lessonAnnotations.$inferSelect;
export type NewLessonAnnotation = typeof lessonAnnotations.$inferInsert;

export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    selectedText: text("selected_text").notNull(),
    category: varchar("category", { length: 50 }).notNull(), // "scientific_error" | "typo" | "rendering_issue" | "unclear_content" | "other"
    comment: text("comment"),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    lessonIdx: index("idx_content_reports_lesson").on(table.lessonId),
    userIdx: index("idx_content_reports_user").on(table.userId),
  }),
);

export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;

/**
 * System Configurations Table.
 * Key-value storage for platform and financial baseline configurations.
 */
export const systemConfigurations = pgTable("system_configurations", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type SystemConfiguration = typeof systemConfigurations.$inferSelect;
export type NewSystemConfiguration = typeof systemConfigurations.$inferInsert;

// ---------------------------------------------------------------------------
// Avana Credits & Wallet System (Migration 0047)
// ---------------------------------------------------------------------------

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    currency: varchar("currency", { length: 10 }).notNull().default("toman"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("idx_wallets_user_id").on(table.userId),
    balanceCheck: check(
      "chk_wallets_balance_non_negative",
      sql`${table.balance} >= 0`,
    ),
  }),
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 30 }).notNull(),
    amount: integer("amount").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    source: varchar("source", { length: 50 }).notNull(),
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    referenceId: varchar("reference_id", { length: 255 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    walletIdx: index("idx_wallet_tx_wallet_id").on(table.walletId),
    userIdx: index("idx_wallet_tx_user_id").on(table.userId),
    referenceIdx: index("idx_wallet_tx_reference").on(
      table.referenceType,
      table.referenceId,
    ),
    idempotencyIdx: uniqueIndex("idx_wallet_tx_idempotency").on(
      table.idempotencyKey,
    ),
    amountCheck: check(
      "chk_wallet_tx_amount_positive",
      sql`${table.amount} > 0`,
    ),
  }),
);

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;

// ---------------------------------------------------------------------------
// Promotions, Coupons, Restrictions & Redemptions (Migration 0051)
// ---------------------------------------------------------------------------

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    benefitType: varchar("benefit_type", { length: 50 }).notNull(),
    benefitValue: integer("benefit_value").notNull(),
    maxDiscountAmount: integer("max_discount_amount"),
    minOrderAmount: integer("min_order_amount"),
    totalUsageLimit: integer("total_usage_limit"),
    perUserUsageLimit: integer("per_user_usage_limit"),
    active: boolean("active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
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
    activeDatesIdx: index("idx_promotions_active_dates")
      .on(table.active, table.startsAt, table.endsAt)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const promotionCodes = pgTable(
  "promotion_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 100 }).notNull(),
    maxUses: integer("max_uses"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    promotionIdIdx: index("idx_promotion_codes_promotion_id").on(table.promotionId),
    uniqueActiveCodeIdx: uniqueIndex("idx_promotion_codes_unique_active")
      .on(sql`UPPER(${table.code})`)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const promotionProducts = pgTable(
  "promotion_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    productType: varchar("product_type", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    lookupIdx: index("idx_promotion_products_lookup").on(
      table.promotionId,
      table.productId,
      table.productType,
    ),
    targetCheck: check(
      "chk_promotion_products_target",
      sql`${table.productId} IS NOT NULL OR ${table.productType} IS NOT NULL`,
    ),
  }),
);

export const promotionUsers = pgTable(
  "promotion_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    lookupIdx: index("idx_promotion_users_lookup").on(
      table.promotionId,
      table.userId,
    ),
    uniqueUserPromotion: uniqueIndex("uq_promotion_users").on(
      table.promotionId,
      table.userId,
    ),
  }),
);

export const promotionRedemptions = pgTable(
  "promotion_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    codeId: uuid("code_id")
      .notNull()
      .references(() => promotionCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "cascade",
    }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    benefitType: varchar("benefit_type", { length: 50 }).notNull(),
    benefitValue: integer("benefit_value").notNull(),
    discountAmount: integer("discount_amount").notNull().default(0),
    cashbackAmount: integer("cashback_amount").notNull().default(0),
    orderOriginalAmount: integer("order_original_amount").notNull(),
    orderFinalAmount: integer("order_final_amount").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }).notNull(),
    promotionSnapshot: jsonb("promotion_snapshot").notNull().default({}),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orderIdx: index("idx_redemptions_order_id").on(table.orderId),
    userPromotionIdx: index("idx_redemptions_user_promotion").on(
      table.userId,
      table.promotionId,
      table.status,
    ),
    statusExpiresIdx: index("idx_redemptions_status_expires").on(
      table.status,
      table.reservationExpiresAt,
    ),
    promotionActiveIdx: index("idx_redemptions_promotion_active").on(
      table.promotionId,
      table.status,
    ),
  }),
);

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;
export type PromotionCode = typeof promotionCodes.$inferSelect;
export type NewPromotionCode = typeof promotionCodes.$inferInsert;
export type PromotionProduct = typeof promotionProducts.$inferSelect;
export type NewPromotionProduct = typeof promotionProducts.$inferInsert;
export type PromotionUser = typeof promotionUsers.$inferSelect;
export type NewPromotionUser = typeof promotionUsers.$inferInsert;
export type PromotionRedemption = typeof promotionRedemptions.$inferSelect;
export type NewPromotionRedemption = typeof promotionRedemptions.$inferInsert;

// ---------------------------------------------------------------------------
// Referral System (Migration 0052)
// ---------------------------------------------------------------------------

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("idx_referral_codes_user_id").on(table.userId),
    uniqueCodeIdx: uniqueIndex("idx_referral_codes_code_unique").on(
      sql`UPPER(${table.code})`,
    ),
  }),
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inviterUserId: uuid("inviter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referralCodeId: uuid("referral_code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 30 }).default("pending").notNull(),
    qualifyingOrderId: uuid("qualifying_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    qualifyingPaymentId: uuid("qualifying_payment_id").references(
      () => payments.id,
      { onDelete: "set null" },
    ),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    rewardType: varchar("reward_type", { length: 50 })
      .default("wallet_credit")
      .notNull(),
    rewardAmount: integer("reward_amount").default(0).notNull(),
    rewardStatus: varchar("reward_status", { length: 30 })
      .default("pending")
      .notNull(),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
    walletTransactionId: uuid("wallet_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    invitedUserUniqueIdx: uniqueIndex("idx_referrals_invited_user_unique").on(
      table.invitedUserId,
    ),
    inviterStatusIdx: index("idx_referrals_inviter_status").on(
      table.inviterUserId,
      table.status,
    ),
    statusIdx: index("idx_referrals_status").on(table.status),
    noSelfReferralCheck: check(
      "chk_referrals_no_self_referral",
      sql`${table.inviterUserId} != ${table.invitedUserId}`,
    ),
  }),
);

export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;

// ---------------------------------------------------------------------------
// Daily Study Planner (Migration 0053)
// ---------------------------------------------------------------------------

export const dailyStudyPlans = pgTable(
  "daily_study_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planDate: date("plan_date").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("in_progress"),
    targetDurationMinutes: integer("target_duration_minutes")
      .notNull()
      .default(45),
    completedDurationMinutes: integer("completed_duration_minutes")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userDateUniqueIdx: uniqueIndex("idx_daily_study_plans_user_date").on(
      table.userId,
      table.planDate,
    ),
    userStatusIdx: index("idx_daily_study_plans_user_status").on(
      table.userId,
      table.status,
    ),
    planDateIdx: index("idx_daily_study_plans_date").on(table.planDate),
  }),
);

export const studyTasks = pgTable(
  "study_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => dailyStudyPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskType: varchar("task_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    moduleId: uuid("module_id").references(() => modules.id, {
      onDelete: "set null",
    }),
    lessonId: uuid("lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    quizId: uuid("quiz_id").references(() => quizzes.id, {
      onDelete: "set null",
    }),
    priority: integer("priority").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes").notNull().default(15),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    planPriorityIdx: index("idx_study_tasks_plan_priority").on(
      table.planId,
      table.priority,
    ),
    userStatusIdx: index("idx_study_tasks_user_status").on(
      table.userId,
      table.status,
    ),
    lessonIdx: index("idx_study_tasks_lesson").on(table.lessonId),
    quizIdx: index("idx_study_tasks_quiz").on(table.quizId),
    courseIdx: index("idx_study_tasks_course").on(table.courseId),
  }),
);

export type DailyStudyPlanRecord = typeof dailyStudyPlans.$inferSelect;
export type NewDailyStudyPlanRecord = typeof dailyStudyPlans.$inferInsert;
export type StudyTaskRecord = typeof studyTasks.$inferSelect;
export type NewStudyTaskRecord = typeof studyTasks.$inferInsert;

// ---------------------------------------------------------------------------
// Support & Feedback System (Migration 0055)
// ---------------------------------------------------------------------------

export const feedbacks = pgTable(
  "feedbacks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    attachmentUrl: varchar("attachment_url", { length: 512 }),
    status: varchar("status", { length: 30 }).notNull().default("new"),
    adminResponse: text("admin_response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: uuid("responded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_feedbacks_user_id").on(table.userId),
    statusIdx: index("idx_feedbacks_status").on(table.status),
    typeIdx: index("idx_feedbacks_type").on(table.type),
    categoryIdx: index("idx_feedbacks_category").on(table.category),
    createdAtIdx: index("idx_feedbacks_created_at").on(table.createdAt),
  }),
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 50 }).notNull(),
    priority: varchar("priority", { length: 30 }).notNull().default("medium"),
    status: varchar("status", { length: 30 }).notNull().default("open"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    attachmentUrl: varchar("attachment_url", { length: 512 }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_support_tickets_user_id").on(table.userId),
    statusIdx: index("idx_support_tickets_status").on(table.status),
    priorityIdx: index("idx_support_tickets_priority").on(table.priority),
    categoryIdx: index("idx_support_tickets_category").on(table.category),
    lastActivityIdx: index("idx_support_tickets_last_activity").on(
      table.lastActivityAt,
    ),
    createdAtIdx: index("idx_support_tickets_created_at").on(table.createdAt),
  }),
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderRole: varchar("sender_role", { length: 30 }).notNull().default("user"),
    body: text("body").notNull(),
    attachmentUrl: varchar("attachment_url", { length: 512 }),
    isInternalNote: boolean("is_internal_note").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    ticketIdx: index("idx_support_messages_ticket_id").on(table.ticketId),
    senderIdx: index("idx_support_messages_sender_id").on(table.senderId),
    internalNoteIdx: index("idx_support_messages_internal_note").on(
      table.ticketId,
      table.isInternalNote,
    ),
    createdAtIdx: index("idx_support_messages_created_at").on(table.createdAt),
  }),
);

export type FeedbackRecord = typeof feedbacks.$inferSelect;
export type NewFeedbackRecord = typeof feedbacks.$inferInsert;
export type SupportTicketRecord = typeof supportTickets.$inferSelect;
export type NewSupportTicketRecord = typeof supportTickets.$inferInsert;
export type SupportMessageRecord = typeof supportMessages.$inferSelect;
export type NewSupportMessageRecord = typeof supportMessages.$inferInsert;

// ---------------------------------------------------------------------------
// Teacher Platform (Classrooms, Exams, Questions, Attempts)
// ---------------------------------------------------------------------------

export const classrooms = pgTable(
  "classrooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    inviteCode: varchar("invite_code", { length: 16 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index("idx_classrooms_org_id").on(table.organizationId),
    teacherIdx: index("idx_classrooms_teacher_id").on(table.teacherId),
    inviteCodeIdx: uniqueIndex("idx_classrooms_invite_code").on(table.inviteCode),
  }),
);

export const classroomMembers = pgTable(
  "classroom_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastJoinedAt: timestamp("last_joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    memberLookupIdx: index("idx_classroom_members_lookup").on(
      table.classroomId,
      table.studentId,
    ),
    activeMemberUniqueIdx: uniqueIndex("idx_classroom_members_active_unique")
      .on(table.classroomId, table.studentId)
      .where(sql`status = 'active'`),
  }),
);

export const teacherExams = pgTable(
  "teacher_exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    passingScorePercentage: numeric("passing_score_percentage", {
      precision: 5,
      scale: 2,
    }),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
    shuffleOptions: boolean("shuffle_options").notNull().default(true),
    showResultsImmediately: boolean("show_results_immediately")
      .notNull()
      .default(false),
    allowBackNavigation: boolean("allow_back_navigation")
      .notNull()
      .default(true),
    perQuestionTimeSeconds: integer("per_question_time_seconds"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    resultsReleasedAt: timestamp("results_released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    classroomIdx: index("idx_teacher_exams_classroom_id").on(table.classroomId),
    statusTimingIdx: index("idx_teacher_exams_status_timing").on(
      table.status,
      table.startsAt,
      table.endsAt,
    ),
  }),
);

export const teacherExamQuestions = pgTable(
  "teacher_exam_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => teacherExams.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    questionType: varchar("question_type", { length: 30 })
      .notNull()
      .default("single_choice"),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<Array<{ id: string; text: string }>>(),
    correctOptionId: varchar("correct_option_id", { length: 64 }),
    points: numeric("points", { precision: 5, scale: 2 })
      .notNull()
      .default("1.00"),
    explanation: text("explanation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    examOrderIdx: index("idx_teacher_exam_questions_order").on(
      table.examId,
      table.orderIndex,
    ),
  }),
);

export const teacherExamAttempts = pgTable(
  "teacher_exam_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => teacherExams.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("in_progress"),
    gradingStatus: varchar("grading_status", { length: 30 })
      .notNull()
      .default("fully_graded"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    score: numeric("score", { precision: 6, scale: 2 }),
    maxScore: numeric("max_score", { precision: 6, scale: 2 }),
    percentage: numeric("percentage", { precision: 5, scale: 2 }),
    passed: boolean("passed"),
    allowBackNavigation: boolean("allow_back_navigation")
      .notNull()
      .default(true),
    perQuestionTimeSeconds: integer("per_question_time_seconds"),
    questionSnapshot: jsonb("question_snapshot")
      .$type<
        Array<{
          id: string;
          orderIndex: number;
          questionType?: string;
          prompt: string;
          options?: Array<{ id: string; text: string }>;
          correctOptionId?: string | null;
          points: number;
          explanation?: string | null;
        }>
      >()
      .notNull(),
    integrityMetadata: jsonb("integrity_metadata").$type<{
      tabSwitchCount: number;
      incompleteExitCount: number;
      totalTimeAwayMs: number;
      reconnectCount: number;
      concurrentSessionDetected: boolean;
      activeSessions?: Array<{
        clientSessionId: string;
        firstSeenAt: string;
        lastSeenAt: string;
      }>;
      events: Array<{
        id: string;
        type: "tab_hidden" | "tab_visible" | "reconnect";
        serverReceivedAt: string;
        clientTimestamp?: string | null;
        clientSessionId: string;
        durationAwayMs?: number | null;
      }>;
      lastExitTimestamp?: string | null;
      lastExitSessionId?: string | null;
      lastEventTimestamp?: string | null;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    singleAttemptIdx: uniqueIndex("idx_exam_attempts_single_student").on(
      table.examId,
      table.studentId,
    ),
    studentIdx: index("idx_exam_attempts_student_id").on(table.studentId),
    examStatusIdx: index("idx_exam_attempts_exam_status").on(
      table.examId,
      table.status,
    ),
  }),
);

export const teacherExamAttemptAnswers = pgTable(
  "teacher_exam_attempt_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => teacherExamAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull(),
    selectedOptionId: varchar("selected_option_id", { length: 64 }),
    textAnswer: text("text_answer"),
    teacherFeedback: text("teacher_feedback"),
    gradingStatus: varchar("grading_status", { length: 30 })
      .notNull()
      .default("auto_graded"),
    isCorrect: boolean("is_correct"),
    pointsEarned: numeric("points_earned", { precision: 5, scale: 2 }),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    integrityMetadata: jsonb("integrity_metadata").$type<{
      startedAt?: string | null;
      lastEditedAt?: string | null;
      durationMs?: number | null;
      editCount: number;
      pasteCount: number;
      pastedCharactersTotal: number;
      pastedWordsTotal: number;
      rapidInputCount: number;
      rapidInputCharactersTotal: number;
      rapidInputWordsTotal: number;
      pasteEvents?: Array<{
        timestamp: string;
        characterCount: number;
        wordCount: number;
        cursorPosition?: number | null;
      }>;
      rapidInputEvents?: Array<{
        timestamp: string;
        characterCount: number;
        wordCount: number;
        durationMs: number;
        charactersPerSecond: number;
        wordsPerSecond: number;
      }>;
      timeline?: Array<{
        type: "start" | "typing" | "paste" | "rapid_input" | "edit" | "submit";
        timestamp: string;
        characterDelta?: number | null;
        wordDelta?: number | null;
        metadata?: Record<string, string | number | boolean | null>;
      }>;
    }>(),
  },
  (table) => ({
    attemptQuestionUniqueIdx: uniqueIndex("idx_attempt_answers_unique").on(
      table.attemptId,
      table.questionId,
    ),
  }),
);

export type ClassroomRecord = typeof classrooms.$inferSelect;
export type NewClassroomRecord = typeof classrooms.$inferInsert;
export type ClassroomMemberRecord = typeof classroomMembers.$inferSelect;
export type NewClassroomMemberRecord = typeof classroomMembers.$inferInsert;
export type TeacherExamRecord = typeof teacherExams.$inferSelect;
export type NewTeacherExamRecord = typeof teacherExams.$inferInsert;
export type TeacherExamQuestionRecord = typeof teacherExamQuestions.$inferSelect;
export type NewTeacherExamQuestionRecord = typeof teacherExamQuestions.$inferInsert;
export type TeacherExamAttemptRecord = typeof teacherExamAttempts.$inferSelect;
export type NewTeacherExamAttemptRecord = typeof teacherExamAttempts.$inferInsert;
export type TeacherExamAttemptAnswerRecord =
  typeof teacherExamAttemptAnswers.$inferSelect;
export type NewTeacherExamAttemptAnswerRecord =
  typeof teacherExamAttemptAnswers.$inferInsert;

// ---------------------------------------------------------------------------
// Classroom Assignments & Submissions
// ---------------------------------------------------------------------------

export const classroomAssignments = pgTable(
  "classroom_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    classroomIdx: index("idx_classroom_assignments_classroom_id").on(
      table.classroomId,
    ),
    teacherIdx: index("idx_classroom_assignments_teacher_id").on(table.teacherId),
    statusTimingIdx: index("idx_classroom_assignments_status_timing").on(
      table.status,
      table.startsAt,
      table.dueAt,
    ),
  }),
);

export const classroomAssignmentSubmissions = pgTable(
  "classroom_assignment_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => classroomAssignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    answerText: text("answer_text").notNull().default(""),
    attachmentUrl: varchar("attachment_url", { length: 512 }),
    attachmentName: varchar("attachment_name", { length: 255 }),
    attachmentSizeBytes: integer("attachment_size_bytes"),
    status: varchar("status", { length: 20 }).notNull().default("submitted"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    singleSubmissionIdx: uniqueIndex(
      "idx_assignment_submissions_single_student",
    ).on(table.assignmentId, table.studentId),
    assignmentIdx: index("idx_assignment_submissions_assignment_id").on(
      table.assignmentId,
    ),
    studentIdx: index("idx_assignment_submissions_student_id").on(
      table.studentId,
    ),
  }),
);

export type ClassroomAssignmentRecord = typeof classroomAssignments.$inferSelect;
export type NewClassroomAssignmentRecord = typeof classroomAssignments.$inferInsert;
export type ClassroomAssignmentSubmissionRecord =
  typeof classroomAssignmentSubmissions.$inferSelect;
export type NewClassroomAssignmentSubmissionRecord =
  typeof classroomAssignmentSubmissions.$inferInsert;

// ---------------------------------------------------------------------------
// Classroom Educational Contents
// ---------------------------------------------------------------------------

export const classroomContents = pgTable(
  "classroom_contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    contentType: varchar("content_type", { length: 30 }).notNull(),
    textContent: text("text_content"),
    fileUrl: varchar("file_url", { length: 512 }),
    fileName: varchar("file_name", { length: 255 }),
    fileSizeBytes: integer("file_size_bytes"),
    mimeType: varchar("mime_type", { length: 128 }),
    externalUrl: varchar("external_url", { length: 2048 }),
    videoProvider: varchar("video_provider", { length: 50 }),
    videoEmbedUrl: varchar("video_embed_url", { length: 2048 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    classroomIdx: index("idx_classroom_contents_classroom_id").on(
      table.classroomId,
    ),
    teacherIdx: index("idx_classroom_contents_teacher_id").on(table.teacherId),
    statusCreatedAtIdx: index("idx_classroom_contents_status_created_at").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export type ClassroomContentRecord = typeof classroomContents.$inferSelect;
export type NewClassroomContentRecord = typeof classroomContents.$inferInsert;

// ---------------------------------------------------------------------------
// Teacher Student Messaging (Migration 0070)
// ---------------------------------------------------------------------------

export const teacherStudentConversations = pgTable(
  "teacher_student_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("new"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSenderRole: varchar("last_sender_role", { length: 20 })
      .notNull()
      .default("student"),
    teacherReadAt: timestamp("teacher_read_at", { withTimezone: true }),
    studentReadAt: timestamp("student_read_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    teacherStatusIdx: index("idx_teacher_conversations_teacher_status").on(
      table.teacherId,
      table.status,
    ),
    teacherCategoryIdx: index("idx_teacher_conversations_teacher_category").on(
      table.teacherId,
      table.category,
    ),
    studentIdx: index("idx_teacher_conversations_student_id").on(table.studentId),
    classroomIdx: index("idx_teacher_conversations_classroom_id").on(
      table.classroomId,
    ),
    lastActivityIdx: index("idx_teacher_conversations_last_activity").on(
      table.lastActivityAt,
    ),
  }),
);

export const teacherConversationMessages = pgTable(
  "teacher_conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => teacherStudentConversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderRole: varchar("sender_role", { length: 20 })
      .notNull()
      .default("student"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    conversationIdx: index("idx_teacher_conv_messages_conv_id").on(
      table.conversationId,
    ),
    createdAtIdx: index("idx_teacher_conv_messages_created_at").on(
      table.createdAt,
    ),
  }),
);

export type TeacherStudentConversationRecord =
  typeof teacherStudentConversations.$inferSelect;
export type NewTeacherStudentConversationRecord =
  typeof teacherStudentConversations.$inferInsert;
export type TeacherConversationMessageRecord =
  typeof teacherConversationMessages.$inferSelect;
export type NewTeacherConversationMessageRecord =
  typeof teacherConversationMessages.$inferInsert;

// ---------------------------------------------------------------------------
// Question Patterns (AI Exam Generation Reference Patterns MVP)
// ---------------------------------------------------------------------------

export const questionPatterns = pgTable(
  "question_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }).notNull().default("exam"),
    cognitiveLevel: varchar("cognitive_level", { length: 50 }).default("recall"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    systemInstructions: text("system_instructions").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    activeIdx: index("idx_question_patterns_active").on(table.isActive),
    categoryIdx: index("idx_question_patterns_category").on(table.category, table.isActive),
  }),
);

export const questionPatternExamples = pgTable(
  "question_pattern_examples",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionPatternId: uuid("question_pattern_id")
      .notNull()
      .references(() => questionPatterns.id, { onDelete: "cascade" }),
    sourceQuizQuestionId: uuid("source_quiz_question_id").references(
      () => quizQuestions.id,
      { onDelete: "set null" },
    ),
    question: text("question").notNull(),
    choices: jsonb("choices").notNull(),
    correctAnswer: jsonb("correct_answer").notNull(),
    explanation: text("explanation"),
    clinicalContext: text("clinical_context"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    patternIdx: index("idx_question_pattern_examples_pattern").on(
      table.questionPatternId,
      table.sortOrder,
    ),
    sourceQuestionIdx: index("idx_question_pattern_examples_source_question").on(
      table.sourceQuizQuestionId,
    ),
  }),
);

export type QuestionPatternDbRecord = typeof questionPatterns.$inferSelect;
export type NewQuestionPatternDbRecord = typeof questionPatterns.$inferInsert;
export type QuestionPatternExampleDbRecord = typeof questionPatternExamples.$inferSelect;
export type NewQuestionPatternExampleDbRecord = typeof questionPatternExamples.$inferInsert;

// ---------------------------------------------------------------------------
// Telegram Outbox System
// ---------------------------------------------------------------------------

export const telegramOutbox = pgTable(
  "telegram_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    chatId: varchar("chat_id", { length: 64 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(10),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseToken: varchar("lease_token", { length: 64 }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("idx_telegram_outbox_idempotency_key").on(
      table.idempotencyKey,
    ),
    pollIdx: index("idx_telegram_outbox_poll").on(
      table.status,
      table.nextAttemptAt,
    ),
    createdAtIdx: index("idx_telegram_outbox_created_at").on(
      table.createdAt,
    ),
  }),
);

export type TelegramOutboxDbRecord = typeof telegramOutbox.$inferSelect;
export type NewTelegramOutboxDbRecord = typeof telegramOutbox.$inferInsert;

// ---------------------------------------------------------------------------
// Avana User Welcome Gifts System (Migration 0082)
// ---------------------------------------------------------------------------

export const userWelcomeGifts = pgTable(
  "user_welcome_gifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    walletAmount: integer("wallet_amount").notNull().default(20000),
    walletTransactionId: uuid("wallet_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    subscriptionDays: integer("subscription_days").notNull().default(7),
    subscriptionId: uuid("subscription_id").references(
      () => userSubscriptions.id,
      { onDelete: "set null" },
    ),
    entitlementId: uuid("entitlement_id").references(
      () => userEntitlements.id,
      { onDelete: "set null" },
    ),
    status: varchar("status", { length: 30 }).notNull().default("completed"),
    popupSeenAt: timestamp("popup_seen_at", { withTimezone: true }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("idx_user_welcome_gifts_user_id").on(table.userId),
    statusIdx: index("idx_user_welcome_gifts_status").on(table.status),
    popupSeenIdx: index("idx_user_welcome_gifts_popup_seen").on(
      table.userId,
      table.popupSeenAt,
    ),
  }),
);

export type UserWelcomeGift = typeof userWelcomeGifts.$inferSelect;
export type NewUserWelcomeGift = typeof userWelcomeGifts.$inferInsert;

// ---------------------------------------------------------------------------
// Avana User Onboarding Tours System (Migration 0086)
// ---------------------------------------------------------------------------

export const userOnboardingTours = pgTable(
  "user_onboarding_tours",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    tourId: varchar("tour_id", { length: 50 }).notNull().default("dashboard_overview"),
    status: varchar("status", { length: 30 }).notNull().default("unseen"),
    step: integer("step").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: uniqueIndex("idx_user_onboarding_tours_user_id").on(table.userId),
    statusIdx: index("idx_user_onboarding_tours_status").on(table.status),
  }),
);

export type UserOnboardingTour = typeof userOnboardingTours.$inferSelect;
export type NewUserOnboardingTour = typeof userOnboardingTours.$inferInsert;

// ---------------------------------------------------------------------------
// Avana CRM Core System (Migration 0088)
// ---------------------------------------------------------------------------

export const crmTags = pgTable(
  "crm_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex("idx_crm_tags_name").on(table.name),
  }),
);

export const crmCustomerTags = pgTable(
  "crm_customer_tags",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => crmTags.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.tagId],
      name: "pk_crm_customer_tags",
    }),
    tagIdx: index("idx_crm_customer_tags_tag").on(table.tagId),
    userIdx: index("idx_crm_customer_tags_user").on(table.userId),
  }),
);

export const crmCustomerNotes = pgTable(
  "crm_customer_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_crm_customer_notes_user").on(table.userId),
    userPinnedIdx: index("idx_crm_customer_notes_user_pinned").on(
      table.userId,
      table.isPinned,
      table.createdAt,
    ),
  }),
);

export type CrmTag = typeof crmTags.$inferSelect;
export type NewCrmTag = typeof crmTags.$inferInsert;
export type CrmCustomerTag = typeof crmCustomerTags.$inferSelect;
export type NewCrmCustomerTag = typeof crmCustomerTags.$inferInsert;
export type CrmCustomerNote = typeof crmCustomerNotes.$inferSelect;
export type NewCrmCustomerNote = typeof crmCustomerNotes.$inferInsert;

// ---------------------------------------------------------------------------
// Avana CRM Dynamic Segmentation (Migration 0089)
// ---------------------------------------------------------------------------

export const crmSegments = pgTable(
  "crm_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    matchOperator: varchar("match_operator", { length: 10 }).notNull().default("and"),
    filterRules: jsonb("filter_rules").notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    activeIdx: index("idx_crm_segments_active").on(table.isActive),
    createdByIdx: index("idx_crm_segments_created_by").on(table.createdBy),
    createdAtIdx: index("idx_crm_segments_created_at").on(table.createdAt),
  }),
);

export type CrmSegment = typeof crmSegments.$inferSelect;
export type NewCrmSegment = typeof crmSegments.$inferInsert;

// ---------------------------------------------------------------------------
// Avana CRM Customer Campaign Management (Phase 3)
// ---------------------------------------------------------------------------

export const crmCampaigns = pgTable(
  "crm_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    targetSegmentId: uuid("target_segment_id")
      .notNull()
      .references(() => crmSegments.id, { onDelete: "restrict" }),
    channel: varchar("channel", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    messageContent: text("message_content"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    statusIdx: index("idx_crm_campaigns_status").on(table.status),
    segmentIdx: index("idx_crm_campaigns_segment").on(table.targetSegmentId),
    createdByIdx: index("idx_crm_campaigns_created_by").on(table.createdBy),
    createdAtIdx: index("idx_crm_campaigns_created_at").on(table.createdAt),
  }),
);

export type CrmCampaign = typeof crmCampaigns.$inferSelect;
export type NewCrmCampaign = typeof crmCampaigns.$inferInsert;

export const crmCampaignExecutions = pgTable(
  "crm_campaign_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => crmCampaigns.id, { onDelete: "cascade" }),
    jobId: varchar("job_id", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    totalRecipients: integer("total_recipients").notNull().default(0),
    processedRecipients: integer("processed_recipients").notNull().default(0),
    successfulRecipients: integer("successful_recipients").notNull().default(0),
    failedRecipients: integer("failed_recipients").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    triggeredBy: uuid("triggered_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    campaignIdx: index("idx_crm_campaign_executions_campaign").on(table.campaignId),
    statusIdx: index("idx_crm_campaign_executions_status").on(table.status),
    jobIdIdx: index("idx_crm_campaign_executions_job_id").on(table.jobId),
    createdAtIdx: index("idx_crm_campaign_executions_created_at").on(table.createdAt),
  }),
);

export type CrmCampaignExecution = typeof crmCampaignExecutions.$inferSelect;
export type NewCrmCampaignExecution = typeof crmCampaignExecutions.$inferInsert;

export const crmCampaignRecipients = pgTable(
  "crm_campaign_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => crmCampaigns.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => crmCampaignExecutions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    execUserIdx: uniqueIndex("idx_crm_campaign_recipients_exec_user").on(
      table.executionId,
      table.userId,
    ),
    campaignIdx: index("idx_crm_campaign_recipients_campaign").on(table.campaignId),
    executionIdx: index("idx_crm_campaign_recipients_execution").on(table.executionId),
    userIdx: index("idx_crm_campaign_recipients_user").on(table.userId),
    statusIdx: index("idx_crm_campaign_recipients_status").on(table.status),
    execStatusIdx: index("idx_crm_campaign_recipients_exec_status").on(
      table.executionId,
      table.status,
    ),
  }),
);

export type CrmCampaignRecipient = typeof crmCampaignRecipients.$inferSelect;
export type NewCrmCampaignRecipient = typeof crmCampaignRecipients.$inferInsert;

// ---------------------------------------------------------------------------
// Presentation Assistant Core (Phase 1)
// ---------------------------------------------------------------------------

export const presentationProjects = pgTable(
  "presentation_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    pptxDocumentId: uuid("pptx_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    targetDurationMinutes: integer("target_duration_minutes")
      .notNull()
      .default(15),
    academicLevel: varchar("academic_level", { length: 30 })
      .notNull()
      .default("intermediate"),
    tone: varchar("tone", { length: 30 })
      .notNull()
      .default("formal_scientific"),
    elaborationDepth: varchar("elaboration_depth", { length: 30 })
      .notNull()
      .default("balanced"),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("created"),
    currentStage: varchar("current_stage", { length: 50 }),
    totalSlides: integer("total_slides").notNull().default(0),
    overallIntroduction: text("overall_introduction"),
    overallConclusion: text("overall_conclusion"),
    totalEstimatedSeconds: integer("total_estimated_seconds")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    orgOwnerIdx: index("idx_presentation_projects_org_owner").on(
      table.organizationId,
      table.ownerUserId,
    ),
    statusIdx: index("idx_presentation_projects_status").on(table.status),
    docIdx: index("idx_presentation_projects_doc").on(table.pptxDocumentId),
    targetDurationCheck: check(
      "chk_presentation_projects_duration",
      sql`${table.targetDurationMinutes} IN (5, 10, 15, 20, 30)`,
    ),
    totalSlidesCheck: check(
      "chk_presentation_projects_total_slides",
      sql`${table.totalSlides} >= 0`,
    ),
    totalEstimatedSecondsCheck: check(
      "chk_presentation_projects_estimated_seconds",
      sql`${table.totalEstimatedSeconds} >= 0`,
    ),
    academicLevelCheck: check(
      "chk_presentation_projects_academic_level",
      sql`${table.academicLevel} IN ('introductory', 'intermediate', 'advanced')`,
    ),
    toneCheck: check(
      "chk_presentation_projects_tone",
      sql`${table.tone} IN ('formal_scientific', 'fluent_student')`,
    ),
    elaborationDepthCheck: check(
      "chk_presentation_projects_depth",
      sql`${table.elaborationDepth} IN ('concise', 'balanced', 'comprehensive')`,
    ),
    statusCheck: check(
      "chk_presentation_projects_status",
      sql`${table.status} IN ('created', 'extracting', 'analyzing', 'generating', 'completed', 'failed')`,
    ),
  }),
);

export type PresentationProject = typeof presentationProjects.$inferSelect;
export type NewPresentationProject = typeof presentationProjects.$inferInsert;

export const presentationSlides = pgTable(
  "presentation_slides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => presentationProjects.id, { onDelete: "cascade" }),
    slideIndex: integer("slide_index").notNull(),
    title: varchar("title", { length: 500 }),
    rawText: text("raw_text").notNull().default(""),
    extractedTables: jsonb("extracted_tables")
      .$type<Array<{ headers?: string[]; rows: string[][] }>>()
      .notNull()
      .default([]),
    speakerNotes: text("speaker_notes"),
    hasVisuals: boolean("has_visuals").notNull().default(false),
    visualSummary: text("visual_summary"),
    mediaStorageKeys: jsonb("media_storage_keys")
      .$type<string[]>()
      .notNull()
      .default([]),
    extractionMetadata: jsonb("extraction_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    paymentTransactionId: uuid("payment_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    projectSlideIdx: uniqueIndex("idx_presentation_slides_project_slide").on(
      table.projectId,
      table.slideIndex,
    ),
    projectIdx: index("idx_presentation_slides_project").on(table.projectId),
    paymentTxIdx: index("idx_presentation_slides_payment_tx").on(
      table.paymentTransactionId,
    ),
    slideIndexCheck: check(
      "chk_presentation_slides_index",
      sql`${table.slideIndex} > 0`,
    ),
  }),
);

export type PresentationSlide = typeof presentationSlides.$inferSelect;
export type NewPresentationSlide = typeof presentationSlides.$inferInsert;

export const presentationReferences = pgTable(
  "presentation_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => presentationProjects.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 30 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    sourceIdentifier: text("source_identifier"),
    accessStatus: varchar("access_status", { length: 30 })
      .notNull()
      .default("pending"),
    bibliographicMetadata: jsonb("bibliographic_metadata")
      .$type<{
        authors?: string[];
        journal?: string;
        year?: number;
        doi?: string;
        pmid?: string;
        abstract?: string;
      }>()
      .notNull()
      .default({}),
    extractedContent: text("extracted_content"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    projectRefIdx: index("idx_presentation_refs_project").on(table.projectId),
    docIdx: index("idx_presentation_refs_doc").on(table.documentId),
    statusIdx: index("idx_presentation_refs_status").on(table.accessStatus),
    typeCheck: check(
      "chk_presentation_refs_type",
      sql`${table.type} IN ('text', 'pdf', 'docx', 'url', 'doi', 'pubmed')`,
    ),
    accessStatusCheck: check(
      "chk_presentation_refs_access_status",
      sql`${table.accessStatus} IN ('pending', 'full_text_available', 'abstract_only', 'metadata_only', 'manual_text_provided', 'failed_to_fetch')`,
    ),
  }),
);

export type PresentationReference = typeof presentationReferences.$inferSelect;
export type NewPresentationReference = typeof presentationReferences.$inferInsert;

// ---------------------------------------------------------------------------
// Presentation Generation Operations (Migration 0106 - Financial Audit & State Machine)
// ---------------------------------------------------------------------------

export const presentationGenerationOperations = pgTable(
  "presentation_generation_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => presentationProjects.id, {
      onDelete: "set null",
    }),
    slideId: uuid("slide_id").references(() => presentationSlides.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    costToman: integer("cost_toman").notNull().default(1500),
    debitTransactionId: uuid("debit_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    refundTransactionId: uuid("refund_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    recoveryWorkerId: varchar("recovery_worker_id", { length: 128 }),
    recoveryLockedUntil: timestamp("recovery_locked_until", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("idx_pres_gen_ops_idempotency").on(
      table.idempotencyKey,
    ),
    activeSlideIdx: uniqueIndex("idx_pres_gen_ops_active_slide")
      .on(table.slideId)
      .where(sql`status IN ('pending', 'debited', 'generating', 'refund_pending')`),
    projectStatusIdx: index("idx_pres_gen_ops_project_status").on(
      table.projectId,
      table.status,
    ),
    batchIdx: index("idx_pres_gen_ops_batch").on(table.batchId),
    slideIdx: index("idx_pres_gen_ops_slide").on(table.slideId),
    statusStartedIdx: index("idx_pres_gen_ops_status_started").on(
      table.status,
      table.startedAt,
    ),
  }),
);

export type PresentationGenerationOperation =
  typeof presentationGenerationOperations.$inferSelect;
export type NewPresentationGenerationOperation =
  typeof presentationGenerationOperations.$inferInsert;


// ---------------------------------------------------------------------------
// User Personal Contents (Personal Summaries, Flashcards, Quizzes) (Migration 0096)
// ---------------------------------------------------------------------------

export const userPersonalContents = pgTable(
  "user_personal_contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    contentType: varchar("content_type", { length: 30 })
      .notNull()
      .default("review_summary"),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    inputSnapshot: jsonb("input_snapshot").notNull().default({}),
    highlightsCount: integer("highlights_count").notNull().default(0),
    notesCount: integer("notes_count").notNull().default(0),
    costToman: integer("cost_toman").notNull().default(3000),
    transactionId: uuid("transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    refundTransactionId: uuid("refund_transaction_id").references(
      () => walletTransactions.id,
      { onDelete: "set null" },
    ),
    refundStatus: varchar("refund_status", { length: 30 })
      .notNull()
      .default("none"),
    failureReason: text("failure_reason"),
    workerId: varchar("worker_id", { length: 100 }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    versionUniqueIdx: uniqueIndex("uq_user_personal_contents_version").on(
      table.userId,
      table.moduleId,
      table.contentType,
      table.version,
    ),
    idempotencyUniqueIdx: uniqueIndex(
      "uq_user_personal_contents_idempotency",
    ).on(table.idempotencyKey),
    queryIdx: index("idx_user_personal_contents_query").on(
      table.userId,
      table.moduleId,
      table.contentType,
      table.status,
      table.version,
    ),
    txIdx: index("idx_user_personal_contents_tx").on(table.transactionId),
    statusCheck: check(
      "chk_personal_content_status",
      sql`${table.status} IN ('pending', 'completed', 'failed')`,
    ),
    typeCheck: check(
      "chk_personal_content_type",
      sql`${table.contentType} IN ('review_summary', 'flashcard', 'quiz', 'mind_map')`,
    ),
    refundStatusCheck: check(
      "chk_personal_refund_status",
      sql`${table.refundStatus} IN ('none', 'pending', 'refunded', 'failed')`,
    ),
  }),
);

export type UserPersonalContent = typeof userPersonalContents.$inferSelect;
export type NewUserPersonalContent = typeof userPersonalContents.$inferInsert;

// ---------------------------------------------------------------------------
// Error Monitoring & Observability (Phase 1)
// ---------------------------------------------------------------------------

export const errorGroups = pgTable(
  "error_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    fingerprintVersion: integer("fingerprint_version").notNull().default(1),
    environment: varchar("environment", { length: 30 }).notNull().default("production"),
    source: varchar("source", { length: 30 }).notNull().default("backend"),
    severity: varchar("severity", { length: 20 }).notNull().default("error"),
    feature: varchar("feature", { length: 50 }).notNull().default("system"),
    errorCode: varchar("error_code", { length: 100 }),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("unresolved"),
    appVersion: varchar("app_version", { length: 50 }),
    totalOccurrences: integer("total_occurrences").notNull().default(1),
    affectedUsersCount: integer("affected_users_count").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
  },
  (table) => ({
    fingerprintUniqueIdx: uniqueIndex("uq_error_groups_fingerprint").on(table.fingerprint),
    statusLastSeenIdx: index("idx_error_groups_status_last_seen").on(table.status, table.lastSeenAt),
    filterIdx: index("idx_error_groups_filter").on(table.source, table.severity, table.feature, table.lastSeenAt),
    resolverFk: foreignKey({
      columns: [table.resolvedByUserId],
      foreignColumns: [users.id],
      name: "fk_error_groups_resolver",
    }).onDelete("set null"),
  }),
);

export const errorGroupUsers = pgTable(
  "error_group_users",
  {
    groupId: uuid("group_id").notNull(),
    userId: uuid("user_id").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.userId], name: "pk_error_group_users" }),
    groupFk: foreignKey({
      columns: [table.groupId],
      foreignColumns: [errorGroups.id],
      name: "fk_error_group_users_group",
    }).onDelete("cascade"),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "fk_error_group_users_user",
    }).onDelete("cascade"),
    userGroupIdx: index("idx_error_group_users_user").on(table.userId),
  }),
);

export const errorEvents = pgTable(
  "error_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    requestId: varchar("request_id", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    operation: varchar("operation", { length: 80 }),
    failureStage: varchar("failure_stage", { length: 80 }),
    userId: uuid("user_id"),
    organizationId: uuid("organization_id"),
    courseId: uuid("course_id"),
    endpoint: varchar("endpoint", { length: 255 }),
    httpMethod: varchar("http_method", { length: 10 }),
    httpStatus: integer("http_status"),
    stackTrace: text("stack_trace"),
    sanitizedContext: jsonb("sanitized_context").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupFk: foreignKey({
      columns: [table.groupId],
      foreignColumns: [errorGroups.id],
      name: "fk_error_events_group",
    }).onDelete("cascade"),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "fk_error_events_user",
    }).onDelete("set null"),
    orgFk: foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: "fk_error_events_org",
    }).onDelete("set null"),
    courseFk: foreignKey({
      columns: [table.courseId],
      foreignColumns: [courses.id],
      name: "fk_error_events_course",
    }).onDelete("set null"),
    groupTimeIdx: index("idx_error_events_group_time").on(table.groupId, table.occurredAt),
    timeIdx: index("idx_error_events_occurred_at").on(table.occurredAt),
    reqIdx: index("idx_error_events_request_id").on(table.requestId),
    corrIdx: index("idx_error_events_correlation_id").on(table.correlationId),
  }),
);

export const errorAdminNotes = pgTable(
  "error_admin_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id").notNull(),
    adminUserId: uuid("admin_user_id").notNull(),
    action: varchar("action", { length: 50 }).notNull().default("comment"),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupFk: foreignKey({
      columns: [table.groupId],
      foreignColumns: [errorGroups.id],
      name: "fk_error_notes_group",
    }).onDelete("cascade"),
    adminUserFk: foreignKey({
      columns: [table.adminUserId],
      foreignColumns: [users.id],
      name: "fk_error_notes_admin_user",
    }).onDelete("cascade"),
    groupCreatedIdx: index("idx_error_notes_group_created").on(table.groupId, table.createdAt),
  }),
);

export type ErrorGroup = typeof errorGroups.$inferSelect;
export type NewErrorGroup = typeof errorGroups.$inferInsert;
export type ErrorGroupUser = typeof errorGroupUsers.$inferSelect;
export type ErrorEvent = typeof errorEvents.$inferSelect;
export type NewErrorEvent = typeof errorEvents.$inferInsert;
export type ErrorAdminNote = typeof errorAdminNotes.$inferSelect;
export type NewErrorAdminNote = typeof errorAdminNotes.$inferInsert;

// ---------------------------------------------------------------------------
// AVANA Studio & Marketing Quizzes Module (Migration 0102)
// ---------------------------------------------------------------------------

export const marketingQuizzes = pgTable(
  "marketing_quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    slugIdx: index("idx_marketing_quizzes_slug")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    statusIdx: index("idx_marketing_quizzes_status")
      .on(table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    orgCreatedIdx: index("idx_marketing_quizzes_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
  }),
);

export const marketingQuestionBank = pgTable(
  "marketing_question_bank",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    sourceType: varchar("source_type", { length: 30 }).notNull().default("manual"),
    sourceQuestionId: uuid("source_question_id").references(() => quizQuestions.id, {
      onDelete: "set null",
    }),
    sourceCourseId: uuid("source_course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    choices: jsonb("choices").$type<Array<{ id: string; text: string }>>().notNull(),
    correctAnswer: jsonb("correct_answer").$type<{ choiceId: string } | string>().notNull(),
    explanation: text("explanation"),
    difficulty: varchar("difficulty", { length: 20 }).notNull().default("medium"),
    topic: varchar("topic", { length: 255 }),
    questionType: varchar("question_type", { length: 50 }).notNull().default("multiple_choice"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    topicIdx: index("idx_marketing_qbank_topic")
      .on(table.topic)
      .where(sql`${table.deletedAt} IS NULL`),
    diffIdx: index("idx_marketing_qbank_difficulty")
      .on(table.difficulty)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const marketingQuizQuestions = pgTable(
  "marketing_quiz_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketingQuizId: uuid("marketing_quiz_id")
      .notNull()
      .references(() => marketingQuizzes.id, { onDelete: "cascade" }),
    sourceQuestionId: uuid("source_question_id").references(() => quizQuestions.id, {
      onDelete: "set null",
    }),
    sourceBankQuestionId: uuid("source_bank_question_id").references(
      () => marketingQuestionBank.id,
      { onDelete: "set null" },
    ),
    sourceStagingQuestionId: uuid("source_staging_question_id").references(
      (): AnyPgColumn => studioExamGeneratedQuestions.id,
      { onDelete: "set null" },
    ),
    question: text("question").notNull(),
    choices: jsonb("choices").$type<Array<{ id: string; text: string }>>().notNull(),
    correctAnswer: jsonb("correct_answer").$type<{ choiceId: string } | string>().notNull(),
    explanation: text("explanation"),
    difficulty: varchar("difficulty", { length: 20 }).notNull().default("medium"),
    topic: varchar("topic", { length: 255 }),
    questionType: varchar("question_type", { length: 50 }).notNull().default("multiple_choice"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    quizOrderIdx: index("idx_marketing_quiz_questions_quiz_order").on(
      table.marketingQuizId,
      table.sortOrder,
    ),
    stagingSourceUniqueIdx: uniqueIndex("uq_marketing_quiz_q_staging_source")
      .on(table.sourceStagingQuestionId)
      .where(sql`${table.sourceStagingQuestionId} IS NOT NULL`),
  }),
);

export const marketingQuizAttempts = pgTable(
  "marketing_quiz_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketingQuizId: uuid("marketing_quiz_id")
      .notNull()
      .references(() => marketingQuizzes.id, { onDelete: "cascade" }),
    attemptToken: varchar("attempt_token", { length: 64 }).notNull().unique(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    totalQuestions: integer("total_questions").notNull().default(0),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    questionSnapshots: jsonb("question_snapshots").$type<Array<{
      id: string;
      question: string;
      choices: Array<{ id: string; text: string }>;
    }>>(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    quizTimeIdx: index("idx_marketing_quiz_attempts_quiz_time").on(
      table.marketingQuizId,
      table.completedAt,
    ),
    tokenIdx: index("idx_marketing_quiz_attempts_token").on(table.attemptToken),
    quizIdempotencyIdx: uniqueIndex("uq_marketing_quiz_attempts_quiz_idempotency").on(
      table.marketingQuizId,
      table.idempotencyKey,
    ),
  }),
);

export type MarketingQuizRecord = typeof marketingQuizzes.$inferSelect;
export type NewMarketingQuizRecord = typeof marketingQuizzes.$inferInsert;
export type MarketingQuestionBankRecord = typeof marketingQuestionBank.$inferSelect;
export type NewMarketingQuestionBankRecord = typeof marketingQuestionBank.$inferInsert;
export type MarketingQuizQuestionRecord = typeof marketingQuizQuestions.$inferSelect;
export type NewMarketingQuizQuestionRecord = typeof marketingQuizQuestions.$inferInsert;
export type MarketingQuizAttemptRecord = typeof marketingQuizAttempts.$inferSelect;
export type NewMarketingQuizAttemptRecord = typeof marketingQuizAttempts.$inferInsert;

// ---------------------------------------------------------------------------
// AVANA Studio & Polls & Surveys Module (Migration 0104)
// ---------------------------------------------------------------------------

export const polls = pgTable(
  "polls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    slugIdx: index("idx_polls_slug")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    statusIdx: index("idx_polls_status")
      .on(table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    orgCreatedIdx: index("idx_polls_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
  }),
);

export const pollQuestions = pgTable(
  "poll_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    description: text("description"),
    questionType: varchar("question_type", { length: 30 }).notNull(),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    minChoices: integer("min_choices"),
    maxChoices: integer("max_choices"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pollOrderIdx: index("idx_poll_questions_poll_order").on(
      table.pollId,
      table.sortOrder,
    ),
  }),
);

export const pollOptions = pgTable(
  "poll_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => pollQuestions.id, { onDelete: "cascade" }),
    optionText: varchar("option_text", { length: 500 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    questionOrderIdx: index("idx_poll_options_question_order").on(
      table.questionId,
      table.sortOrder,
    ),
  }),
);

export const pollResponses = pgTable(
  "poll_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    participantId: varchar("participant_id", { length: 64 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: text("user_agent"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pollTimeIdx: index("idx_poll_responses_poll_time").on(
      table.pollId,
      table.completedAt,
    ),
    participantIdx: index("idx_poll_responses_participant").on(table.participantId),
    pollParticipantIdx: uniqueIndex("uq_poll_responses_poll_participant").on(
      table.pollId,
      table.participantId,
    ),
  }),
);

export const pollAnswers = pgTable(
  "poll_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => pollResponses.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => pollQuestions.id, { onDelete: "cascade" }),
    textAnswer: text("text_answer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    responseIdx: index("idx_poll_answers_response").on(table.responseId),
    questionIdx: index("idx_poll_answers_question").on(table.questionId),
    responseQuestionIdx: uniqueIndex("uq_poll_answers_response_question").on(
      table.responseId,
      table.questionId,
    ),
  }),
);

export const pollAnswerOptions = pgTable(
  "poll_answer_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    answerId: uuid("answer_id")
      .notNull()
      .references(() => pollAnswers.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    answerIdx: index("idx_poll_answer_options_answer").on(table.answerId),
    optionIdx: index("idx_poll_answer_options_option").on(table.optionId),
    answerOptionIdx: uniqueIndex("uq_poll_answer_options_answer_option").on(
      table.answerId,
      table.optionId,
    ),
  }),
);

export type PollRecord = typeof polls.$inferSelect;
export type NewPollRecord = typeof polls.$inferInsert;
export type PollQuestionRecord = typeof pollQuestions.$inferSelect;
export type NewPollQuestionRecord = typeof pollQuestions.$inferInsert;
export type PollOptionRecord = typeof pollOptions.$inferSelect;
export type NewPollOptionRecord = typeof pollOptions.$inferInsert;
export type PollResponseRecord = typeof pollResponses.$inferSelect;
export type NewPollResponseRecord = typeof pollResponses.$inferInsert;
export type PollAnswerRecord = typeof pollAnswers.$inferSelect;
export type NewPollAnswerRecord = typeof pollAnswers.$inferInsert;
export type PollAnswerOptionRecord = typeof pollAnswerOptions.$inferSelect;
export type NewPollAnswerOptionRecord = typeof pollAnswerOptions.$inferInsert;





// ---------------------------------------------------------------------------
// AVANA Pocket — Phase 1: Database Foundation
// ---------------------------------------------------------------------------

// 1. Sources & Guidelines
export const pocketSources = pgTable(
  "pocket_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    title: varchar("title", { length: 500 }).notNull(),
    publisher: varchar("publisher", { length: 255 }).notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    editionOrVersion: varchar("edition_or_version", { length: 50 }).notNull(),
    publicationDate: date("publication_date"),
    validUntilDate: date("valid_until_date"),
    doi: varchar("doi", { length: 255 }),
    canonicalUrl: text("canonical_url"),
    licenseType: varchar("license_type", { length: 50 }).notNull().default("pending_legal_review"),
    reproductionAllowed: boolean("reproduction_allowed").notNull().default(false),
    displayScope: varchar("display_scope", { length: 50 }).notNull().default("citation_pointer_only"),
    storageScope: varchar("storage_scope", { length: 50 }).notNull().default("metadata_only"),
    lastAuditedAt: timestamp("last_audited_at", { withTimezone: true }).defaultNow().notNull(),
    auditStatus: varchar("audit_status", { length: 30 }).notNull().default("pending_legal_review"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex("idx_pocket_sources_code").on(table.code),
    typeIdx: index("idx_pocket_sources_type").on(table.sourceType),
    statusIdx: index("idx_pocket_sources_status").on(table.auditStatus),
  }),
);

// 2. Entity Version Registry (Redis Monotonic Coherence)
export const pocketEntityVersionRegistry = pgTable(
  "pocket_entity_version_registry",
  {
    aggregateType: varchar("aggregate_type", { length: 32 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 64 }).notNull(),
    currentVersion: bigint("current_version", { mode: "number" }).notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.aggregateType, table.aggregateId], name: "pk_pocket_version_reg" }),
  }),
);

// 3. Standard Unit Conversions (Decision-03: Mass & Volume)
export const pocketStandardUnitConversions = pgTable(
  "pocket_standard_unit_conversions",
  {
    sourceUnit: varchar("source_unit", { length: 16 }).notNull(),
    targetUnit: varchar("target_unit", { length: 16 }).notNull(),
    factor: numeric("factor", { precision: 18, scale: 8 }).notNull(),
    isReversible: boolean("is_reversible").notNull().default(true),
    dimension: varchar("dimension", { length: 16 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sourceUnit, table.targetUnit], name: "pk_pocket_std_unit_conv" }),
    checkPositive: check("chk_pocket_factor_positive", sql`${table.factor} > 0`),
  }),
);

// 4. Reliable Outbox
export const pocketOutbox = pgTable(
  "pocket_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 32 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseToken: varchar("lease_token", { length: 64 }),
    lastError: varchar("last_error", { length: 1000 }),
    globalEpoch: bigint("global_epoch", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => ({
    pollIdx: index("idx_pocket_outbox_poll").on(table.status, table.nextAttemptAt),
    expiredLeaseIdx: index("idx_pocket_outbox_expired_leases").on(table.leaseExpiresAt),
  }),
);

// 5. Clinical Reviewer Credentials (Decision-01)
export const pocketClinicalReviewerCredentials = pgTable(
  "pocket_clinical_reviewer_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    medicalLicenseNumber: varchar("medical_license_number", { length: 64 }).notNull(),
    specialty: varchar("specialty", { length: 128 }).notNull(),
    licensingAuthority: varchar("licensing_authority", { length: 128 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "restrict" }),
    revocationReason: text("revocation_reason"),
    grantedBy: uuid("granted_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    licenseExpiresAt: timestamp("license_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeReviewerIdx: uniqueIndex("uq_pocket_active_reviewer").on(table.userId).where(sql`${table.isActive} = true`),
    lookupIdx: index("idx_pocket_reviewer_lookup").on(table.userId, table.isActive),
  }),
);

// 5b. Clinical Reviewer Credential Lifecycle Events (Append-Only)
export const pocketReviewerCredentialEvents = pgTable(
  "pocket_reviewer_credential_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => pocketClinicalReviewerCredentials.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventTypeCheck: check(
      "chk_pocket_cred_event_type",
      sql`${table.eventType} IN ('granted', 'suspended', 'reactivated', 'revoked')`,
    ),
    lookupIdx: index("idx_pocket_cred_events_lookup").on(table.credentialId, table.createdAt, table.id),
  }),
);

// 6. Drugs (Core Pillar 1)
export const pocketDrugs = pgTable(
  "pocket_drugs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    genericNameEn: varchar("generic_name_en", { length: 255 }).notNull(),
    genericNameFa: varchar("generic_name_fa", { length: 255 }).notNull(),
    brandNames: jsonb("brand_names").$type<string[]>().notNull().default([]),
    drugClass: varchar("drug_class", { length: 255 }).notNull(),
    mechanismOfAction: text("mechanism_of_action").notNull(),
    standardAdultDoseText: text("standard_adult_dose_text"),
    pediatricDoseText: text("pediatric_dose_text"),
    therapeuticMonitoringText: text("therapeutic_monitoring_text"),
    counselingPoints: text("counseling_points"),
    toxicityAndOverdoseText: text("toxicity_and_overdose_text"),
    organizationId: uuid("organization_id").notNull().default("00000000-0000-0000-0000-000000000001"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    versionNumber: integer("version_number").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_pocket_drugs_slug").on(table.slug),
    nameEnIdx: index("idx_pocket_drugs_name_en").on(table.genericNameEn),
    statusIdx: index("idx_pocket_drugs_status").on(table.status),
  }),
);

// 7. Diseases (Core Pillar 2)
export const pocketDiseases = pgTable(
  "pocket_diseases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleFa: varchar("title_fa", { length: 255 }).notNull(),
    icd10Code: varchar("icd10_code", { length: 30 }),
    definition: text("definition").notNull(),
    etiology: text("etiology"),
    pathophysiology: text("pathophysiology"),
    prognosis: text("prognosis"),
    clinicalPearls: text("clinical_pearls"),
    organizationId: uuid("organization_id").notNull().default("00000000-0000-0000-0000-000000000001"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    versionNumber: integer("version_number").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_pocket_diseases_slug").on(table.slug),
    titleEnIdx: index("idx_pocket_diseases_title_en").on(table.titleEn),
    statusIdx: index("idx_pocket_diseases_status").on(table.status),
  }),
);

// 8. Treatments (Core Pillar 3)
export const pocketTreatments = pgTable(
  "pocket_treatments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleFa: varchar("title_fa", { length: 255 }).notNull(),
    treatmentType: varchar("treatment_type", { length: 50 }).notNull().default("pharmacological"),
    nonPharmacologicalApproach: text("non_pharmacological_approach"),
    pharmacologicalStrategy: text("pharmacological_strategy").notNull(),
    efficacyMonitoring: text("efficacy_monitoring").notNull(),
    safetyMonitoring: text("safety_monitoring").notNull(),
    guidelineSummary: text("guideline_summary"),
    organizationId: uuid("organization_id").notNull().default("00000000-0000-0000-0000-000000000001"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    versionNumber: integer("version_number").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_pocket_treatments_slug").on(table.slug),
    statusIdx: index("idx_pocket_treatments_status").on(table.status),
  }),
);

// 9. Emergencies (Core Pillar 4)
export const pocketEmergencies = pgTable(
  "pocket_emergencies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleFa: varchar("title_fa", { length: 255 }).notNull(),
    conditionType: varchar("condition_type", { length: 50 }).notNull(),
    immediateTriageGuidance: text("immediate_triage_guidance").notNull(),
    referralAndEscalationCriteria: text("referral_and_escalation_criteria").notNull(),
    organizationId: uuid("organization_id").notNull().default("00000000-0000-0000-0000-000000000001"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    versionNumber: integer("version_number").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_pocket_emergencies_slug").on(table.slug),
    condIdx: index("idx_pocket_emergencies_cond").on(table.conditionType),
    statusIdx: index("idx_pocket_emergencies_status").on(table.status),
  }),
);

// 10. Draft Sessions
export const pocketDraftSessions = pgTable(
  "pocket_draft_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    baseReleaseVersion: integer("base_release_version").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_pocket_draft_status").on(table.status),
  }),
);

// 11. Draft Changes
export const pocketDraftChanges = pgTable(
  "pocket_draft_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => pocketDraftSessions.id, { onDelete: "cascade" }),
    targetTable: varchar("target_table", { length: 100 }).notNull(),
    targetRecordId: uuid("target_record_id").notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    payload: jsonb("payload").$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      patch?: Record<string, unknown>;
    }>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionRecordIdx: uniqueIndex("idx_pocket_draft_change_record").on(table.sessionId, table.targetTable, table.targetRecordId),
  }),
);

// 12. Releases
export const pocketReleases = pgTable(
  "pocket_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionNumber: integer("version_number").notNull().unique(),
    parentReleaseId: uuid("parent_release_id").references((): AnyPgColumn => pocketReleases.id, { onDelete: "restrict" }),
    draftSessionId: uuid("draft_session_id").references(() => pocketDraftSessions.id, { onDelete: "set null" }),
    schemaVersion: integer("schema_version").notNull().default(1),
    manifestChecksum: varchar("manifest_checksum", { length: 64 }).notNull(),
    manifest: jsonb("manifest").notNull(),
    changesSummary: jsonb("changes_summary").notNull(),
    isRollback: boolean("is_rollback").notNull().default(false),
    restoredFromVersion: integer("restored_from_version"),
    publishedBy: uuid("published_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    versionIdx: uniqueIndex("idx_pocket_releases_version").on(table.versionNumber),
  }),
);

// 13. Scientific Assertions (Immutable physical versions under conceptual root)
export const pocketScientificAssertions = pgTable(
  "pocket_scientific_assertions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assertionRootId: uuid("assertion_root_id").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    previousVersionId: uuid("previous_version_id").references((): AnyPgColumn => pocketScientificAssertions.id, { onDelete: "set null" }),
    drugId: uuid("drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    diseaseId: uuid("disease_id").references(() => pocketDiseases.id, { onDelete: "cascade" }),
    treatmentId: uuid("treatment_id").references(() => pocketTreatments.id, { onDelete: "cascade" }),
    emergencyId: uuid("emergency_id").references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    assertionType: varchar("assertion_type", { length: 50 }).notNull(),
    assertionKey: varchar("assertion_key", { length: 150 }).notNull(),
    statementText: text("statement_text").notNull(),
    jurisdiction: varchar("jurisdiction", { length: 50 }).notNull().default("global"),
    targetPopulation: varchar("target_population", { length: 100 }).notNull().default("general_adult"),
    clinicalSetting: varchar("clinical_setting", { length: 100 }).notNull().default("all"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    releaseId: uuid("release_id").references(() => pocketReleases.id, { onDelete: "restrict" }),
    validUntilDate: date("valid_until_date"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    arcCheck: check(
      "chk_pocket_assertion_arc",
      sql`num_nonnulls(${table.drugId}, ${table.diseaseId}, ${table.treatmentId}, ${table.emergencyId}) = 1`,
    ),
    uqRootVersion: uniqueIndex("uq_assertion_root_version").on(table.assertionRootId, table.versionNumber),
    uqPublishedRoot: uniqueIndex("uq_pocket_published_assertion_root")
      .on(table.assertionRootId)
      .where(sql`${table.status} = 'published'`),
    uqAssertionDrug: uniqueIndex("uq_assertion_drug").on(table.id, table.drugId),
    uqAssertionDisease: uniqueIndex("uq_assertion_disease").on(table.id, table.diseaseId),
    uqAssertionTreatment: uniqueIndex("uq_assertion_treatment").on(table.id, table.treatmentId),
    uqAssertionEmergency: uniqueIndex("uq_assertion_emergency").on(table.id, table.emergencyId),
    statusIdx: index("idx_pocket_assertion_status").on(table.status),
    releaseIdx: index("idx_pocket_assertion_release").on(table.releaseId),
  }),
);

// 14. Assertion Citations
export const pocketAssertionCitations = pgTable(
  "pocket_assertion_citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assertionId: uuid("assertion_id").notNull().references(() => pocketScientificAssertions.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => pocketSources.id, { onDelete: "restrict" }),
    locationReference: text("location_reference").notNull(),
    sourceSnapshotUrl: text("source_snapshot_url"),
    sourceContentHash: varchar("source_content_hash", { length: 64 }),
    accessedAt: date("accessed_at").notNull(),
    evidenceGrade: varchar("evidence_grade", { length: 50 }),
    verifiedByUserId: uuid("verified_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    assertionSourceIdx: index("idx_pocket_cit_assertion_source").on(table.assertionId, table.sourceId),
    statusIdx: index("idx_pocket_cit_status").on(table.status),
  }),
);

// 15. Assertion Verifications (Human Review Sign-Off)
export const pocketAssertionVerifications = pgTable(
  "pocket_assertion_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assertionId: uuid("assertion_id").notNull().references(() => pocketScientificAssertions.id, { onDelete: "restrict" }),
    reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    verificationAction: varchar("verification_action", { length: 50 }).notNull(),
    clinicalReviewNotes: text("clinical_review_notes").notNull(),
    parentVerificationId: uuid("parent_verification_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
    verificationSeq: bigint("verification_seq", { mode: "number" }),
  },
  (table) => ({
    uqVerificationNode: uniqueIndex("uq_assertion_verification_node").on(table.id, table.assertionId),
    uqVerificationTriad: uniqueIndex("uq_assertion_verification_triad").on(
      table.id,
      table.assertionId,
      table.reviewerUserId,
    ),
    fkParentSameAssertionReviewer: foreignKey({
      name: "fk_verif_parent_same_assertion_reviewer",
      columns: [table.parentVerificationId, table.assertionId, table.reviewerUserId],
      foreignColumns: [table.id, table.assertionId, table.reviewerUserId],
    }).onDelete("restrict"),
    uqSingleChild: uniqueIndex("uq_pocket_verif_single_child")
      .on(table.parentVerificationId)
      .where(sql`${table.parentVerificationId} IS NOT NULL`),
    uqSingleRootPerReviewer: uniqueIndex("uq_pocket_verif_single_root_per_reviewer")
      .on(table.assertionId, table.reviewerUserId)
      .where(sql`${table.parentVerificationId} IS NULL`),
    idxLatestLookup: index("idx_pocket_verif_latest_lookup").on(
      table.assertionId,
      table.reviewerUserId,
      table.verifiedAt.desc(),
      table.id.desc(),
    ),
    chkNoSelfParent: check(
      "chk_pocket_verif_no_self_parent",
      sql`${table.parentVerificationId} IS NULL OR ${table.parentVerificationId} <> ${table.id}`,
    ),
  }),
);

// 16. Clinical Conflicts
export const pocketClinicalConflicts = pgTable(
  "pocket_clinical_conflicts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conflictSubject: varchar("conflict_subject", { length: 255 }).notNull(),
    assertionAId: uuid("assertion_a_id").notNull().references(() => pocketScientificAssertions.id, { onDelete: "cascade" }),
    assertionBId: uuid("assertion_b_id").notNull().references(() => pocketScientificAssertions.id, { onDelete: "cascade" }),
    discrepancyDescription: text("discrepancy_description").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("active_discrepancy"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    resolutionSeq: bigint("resolution_seq", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conflictPairIdx: index("idx_pocket_conflict_pair").on(table.assertionAId, table.assertionBId),
    conflictStatusCheck: check(
      "chk_pocket_conflict_status",
      sql`${table.status} IN ('active_discrepancy', 'resolved', 'dismissed')`,
    ),
    conflictDistinctAssertionsCheck: check(
      "chk_pocket_conflict_distinct_assertions",
      sql`${table.assertionAId} <> ${table.assertionBId}`,
    ),
    activeConflictPairIdx: uniqueIndex("uq_pocket_active_conflict_pair")
      .on(
        sql`LEAST(${table.assertionAId}, ${table.assertionBId})`,
        sql`GREATEST(${table.assertionAId}, ${table.assertionBId})`,
      )
      .where(sql`${table.status} = 'active_discrepancy'`),
  }),
);

// 17. Assertion Publication Audit Log
export const pocketAssertionAuditLog = pgTable(
  "pocket_assertion_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assertionId: uuid("assertion_id").notNull().references(() => pocketScientificAssertions.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 32 }).notNull(),
    previousStatus: varchar("previous_status", { length: 32 }),
    newStatus: varchar("new_status", { length: 32 }).notNull(),
    clinicalNotes: text("clinical_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    auditLogAssertionIdx: index("idx_pocket_assertion_audit_assertion").on(table.assertionId, table.createdAt),
  }),
);

// 18. Drug Dosing Rules
export const pocketDrugDosingRules = pgTable(
  "pocket_drug_dosing_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    drugId: uuid("drug_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").notNull(),
    diseaseId: uuid("disease_id").references(() => pocketDiseases.id, { onDelete: "restrict" }),
    regimenStage: varchar("regimen_stage", { length: 50 }).notNull(),
    administrationModality: varchar("administration_modality", { length: 50 }).notNull(),
    dosingBasis: varchar("dosing_basis", { length: 30 }).notNull().default("fixed"),
    doseAmountMin: numeric("dose_amount_min", { precision: 12, scale: 4 }).notNull(),
    doseAmountMax: numeric("dose_amount_max", { precision: 12, scale: 4 }),
    doseUnit: varchar("dose_unit", { length: 30 }).notNull(),
    perWeightUnit: varchar("per_weight_unit", { length: 20 }),
    perBsaUnit: varchar("per_bsa_unit", { length: 20 }),
    targetAucValue: numeric("target_auc_value", { precision: 6, scale: 2 }),
    gfrCapMlMin: numeric("gfr_cap_ml_min", { precision: 6, scale: 2 }),
    infusionRateValueMin: numeric("infusion_rate_value_min", { precision: 10, scale: 4 }),
    infusionRateValueMax: numeric("infusion_rate_value_max", { precision: 10, scale: 4 }),
    infusionRateUnit: varchar("infusion_rate_unit", { length: 50 }),
    dilutionMinConcentrationMgMl: numeric("dilution_min_conc_mg_ml", { precision: 10, scale: 4 }),
    dilutionMaxConcentrationMgMl: numeric("dilution_max_conc_mg_ml", { precision: 10, scale: 4 }),
    compatibleDiluents: jsonb("compatible_diluents").$type<string[]>().default(["D5W", "NS"]),
    route: varchar("route", { length: 50 }).notNull(),
    frequency: varchar("frequency", { length: 50 }).notNull(),
    scheduleType: varchar("schedule_type", { length: 30 }).notNull().default("standard"),
    cycleDaysOn: integer("cycle_days_on"),
    cycleDaysOff: integer("cycle_days_off"),
    prnMinIntervalHours: numeric("prn_min_interval_hours", { precision: 5, scale: 2 }),
    prnMaxDosesPer24h: integer("prn_max_doses_per_24h"),
    prnMaxDailyAmount: numeric("prn_max_daily_amount", { precision: 12, scale: 4 }),
    maxSingleDoseAmount: numeric("max_single_dose_amount", { precision: 12, scale: 4 }),
    maxDailyDoseAmount: numeric("max_daily_dose_amount", { precision: 12, scale: 4 }),
    titrationStepAmount: numeric("titration_step_amount", { precision: 12, scale: 4 }),
    titrationIntervalDays: integer("titration_interval_days"),
    titrationTargetDose: numeric("titration_target_dose", { precision: 12, scale: 4 }),
    treatmentDurationDaysMin: integer("treatment_duration_days_min"),
    treatmentDurationDaysMax: integer("treatment_duration_days_max"),
    populationTier: varchar("population_tier", { length: 50 }).notNull().default("adult"),
    pregnancyTrimester: varchar("pregnancy_trimester", { length: 50 }).notNull().default("all"),
    lactationCompatibility: varchar("lactation_compatibility", { length: 50 }).notNull().default("compatible"),
    ageMonthsMin: integer("age_months_min"),
    ageYearsMax: integer("age_years_max"),
    weightKgMin: numeric("weight_kg_min", { precision: 6, scale: 2 }),
    weightKgMax: numeric("weight_kg_max", { precision: 6, scale: 2 }),
    instructionsPersian: text("instructions_persian").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqDosingRuleTriad: uniqueIndex("uq_pocket_dosing_rule_triad").on(table.id, table.drugId, table.assertionId),
    fkDosingAssertionDrug: foreignKey({
      columns: [table.assertionId, table.drugId],
      foreignColumns: [pocketScientificAssertions.id, pocketScientificAssertions.drugId],
      name: "fk_dosing_rule_assertion_drug_match",
    }).onDelete("restrict"),
    chkDoseMagnitudes: check(
      "chk_pocket_dose_magnitudes",
      sql`${table.doseAmountMin} > 0 AND (${table.doseAmountMax} IS NULL OR ${table.doseAmountMax} >= ${table.doseAmountMin}) AND (${table.maxSingleDoseAmount} IS NULL OR ${table.maxSingleDoseAmount} >= ${table.doseAmountMin}) AND (${table.maxDailyDoseAmount} IS NULL OR (${table.maxSingleDoseAmount} IS NOT NULL AND ${table.maxDailyDoseAmount} >= ${table.maxSingleDoseAmount}))`,
    ),
    drugIdx: index("idx_pocket_dosing_drug").on(table.drugId),
    statusIdx: index("idx_pocket_dosing_status").on(table.status),
  }),
);

// 19. Drug Renal Adjustments
export const pocketDrugRenalAdjustments = pgTable(
  "pocket_drug_renal_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dosingRuleId: uuid("dosing_rule_id").notNull(),
    drugId: uuid("drug_id").notNull(),
    assertionId: uuid("assertion_id").notNull(),
    metricType: varchar("metric_type", { length: 30 }).notNull().default("crcl"),
    tierMinMlMin: numeric("tier_min_ml_min", { precision: 6, scale: 2 }).notNull(),
    tierMaxMlMin: numeric("tier_max_ml_min", { precision: 6, scale: 2 }).notNull(),
    dialysisSetting: varchar("dialysis_setting", { length: 30 }).notNull().default("none"),
    adjustmentType: varchar("adjustment_type", { length: 50 }).notNull(),
    adjustedDoseAmount: numeric("adjusted_dose_amount", { precision: 12, scale: 4 }),
    adjustedDoseUnit: varchar("adjusted_dose_unit", { length: 30 }),
    adjustedFrequency: varchar("adjusted_frequency", { length: 50 }),
    percentageOfNormalDose: numeric("percentage_of_normal_dose", { precision: 5, scale: 2 }),
    dialysisSupplementNotes: text("dialysis_supplement_notes"),
    clinicalGuidancePersian: text("clinical_guidance_persian").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fkParentDosingTriad: foreignKey({
      columns: [table.dosingRuleId, table.drugId, table.assertionId],
      foreignColumns: [pocketDrugDosingRules.id, pocketDrugDosingRules.drugId, pocketDrugDosingRules.assertionId],
      name: "fk_renal_adj_parent_triad",
    }).onDelete("cascade"),
    chkRenalRangeValid: check(
      "chk_renal_range_valid",
      sql`${table.tierMinMlMin} < ${table.tierMaxMlMin} AND ${table.tierMinMlMin} >= 0`,
    ),
    ruleMetricTierUnique: uniqueIndex("uq_renal_rule_metric_tier").on(
      table.dosingRuleId,
      table.metricType,
      table.tierMinMlMin,
      table.tierMaxMlMin,
      table.dialysisSetting,
    ),
    statusIdx: index("idx_pocket_renal_status").on(table.status),
  }),
);

// 20. Drug Hepatic Adjustments
export const pocketDrugHepaticAdjustments = pgTable(
  "pocket_drug_hepatic_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dosingRuleId: uuid("dosing_rule_id").notNull(),
    drugId: uuid("drug_id").notNull(),
    assertionId: uuid("assertion_id").notNull(),
    childPughClass: varchar("child_pugh_class", { length: 20 }).notNull(),
    adjustmentAction: varchar("adjustment_action", { length: 50 }).notNull(),
    percentageDoseReduction: numeric("percentage_dose_reduction", { precision: 5, scale: 2 }),
    clinicalGuidancePersian: text("clinical_guidance_persian").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fkParentDosingTriad: foreignKey({
      columns: [table.dosingRuleId, table.drugId, table.assertionId],
      foreignColumns: [pocketDrugDosingRules.id, pocketDrugDosingRules.drugId, pocketDrugDosingRules.assertionId],
      name: "fk_hepatic_adj_parent_triad",
    }).onDelete("cascade"),
    chkHepaticReduction: check(
      "chk_pocket_hepatic_reduction",
      sql`${table.percentageDoseReduction} >= 0.00 AND ${table.percentageDoseReduction} <= 100.00`,
    ),
    uqRuleChildPugh: uniqueIndex("uq_hepatic_rule_child_pugh").on(table.dosingRuleId, table.childPughClass),
    statusIdx: index("idx_pocket_hepatic_status").on(table.status),
  }),
);

// 21. Drug Safety Profiles
export const pocketDrugSafetyProfiles = pgTable(
  "pocket_drug_safety_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    drugId: uuid("drug_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").notNull(),
    profileType: varchar("profile_type", { length: 50 }).notNull(),
    clinicalTerm: varchar("clinical_term", { length: 255 }).notNull(),
    meddraCode: varchar("meddra_code", { length: 50 }),
    severity: varchar("severity", { length: 30 }),
    incidencePercentageMin: numeric("incidence_pct_min", { precision: 5, scale: 2 }),
    incidencePercentageMax: numeric("incidence_pct_max", { precision: 5, scale: 2 }),
    clinicalManagementNotes: text("clinical_management_notes"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fkSafetyAssertionDrug: foreignKey({
      columns: [table.assertionId, table.drugId],
      foreignColumns: [pocketScientificAssertions.id, pocketScientificAssertions.drugId],
      name: "fk_safety_assertion_drug",
    }).onDelete("restrict"),
    drugTypeIdx: index("idx_pocket_safety_drug_type").on(table.drugId, table.profileType),
    statusIdx: index("idx_pocket_safety_status").on(table.status),
  }),
);

// 22. Emergency Steps
export const pocketEmergencySteps = pgTable(
  "pocket_emergency_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emergencyId: uuid("emergency_id").notNull().references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").notNull(),
    stepOrder: integer("step_order").notNull(),
    actionTitle: varchar("action_title", { length: 255 }).notNull(),
    actionDetails: text("action_details").notNull(),
    targetTimeWindowMinutes: integer("target_time_window_minutes"),
    isCriticalImmediate: boolean("is_critical_immediate").notNull().default(false),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fkEmergencyStepAssertion: foreignKey({
      columns: [table.assertionId, table.emergencyId],
      foreignColumns: [pocketScientificAssertions.id, pocketScientificAssertions.emergencyId],
      name: "fk_emergency_step_assertion",
    }).onDelete("restrict"),
    stepOrderUnique: uniqueIndex("idx_pocket_em_steps_order").on(table.emergencyId, table.stepOrder),
    statusIdx: index("idx_pocket_em_steps_status").on(table.status),
  }),
);

// 23. Emergency Medications
export const pocketEmergencyMedications = pgTable(
  "pocket_emergency_medications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emergencyId: uuid("emergency_id").notNull().references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    drugId: uuid("drug_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").notNull(),
    stepOrder: integer("step_order").notNull().default(1),
    doseAmount: numeric("dose_amount", { precision: 10, scale: 2 }).notNull(),
    doseUnit: varchar("dose_unit", { length: 30 }).notNull(),
    route: varchar("route", { length: 50 }).notNull(),
    administrationRate: varchar("administration_rate", { length: 100 }),
    dilutionInstructions: text("dilution_instructions"),
    maxEmergencyDose: text("max_emergency_dose"),
    criticalPrecautions: text("critical_precautions"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fkEmergencyMedAssertion: foreignKey({
      columns: [table.assertionId, table.emergencyId],
      foreignColumns: [pocketScientificAssertions.id, pocketScientificAssertions.emergencyId],
      name: "fk_emergency_med_assertion",
    }).onDelete("restrict"),
    emergencyDrugIdx: index("idx_pocket_em_meds").on(table.emergencyId, table.drugId),
    statusIdx: index("idx_pocket_em_meds_status").on(table.status),
  }),
);

// 24. Drug Interactions
export const pocketDrugInteractions = pgTable(
  "pocket_drug_interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    drugAId: uuid("drug_a_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    drugBId: uuid("drug_b_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").notNull().references(() => pocketScientificAssertions.id, { onDelete: "restrict" }),
    precipitantDrugId: uuid("precipitant_drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    objectDrugId: uuid("object_drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    severity: varchar("severity", { length: 30 }).notNull(),
    mechanismType: varchar("mechanism_type", { length: 50 }),
    clinicalConsequencePersian: text("clinical_consequence_persian").notNull(),
    managementActionPersian: text("management_action_persian").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderedPairIdx: uniqueIndex("idx_pocket_interaction_ordered_pair").on(table.drugAId, table.drugBId, table.assertionId),
    checkCanonicalOrder: check("chk_interaction_canonical_order", sql`${table.drugAId} < ${table.drugBId}`),
    checkDistinctPrecipitantObject: check(
      "chk_distinct_precipitant_object",
      sql`${table.precipitantDrugId} IS NULL OR ${table.objectDrugId} IS NULL OR ${table.precipitantDrugId} <> ${table.objectDrugId}`,
    ),
    statusIdx: index("idx_pocket_interaction_status").on(table.status),
  }),
);

// 25. Drug-Disease Links
export const pocketDrugDiseaseLinks = pgTable(
  "pocket_drug_disease_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    drugId: uuid("drug_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    diseaseId: uuid("disease_id").notNull().references(() => pocketDiseases.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").references(() => pocketScientificAssertions.id, { onDelete: "restrict" }),
    relationshipType: varchar("relationship_type", { length: 30 }).notNull(),
    clinicalNotes: text("clinical_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    ddUnique: uniqueIndex("idx_pocket_dd_link_unique").on(table.drugId, table.diseaseId, table.relationshipType),
    drugIdx: index("idx_pocket_dd_drug").on(table.drugId),
    diseaseIdx: index("idx_pocket_dd_disease").on(table.diseaseId),
  }),
);

// 26. Disease-Treatment Links
export const pocketDiseaseTreatmentLinks = pgTable(
  "pocket_disease_treatment_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    diseaseId: uuid("disease_id").notNull().references(() => pocketDiseases.id, { onDelete: "cascade" }),
    treatmentId: uuid("treatment_id").notNull().references(() => pocketTreatments.id, { onDelete: "cascade" }),
    lineOfTherapy: varchar("line_of_therapy", { length: 30 }).notNull(),
    isStandardOfCare: boolean("is_standard_of_care").notNull().default(true),
    clinicalNotes: text("clinical_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    dtUnique: uniqueIndex("idx_pocket_dt_link_unique").on(table.diseaseId, table.treatmentId),
  }),
);

// 27. Treatment Drugs
export const pocketTreatmentDrugs = pgTable(
  "pocket_treatment_drugs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    treatmentId: uuid("treatment_id").notNull().references(() => pocketTreatments.id, { onDelete: "cascade" }),
    drugId: uuid("drug_id").notNull().references(() => pocketDrugs.id, { onDelete: "cascade" }),
    assertionId: uuid("assertion_id").references(() => pocketScientificAssertions.id, { onDelete: "restrict" }),
    lineOfTherapy: varchar("line_of_therapy", { length: 30 }).notNull(),
    priorityOrder: integer("priority_order").notNull().default(1),
    dosingSummary: text("dosing_summary").notNull(),
    clinicalNotes: text("clinical_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tdIdx: index("idx_pocket_td_pair").on(table.treatmentId, table.drugId),
  }),
);

// 28. Search Aliases
export const pocketSearchAliases = pgTable(
  "pocket_search_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    drugId: uuid("drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    diseaseId: uuid("disease_id").references(() => pocketDiseases.id, { onDelete: "cascade" }),
    emergencyId: uuid("emergency_id").references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    rawAlias: varchar("raw_alias", { length: 255 }).notNull(),
    normalizedAlias: varchar("normalized_alias", { length: 255 }).notNull(),
    aliasType: varchar("alias_type", { length: 50 }).notNull(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    priorityWeight: integer("priority_weight").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    arcCheck: check(
      "chk_pocket_alias_arc",
      sql`num_nonnulls(${table.drugId}, ${table.diseaseId}, ${table.emergencyId}) = 1`,
    ),
    normIdx: index("idx_pocket_alias_norm").on(table.normalizedAlias),
  }),
);

// 29. User Notes
export const pocketUserNotes = pgTable(
  "pocket_user_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    drugId: uuid("drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    diseaseId: uuid("disease_id").references(() => pocketDiseases.id, { onDelete: "cascade" }),
    treatmentId: uuid("treatment_id").references(() => pocketTreatments.id, { onDelete: "cascade" }),
    emergencyId: uuid("emergency_id").references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    contentMarkdown: text("content_markdown").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    arcCheck: check(
      "chk_pocket_notes_arc",
      sql`num_nonnulls(${table.drugId}, ${table.diseaseId}, ${table.treatmentId}, ${table.emergencyId}) <= 1`,
    ),
    userCreatedIdx: index("idx_pocket_notes_user_created").on(table.userId, table.createdAt),
  }),
);

// 30. User Favorites
export const pocketUserFavorites = pgTable(
  "pocket_user_favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    drugId: uuid("drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    diseaseId: uuid("disease_id").references(() => pocketDiseases.id, { onDelete: "cascade" }),
    treatmentId: uuid("treatment_id").references(() => pocketTreatments.id, { onDelete: "cascade" }),
    emergencyId: uuid("emergency_id").references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    arcCheck: check(
      "chk_pocket_fav_arc",
      sql`num_nonnulls(${table.drugId}, ${table.diseaseId}, ${table.treatmentId}, ${table.emergencyId}) = 1`,
    ),
    userFavIdx: index("idx_pocket_fav_user").on(table.userId),
  }),
);

// 31. User History
export const pocketUserHistory = pgTable(
  "pocket_user_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    drugId: uuid("drug_id").references(() => pocketDrugs.id, { onDelete: "cascade" }),
    diseaseId: uuid("disease_id").references(() => pocketDiseases.id, { onDelete: "cascade" }),
    treatmentId: uuid("treatment_id").references(() => pocketTreatments.id, { onDelete: "cascade" }),
    emergencyId: uuid("emergency_id").references(() => pocketEmergencies.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    arcCheck: check(
      "chk_pocket_history_arc",
      sql`num_nonnulls(${table.drugId}, ${table.diseaseId}, ${table.treatmentId}, ${table.emergencyId}) = 1`,
    ),
    userTimeIdx: index("idx_pocket_history_user_time").on(table.userId, table.viewedAt),
  }),
);

// 32. Safety Overrides (Live State)
export const pocketSafetyOverrides = pgTable(
  "pocket_safety_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetEntityType: varchar("target_entity_type", { length: 50 }).notNull(),
    targetEntityId: uuid("target_entity_id").notNull(),
    actionState: varchar("action_state", { length: 50 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    currentEventId: uuid("current_event_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqSingleActiveOverride: uniqueIndex("uq_single_active_override")
      .on(table.targetEntityType, table.targetEntityId)
      .where(sql`${table.isActive} = true`),
    targetLookupIdx: index("idx_safety_override_lookup").on(table.targetEntityType, table.targetEntityId, table.isActive),
  }),
);

// 33. Safety Override Events (Append-Only)
export const pocketSafetyOverrideEvents = pgTable(
  "pocket_safety_override_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    overrideId: uuid("override_id").notNull().references(() => pocketSafetyOverrides.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    targetEntityType: varchar("target_entity_type", { length: 50 }).notNull(),
    targetEntityId: uuid("target_entity_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    previousState: varchar("previous_state", { length: 50 }),
    newState: varchar("new_state", { length: 50 }).notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    overrideEventsIdx: index("idx_override_events_override_id").on(table.overrideId, table.eventTimestamp),
  }),
);

// Export Pocket TypeScript Inferred Types
export type PocketSourceRecord = typeof pocketSources.$inferSelect;
export type NewPocketSourceRecord = typeof pocketSources.$inferInsert;
export type PocketEntityVersionRegistryRecord = typeof pocketEntityVersionRegistry.$inferSelect;
export type NewPocketEntityVersionRegistryRecord = typeof pocketEntityVersionRegistry.$inferInsert;
export type PocketStandardUnitConversionRecord = typeof pocketStandardUnitConversions.$inferSelect;
export type NewPocketStandardUnitConversionRecord = typeof pocketStandardUnitConversions.$inferInsert;
export type PocketOutboxRecord = typeof pocketOutbox.$inferSelect;
export type NewPocketOutboxRecord = typeof pocketOutbox.$inferInsert;
export type PocketClinicalReviewerCredentialRecord = typeof pocketClinicalReviewerCredentials.$inferSelect;
export type NewPocketClinicalReviewerCredentialRecord = typeof pocketClinicalReviewerCredentials.$inferInsert;
export type PocketDrugRecord = typeof pocketDrugs.$inferSelect;
export type NewPocketDrugRecord = typeof pocketDrugs.$inferInsert;
export type PocketDiseaseRecord = typeof pocketDiseases.$inferSelect;
export type NewPocketDiseaseRecord = typeof pocketDiseases.$inferInsert;
export type PocketTreatmentRecord = typeof pocketTreatments.$inferSelect;
export type NewPocketTreatmentRecord = typeof pocketTreatments.$inferInsert;
export type PocketEmergencyRecord = typeof pocketEmergencies.$inferSelect;
export type NewPocketEmergencyRecord = typeof pocketEmergencies.$inferInsert;
export type PocketDraftSessionRecord = typeof pocketDraftSessions.$inferSelect;
export type NewPocketDraftSessionRecord = typeof pocketDraftSessions.$inferInsert;
export type PocketDraftChangeRecord = typeof pocketDraftChanges.$inferSelect;
export type NewPocketDraftChangeRecord = typeof pocketDraftChanges.$inferInsert;
export type PocketReleaseRecord = typeof pocketReleases.$inferSelect;
export type NewPocketReleaseRecord = typeof pocketReleases.$inferInsert;
export type PocketScientificAssertionRecord = typeof pocketScientificAssertions.$inferSelect;
export type NewPocketScientificAssertionRecord = typeof pocketScientificAssertions.$inferInsert;
export type PocketAssertionCitationRecord = typeof pocketAssertionCitations.$inferSelect;
export type NewPocketAssertionCitationRecord = typeof pocketAssertionCitations.$inferInsert;
export type PocketAssertionVerificationRecord = typeof pocketAssertionVerifications.$inferSelect;
export type NewPocketAssertionVerificationRecord = typeof pocketAssertionVerifications.$inferInsert;
export type PocketClinicalConflictRecord = typeof pocketClinicalConflicts.$inferSelect;
export type NewPocketClinicalConflictRecord = typeof pocketClinicalConflicts.$inferInsert;
export type PocketAssertionAuditLogRecord = typeof pocketAssertionAuditLog.$inferSelect;
export type NewPocketAssertionAuditLogRecord = typeof pocketAssertionAuditLog.$inferInsert;
export type PocketDrugDosingRuleRecord = typeof pocketDrugDosingRules.$inferSelect;
export type NewPocketDrugDosingRuleRecord = typeof pocketDrugDosingRules.$inferInsert;
export type PocketDrugRenalAdjustmentRecord = typeof pocketDrugRenalAdjustments.$inferSelect;
export type NewPocketDrugRenalAdjustmentRecord = typeof pocketDrugRenalAdjustments.$inferInsert;
export type PocketDrugHepaticAdjustmentRecord = typeof pocketDrugHepaticAdjustments.$inferSelect;
export type NewPocketDrugHepaticAdjustmentRecord = typeof pocketDrugHepaticAdjustments.$inferInsert;
export type PocketDrugSafetyProfileRecord = typeof pocketDrugSafetyProfiles.$inferSelect;
export type NewPocketDrugSafetyProfileRecord = typeof pocketDrugSafetyProfiles.$inferInsert;
export type PocketEmergencyStepRecord = typeof pocketEmergencySteps.$inferSelect;
export type NewPocketEmergencyStepRecord = typeof pocketEmergencySteps.$inferInsert;
export type PocketEmergencyMedicationRecord = typeof pocketEmergencyMedications.$inferSelect;
export type NewPocketEmergencyMedicationRecord = typeof pocketEmergencyMedications.$inferInsert;
export type PocketDrugInteractionRecord = typeof pocketDrugInteractions.$inferSelect;
export type NewPocketDrugInteractionRecord = typeof pocketDrugInteractions.$inferInsert;
export type PocketDrugDiseaseLinkRecord = typeof pocketDrugDiseaseLinks.$inferSelect;
export type NewPocketDrugDiseaseLinkRecord = typeof pocketDrugDiseaseLinks.$inferInsert;
export type PocketDiseaseTreatmentLinkRecord = typeof pocketDiseaseTreatmentLinks.$inferSelect;
export type NewPocketDiseaseTreatmentLinkRecord = typeof pocketDiseaseTreatmentLinks.$inferInsert;
export type PocketTreatmentDrugRecord = typeof pocketTreatmentDrugs.$inferSelect;
export type NewPocketTreatmentDrugRecord = typeof pocketTreatmentDrugs.$inferInsert;
export type PocketSearchAliasRecord = typeof pocketSearchAliases.$inferSelect;
export type NewPocketSearchAliasRecord = typeof pocketSearchAliases.$inferInsert;
export type PocketUserNoteRecord = typeof pocketUserNotes.$inferSelect;
export type NewPocketUserNoteRecord = typeof pocketUserNotes.$inferInsert;
export type PocketUserFavoriteRecord = typeof pocketUserFavorites.$inferSelect;
export type NewPocketUserFavoriteRecord = typeof pocketUserFavorites.$inferInsert;
export type PocketUserHistoryRecord = typeof pocketUserHistory.$inferSelect;
export type NewPocketUserHistoryRecord = typeof pocketUserHistory.$inferInsert;
export type PocketSafetyOverrideRecord = typeof pocketSafetyOverrides.$inferSelect;
export type NewPocketSafetyOverrideRecord = typeof pocketSafetyOverrides.$inferInsert;
export type PocketSafetyOverrideEventRecord = typeof pocketSafetyOverrideEvents.$inferSelect;
export type NewPocketSafetyOverrideEventRecord = typeof pocketSafetyOverrideEvents.$inferInsert;

// ---------------------------------------------------------------------------
// Studio Exam Generation Module (Migration 0108 - Multi-Chapter AI Operations)
// ---------------------------------------------------------------------------

export const studioExamGenerationOperations = pgTable(
  "studio_exam_generation_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => marketingQuizzes.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    totalRequestedQuestions: integer("total_requested_questions").notNull(),
    totalGeneratedQuestions: integer("total_generated_questions")
      .notNull()
      .default(0),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    patternSnapshots: jsonb("pattern_snapshots")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    quizIdx: index("idx_studio_exam_ops_quiz").on(table.quizId),
    statusIdx: index("idx_studio_exam_ops_status").on(table.status),
    orgCreatedIdx: index("idx_studio_exam_ops_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
  }),
);

export const studioExamGenerationTasks = pgTable(
  "studio_exam_generation_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => studioExamGenerationOperations.id, {
        onDelete: "cascade",
      }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    targetQuestionCount: integer("target_question_count").notNull(),
    generatedQuestionCount: integer("generated_question_count")
      .notNull()
      .default(0),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    opModuleUniqueIdx: uniqueIndex("uq_studio_exam_tasks_op_module").on(
      table.operationId,
      table.moduleId,
    ),
    opStatusIdx: index("idx_studio_exam_tasks_op_status").on(
      table.operationId,
      table.status,
    ),
    moduleIdx: index("idx_studio_exam_tasks_module").on(table.moduleId),
  }),
);

export const studioExamGenerationBatches = pgTable(
  "studio_exam_generation_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => studioExamGenerationTasks.id, { onDelete: "cascade" }),
    batchIndex: integer("batch_index").notNull(),
    targetCount: integer("target_count").notNull(),
    generatedCount: integer("generated_count").notNull().default(0),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    patternAllocations: jsonb("pattern_allocations")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    retryCount: integer("retry_count").notNull().default(0),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    taskIndexUniqueIdx: uniqueIndex("uq_studio_exam_batches_task_index").on(
      table.taskId,
      table.batchIndex,
    ),
    taskStatusIdx: index("idx_studio_exam_batches_task_status").on(
      table.taskId,
      table.status,
    ),
  }),
);

export const studioExamGeneratedQuestions = pgTable(
  "studio_exam_generated_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => studioExamGenerationOperations.id, {
        onDelete: "cascade",
      }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => studioExamGenerationTasks.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => studioExamGenerationBatches.id, {
        onDelete: "cascade",
      }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    patternId: uuid("pattern_id").references(() => questionPatterns.id, {
      onDelete: "set null",
    }),
    patternVersion: integer("pattern_version"),
    questionIndex: integer("question_index").notNull(),
    question: text("question").notNull(),
    choices: jsonb("choices").notNull(),
    correctAnswer: jsonb("correct_answer").notNull(),
    explanation: text("explanation"),
    difficulty: varchar("difficulty", { length: 20 })
      .notNull()
      .default("medium"),
    topic: varchar("topic", { length: 255 }),
    questionType: varchar("question_type", { length: 50 })
      .notNull()
      .default("multiple_choice"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isAccepted: boolean("is_accepted").notNull().default(false),
    reviewStatus: varchar("review_status", { length: 32 })
      .notNull()
      .default("pending_review"),
    transferredQuestionId: uuid("transferred_question_id").references(
      () => marketingQuizQuestions.id,
      { onDelete: "set null" },
    ),
    transferredAt: timestamp("transferred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    batchQuestionIndexUniqueIdx: uniqueIndex("uq_studio_gen_q_batch_index").on(
      table.batchId,
      table.questionIndex,
    ),
    opIdx: index("idx_studio_gen_q_op").on(table.operationId),
    taskIdx: index("idx_studio_gen_q_task").on(table.taskId),
    batchIdx: index("idx_studio_gen_q_batch").on(table.batchId),
    moduleIdx: index("idx_studio_gen_q_module").on(table.moduleId),
    opReviewStatusIdx: index("idx_studio_gen_q_op_review_status").on(
      table.operationId,
      table.reviewStatus,
    ),
  }),
);

export type StudioExamGenerationOperationRecord =
  typeof studioExamGenerationOperations.$inferSelect;
export type NewStudioExamGenerationOperationRecord =
  typeof studioExamGenerationOperations.$inferInsert;

export type StudioExamGenerationTaskRecord =
  typeof studioExamGenerationTasks.$inferSelect;
export type NewStudioExamGenerationTaskRecord =
  typeof studioExamGenerationTasks.$inferInsert;

export type StudioExamGenerationBatchRecord =
  typeof studioExamGenerationBatches.$inferSelect;
export type NewStudioExamGenerationBatchRecord =
  typeof studioExamGenerationBatches.$inferInsert;

export type StudioExamGeneratedQuestionDbRecord =
  typeof studioExamGeneratedQuestions.$inferSelect;
export type NewStudioExamGeneratedQuestionDbRecord =
  typeof studioExamGeneratedQuestions.$inferInsert;
