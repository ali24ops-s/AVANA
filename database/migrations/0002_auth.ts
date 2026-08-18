import { sql } from "drizzle-orm";

/**
 * PR-7 auth migration.
 *
 * Creates auth_identities and sessions tables for the authentication
 * and session boundary.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application during development.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- ============================================================
    -- Users Table Update
    -- ============================================================

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar(255);

    -- ============================================================
    -- Auth Identities
    -- ============================================================

    CREATE TABLE IF NOT EXISTS auth_identities (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider varchar(100) NOT NULL,
      provider_subject varchar(500) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_provider_subject
      ON auth_identities (provider, provider_subject);

    CREATE INDEX IF NOT EXISTS idx_auth_identities_user
      ON auth_identities (user_id);

    -- ============================================================
    -- Sessions
    -- ============================================================

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL,
      expires_at timestamptz NOT NULL,
      last_used_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash
      ON sessions (token_hash);

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions (user_id);

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions (expires_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS auth_identities CASCADE;
  `);
}
