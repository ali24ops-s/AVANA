import { sql } from "drizzle-orm";

/**
 * Migration 0060: Add per-question timing support to teacher exams and attempts.
 *
 * 1. Adds per_question_time_seconds to teacher_exams.
 * 2. Adds allow_back_navigation and per_question_time_seconds to teacher_exam_attempts for snapshotting.
 * 3. Adds finalized_at to teacher_exam_attempt_answers for explicit question completion timestamps.
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exams
    ADD COLUMN IF NOT EXISTS per_question_time_seconds integer;

    ALTER TABLE teacher_exam_attempts
    ADD COLUMN IF NOT EXISTS allow_back_navigation boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS per_question_time_seconds integer;

    ALTER TABLE teacher_exam_attempt_answers
    ADD COLUMN IF NOT EXISTS finalized_at timestamp with time zone;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_attempt_answers
    DROP COLUMN IF EXISTS finalized_at;

    ALTER TABLE teacher_exam_attempts
    DROP COLUMN IF EXISTS per_question_time_seconds,
    DROP COLUMN IF EXISTS allow_back_navigation;

    ALTER TABLE teacher_exams
    DROP COLUMN IF EXISTS per_question_time_seconds;
  `);
}
