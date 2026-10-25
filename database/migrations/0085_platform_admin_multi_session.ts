import { sql } from "drizzle-orm";

/**
 * Migration 0085: Enable multi-device concurrent sessions for platform_admin role.
 *
 * Rationale:
 * Drops the database-level partial unique index `idx_sessions_single_active_user`
 * which enforced a rigid single active session per user across the entire table.
 *
 * Single active session for regular users (`student`) and all other roles
 * (`teacher`, `organization_admin`, `course_editor`, `content_worker`, `support_agent`)
 * is strictly guaranteed at the application transaction layer under row-level lock
 * (`SELECT id FROM users WHERE id = $userId::uuid FOR UPDATE`) in `authenticateAndTakeoverSession`.
 *
 * Replaces the unique index with a non-unique index on `(user_id, revoked_at)` to preserve
 * query performance when filtering/fetching active sessions for users.
 *
 * Idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Drop partial unique index that prevented concurrent sessions across devices
    DROP INDEX IF EXISTS idx_sessions_single_active_user;

    -- 2. Add non-unique composite index to optimize active session queries by user
    CREATE INDEX IF NOT EXISTS idx_sessions_user_revoked
      ON sessions (user_id, revoked_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_sessions_user_revoked;

    -- Clean up any multiple active sessions before restoring unique constraint
    UPDATE sessions
    SET revoked_at = NOW(), revocation_reason = 'rollback_cleanup'
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_id) id
      FROM sessions
      WHERE revoked_at IS NULL
      ORDER BY user_id, last_used_at DESC, created_at DESC
    ) AND revoked_at IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_single_active_user
      ON sessions (user_id)
      WHERE revoked_at IS NULL;
  `);
}
