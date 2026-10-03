import { sql } from "drizzle-orm";

/**
 * Migration 0066: Descriptive Exam Answers Integrity & Telemetry.
 *
 * Adds integrity_metadata JSONB column to teacher_exam_attempt_answers.
 * Stores telemetry such as paste counts, character counts, rapid input events, and timeline.
 * Does NOT store clipboard text/content (strictly privacy-preserving).
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_attempt_answers
    ADD COLUMN IF NOT EXISTS integrity_metadata jsonb;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_attempt_answers
    DROP COLUMN IF EXISTS integrity_metadata;
  `);
}
