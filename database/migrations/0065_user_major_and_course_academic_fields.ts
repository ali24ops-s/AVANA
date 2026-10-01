import { sql } from "drizzle-orm";

/**
 * Migration 0064: User Major and Course Academic Fields.
 *
 * 1. Adds `major` (varchar(50)) to `users` table for student academic field persistence.
 * 2. Adds `target_academic_fields` (jsonb DEFAULT '[]'::jsonb) to `courses` table for multi-field taxonomy.
 * 3. Adds index `idx_users_major` on `users(major)`.
 *
 * Fully backward-compatible and idempotent (IF NOT EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Add major column to users if not exists
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS major varchar(50);

    CREATE INDEX IF NOT EXISTS idx_users_major ON users (major);

    -- 2. Add target_academic_fields column to courses if not exists
    ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS target_academic_fields jsonb DEFAULT '[]'::jsonb;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_users_major;

    ALTER TABLE users
      DROP COLUMN IF EXISTS major;

    ALTER TABLE courses
      DROP COLUMN IF EXISTS target_academic_fields;
  `);
}
