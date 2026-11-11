import { sql } from "drizzle-orm";

/**
 * Migration 0096: User Personal Contents (Personal Summaries, Flashcards & Quizzes from Highlights/Notes).
 *
 * Creates table `user_personal_contents` to persist user-owned AI generations
 * based on user's own highlights and personal notes:
 * - Completely isolated from public course contents (generated_contents).
 * - Versioned monotonically per user and chapter (module).
 * - Tracks financial transaction (wallet_transactions) and auto-refund status.
 * - Persistent lease & heartbeat columns for concurrency control and crash recovery.
 * - Stores immutable input snapshot and item counts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_personal_contents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      content_type VARCHAR(30) NOT NULL DEFAULT 'review_summary',
      version INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      payload JSONB NOT NULL DEFAULT '{}',
      input_snapshot JSONB NOT NULL DEFAULT '{}',
      highlights_count INTEGER NOT NULL DEFAULT 0,
      notes_count INTEGER NOT NULL DEFAULT 0,
      cost_toman INTEGER NOT NULL DEFAULT 3000,
      transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      refund_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      refund_status VARCHAR(30) NOT NULL DEFAULT 'none',
      failure_reason TEXT,
      worker_id VARCHAR(100),
      heartbeat_at TIMESTAMPTZ,
      lease_expires_at TIMESTAMPTZ,
      idempotency_key VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_user_personal_contents_version 
        UNIQUE (user_id, module_id, content_type, version),
      CONSTRAINT uq_user_personal_contents_idempotency 
        UNIQUE (idempotency_key),
      CONSTRAINT chk_personal_content_status 
        CHECK (status IN ('pending', 'completed', 'failed')),
      CONSTRAINT chk_personal_content_type 
        CHECK (content_type IN ('review_summary', 'flashcard', 'quiz')),
      CONSTRAINT chk_personal_refund_status 
        CHECK (refund_status IN ('none', 'pending', 'refunded', 'failed'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_personal_contents_query 
      ON user_personal_contents (user_id, module_id, content_type, status, version DESC);

    CREATE INDEX IF NOT EXISTS idx_user_personal_contents_recovery 
      ON user_personal_contents (status, lease_expires_at) 
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS idx_user_personal_contents_tx
      ON user_personal_contents (transaction_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS user_personal_contents CASCADE;
  `);
}
