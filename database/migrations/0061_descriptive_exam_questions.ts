import { sql } from "drizzle-orm";

/**
 * Migration 0061: Descriptive Exam Questions Support.
 *
 * 1. Adds question_type to teacher_exam_questions (defaults to 'single_choice').
 * 2. Makes options and correct_option_id nullable in teacher_exam_questions.
 * 3. Adds grading_status to teacher_exam_attempts (defaults to 'fully_graded').
 * 4. Adds text_answer, teacher_feedback, and grading_status to teacher_exam_attempt_answers.
 *
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_questions
    ADD COLUMN IF NOT EXISTS question_type varchar(30) NOT NULL DEFAULT 'single_choice';

    ALTER TABLE teacher_exam_questions
    ALTER COLUMN options DROP NOT NULL,
    ALTER COLUMN correct_option_id DROP NOT NULL;

    ALTER TABLE teacher_exam_attempts
    ADD COLUMN IF NOT EXISTS grading_status varchar(30) NOT NULL DEFAULT 'fully_graded';

    ALTER TABLE teacher_exam_attempt_answers
    ADD COLUMN IF NOT EXISTS text_answer text,
    ADD COLUMN IF NOT EXISTS teacher_feedback text,
    ADD COLUMN IF NOT EXISTS grading_status varchar(30) NOT NULL DEFAULT 'auto_graded';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE teacher_exam_attempt_answers
    DROP COLUMN IF EXISTS grading_status,
    DROP COLUMN IF EXISTS teacher_feedback,
    DROP COLUMN IF EXISTS text_answer;

    ALTER TABLE teacher_exam_attempts
    DROP COLUMN IF EXISTS grading_status;

    ALTER TABLE teacher_exam_questions
    DROP COLUMN IF EXISTS question_type;
  `);
}
