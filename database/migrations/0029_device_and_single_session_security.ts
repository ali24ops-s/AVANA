import { sql } from "drizzle-orm";

/**
 * Migration 0029: Device and Single-Session Subscription Security.
 *
 * Implements:
 * 1. `user_devices` table for registered mobile and desktop devices (max 1 of each per user).
 * 2. `sessions` table updates:
 *    - `device_id`: FK to user_devices(id)
 *    - `revocation_reason`: Tracking reason for session termination
 *    - Single active session partial unique constraint on (user_id) WHERE revoked_at IS NULL
 * 3. `authentication_attempts` table for tracking failed/blocked attempts (e.g. DEVICE_LIMIT_REACHED).
 *
 * Fully idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Create user_devices table
    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id VARCHAR(64) NOT NULL,
      device_type VARCHAR(20) NOT NULL,
      device_name VARCHAR(255),
      user_agent TEXT,
      last_ip VARCHAR(64),
      first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_user_type_active
      ON user_devices (user_id, device_type)
      WHERE revoked_at IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_user_device_active
      ON user_devices (user_id, device_id)
      WHERE revoked_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_user_devices_device_id
      ON user_devices (device_id);

    CREATE INDEX IF NOT EXISTS idx_user_devices_user
      ON user_devices (user_id);

    -- 2. Alter sessions table
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES user_devices(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS revocation_reason VARCHAR(50);

    CREATE INDEX IF NOT EXISTS idx_sessions_device
      ON sessions (device_id);

    -- Clean up any historical duplicate active sessions, keeping only the most recent
    UPDATE sessions
    SET revoked_at = NOW(), revocation_reason = 'migration_cleanup'
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_id) id
      FROM sessions
      WHERE revoked_at IS NULL
      ORDER BY user_id, last_used_at DESC, created_at DESC
    ) AND revoked_at IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_single_active_user
      ON sessions (user_id)
      WHERE revoked_at IS NULL;

    -- 3. Create authentication_attempts table
    CREATE TABLE IF NOT EXISTS authentication_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(320) NOT NULL,
      device_type VARCHAR(20) NOT NULL,
      device_id VARCHAR(64),
      user_agent TEXT,
      ip VARCHAR(64),
      result VARCHAR(50) NOT NULL,
      details TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_auth_attempts_user
      ON authentication_attempts (user_id);

    CREATE INDEX IF NOT EXISTS idx_auth_attempts_email
      ON authentication_attempts (email);

    CREATE INDEX IF NOT EXISTS idx_auth_attempts_created_at
      ON authentication_attempts (created_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS authentication_attempts;

    DROP INDEX IF EXISTS idx_sessions_single_active_user;
    DROP INDEX IF EXISTS idx_sessions_device;

    ALTER TABLE sessions
      DROP COLUMN IF EXISTS revocation_reason,
      DROP COLUMN IF EXISTS device_id;

    DROP TABLE IF EXISTS user_devices;
  `);
}
