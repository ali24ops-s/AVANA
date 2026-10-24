import { sql } from "drizzle-orm";

/**
 * Migration 0082: User Welcome Gifts.
 *
 * Implements:
 * 1. user_welcome_gifts table:
 *    - Strictly enforces at-most-once welcome gift per user via UNIQUE(user_id)
 *    - Records wallet_amount (20,000 Tomans) and wallet_transaction_id
 *    - Records subscription_days (7 days), subscription_id, and entitlement_id
 *    - Tracks popup_seen_at timestamp to control dashboard modal presentation
 *    - Maintains durable lifecycle status ('pending', 'completed')
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_welcome_gifts (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wallet_amount integer NOT NULL DEFAULT 20000,
      wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      subscription_days integer NOT NULL DEFAULT 7,
      subscription_id uuid REFERENCES user_subscriptions(id) ON DELETE SET NULL,
      entitlement_id uuid REFERENCES user_entitlements(id) ON DELETE SET NULL,
      status varchar(30) NOT NULL DEFAULT 'completed',
      popup_seen_at timestamptz,
      granted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_welcome_gifts_user_id
      ON user_welcome_gifts (user_id);

    CREATE INDEX IF NOT EXISTS idx_user_welcome_gifts_status
      ON user_welcome_gifts (status);

    CREATE INDEX IF NOT EXISTS idx_user_welcome_gifts_popup_seen
      ON user_welcome_gifts (user_id, popup_seen_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS user_welcome_gifts CASCADE;
  `);
}
