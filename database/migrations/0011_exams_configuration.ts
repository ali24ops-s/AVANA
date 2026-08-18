import { sql } from "drizzle-orm";

/**
 * Migration 0011: Exams Configuration & Question Snapshot support.
 *
 * 1. Adds `topic` and `difficulty` to `quizzes` and `quiz_questions`.
 * 2. Makes `document_id` on `quizzes` and `quiz_id` on `quiz_attempts` nullable for flexible custom exam configs.
 * 3. Adds `question_ids`, `topic`, `difficulty`, and `status` to `quiz_attempts` for immutable attempt snapshots.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE quizzes
      ALTER COLUMN document_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS topic varchar(255),
      ADD COLUMN IF NOT EXISTS difficulty varchar(20) DEFAULT 'medium';

    ALTER TABLE quiz_questions
      ADD COLUMN IF NOT EXISTS topic varchar(255),
      ADD COLUMN IF NOT EXISTS difficulty varchar(20) DEFAULT 'medium';

    ALTER TABLE quiz_attempts
      ALTER COLUMN quiz_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS question_ids jsonb,
      ADD COLUMN IF NOT EXISTS topic varchar(255),
      ADD COLUMN IF NOT EXISTS difficulty varchar(20),
      ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'in_progress';

    CREATE INDEX IF NOT EXISTS idx_quiz_questions_topic ON quiz_questions (topic);
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_difficulty ON quiz_questions (difficulty);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_quiz_questions_difficulty;
    DROP INDEX IF EXISTS idx_quiz_questions_topic;

    ALTER TABLE quiz_attempts
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS topic,
      DROP COLUMN IF EXISTS question_ids;

    ALTER TABLE quiz_questions
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS topic;

    ALTER TABLE quizzes
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS topic;
  `);
}
