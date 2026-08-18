import { sql } from "drizzle-orm";

/**
 * Migration 0014: Email Verification System.
 *
 * Adds email_verified_at column to users table and creates
 * email_verification_codes table for 6-digit verification challenges.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Add email_verified_at to users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

    -- Create email_verification_codes table
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash varchar(255) NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      used_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user
      ON email_verification_codes (user_id);

    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_active
      ON email_verification_codes (user_id, expires_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS email_verification_codes CASCADE;
    ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
  `);
}
