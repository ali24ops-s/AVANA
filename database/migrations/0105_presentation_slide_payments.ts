import { sql } from "drizzle-orm";

/**
 * Migration 0105: Presentation Slide Payments & Monetization.
 *
 * Adds explicit, audit-safe payment tracking columns to `presentation_slides`:
 * - `payment_transaction_id`: References the immutable ledger entry in `wallet_transactions`
 * - `paid_at`: Timestamp indicating when the slide was successfully paid and verified
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE presentation_slides
      ADD COLUMN IF NOT EXISTS payment_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_presentation_slides_payment_tx
      ON presentation_slides (payment_transaction_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_presentation_slides_payment_tx;

    ALTER TABLE presentation_slides
      DROP COLUMN IF EXISTS paid_at,
      DROP COLUMN IF EXISTS payment_transaction_id;
  `);
}
