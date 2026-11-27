import { sql } from "drizzle-orm";

/**
 * Migration 0108: Multi-chapter Studio Exam Generation Foundation.
 *
 * Implements:
 * 1. studio_exam_generation_operations:
 *    - Aggregate state machine for full exam generation operations
 *    - Tracks requested vs generated question counts and immutable pattern snapshots
 *    - Statuses: pending, processing, completed, partial, failed
 * 2. studio_exam_generation_tasks:
 *    - Per-chapter generation task (module_id level for chapters with quota >= 1)
 *    - Enforces uniqueness per (operation_id, module_id)
 *    - Statuses: pending, processing, completed, partial, failed, insufficient_content
 * 3. studio_exam_generation_batches:
 *    - Granular Gemini LLM completion batches (max 10 questions each)
 *    - Enforces uniqueness per (task_id, batch_index)
 *    - Stores deterministic question-to-pattern allocations (pattern_allocations)
 *    - Statuses: pending, processing, completed, failed
 * 4. studio_exam_generated_questions:
 *    - Independent staging repository for generated questions
 *    - Retains source module_id, course_id, pattern_id, and pattern_version
 *    - Stores question_index (1..10) within the batch
 *    - Enforces physical DB idempotency: UNIQUE (batch_id, question_index)
 *    - Completely decouples staging output from marketing_quiz_questions
 *      so admin review is preserved without polluting the live quiz
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Operations table
    CREATE TABLE IF NOT EXISTS studio_exam_generation_operations (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      quiz_id uuid NOT NULL REFERENCES marketing_quizzes(id) ON DELETE CASCADE,
      organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      total_requested_questions integer NOT NULL CHECK (total_requested_questions >= 1 AND total_requested_questions <= 100),
      total_generated_questions integer NOT NULL DEFAULT 0,
      status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      pattern_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_studio_exam_ops_quiz
      ON studio_exam_generation_operations (quiz_id);

    CREATE INDEX IF NOT EXISTS idx_studio_exam_ops_status
      ON studio_exam_generation_operations (status);

    CREATE INDEX IF NOT EXISTS idx_studio_exam_ops_org_created
      ON studio_exam_generation_operations (organization_id, created_at DESC);

    -- 2. Chapter Tasks table
    CREATE TABLE IF NOT EXISTS studio_exam_generation_tasks (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      operation_id uuid NOT NULL REFERENCES studio_exam_generation_operations(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      target_question_count integer NOT NULL CHECK (target_question_count >= 1 AND target_question_count <= 100),
      generated_question_count integer NOT NULL DEFAULT 0,
      status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'insufficient_content', 'cancelled')),
      retry_count integer NOT NULL DEFAULT 0,
      error_code varchar(100),
      error_message text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_studio_exam_tasks_op_module UNIQUE (operation_id, module_id)
    );

    CREATE INDEX IF NOT EXISTS idx_studio_exam_tasks_op_status
      ON studio_exam_generation_tasks (operation_id, status);

    CREATE INDEX IF NOT EXISTS idx_studio_exam_tasks_module
      ON studio_exam_generation_tasks (module_id);

    -- 3. Batches table
    CREATE TABLE IF NOT EXISTS studio_exam_generation_batches (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      task_id uuid NOT NULL REFERENCES studio_exam_generation_tasks(id) ON DELETE CASCADE,
      batch_index integer NOT NULL,
      target_count integer NOT NULL CHECK (target_count >= 1 AND target_count <= 10),
      generated_count integer NOT NULL DEFAULT 0,
      status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
      pattern_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
      retry_count integer NOT NULL DEFAULT 0,
      error_code varchar(100),
      error_message text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_studio_exam_batches_task_index UNIQUE (task_id, batch_index)
    );

    CREATE INDEX IF NOT EXISTS idx_studio_exam_batches_task_status
      ON studio_exam_generation_batches (task_id, status);

    -- 4. Staging Generated Questions table
    CREATE TABLE IF NOT EXISTS studio_exam_generated_questions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      operation_id uuid NOT NULL REFERENCES studio_exam_generation_operations(id) ON DELETE CASCADE,
      task_id uuid NOT NULL REFERENCES studio_exam_generation_tasks(id) ON DELETE CASCADE,
      batch_id uuid NOT NULL REFERENCES studio_exam_generation_batches(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      pattern_id uuid REFERENCES question_patterns(id) ON DELETE SET NULL,
      pattern_version integer,
      question_index integer NOT NULL CHECK (question_index >= 1 AND question_index <= 10),
      question text NOT NULL,
      choices jsonb NOT NULL,
      correct_answer jsonb NOT NULL,
      explanation text,
      difficulty varchar(20) NOT NULL DEFAULT 'medium',
      topic varchar(255),
      question_type varchar(50) NOT NULL DEFAULT 'multiple_choice',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_accepted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_studio_gen_q_batch_index UNIQUE (batch_id, question_index)
    );

    CREATE INDEX IF NOT EXISTS idx_studio_gen_q_op
      ON studio_exam_generated_questions (operation_id);

    CREATE INDEX IF NOT EXISTS idx_studio_gen_q_task
      ON studio_exam_generated_questions (task_id);

    CREATE INDEX IF NOT EXISTS idx_studio_gen_q_batch
      ON studio_exam_generated_questions (batch_id);

    CREATE INDEX IF NOT EXISTS idx_studio_gen_q_module
      ON studio_exam_generated_questions (module_id);

    -- Ensure status check constraints explicitly include 'cancelled' for existing tables
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'studio_exam_generation_operations_status_check'
      ) THEN
        ALTER TABLE studio_exam_generation_operations DROP CONSTRAINT studio_exam_generation_operations_status_check;
        ALTER TABLE studio_exam_generation_operations 
          ADD CONSTRAINT studio_exam_generation_operations_status_check 
          CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'cancelled'));
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'studio_exam_generation_tasks_status_check'
      ) THEN
        ALTER TABLE studio_exam_generation_tasks DROP CONSTRAINT studio_exam_generation_tasks_status_check;
        ALTER TABLE studio_exam_generation_tasks 
          ADD CONSTRAINT studio_exam_generation_tasks_status_check 
          CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed', 'insufficient_content', 'cancelled'));
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'studio_exam_generation_batches_status_check'
      ) THEN
        ALTER TABLE studio_exam_generation_batches DROP CONSTRAINT studio_exam_generation_batches_status_check;
        ALTER TABLE studio_exam_generation_batches 
          ADD CONSTRAINT studio_exam_generation_batches_status_check 
          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
      END IF;
    END $$;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS studio_exam_generated_questions CASCADE;
    DROP TABLE IF EXISTS studio_exam_generation_batches CASCADE;
    DROP TABLE IF EXISTS studio_exam_generation_tasks CASCADE;
    DROP TABLE IF EXISTS studio_exam_generation_operations CASCADE;
  `);
}
