import { sql } from "drizzle-orm";

/**
 * Migration 0028: Card-to-Card Payment System & Admin Review.
 *
 * Adds structured columns to `payments` table for Card-to-Card (کارت‌به‌کارت) processing:
 * - `tracking_number`: Bank reference / tracking number (شماره پیگیری یا شماره ارجاع)
 * - `source_card_last4`: Last 4 digits of payer's source bank card (۴ رقم آخر کارت مبدأ)
 * - `payer_name`: Optional cardholder name
 * - `receipt_url`: Optional private secure storage URL/key for deposit receipt
 * - `initial_validation_result`: Structured JSON recording automated pre-activation validation checks
 * - `rejection_reason`: Mandatory reason when payment is rejected by admin
 * - `reviewed_at`: Timestamp when admin approved/rejected
 * - `reviewed_by`: Admin user ID who reviewed
 *
 * Fully idempotent (ADD COLUMN IF NOT EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Add Card-to-Card columns to payments table
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS source_card_last4 VARCHAR(4),
      ADD COLUMN IF NOT EXISTS payer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS initial_validation_result JSONB,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

    -- 2. Create performance & anti-fraud indexes
    CREATE INDEX IF NOT EXISTS idx_payments_tracking_number
      ON payments(tracking_number);

    CREATE INDEX IF NOT EXISTS idx_payments_c2c_lookup
      ON payments(gateway, status);

    CREATE INDEX IF NOT EXISTS idx_payments_c2c_duplicate_check
      ON payments(tracking_number, amount, source_card_last4);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_payments_c2c_duplicate_check;
    DROP INDEX IF EXISTS idx_payments_c2c_lookup;
    DROP INDEX IF EXISTS idx_payments_tracking_number;

    ALTER TABLE payments
      DROP COLUMN IF EXISTS reviewed_by,
      DROP COLUMN IF EXISTS reviewed_at,
      DROP COLUMN IF EXISTS rejection_reason,
      DROP COLUMN IF EXISTS initial_validation_result,
      DROP COLUMN IF EXISTS receipt_url,
      DROP COLUMN IF EXISTS payer_name,
      DROP COLUMN IF EXISTS source_card_last4,
      DROP COLUMN IF EXISTS tracking_number;
  `);
}
