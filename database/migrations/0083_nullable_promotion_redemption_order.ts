import { sql } from "drizzle-orm";

/**
 * Migration 0083: Make order_id nullable in promotion_redemptions.
 *
 * Rationale:
 * Promotion redemption reservations are created in 'pending' status during checkout
 * before the order row exists in the orders table. Once the order is created,
 * linkRedemptionToOrder binds the reservation to the actual order_id.
 *
 * This migration safely drops the NOT NULL constraint on order_id without
 * touching existing data or breaking the FOREIGN KEY cascade relation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE promotion_redemptions
      ALTER COLUMN order_id DROP NOT NULL;
  `);
}

/**
 * Migration 0083 Down:
 * Restores the NOT NULL constraint on order_id.
 *
 * Operational Safety & Rollback Governance:
 * 1. Intentional Failure under Incompatible Data:
 *    PostgreSQL will naturally abort and reject this migration if ANY row in
 *    `promotion_redemptions` has `order_id IS NULL` (e.g. pending, abandoned,
 *    or cancelled reservation records).
 * 2. Strict Prohibition of Automated Destructive Operations:
 *    NO automated script or pipeline should EVER execute:
 *    `DELETE FROM promotion_redemptions WHERE order_id IS NULL`
 *    Blindly purging unlinked rows permanently destroys financial audit logs,
 *    coupon utilization analytics, and customer checkout attempt histories.
 * 3. Required Pre-Rollback Operator Procedure:
 *    a) Run read-only diagnostic query to inspect unlinked rows:
 *       `SELECT status, count(*), min(created_at), max(created_at)`
 *       `FROM promotion_redemptions WHERE order_id IS NULL GROUP BY status;`
 *    b) If incompatible rows exist, the rollback MUST be halted.
 *    c) Operator and business stakeholders must make an explicit, informed
 *       decision. If archiving is approved, complete non-destructive archival
 *       must be verified prior to any remediation:
 *       `CREATE TABLE IF NOT EXISTS promotion_redemptions_unlinked_archive AS`
 *       `SELECT * FROM promotion_redemptions WHERE order_id IS NULL;`
 *       Verify count: `SELECT count(*) FROM promotion_redemptions_unlinked_archive;`
 *    d) Down migration must NEVER automatically mutate or delete primary business data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE promotion_redemptions
      ALTER COLUMN order_id SET NOT NULL;
  `);
}
