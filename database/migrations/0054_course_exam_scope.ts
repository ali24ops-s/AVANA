import { sql } from "drizzle-orm";

/**
 * Migration 0054: Course Exam Scope.
 *
 * Adds `exam_scope` (jsonb) column to `courses` table to store
 * selected module/lesson IDs for exam-focused preparation.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS exam_scope jsonb;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE courses
      DROP COLUMN IF EXISTS exam_scope;
  `);
}
