/* eslint-disable no-secrets/no-secrets */
import { sql } from "drizzle-orm";

/**
 * Migration 0113: Clinical Conflict Resolution Workflow & Logical Event Ordering.
 *
 * 1. Pre-flight data integrity checks (aborts without modifying rows if any
 *    invalid status, self-conflict, or duplicate active conflict pair exists).
 * 2. Creates shared `pocket_governance_event_seq` (CACHE 1) for strictly monotonic
 *    ordering between conflict resolutions and subsequent clinical votes.
 * 3. Adds `verification_seq` (nullable BIGINT) to `pocket_assertion_verifications`.
 * 4. Adds `recorded_by_user_id`, `resolved_by_user_id`, `resolved_at`,
 *    `resolution_notes`, and `resolution_seq` to `pocket_clinical_conflicts`.
 * 5. Enforces `chk_pocket_conflict_status` (`active_discrepancy`, `resolved`, `dismissed`),
 *    `chk_pocket_conflict_distinct_assertions` (`assertion_a_id <> assertion_b_id`),
 *    and partial unique index `uq_pocket_active_conflict_pair` on
 *    `(LEAST(assertion_a_id, assertion_b_id), GREATEST(assertion_a_id, assertion_b_id))`
 *    `WHERE status = 'active_discrepancy'`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    DO $$
    DECLARE
      v_invalid_statuses bigint;
      v_self_conflicts bigint;
      v_dup_active_pairs bigint;
    BEGIN
      SELECT COUNT(*) INTO v_invalid_statuses
      FROM pocket_clinical_conflicts
      WHERE status NOT IN ('active_discrepancy', 'resolved', 'dismissed');

      SELECT COUNT(*) INTO v_self_conflicts
      FROM pocket_clinical_conflicts
      WHERE assertion_a_id = assertion_b_id;

      SELECT COUNT(*) INTO v_dup_active_pairs
      FROM (
        SELECT
          LEAST(assertion_a_id, assertion_b_id) AS low_id,
          GREATEST(assertion_a_id, assertion_b_id) AS high_id
        FROM pocket_clinical_conflicts
        WHERE status = 'active_discrepancy'
        GROUP BY LEAST(assertion_a_id, assertion_b_id), GREATEST(assertion_a_id, assertion_b_id)
        HAVING COUNT(*) > 1
      ) dup;

      IF v_invalid_statuses > 0 OR v_self_conflicts > 0 OR v_dup_active_pairs > 0 THEN
        RAISE EXCEPTION
          'pocket_clinical_conflicts pre-check failed: invalid_statuses=%, self_conflicts=%, dup_active_pairs=%',
          v_invalid_statuses, v_self_conflicts, v_dup_active_pairs;
      END IF;
    END $$;

    CREATE SEQUENCE IF NOT EXISTS pocket_governance_event_seq
      AS BIGINT
      INCREMENT BY 1
      START WITH 1
      CACHE 1;

    ALTER TABLE pocket_assertion_verifications
      ADD COLUMN IF NOT EXISTS verification_seq BIGINT;

    ALTER TABLE pocket_clinical_conflicts
      ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
      ADD COLUMN IF NOT EXISTS resolution_seq BIGINT;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pocket_conflict_status'
      ) THEN
        ALTER TABLE pocket_clinical_conflicts
          ADD CONSTRAINT chk_pocket_conflict_status
          CHECK (status IN ('active_discrepancy', 'resolved', 'dismissed'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pocket_conflict_distinct_assertions'
      ) THEN
        ALTER TABLE pocket_clinical_conflicts
          ADD CONSTRAINT chk_pocket_conflict_distinct_assertions
          CHECK (assertion_a_id <> assertion_b_id);
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pocket_active_conflict_pair
      ON pocket_clinical_conflicts (
        LEAST(assertion_a_id, assertion_b_id),
        GREATEST(assertion_a_id, assertion_b_id)
      )
      WHERE status = 'active_discrepancy';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS uq_pocket_active_conflict_pair;

    ALTER TABLE pocket_clinical_conflicts
      DROP CONSTRAINT IF EXISTS chk_pocket_conflict_distinct_assertions,
      DROP CONSTRAINT IF EXISTS chk_pocket_conflict_status;

    ALTER TABLE pocket_clinical_conflicts
      DROP COLUMN IF EXISTS resolution_seq,
      DROP COLUMN IF EXISTS resolution_notes,
      DROP COLUMN IF EXISTS resolved_at,
      DROP COLUMN IF EXISTS resolved_by_user_id,
      DROP COLUMN IF EXISTS recorded_by_user_id;

    ALTER TABLE pocket_assertion_verifications
      DROP COLUMN IF EXISTS verification_seq;

    DROP SEQUENCE IF EXISTS pocket_governance_event_seq;
  `);
}
