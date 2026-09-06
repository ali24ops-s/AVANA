import { sql } from "drizzle-orm";

/**
 * Migration 0036: Backfill Content Products for Legacy Lessons.
 *
 * Ensures all existing lessons have a corresponding product in the `products` table
 * for independent pricing and monetization.
 *
 * Invariants:
 * - type = 'content'
 * - target_type = 'content'
 * - target_id = lessons.id
 * - code = 'content_' || lessons.id
 * - price = 0
 * - active = false (draft/inactive until priced by admin)
 * - duration_days = NULL (lifetime access)
 * - currency = 'toman'
 * - Idempotent: ON CONFLICT (code) DO NOTHING and WHERE NOT EXISTS filter.
 * - Non-destructive: Existing products, orders, payments, entitlements remain untouched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    INSERT INTO products (
      id,
      code,
      type,
      title,
      description,
      price,
      currency,
      target_type,
      target_id,
      duration_days,
      active,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      'content_' || l.id::text,
      'content',
      l.title,
      COALESCE(l.title, ''),
      0,
      'toman',
      'content',
      l.id,
      NULL,
      false,
      '{}'::jsonb,
      now(),
      now()
    FROM lessons l
    WHERE l.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM products p
        WHERE (p.target_type = 'content' OR p.type = 'content')
          AND p.target_id = l.id
          AND p.deleted_at IS NULL
      )
    ON CONFLICT (code) DO NOTHING;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  // Safe rollback: only remove content products that were backfilled with price=0, active=false and no linked orders
  await db.execute(sql`
    DELETE FROM products p
    WHERE p.type = 'content'
      AND p.target_type = 'content'
      AND p.price = 0
      AND p.active = false
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.product_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_subscriptions s WHERE s.product_id = p.id
      );
  `);
}
