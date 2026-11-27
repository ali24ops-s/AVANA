import { sql } from "drizzle-orm";

/**
 * Migration 0109: Staging Question Review Lifecycle & Transfer Idempotency.
 *
 * Implements:
 * 1. studio_exam_generated_questions:
 *    - Preserves existing `is_accepted` boolean column and its data.
 *    - Adds `review_status` ('pending_review', 'accepted', 'rejected', 'transferred')
 *      with default 'pending_review' and explicit CHECK constraint.
 *    - Adds `transferred_question_id` (FK -> marketing_quiz_questions.id ON DELETE SET NULL)
 *      and `transferred_at` (timestamptz) to track transfer lineage.
 *    - Adds composite index (operation_id, review_status) for fast review filtering.
 * 2. marketing_quiz_questions:
 *    - Adds `source_staging_question_id` (FK -> studio_exam_generated_questions.id ON DELETE SET NULL).
 *    - Enforces physical DB idempotency via partial UNIQUE index:
 *      UNIQUE (source_staging_question_id) WHERE source_staging_question_id IS NOT NULL.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Extend studio_exam_generated_questions
    ALTER TABLE studio_exam_generated_questions
      ADD COLUMN IF NOT EXISTS review_status varchar(32) NOT NULL DEFAULT 'pending_review',
      ADD COLUMN IF NOT EXISTS transferred_question_id uuid REFERENCES marketing_quiz_questions(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_studio_gen_q_review_status'
      ) THEN
        ALTER TABLE studio_exam_generated_questions
          ADD CONSTRAINT chk_studio_gen_q_review_status
          CHECK (review_status IN ('pending_review', 'accepted', 'rejected', 'transferred'));
      END IF;
    END $$;

    -- Backfill any pre-existing accepted rows without altering is_accepted
    UPDATE studio_exam_generated_questions
    SET review_status = 'accepted'
    WHERE is_accepted = true AND review_status = 'pending_review';

    CREATE INDEX IF NOT EXISTS idx_studio_gen_q_op_review_status
      ON studio_exam_generated_questions (operation_id, review_status);

    CREATE INDEX IF NOT EXISTS idx_studio_gen_q_transferred_q
      ON studio_exam_generated_questions (transferred_question_id)
      WHERE transferred_question_id IS NOT NULL;

    -- 2. Extend marketing_quiz_questions with staging lineage and idempotent unique constraint
    ALTER TABLE marketing_quiz_questions
      ADD COLUMN IF NOT EXISTS source_staging_question_id uuid REFERENCES studio_exam_generated_questions(id) ON DELETE SET NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_quiz_q_staging_source
      ON marketing_quiz_questions (source_staging_question_id)
      WHERE source_staging_question_id IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS uq_marketing_quiz_q_staging_source;
    ALTER TABLE marketing_quiz_questions
      DROP COLUMN IF EXISTS source_staging_question_id;

    DROP INDEX IF EXISTS idx_studio_gen_q_transferred_q;
    DROP INDEX IF EXISTS idx_studio_gen_q_op_review_status;

    ALTER TABLE studio_exam_generated_questions
      DROP CONSTRAINT IF EXISTS chk_studio_gen_q_review_status,
      DROP COLUMN IF EXISTS transferred_at,
      DROP COLUMN IF EXISTS transferred_question_id,
      DROP COLUMN IF EXISTS review_status;
  `);
}
