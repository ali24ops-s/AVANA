import { sql } from "drizzle-orm";

/**
 * Migration 0047: Avana Credits & Wallet System.
 *
 * Creates:
 * 1. `wallets` table:
 *    - Single wallet per user (`user_id` unique FK)
 *    - Integer Toman balance (`balance >= 0` check constraint)
 * 2. `wallet_transactions` table:
 *    - Immutable ledger for all balance mutations
 *    - `amount > 0` check constraint
 *    - `idempotency_key` unique index
 *    - `balance_before` and `balance_after` accounting
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wallets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      balance integer NOT NULL DEFAULT 0,
      currency varchar(10) NOT NULL DEFAULT 'toman',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_wallets_balance_non_negative CHECK (balance >= 0)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(30) NOT NULL,
      amount integer NOT NULL,
      balance_before integer NOT NULL,
      balance_after integer NOT NULL,
      source varchar(50) NOT NULL,
      reference_type varchar(50) NOT NULL,
      reference_id varchar(255) NOT NULL,
      idempotency_key varchar(255) UNIQUE,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chk_wallet_tx_amount_positive CHECK (amount > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON wallet_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id ON wallet_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference ON wallet_transactions(reference_type, reference_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS wallet_transactions CASCADE;
    DROP TABLE IF EXISTS wallets CASCADE;
  `);
}
