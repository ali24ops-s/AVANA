import { sql } from "drizzle-orm";

/**
 * Migration 0064: Teacher Approval Status.
 *
 * Adds:
 * 1. teacher_status to users table ('pending' | 'approved' | 'rejected')
 *    with default 'approved' to preserve existing teacher statuses.
 * 2. idx_users_teacher_status index.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS teacher_status varchar(20) NOT NULL DEFAULT 'approved';

    CREATE INDEX IF NOT EXISTS idx_users_teacher_status ON users (teacher_status);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_users_teacher_status;
    ALTER TABLE users DROP COLUMN IF EXISTS teacher_status;
  `);
}
