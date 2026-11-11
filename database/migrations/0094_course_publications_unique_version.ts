import { sql } from "drizzle-orm";

/**
 * Migration 0094: Unique course publication version per course across all non-deleted statuses.
 *
 * Enforces UNIQUE (course_id, version) WHERE deleted_at IS NULL across all statuses
 * (pending_review, published, unpublished, superseded, rejected, changes_requested)
 * to strictly prevent duplicate version generation and historical version reuse under high concurrency.
 *
 * Pre-checks for any existing duplicates without destructive data removal.
 * Safely drops any previous partial index and recreates the full invariant index.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  // 1. Identify existing duplicate (course_id, version) groups across non-deleted rows.
  // Abort cleanly with an informative error rather than silently or destructively removing data.
  await db.execute(sql`
    DO $$
    DECLARE
      dup_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO dup_count
      FROM (
        SELECT course_id, version
        FROM course_publications
        WHERE deleted_at IS NULL
        GROUP BY course_id, version
        HAVING COUNT(*) > 1
      ) dups;

      IF dup_count > 0 THEN
        RAISE EXCEPTION 'Migration 0094 aborted: % duplicate (course_id, version) groups found in course_publications where deleted_at IS NULL. Manual data remediation required.', dup_count;
      END IF;
    END $$;
  `);

  // 2. Safely drop previous index if it exists with older partial predicate
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_course_publications_course_version;
  `);

  // 3. Recreate unique index covering ALL non-deleted rows
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_course_publications_course_version
      ON course_publications (course_id, version)
      WHERE deleted_at IS NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_course_publications_course_version;
  `);
}
