import { sql } from "drizzle-orm";

/**
 * Migration 0068: Teacher Academic Profile.
 *
 * 1. Adds `university` (varchar(255)) to `users` table for teacher institution persistence.
 * 2. Adds `faculty` (varchar(255)) to `users` table for teacher faculty/school persistence.
 * 3. Adds `department` (varchar(255)) to `users` table for teacher academic department persistence.
 * 4. Adds indexes on `users(university)` and `users(department)`.
 *
 * Fully backward-compatible and idempotent (IF NOT EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS university varchar(255),
      ADD COLUMN IF NOT EXISTS faculty varchar(255),
      ADD COLUMN IF NOT EXISTS department varchar(255);

    CREATE INDEX IF NOT EXISTS idx_users_university ON users (university);
    CREATE INDEX IF NOT EXISTS idx_users_department ON users (department);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_users_department;
    DROP INDEX IF EXISTS idx_users_university;

    ALTER TABLE users
      DROP COLUMN IF EXISTS department,
      DROP COLUMN IF EXISTS faculty,
      DROP COLUMN IF EXISTS university;
  `);
}
