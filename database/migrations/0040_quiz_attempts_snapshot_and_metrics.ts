import { sql } from "drizzle-orm";

/**
 * Migration 0040: Add question_snapshot and metrics columns to quiz_attempts.
 *
 * Preserves historical question state at attempt time so subsequent edits or
 * deletions of original questions do not alter past completed reviews.
 * Also stores pre-computed evaluation metrics for high-speed analysis.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS quiz_attempts 
      ADD COLUMN IF NOT EXISTS question_snapshot jsonb,
      ADD COLUMN IF NOT EXISTS metrics jsonb;

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_completed 
      ON quiz_attempts (user_id, completed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_started 
      ON quiz_attempts (user_id, started_at DESC);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_quiz_attempts_user_started;
    DROP INDEX IF EXISTS idx_quiz_attempts_user_completed;

    ALTER TABLE IF EXISTS quiz_attempts 
      DROP COLUMN IF EXISTS question_snapshot,
      DROP COLUMN IF EXISTS metrics;
  `);
}
