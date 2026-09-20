import { sql } from "drizzle-orm";

/**
 * Migration 0049: Seed Canonical Wallet Top-up Product.
 *
 * Seeds the canonical \`wallet_topup\` system product in \`products\`:
 * - id: '44444444-4444-4444-8444-444444444444'
 * - code: 'wallet_topup'
 * - type: 'wallet_topup'
 * - title: 'شارژ کیف پول'
 * - description: 'افزایش موجودی و اعتبار کیف پول جهت استفاده از خدمات و تولید محتوای هوشمند'
 * - price: 0 (System placeholder: actual top-up amount is always dynamically specified by user input)
 * - currency: 'toman'
 * - target_type: 'wallet'
 * - target_id: NULL
 * - duration_days: NULL
 * - active: true
 * - metadata: {"isDynamicPrice": true}
 *
 * Idempotent (ON CONFLICT (code) DO UPDATE).
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
    VALUES (
      '44444444-4444-4444-8444-444444444444',
      'wallet_topup',
      'wallet_topup',
      'شارژ کیف پول',
      'افزایش موجودی و اعتبار کیف پول جهت استفاده از خدمات و تولید محتوای هوشمند',
      0,
      'toman',
      'wallet',
      NULL,
      NULL,
      true,
      '{"isDynamicPrice": true}'::jsonb,
      now(),
      now()
    )
    ON CONFLICT (code) DO UPDATE SET
      type = EXCLUDED.type,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      target_type = EXCLUDED.target_type,
      active = EXCLUDED.active,
      metadata = EXCLUDED.metadata,
      updated_at = now();
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DELETE FROM products WHERE code = 'wallet_topup';
  `);
}
