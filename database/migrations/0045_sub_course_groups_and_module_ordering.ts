import { sql } from 'drizzle-orm';

/**
 * Migration 0045: Sub-course groups and persistent module ordering.
 *
 * Creates:
 * 1. `sub_course_groups` table to categorize and group modules/chapters within a course.
 * 2. Adds `sub_course_group_id` column to `modules` table (ON DELETE SET NULL).
 * 3. Ensures deterministic sort_order backfill for all existing modules.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sub_course_groups (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_sub_course_groups_course_order
      ON sub_course_groups (course_id, sort_order);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_course_groups_course_id
      ON sub_course_groups (course_id, id);

    ALTER TABLE IF EXISTS modules
      ADD COLUMN IF NOT EXISTS sub_course_group_id uuid REFERENCES sub_course_groups(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_modules_sub_course_group
      ON modules (sub_course_group_id);

    -- Deterministic backfill for existing modules to ensure persistent 0-indexed sequences
    WITH ranked_modules AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY sort_order ASC, created_at ASC, id ASC) - 1 AS new_sort_order
      FROM modules
      WHERE deleted_at IS NULL
    )
    UPDATE modules
    SET sort_order = ranked_modules.new_sort_order
    FROM ranked_modules
    WHERE modules.id = ranked_modules.id;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_modules_sub_course_group;

    ALTER TABLE IF EXISTS modules
      DROP COLUMN IF EXISTS sub_course_group_id;

    DROP TABLE IF EXISTS sub_course_groups CASCADE;
  `);
}
