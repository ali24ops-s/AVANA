import { sql } from "drizzle-orm";

/**
 * Migration 0102: AVANA Studio & Marketing Quizzes Module.
 *
 * Implements:
 * 1. marketing_quizzes table:
 *    - Standalone marketing quizzes with public non-guessable slug
 *    - Lifecycle statuses: draft, published, disabled
 *    - Metadata, cover image, CTA configurations
 * 2. marketing_question_bank table:
 *    - Reusable question bank across marketing campaigns
 *    - Sources from courses, AI generation, or manual creation
 * 3. marketing_quiz_questions table:
 *    - Independent snapshot of questions, choices, correct answers and explanations
 *    - Safe foreign keys with ON DELETE SET NULL on source questions
 * 4. marketing_quiz_attempts table:
 *    - Guest-friendly and authenticated attempts
 *    - Independent attemptToken for private result lookup
 *    - Optional idempotency_key for safe retry submissions
 *    - Stores backend-calculated scores and counts (immutable once completed)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marketing_quizzes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
      slug varchar(64) NOT NULL UNIQUE,
      title varchar(255) NOT NULL,
      description text,
      cover_image_url text,
      status varchar(20) NOT NULL DEFAULT 'draft',
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_quizzes_slug
      ON marketing_quizzes (slug)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_marketing_quizzes_status
      ON marketing_quizzes (status)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_marketing_quizzes_org_created
      ON marketing_quizzes (organization_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS marketing_question_bank (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
      source_type varchar(30) NOT NULL DEFAULT 'manual',
      source_question_id uuid REFERENCES quiz_questions(id) ON DELETE SET NULL,
      source_course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      question text NOT NULL,
      choices jsonb NOT NULL,
      correct_answer jsonb NOT NULL,
      explanation text,
      difficulty varchar(20) NOT NULL DEFAULT 'medium',
      topic varchar(255),
      question_type varchar(50) NOT NULL DEFAULT 'multiple_choice',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_qbank_topic
      ON marketing_question_bank (topic)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_marketing_qbank_difficulty
      ON marketing_question_bank (difficulty)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS marketing_quiz_questions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      marketing_quiz_id uuid NOT NULL REFERENCES marketing_quizzes(id) ON DELETE CASCADE,
      source_question_id uuid REFERENCES quiz_questions(id) ON DELETE SET NULL,
      source_bank_question_id uuid REFERENCES marketing_question_bank(id) ON DELETE SET NULL,
      question text NOT NULL,
      choices jsonb NOT NULL,
      correct_answer jsonb NOT NULL,
      explanation text,
      difficulty varchar(20) NOT NULL DEFAULT 'medium',
      topic varchar(255),
      question_type varchar(50) NOT NULL DEFAULT 'multiple_choice',
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_quiz_questions_quiz_order
      ON marketing_quiz_questions (marketing_quiz_id, sort_order ASC);

    CREATE TABLE IF NOT EXISTS marketing_quiz_attempts (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      marketing_quiz_id uuid NOT NULL REFERENCES marketing_quizzes(id) ON DELETE CASCADE,
      attempt_token varchar(64) NOT NULL UNIQUE,
      idempotency_key varchar(128),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      status varchar(20) NOT NULL DEFAULT 'completed',
      score numeric(5, 2) NOT NULL DEFAULT '0',
      correct_count integer NOT NULL DEFAULT 0,
      wrong_count integer NOT NULL DEFAULT 0,
      total_questions integer NOT NULL DEFAULT 0,
      answers jsonb NOT NULL DEFAULT '{}'::jsonb,
      question_snapshots jsonb,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_marketing_quiz_attempts_quiz_idempotency UNIQUE (marketing_quiz_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_quiz_attempts_quiz_time
      ON marketing_quiz_attempts (marketing_quiz_id, completed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_marketing_quiz_attempts_token
      ON marketing_quiz_attempts (attempt_token);
  `);
}
