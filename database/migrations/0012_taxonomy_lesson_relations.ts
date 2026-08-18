import { sql } from "drizzle-orm";

/**
 * Migration 0012: Direct Lesson relations for Flashcards and Quiz Questions.
 *
 * 1. Adds `lesson_id` foreign key column to `flashcards` and `quiz_questions`.
 * 2. Adds indices on `lesson_id` for query optimization.
 * 3. Backfills `lesson_id` 100% deterministically from `generated_contents.materialized_lesson_id`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE flashcards
      ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;

    ALTER TABLE quiz_questions
      ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_flashcards_lesson ON flashcards (lesson_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_lesson ON quiz_questions (lesson_id);

    -- 100% Deterministic Backfill for Flashcards
    UPDATE flashcards f
    SET lesson_id = (
      SELECT gc.materialized_lesson_id
      FROM generated_contents gc
      WHERE gc.id = f.generated_content_id
        AND gc.materialized_lesson_id IS NOT NULL
      LIMIT 1
    )
    WHERE f.lesson_id IS NULL AND f.generated_content_id IS NOT NULL;

    UPDATE flashcards f
    SET lesson_id = (
      SELECT gc.materialized_lesson_id
      FROM generated_contents gc
      WHERE gc.document_id = f.document_id
        AND gc.type = 'lesson'
        AND gc.materialized_lesson_id IS NOT NULL
      LIMIT 1
    )
    WHERE f.lesson_id IS NULL AND f.document_id IS NOT NULL;

    -- 100% Deterministic Backfill for Quiz Questions
    UPDATE quiz_questions qq
    SET lesson_id = (
      SELECT gc.materialized_lesson_id
      FROM generated_contents gc
      WHERE gc.id = qq.generated_content_id
        AND gc.materialized_lesson_id IS NOT NULL
      LIMIT 1
    )
    WHERE qq.lesson_id IS NULL AND qq.generated_content_id IS NOT NULL;

    UPDATE quiz_questions qq
    SET lesson_id = (
      SELECT gc.materialized_lesson_id
      FROM quizzes q
      JOIN generated_contents gc ON gc.document_id = q.document_id
      WHERE q.id = qq.quiz_id
        AND gc.type = 'lesson'
        AND gc.materialized_lesson_id IS NOT NULL
      LIMIT 1
    )
    WHERE qq.lesson_id IS NULL AND qq.quiz_id IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_quiz_questions_lesson;
    DROP INDEX IF EXISTS idx_flashcards_lesson;

    ALTER TABLE quiz_questions
      DROP COLUMN IF EXISTS lesson_id;

    ALTER TABLE flashcards
      DROP COLUMN IF EXISTS lesson_id;
  `);
}
