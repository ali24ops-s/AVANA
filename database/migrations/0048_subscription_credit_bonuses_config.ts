import { sql } from "drizzle-orm";
import type { DbClient } from "../client.js";

/**
 * Migration 0048: Seed Subscription Gift Credit Bonuses Configuration.
 *
 * Seeds initial `subscription_credit_bonuses` configuration in `system_configurations`:
 * - monthly: 40000 (40,000 Tomans)
 * - quarterly: 100000 (100,000 Tomans)
 * - annual: 200000 (200,000 Tomans)
 */
export async function up(db: DbClient) {
  await db.execute(sql`
    INSERT INTO system_configurations (key, value, description, updated_at)
    VALUES (
      'subscription_credit_bonuses',
      jsonb_build_object(
        'monthly', 40000,
        'quarterly', 100000,
        'annual', 200000
      ),
      'Avana Credit gift bonuses awarded to user wallets upon subscription activation',
      now()
    )
    ON CONFLICT (key) DO NOTHING;
  `);
}

export async function down(db: DbClient) {
  await db.execute(sql`
    DELETE FROM system_configurations WHERE key = 'subscription_credit_bonuses';
  `);
}
