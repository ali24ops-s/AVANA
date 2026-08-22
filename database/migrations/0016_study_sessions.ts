import { sql } from "drizzle-orm";

/**
 * Migration 0016: Study Sessions & Active Study Time Tracking.
 *
 * Adds study_sessions table to record real active educational sessions
 * (lessons, flashcards, exams, AI tutor, PDF reading).
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Create study_sessions table
    CREATE TABLE IF NOT EXISTS study_sessions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_type varchar(50) NOT NULL,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
      lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz,
      duration_seconds integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_study_sessions_user
      ON study_sessions (user_id);

    CREATE INDEX IF NOT EXISTS idx_study_sessions_activity_type
      ON study_sessions (activity_type);

    CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at
      ON study_sessions (started_at);

    CREATE INDEX IF NOT EXISTS idx_study_sessions_ended_at
      ON study_sessions (ended_at);

    CREATE INDEX IF NOT EXISTS idx_study_sessions_user_started
      ON study_sessions (user_id, started_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS study_sessions CASCADE;
  `);
}
