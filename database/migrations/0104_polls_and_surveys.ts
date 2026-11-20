import { sql } from "drizzle-orm";

/**
 * Migration 0104: AVANA Studio Polls & Surveys Module.
 *
 * Implements:
 * 1. polls table:
 *    - Standalone marketing polls and surveys with public unique slug
 *    - Statuses: draft, published, closed, archived
 *    - Configurable settings, start/end dates, cover image, and soft-delete
 * 2. poll_questions table:
 *    - Questions tied to poll with ON DELETE CASCADE
 *    - Types: single_choice, multiple_choice, short_text
 *    - Ordering, required flags, and min/max choice constraints
 * 3. poll_options table:
 *    - Choices for single and multiple choice questions with ON DELETE CASCADE
 *    - Ordering and option text
 * 4. poll_responses table:
 *    - Session/participation records
 *    - participant_id: HMAC-SHA256 salted hash of participant token (raw token is never stored)
 *    - Unique constraint on (poll_id, participant_id) preventing repeat votes
 *    - Optional user_id (if authenticated) and hashed IP
 * 5. poll_answers table:
 *    - Normalized answer record per question for each response
 *    - Unique constraint on (response_id, question_id) ensuring at most one answer per question
 *    - Stores text_answer for short_text questions
 * 6. poll_answer_options table:
 *    - Relational junction table for selected option choices (single & multiple choice)
 *    - Enables ultra-fast SQL aggregation without JSONB parsing
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. polls table
    CREATE TABLE IF NOT EXISTS polls (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
      slug varchar(64) NOT NULL UNIQUE,
      title varchar(255) NOT NULL,
      description text,
      cover_image_url text,
      status varchar(20) NOT NULL DEFAULT 'draft',
      starts_at timestamptz,
      ends_at timestamptz,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_polls_slug
      ON polls (slug)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_polls_status
      ON polls (status)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_polls_org_created
      ON polls (organization_id, created_at DESC);

    -- 2. poll_questions table
    CREATE TABLE IF NOT EXISTS poll_questions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      question_text text NOT NULL,
      description text,
      question_type varchar(30) NOT NULL,
      is_required boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      min_choices integer,
      max_choices integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_poll_questions_poll_order
      ON poll_questions (poll_id, sort_order ASC);

    -- 3. poll_options table
    CREATE TABLE IF NOT EXISTS poll_options (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      question_id uuid NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
      option_text varchar(500) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_poll_options_question_order
      ON poll_options (question_id, sort_order ASC);

    -- 4. poll_responses table
    CREATE TABLE IF NOT EXISTS poll_responses (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      poll_id uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      participant_id varchar(64) NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      ip_hash varchar(64),
      user_agent text,
      completed_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_poll_responses_poll_participant UNIQUE (poll_id, participant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_time
      ON poll_responses (poll_id, completed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_poll_responses_participant
      ON poll_responses (participant_id);

    -- 5. poll_answers table
    CREATE TABLE IF NOT EXISTS poll_answers (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      response_id uuid NOT NULL REFERENCES poll_responses(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
      text_answer text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_poll_answers_response_question UNIQUE (response_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_poll_answers_response
      ON poll_answers (response_id);

    CREATE INDEX IF NOT EXISTS idx_poll_answers_question
      ON poll_answers (question_id);

    -- 6. poll_answer_options table
    CREATE TABLE IF NOT EXISTS poll_answer_options (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      answer_id uuid NOT NULL REFERENCES poll_answers(id) ON DELETE CASCADE,
      option_id uuid NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
      CONSTRAINT uq_poll_answer_options_answer_option UNIQUE (answer_id, option_id)
    );

    CREATE INDEX IF NOT EXISTS idx_poll_answer_options_answer
      ON poll_answer_options (answer_id);

    CREATE INDEX IF NOT EXISTS idx_poll_answer_options_option
      ON poll_answer_options (option_id);
  `);
}
