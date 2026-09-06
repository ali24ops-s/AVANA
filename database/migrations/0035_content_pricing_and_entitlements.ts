import { sql } from "drizzle-orm";

/**
 * Migration 0035: Content Pricing & Entitlements Support.
 *
 * Updates user_entitlements check constraint to support direct 'content' entitlements
 * alongside 'course', 'content_pack', and 'subscription'.
 *
 * Invariant:
 * - resource_id MUST BE NULL for 'subscription'
 * - resource_id MUST BE NOT NULL for 'course', 'content_pack', and 'content'
 *
 * Pure non-destructive additive DDL migration.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE user_entitlements
      DROP CONSTRAINT IF EXISTS chk_user_entitlements_resource_id;

    ALTER TABLE user_entitlements
      ADD CONSTRAINT chk_user_entitlements_resource_id CHECK (
        (resource_type = 'subscription' AND resource_id IS NULL) OR
        (resource_type IN ('course', 'content_pack', 'content') AND resource_id IS NOT NULL)
      );
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE user_entitlements
      DROP CONSTRAINT IF EXISTS chk_user_entitlements_resource_id;

    ALTER TABLE user_entitlements
      ADD CONSTRAINT chk_user_entitlements_resource_id CHECK (
        (resource_type = 'subscription' AND resource_id IS NULL) OR
        (resource_type IN ('course', 'content_pack') AND resource_id IS NOT NULL)
      );
  `);
}
