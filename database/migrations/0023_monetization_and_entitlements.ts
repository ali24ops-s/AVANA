import { sql } from "drizzle-orm";

/**
 * Migration 0023: Monetization, Subscriptions, and Entitlements.
 *
 * Adds 5 core commerce tables:
 * 1. products — Sellable catalog items (subscriptions, content packs, courses)
 * 2. orders — Purchase intents with pricing in Tomans
 * 3. payments — Payment gateway transactions & verification metadata
 * 4. user_subscriptions — Business record and subscription history
 * 5. user_entitlements — Unified runtime access ledger (subscriptions & permanent lifetime ownership)
 *
 * Enforces data integrity:
 * - resource_id MUST BE NULL for 'subscription'
 * - resource_id MUST BE NOT NULL for 'course' and 'content_pack'
 * - Single lifetime entitlement per user per resource (unique index on expires_at IS NULL)
 * - Seeds standard subscription products (monthly, quarterly, yearly)
 *
 * Idempotent (IF NOT EXISTS) for safe execution.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Create products table
    CREATE TABLE IF NOT EXISTS products (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      code varchar(100) NOT NULL UNIQUE,
      type varchar(50) NOT NULL,
      title varchar(255) NOT NULL,
      description text,
      price integer NOT NULL,
      currency varchar(10) NOT NULL DEFAULT 'toman',
      target_type varchar(50),
      target_id uuid,
      duration_days integer,
      active boolean NOT NULL DEFAULT true,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_products_type_active ON products(type, active);
    CREATE INDEX IF NOT EXISTS idx_products_target ON products(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);

    -- 2. Create orders table
    CREATE TABLE IF NOT EXISTS orders (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      order_number varchar(50) NOT NULL UNIQUE,
      amount integer NOT NULL,
      currency varchar(10) NOT NULL DEFAULT 'toman',
      status varchar(30) NOT NULL DEFAULT 'pending',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);

    -- 3. Create payments table
    CREATE TABLE IF NOT EXISTS payments (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount integer NOT NULL,
      currency varchar(10) NOT NULL DEFAULT 'toman',
      gateway varchar(50) NOT NULL DEFAULT 'zarinpal',
      authority varchar(255),
      transaction_id varchar(255),
      status varchar(30) NOT NULL DEFAULT 'pending',
      idempotency_key varchar(255) UNIQUE,
      raw_callback_metadata jsonb,
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_authority ON payments(authority);
    CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

    -- 4. Create user_subscriptions table (Business record & history)
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      status varchar(30) NOT NULL DEFAULT 'active',
      started_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_user_subs_user_status ON user_subscriptions(user_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_subs_product ON user_subscriptions(product_id);

    -- 5. Create user_entitlements table (Runtime access ledger)
    CREATE TABLE IF NOT EXISTS user_entitlements (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource_type varchar(50) NOT NULL,
      resource_id uuid,
      source_type varchar(50) NOT NULL DEFAULT 'purchase',
      order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
      starts_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_user_entitlements_resource_id CHECK (
        (resource_type = 'subscription' AND resource_id IS NULL) OR
        (resource_type IN ('course', 'content_pack') AND resource_id IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_lifetime_unique
      ON user_entitlements(user_id, resource_type, resource_id)
      WHERE expires_at IS NULL AND resource_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_subscription_lifetime_unique
      ON user_entitlements(user_id, resource_type)
      WHERE expires_at IS NULL AND resource_type = 'subscription';

    CREATE INDEX IF NOT EXISTS idx_user_entitlements_lookup
      ON user_entitlements(user_id, resource_type, resource_id, expires_at);

    CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_expires
      ON user_entitlements(user_id, expires_at);

    -- 6. Seed initial standard subscription products
    INSERT INTO products (code, type, title, description, price, currency, target_type, duration_days, active)
    VALUES
      ('sub_monthly', 'subscription', 'اشتراک ماهانه آوانا', 'دسترسی کامل یک‌ماهه به تمام محتوای ویژه و دستیار هوشمند آوانا', 99000, 'toman', 'plan', 30, true),
      ('sub_quarterly', 'subscription', 'اشتراک سه‌ماهه آوانا', 'دسترسی کامل سه‌ماهه به تمام محتوای ویژه و دستیار هوشمند آوانا', 199000, 'toman', 'plan', 90, true),
      ('sub_yearly', 'subscription', 'اشتراک سالانه آوانا', 'دسترسی کامل دوازده‌ماهه به تمام محتوای ویژه و دستیار هوشمند آوانا با بیشترین تخفیف', 599000, 'toman', 'plan', 365, true)
    ON CONFLICT (code) DO NOTHING;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS user_entitlements CASCADE;
    DROP TABLE IF EXISTS user_subscriptions CASCADE;
    DROP TABLE IF EXISTS payments CASCADE;
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS products CASCADE;
  `);
}
