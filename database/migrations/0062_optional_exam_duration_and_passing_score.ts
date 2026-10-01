import { sql } from "drizzle-orm";

/**
 * Migration 0062: Make exam duration_minutes and passing_score_percentage optional (nullable).
 *
 * Idempotent (safe ALTER COLUMN).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exams
    ALTER COLUMN duration_minutes DROP NOT NULL,
    ALTER COLUMN passing_score_percentage DROP NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exams
    ALTER COLUMN duration_minutes SET NOT NULL,
    ALTER COLUMN passing_score_percentage SET NOT NULL;
  `);
}
