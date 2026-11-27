/* eslint-disable no-secrets/no-secrets */
import { sql } from "drizzle-orm";

/**
 * Migration 0110: Multi-Reviewer Verification Parent Chain Integrity.
 *
 * Hardens `pocket_assertion_verifications` so each (assertion_id, reviewer_user_id)
 * forms a strictly linear, append-only, single-root, fork-free verification chain:
 *
 * 1. Pre-flight data integrity verification (aborts without modifying rows if any
 *    orphan, fork, multi-root, cross-assertion/cross-reviewer parent, or self-reference exists).
 * 2. `uq_assertion_verification_triad`: UNIQUE (id, assertion_id, reviewer_user_id)
 *    to support composite foreign key integrity.
 * 3. `fk_verif_parent_same_assertion_reviewer`: Composite FK on
 *    (parent_verification_id, assertion_id, reviewer_user_id) referencing
 *    pocket_assertion_verifications(id, assertion_id, reviewer_user_id) ON DELETE RESTRICT.
 * 4. `uq_pocket_verif_single_child`: Partial UNIQUE index on (parent_verification_id)
 *    WHERE parent_verification_id IS NOT NULL (prevents forks).
 * 5. `uq_pocket_verif_single_root_per_reviewer`: Partial UNIQUE index on
 *    (assertion_id, reviewer_user_id) WHERE parent_verification_id IS NULL
 *    (prevents multiple roots per reviewer on an assertion).
 * 6. `idx_pocket_verif_latest_lookup`: Covering lookup index on
 *    (assertion_id, reviewer_user_id, verified_at DESC, id DESC) for deterministic
 *    latest-vote resolution.
 * 7. `chk_pocket_verif_no_self_parent`: CHECK (parent_verification_id IS NULL OR
 *    parent_verification_id <> id).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    DO $$
    DECLARE
      v_orphans bigint;
      v_cross_parents bigint;
      v_forks bigint;
      v_multi_roots bigint;
      v_self_refs bigint;
    BEGIN
      SELECT COUNT(*) INTO v_orphans
      FROM pocket_assertion_verifications v
      LEFT JOIN pocket_assertion_verifications p
        ON p.id = v.parent_verification_id
      WHERE v.parent_verification_id IS NOT NULL
        AND p.id IS NULL;

      SELECT COUNT(*) INTO v_cross_parents
      FROM pocket_assertion_verifications v
      JOIN pocket_assertion_verifications p
        ON p.id = v.parent_verification_id
      WHERE p.assertion_id <> v.assertion_id
         OR p.reviewer_user_id <> v.reviewer_user_id;

      SELECT COUNT(*) INTO v_forks
      FROM (
        SELECT parent_verification_id
        FROM pocket_assertion_verifications
        WHERE parent_verification_id IS NOT NULL
        GROUP BY parent_verification_id
        HAVING COUNT(*) > 1
      ) f;

      SELECT COUNT(*) INTO v_multi_roots
      FROM (
        SELECT assertion_id, reviewer_user_id
        FROM pocket_assertion_verifications
        WHERE parent_verification_id IS NULL
        GROUP BY assertion_id, reviewer_user_id
        HAVING COUNT(*) > 1
      ) mr;

      SELECT COUNT(*) INTO v_self_refs
      FROM pocket_assertion_verifications
      WHERE parent_verification_id = id;

      IF v_orphans > 0
         OR v_cross_parents > 0
         OR v_forks > 0
         OR v_multi_roots > 0
         OR v_self_refs > 0 THEN
        RAISE EXCEPTION
          'pocket_assertion_verifications chain integrity pre-check failed: orphans=%, cross_parents=%, forks=%, multi_roots=%, self_refs=%',
          v_orphans, v_cross_parents, v_forks, v_multi_roots, v_self_refs;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_verification_triad
      ON pocket_assertion_verifications (id, assertion_id, reviewer_user_id);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_verif_parent_same_assertion_reviewer'
          AND conrelid = 'pocket_assertion_verifications'::regclass
      ) THEN
        ALTER TABLE pocket_assertion_verifications
          ADD CONSTRAINT fk_verif_parent_same_assertion_reviewer
          FOREIGN KEY (parent_verification_id, assertion_id, reviewer_user_id)
          REFERENCES pocket_assertion_verifications (id, assertion_id, reviewer_user_id)
          ON DELETE RESTRICT;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pocket_verif_single_child
      ON pocket_assertion_verifications (parent_verification_id)
      WHERE parent_verification_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pocket_verif_single_root_per_reviewer
      ON pocket_assertion_verifications (assertion_id, reviewer_user_id)
      WHERE parent_verification_id IS NULL;

    CREATE INDEX IF NOT EXISTS idx_pocket_verif_latest_lookup
      ON pocket_assertion_verifications (assertion_id, reviewer_user_id, verified_at DESC, id DESC);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_pocket_verif_no_self_parent'
          AND conrelid = 'pocket_assertion_verifications'::regclass
      ) THEN
        ALTER TABLE pocket_assertion_verifications
          ADD CONSTRAINT chk_pocket_verif_no_self_parent
          CHECK (parent_verification_id IS NULL OR parent_verification_id <> id);
      END IF;
    END $$;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE pocket_assertion_verifications
      DROP CONSTRAINT IF EXISTS chk_pocket_verif_no_self_parent;

    DROP INDEX IF EXISTS idx_pocket_verif_latest_lookup;

    DROP INDEX IF EXISTS uq_pocket_verif_single_root_per_reviewer;

    DROP INDEX IF EXISTS uq_pocket_verif_single_child;

    ALTER TABLE pocket_assertion_verifications
      DROP CONSTRAINT IF EXISTS fk_verif_parent_same_assertion_reviewer;

    DROP INDEX IF EXISTS uq_assertion_verification_triad;
  `);
}
