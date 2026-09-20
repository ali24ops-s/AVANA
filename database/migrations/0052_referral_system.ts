import { sql } from "drizzle-orm";

/**
 * Migration 0052: Referral System V1.
 *
 * Implements:
 * 1. referral_codes table (Lazy-generated unique referral codes per user)
 * 2. referrals table (Durable invitation relationship, status lifecycle, qualifying purchase, and wallet reward tracking)
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Referral Codes table
    CREATE TABLE IF NOT EXISTS referral_codes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code varchar(50) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_user_id
      ON referral_codes (user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code_unique
      ON referral_codes (UPPER(code));

    -- 2. Referrals table
    CREATE TABLE IF NOT EXISTS referrals (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      inviter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referral_code_id uuid NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
      status varchar(30) NOT NULL DEFAULT 'pending',
      qualifying_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      qualifying_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
      qualified_at timestamptz,
      reward_type varchar(50) NOT NULL DEFAULT 'wallet_credit',
      reward_amount integer NOT NULL DEFAULT 0,
      reward_status varchar(30) NOT NULL DEFAULT 'pending',
      rewarded_at timestamptz,
      wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_referrals_no_self_referral CHECK (inviter_user_id != invited_user_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_invited_user_unique
      ON referrals (invited_user_id);

    CREATE INDEX IF NOT EXISTS idx_referrals_inviter_status
      ON referrals (inviter_user_id, status);

    CREATE INDEX IF NOT EXISTS idx_referrals_status
      ON referrals (status);
  `);
}
