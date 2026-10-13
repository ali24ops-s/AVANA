import { sql } from "drizzle-orm";

/**
 * Migration 0078: Durable Telegram Outbox.
 *
 * Implements an at-least-once outbox queue for reliable delivery of
 * Telegram alerts (especially financial notifications, c2c payments,
 * refunds, and critical error alerts) despite proxy dropouts, bot API outages,
 * and transient network errors.
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key VARCHAR(255) NOT NULL,
      chat_id VARCHAR(64) NOT NULL,
      category VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 10,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_expires_at TIMESTAMPTZ,
      lease_token VARCHAR(64),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_outbox_idempotency_key
      ON telegram_outbox (idempotency_key);

    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_poll
      ON telegram_outbox (status, next_attempt_at);

    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_created_at
      ON telegram_outbox (created_at DESC);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS telegram_outbox CASCADE;
  `);
}
