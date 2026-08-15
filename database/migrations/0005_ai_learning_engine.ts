import { sql } from "drizzle-orm";

/**
 * PR6-1 — AI Learning Engine schema foundation.
 *
 * Creates the additive schema for the AI learning engine described in
 * docs/SPRINT_06_AI_LEARNING_ENGINE_PROPOSAL.md §3:
 *
 *   - documents              (uploaded originals + lifecycle state)
 *   - document_chunks        (semantic chunks; citation basis)
 *   - generated_contents     (AI draft items: lesson/flashcard/quiz/recommendation)
 *   - generated_content_citations (join: generated content → source chunks)
 *   - flashcards             (accepted cards)
 *   - flashcard_reviews      (spaced-repetition review history)
 *   - quizzes                (accepted quizzes)
 *   - quiz_questions         (questions belonging to a quiz)
 *   - quiz_attempts          (student attempts + answers)
 *
 * All tables are additive and independent of existing rows. The migration is
 * idempotent (IF NOT EXISTS) for safe re-application during development.
 *
 * No application code, APIs, workers, or AI integration in this PR.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- ============================================================
    -- Documents
    -- The uploaded original and its lifecycle state.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS documents (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_name varchar(255) NOT NULL,
      mime_type varchar(100) NOT NULL,
      size_bytes integer NOT NULL,
      sha256 char(64) NOT NULL,
      storage_key varchar(500) NOT NULL,
      page_count integer,
      status varchar(30) NOT NULL DEFAULT 'uploaded',
      error_code varchar(100),
      retry_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_hash
      ON documents (organization_id, sha256);

    CREATE INDEX IF NOT EXISTS idx_documents_org_course
      ON documents (organization_id, course_id);

    CREATE INDEX IF NOT EXISTS idx_documents_owner_user
      ON documents (owner_user_id);

    CREATE INDEX IF NOT EXISTS idx_documents_status
      ON documents (status);

    -- ============================================================
    -- Document Chunks
    -- Semantic chunks produced by the chunking stage.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS document_chunks (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      sequence integer NOT NULL,
      heading varchar(500),
      content text NOT NULL,
      start_page integer NOT NULL DEFAULT 1,
      end_page integer NOT NULL DEFAULT 1,
      token_estimate integer NOT NULL DEFAULT 0,
      content_hash char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_doc_sequence
      ON document_chunks (document_id, sequence);

    CREATE INDEX IF NOT EXISTS idx_document_chunks_document
      ON document_chunks (document_id);

    CREATE INDEX IF NOT EXISTS idx_document_chunks_org_hash
      ON document_chunks (organization_id, content_hash);

    -- ============================================================
    -- Generated Contents
    -- Every AI-produced draft item, regardless of type.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS generated_contents (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      type varchar(30) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'draft',
      payload jsonb NOT NULL DEFAULT '{}',
      prompt_version varchar(50),
      model varchar(100),
      token_usage jsonb,
      accepted_at timestamptz,
      accepted_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_generated_contents_org_doc_type
      ON generated_contents (organization_id, document_id, type);

    CREATE INDEX IF NOT EXISTS idx_generated_contents_org_course_status
      ON generated_contents (organization_id, course_id, status);

    CREATE INDEX IF NOT EXISTS idx_generated_contents_status
      ON generated_contents (status);

    -- ============================================================
    -- Generated Content Citations
    -- Join table enforcing the source-grounded principle.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS generated_content_citations (
      generated_content_id uuid NOT NULL REFERENCES generated_contents(id) ON DELETE CASCADE,
      document_chunk_id uuid NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
      PRIMARY KEY (generated_content_id, document_chunk_id)
    );

    CREATE INDEX IF NOT EXISTS idx_generated_content_citations_chunk
      ON generated_content_citations (document_chunk_id);

    -- ============================================================
    -- Flashcards
    -- Accepted flashcards projected/materialized at acceptance.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS flashcards (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      generated_content_id uuid REFERENCES generated_contents(id),
      question text NOT NULL,
      answer text NOT NULL,
      explanation text,
      card_type varchar(30) NOT NULL DEFAULT 'definition',
      difficulty varchar(10) NOT NULL DEFAULT 'medium',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_flashcards_org_course
      ON flashcards (organization_id, course_id);

    CREATE INDEX IF NOT EXISTS idx_flashcards_document
      ON flashcards (document_id);

    -- ============================================================
    -- Flashcard Reviews
    -- Immutable spaced-repetition review history (FSRS-style).
    -- ============================================================

    CREATE TABLE IF NOT EXISTS flashcard_reviews (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      flashcard_id uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating varchar(10) NOT NULL,
      reviewed_at timestamptz NOT NULL DEFAULT now(),
      reaction_ms integer
    );

    CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card_user_time
      ON flashcard_reviews (flashcard_id, user_id, reviewed_at);

    CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_time
      ON flashcard_reviews (user_id, reviewed_at);

    -- ============================================================
    -- Quizzes
    -- Accepted quizzes.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS quizzes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_quizzes_org_course
      ON quizzes (organization_id, course_id);

    -- ============================================================
    -- Quiz Questions
    -- Questions belonging to a quiz.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      generated_content_id uuid REFERENCES generated_contents(id),
      question text NOT NULL,
      question_type varchar(30) NOT NULL DEFAULT 'multiple_choice',
      choices jsonb,
      correct_answer jsonb NOT NULL,
      explanation text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_order
      ON quiz_questions (quiz_id, sort_order);

    -- ============================================================
    -- Quiz Attempts
    -- One row per student attempt at a quiz.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score numeric(5,2) NOT NULL DEFAULT 0,
      answers jsonb NOT NULL DEFAULT '{}',
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_user_time
      ON quiz_attempts (quiz_id, user_id, completed_at);

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_time
      ON quiz_attempts (user_id, completed_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS quiz_attempts CASCADE;
    DROP TABLE IF EXISTS quiz_questions CASCADE;
    DROP TABLE IF EXISTS quizzes CASCADE;
    DROP TABLE IF EXISTS flashcard_reviews CASCADE;
    DROP TABLE IF EXISTS flashcards CASCADE;
    DROP TABLE IF EXISTS generated_content_citations CASCADE;
    DROP TABLE IF EXISTS generated_contents CASCADE;
    DROP TABLE IF EXISTS document_chunks CASCADE;
    DROP TABLE IF EXISTS documents CASCADE;
  `);
}
