import { sql } from "drizzle-orm";

/**
 * Migration 0056: Course Drafts, Atomic Releases, and Soft Delete Invariants.
 *
 * Creates:
 * 1. Alter courses: add `version` integer NOT NULL DEFAULT 1
 * 2. Alter quiz_questions: add `deleted_at` timestamptz
 * 3. Create index idx_quiz_questions_active_quiz_order on quiz_questions (quiz_id, sort_order) WHERE deleted_at IS NULL
 * 4. Create course_draft_sessions table with single active draft per course invariant
 * 5. Create course_draft_changes table with (draft_session_id, entity_type, entity_id) unique intended state
 * 6. Create course_releases table with (course_id, version_number) unique release history
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Add version to courses if not exists
    ALTER TABLE courses 
      ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

    -- 2. Add deleted_at to quiz_questions if not exists
    ALTER TABLE quiz_questions 
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

    -- 3. Create index for active quiz questions
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_active_quiz_order 
      ON quiz_questions (quiz_id, sort_order) 
      WHERE deleted_at IS NULL;

    -- 4. Course Draft Sessions
    CREATE TABLE IF NOT EXISTS course_draft_sessions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      base_course_version integer NOT NULL,
      source varchar(50) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'draft',
      title varchar(255),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_draft_sessions_course_status 
      ON course_draft_sessions (course_id, status);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_draft_per_course 
      ON course_draft_sessions (course_id) 
      WHERE status IN ('draft', 'validating', 'ready', 'publishing');

    -- 5. Course Draft Changes (Unique Intended State per Session + Entity)
    CREATE TABLE IF NOT EXISTS course_draft_changes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      draft_session_id uuid NOT NULL REFERENCES course_draft_sessions(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      entity_type varchar(50) NOT NULL,
      entity_id uuid NOT NULL,
      action varchar(20) NOT NULL,
      parent_id uuid,
      sort_order integer,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_changes_session_entity 
      ON course_draft_changes (draft_session_id, entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_draft_changes_session 
      ON course_draft_changes (draft_session_id);

    CREATE INDEX IF NOT EXISTS idx_draft_changes_course 
      ON course_draft_changes (course_id);

    -- 6. Course Releases (Monotonic Version History + Complete Snapshot Manifest)
    CREATE TABLE IF NOT EXISTS course_releases (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      version_number integer NOT NULL,
      base_version integer NOT NULL,
      draft_session_id uuid REFERENCES course_draft_sessions(id) ON DELETE SET NULL,
      changes_summary jsonb NOT NULL,
      manifest jsonb NOT NULL,
      published_by uuid NOT NULL REFERENCES users(id),
      published_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_course_releases_course_version 
      ON course_releases (course_id, version_number);

    CREATE INDEX IF NOT EXISTS idx_course_releases_course_published 
      ON course_releases (course_id, published_at);
  `);
}
