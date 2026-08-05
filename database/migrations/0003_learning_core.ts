import { sql } from "drizzle-orm";

/**
 * Sprint 2 — Learning Core migration.
 *
 * Creates modules, lessons, and lesson_progress tables for the
 * Course → Module → Lesson → Content hierarchy.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application during development.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- ============================================================
    -- Modules
    -- A module is a major topic within a course.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS modules (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      description text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_modules_course_order
      ON modules (course_id, sort_order);

    -- ============================================================
    -- Lessons
    -- A lesson is a single learning unit inside a module.
    -- Content is stored as markdown in content_markdown.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS lessons (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      content_type varchar(50) NOT NULL DEFAULT 'markdown',
      content_markdown text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0,
      estimated_minutes integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_module_order
      ON lessons (module_id, sort_order);

    -- ============================================================
    -- Lesson Progress
    -- Tracks which lessons a user has completed.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS lesson_progress (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      completed boolean NOT NULL DEFAULT false,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson
      ON lesson_progress (user_id, lesson_id);

    CREATE INDEX IF NOT EXISTS idx_lesson_progress_user
      ON lesson_progress (user_id);

    CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson
      ON lesson_progress (lesson_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS lesson_progress CASCADE;
    DROP TABLE IF EXISTS lessons CASCADE;
    DROP TABLE IF EXISTS modules CASCADE;
  `);
}
