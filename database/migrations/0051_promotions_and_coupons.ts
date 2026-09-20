import { sql } from "drizzle-orm";

/**
 * Migration 0051: Promotions, Coupon Codes, Restrictions, and Redemption Ledger.
 *
 * Implements:
 * 1. promotions table (Core campaign rules, benefit types, limits, validity windows)
 * 2. promotion_codes table (Normalized coupon codes with partial unique index for soft-deletes)
 * 3. promotion_products table (Relational product / product_type restrictions)
 * 4. promotion_users table (Relational user whitelists)
 * 5. promotion_redemptions table (Immutable financial snapshot ledger and lazy reservation expiry)
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Promotions table
    CREATE TABLE IF NOT EXISTS promotions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name varchar(255) NOT NULL,
      description text,
      benefit_type varchar(50) NOT NULL,
      benefit_value integer NOT NULL,
      max_discount_amount integer,
      min_order_amount integer,
      total_usage_limit integer,
      per_user_usage_limit integer,
      active boolean NOT NULL DEFAULT true,
      starts_at timestamptz,
      ends_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_promotions_active_dates
      ON promotions (active, starts_at, ends_at)
      WHERE deleted_at IS NULL;

    -- 2. Promotion Codes table
    CREATE TABLE IF NOT EXISTS promotion_codes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      code varchar(100) NOT NULL,
      max_uses integer,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_promotion_codes_promotion_id
      ON promotion_codes (promotion_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_codes_unique_active
      ON promotion_codes (UPPER(code))
      WHERE deleted_at IS NULL;

    -- 3. Promotion Products table
    CREATE TABLE IF NOT EXISTS promotion_products (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      product_id uuid REFERENCES products(id) ON DELETE CASCADE,
      product_type varchar(50),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_promotion_products_target CHECK (product_id IS NOT NULL OR product_type IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_promotion_products_lookup
      ON promotion_products (promotion_id, product_id, product_type);

    -- 4. Promotion Users table
    CREATE TABLE IF NOT EXISTS promotion_users (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_promotion_users UNIQUE (promotion_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_promotion_users_lookup
      ON promotion_users (promotion_id, user_id);

    -- 5. Promotion Redemptions table
    CREATE TABLE IF NOT EXISTS promotion_redemptions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      code_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
      benefit_type varchar(50) NOT NULL,
      benefit_value integer NOT NULL,
      discount_amount integer NOT NULL DEFAULT 0,
      cashback_amount integer NOT NULL DEFAULT 0,
      order_original_amount integer NOT NULL,
      order_final_amount integer NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending',
      reservation_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
      promotion_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      redeemed_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_redemptions_order_id
      ON promotion_redemptions (order_id);

    CREATE INDEX IF NOT EXISTS idx_redemptions_user_promotion
      ON promotion_redemptions (user_id, promotion_id, status);

    CREATE INDEX IF NOT EXISTS idx_redemptions_status_expires
      ON promotion_redemptions (status, reservation_expires_at);

    CREATE INDEX IF NOT EXISTS idx_redemptions_promotion_active
      ON promotion_redemptions (promotion_id, status);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS promotion_redemptions;
    DROP TABLE IF EXISTS promotion_users;
    DROP TABLE IF EXISTS promotion_products;
    DROP TABLE IF EXISTS promotion_codes;
    DROP TABLE IF EXISTS promotions;
  `);
}
