/* eslint-disable no-secrets/no-secrets */
import { sql } from "drizzle-orm";

/**
 * Migration 0111: Published Assertion Root Uniqueness.
 *
 * Guarantees at the PostgreSQL layer that at most one row per `assertion_root_id`
 * can hold `status = 'published'` at any point in time:
 *
 * 1. Pre-flight check: aborts without modifying or deleting any historical rows
 *    if any `assertion_root_id` currently has more than one `published` row.
 * 2. `uq_pocket_published_assertion_root`: Partial UNIQUE index on
 *    `(assertion_root_id) WHERE status = 'published'`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    DO $$
    DECLARE
      v_dup_published_roots bigint;
    BEGIN
      SELECT COUNT(*) INTO v_dup_published_roots
      FROM (
        SELECT assertion_root_id
        FROM pocket_scientific_assertions
        WHERE status = 'published'
        GROUP BY assertion_root_id
        HAVING COUNT(*) > 1
      ) dup;

      IF v_dup_published_roots > 0 THEN
        RAISE EXCEPTION
          'pocket_scientific_assertions published uniqueness pre-check failed: % assertion_root_id(s) have multiple published rows',
          v_dup_published_roots;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pocket_published_assertion_root
      ON pocket_scientific_assertions (assertion_root_id)
      WHERE status = 'published';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS uq_pocket_published_assertion_root;
  `);
}
