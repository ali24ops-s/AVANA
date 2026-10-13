import { sql } from "drizzle-orm";

/**
 * Migration 0079: Partial index for recovering expired Telegram Outbox leases.
 *
 * Targets only in-flight messages (`status = 'sending'`), making the recovery
 * check (executed on every poll interval) near-zero cost without indexing sent/pending rows.
 *
 * Safe, Non-Destructive Rollback:
 * Only drops the partial index; does NOT drop the table or delete messages.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_expired_leases
      ON telegram_outbox (lease_expires_at)
      WHERE status = 'sending';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_telegram_outbox_expired_leases;
  `);
}
