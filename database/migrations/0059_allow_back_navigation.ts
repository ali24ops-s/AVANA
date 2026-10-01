import { sql } from "drizzle-orm";

/**
 * Migration 0059: Add allow_back_navigation to teacher_exams.
 *
 * Adds allow_back_navigation column with default true to allow students
 * to navigate back to previous questions during exams.
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes \`any\` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exams
    ADD COLUMN IF NOT EXISTS allow_back_navigation boolean NOT NULL DEFAULT true;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes \`any\` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exams
    DROP COLUMN IF EXISTS allow_back_navigation;
  `);
}
