import { sql } from "drizzle-orm";

/**
 * Migration 0039: Phone Verification & Dual-Channel Auth System.
 *
 * Adds phone_number and phone_verified_at columns to users table.
 * Extends email_verification_codes table with channel and target columns.
 *
 * Invariants & Guarantees:
 * 1. phone_number is nullable for existing users so migration never fails on legacy data.
 * 2. Partial unique index on phone_number (WHERE phone_number IS NOT NULL).
 * 3. email_verification_codes.channel defaults to 'email' for 100% backward compatibility.
 * 4. Fully idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Add phone columns to users table
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number varchar(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

    -- 2. Partial unique index for phone_number
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number
      ON users (phone_number)
      WHERE phone_number IS NOT NULL;

    -- 3. Add channel and target to email_verification_codes
    ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS channel varchar(20) NOT NULL DEFAULT 'email';
    ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS target varchar(320);

    -- 4. Index for user + channel lookups
    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_channel
      ON email_verification_codes (user_id, channel);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_email_verification_codes_channel;
    ALTER TABLE email_verification_codes DROP COLUMN IF EXISTS target;
    ALTER TABLE email_verification_codes DROP COLUMN IF EXISTS channel;

    DROP INDEX IF EXISTS idx_users_phone_number;
    ALTER TABLE users DROP COLUMN IF EXISTS phone_verified_at;
    ALTER TABLE users DROP COLUMN IF EXISTS phone_number;
  `);
}
