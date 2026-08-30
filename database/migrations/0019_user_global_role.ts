import { sql } from "drizzle-orm";

/**
 * Migration 0019: Add global_role to users and migrate legacy platform_admin memberships.
 *
 * 1. Adds `global_role varchar(50) DEFAULT NULL` to `users`.
 * 2. Creates index `idx_users_global_role` on `users (global_role)`.
 * 3. Migrates any legacy users holding `platform_admin` role in `organization_memberships`
 *    to have `users.global_role = 'platform_admin'`.
 * 4. Normalizes legacy `platform_admin` organization_memberships to 'student' so there
 *    is only a single Source of Truth for the platform_admin role.
 *
 * Idempotent and safe for production.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Add global_role column to users table (nullable, default NULL)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS global_role varchar(50) DEFAULT NULL;

    -- 2. Create index for fast platform_admin lookups
    CREATE INDEX IF NOT EXISTS idx_users_global_role ON users (global_role);

    -- 3. Backfill global_role for users who have platform_admin in organization_memberships
    UPDATE users
    SET global_role = 'platform_admin'
    WHERE id IN (
      SELECT user_id
      FROM organization_memberships
      WHERE role = 'platform_admin'
    ) AND global_role IS NULL;

    -- 4. Clean up legacy platform_admin from organization_memberships to eliminate duplicate Source of Truth
    UPDATE organization_memberships
    SET role = 'student'
    WHERE role = 'platform_admin';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_users_global_role;
    ALTER TABLE users DROP COLUMN IF EXISTS global_role;
  `);
}
