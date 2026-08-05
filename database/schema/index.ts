import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  integer,
  boolean,
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
