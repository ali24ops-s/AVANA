import { sql } from "drizzle-orm";

/**
 * Migration 0058: Password Reset Tokens System.
 *
 * Adds password_reset_tokens table for secure, short-lived,
 * single-use password recovery tokens.
 *
 * Invariants & Guarantees:
 * 1. Tokens stored hashed (SHA-256) so raw tokens are never persisted.
 * 2. Unique constraint on token_hash for fast lookups and replay prevention.
 * 3. Cascade deletion on user deletion.
 * 4. Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash varchar(64) NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
      ON password_reset_tokens (token_hash);

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
      ON password_reset_tokens (user_id);

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
      ON password_reset_tokens (expires_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_password_reset_tokens_expires_at;
    DROP INDEX IF EXISTS idx_password_reset_tokens_user;
    DROP INDEX IF EXISTS idx_password_reset_tokens_hash;
    DROP TABLE IF EXISTS password_reset_tokens CASCADE;
  `);
}
