import { sql } from "drizzle-orm";

/**
 * Migration 0090: Per-User Course Exam Schedules.
 *
 * Adds `exam_date` (timestamptz) and `exam_scope` (jsonb) columns to `course_memberships`
 * table to decouple individual student exam schedules from the shared `courses` record.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE course_memberships
      ADD COLUMN IF NOT EXISTS exam_date timestamptz,
      ADD COLUMN IF NOT EXISTS exam_scope jsonb;

    CREATE INDEX IF NOT EXISTS idx_course_memberships_user_exam
      ON course_memberships (user_id, exam_date);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_course_memberships_user_exam;

    ALTER TABLE course_memberships
      DROP COLUMN IF EXISTS exam_date,
      DROP COLUMN IF EXISTS exam_scope;
  `);
}
