import { sql } from "drizzle-orm";

/**
 * Migration 0041: Add preview_lesson_id column to modules table.
 *
 * Provides a single persistent source of truth for the canonical preview lesson
 * of each chapter package / module. Backfills existing published modules with
 * their first eligible published lesson to maintain stability and prevent regression.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS modules 
      ADD COLUMN IF NOT EXISTS preview_lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_modules_preview_lesson 
      ON modules (preview_lesson_id);

    -- Backfill existing published modules with their current canonical lesson
    UPDATE modules m
    SET preview_lesson_id = (
      SELECT l.id
      FROM lessons l
      WHERE l.module_id = m.id
        AND l.deleted_at IS NULL
        AND l.publication_status = 'published'
      ORDER BY l.sort_order ASC, l.id ASC
      LIMIT 1
    )
    WHERE m.preview_lesson_id IS NULL
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM lessons l2
        WHERE l2.module_id = m.id
          AND l2.deleted_at IS NULL
          AND l2.publication_status = 'published'
      );
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_modules_preview_lesson;

    ALTER TABLE IF EXISTS modules 
      DROP COLUMN IF EXISTS preview_lesson_id;
  `);
}
