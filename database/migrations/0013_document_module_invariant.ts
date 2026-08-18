import { sql } from "drizzle-orm";

/**
 * Migration 0013: Document-to-Module database invariant.
 *
 * 1. Adds `document_id` foreign key column to `modules` table.
 * 2. Backfills `document_id` on existing modules from `generated_contents`.
 * 3. Deduplicates historical duplicate modules per `(course_id, document_id)` by remapping
 *    lessons/quizzes to the authoritative module and soft-deleting duplicate shell modules.
 * 4. Adds unique index `idx_modules_course_document_unique` on `(course_id, document_id)`
 *    to prevent duplicate active modules per document at the database engine level.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE modules
      ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

    -- Backfill document_id on existing modules from materialized generated_contents
    UPDATE modules m
    SET document_id = sub.document_id
    FROM (
      SELECT DISTINCT l.module_id, gc.document_id
      FROM generated_contents gc
      JOIN lessons l ON l.id = gc.materialized_lesson_id
      WHERE gc.materialized_lesson_id IS NOT NULL
        AND gc.deleted_at IS NULL
        AND l.deleted_at IS NULL
    ) sub
    WHERE m.id = sub.module_id AND m.document_id IS NULL;

    -- Backfill document_id from quiz_questions & lessons if not set
    UPDATE modules m
    SET document_id = sub.document_id
    FROM (
      SELECT DISTINCT l.module_id, q.document_id
      FROM quizzes q
      JOIN quiz_questions qq ON qq.quiz_id = q.id
      JOIN lessons l ON l.id = qq.lesson_id
      WHERE q.document_id IS NOT NULL
        AND q.deleted_at IS NULL
        AND l.deleted_at IS NULL
    ) sub
    WHERE m.id = sub.module_id AND m.document_id IS NULL;

    -- Deduplicate historical duplicate modules before creating unique index
    DO $$
    DECLARE
      dup RECORD;
      auth_module_id UUID;
    BEGIN
      FOR dup IN
        SELECT course_id, document_id, COUNT(*) as cnt
        FROM modules
        WHERE deleted_at IS NULL AND document_id IS NOT NULL
        GROUP BY course_id, document_id
        HAVING COUNT(*) > 1
      LOOP
        -- Pick authoritative module (the one with most lessons or earliest created_at)
        SELECT m.id INTO auth_module_id
        FROM modules m
        LEFT JOIN lessons l ON l.module_id = m.id AND l.deleted_at IS NULL
        WHERE m.course_id = dup.course_id
          AND m.document_id = dup.document_id
          AND m.deleted_at IS NULL
        GROUP BY m.id, m.created_at
        ORDER BY COUNT(l.id) DESC, m.created_at ASC
        LIMIT 1;

        -- Remap lessons from duplicate modules to authoritative module
        UPDATE lessons
        SET module_id = auth_module_id
        WHERE module_id IN (
          SELECT id FROM modules
          WHERE course_id = dup.course_id
            AND document_id = dup.document_id
            AND id <> auth_module_id
            AND deleted_at IS NULL
        );

        -- Soft-delete secondary duplicate modules
        UPDATE modules
        SET deleted_at = NOW()
        WHERE course_id = dup.course_id
          AND document_id = dup.document_id
          AND id <> auth_module_id
          AND deleted_at IS NULL;
      END LOOP;
    END $$;

    -- Unique index enforcing ONE active Module per Document in a Course
    CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_course_document_unique
      ON modules (course_id, document_id)
      WHERE deleted_at IS NULL AND document_id IS NOT NULL;
  `);
}
