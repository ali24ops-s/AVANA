import { sql } from "drizzle-orm";

/**
 * Migration 0072: Teacher Exam Attempt Integrity & Security Telemetry.
 *
 * Adds integrity_metadata JSONB column to teacher_exam_attempts.
 * Stores telemetry such as exit counts, away duration, reconnects, and attempt events.
 * Does NOT store clipboard text or sensitive device fingerprints.
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_attempts
    ADD COLUMN IF NOT EXISTS integrity_metadata jsonb;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_attempts
    DROP COLUMN IF EXISTS integrity_metadata;
  `);
}
