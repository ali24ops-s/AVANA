import { sql } from "drizzle-orm";

/**
 * Migration 0106: Presentation Generation Operations (Persistent Financial State Machine).
 *
 * Implements atomic concurrency control, crash recovery tracking, and persistent
 * debit/refund linkage for Presentation Assistant speech generation.
 *
 * Guarantees:
 * 1. Financial audit records are preserved (ON DELETE SET NULL / RESTRICT, never CASCADE).
 * 2. Partial unique index prevents duplicate active executions on the same slide.
 * 3. Dedicated fields track debit/refund transactions, timestamps, and recovery locks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS presentation_generation_operations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES presentation_projects(id) ON DELETE SET NULL,
      slide_id UUID REFERENCES presentation_slides(id) ON DELETE SET NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      batch_id UUID,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      cost_toman INTEGER NOT NULL DEFAULT 1500,
      debit_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      refund_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(255) NOT NULL,
      recovery_worker_id VARCHAR(128),
      recovery_locked_until TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      refunded_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pres_gen_ops_idempotency
      ON presentation_generation_operations (idempotency_key);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pres_gen_ops_active_slide
      ON presentation_generation_operations (slide_id)
      WHERE status IN ('pending', 'debited', 'generating', 'refund_pending');

    CREATE INDEX IF NOT EXISTS idx_pres_gen_ops_project_status
      ON presentation_generation_operations (project_id, status);

    CREATE INDEX IF NOT EXISTS idx_pres_gen_ops_batch
      ON presentation_generation_operations (batch_id);

    CREATE INDEX IF NOT EXISTS idx_pres_gen_ops_slide
      ON presentation_generation_operations (slide_id);

    CREATE INDEX IF NOT EXISTS idx_pres_gen_ops_status_started
      ON presentation_generation_operations (status, started_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS presentation_generation_operations CASCADE;
  `);
}
