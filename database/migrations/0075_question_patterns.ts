import { sql } from "drizzle-orm";

/**
 * Migration 0075: Question Patterns & Question Pattern Examples.
 *
 * Implements reference question patterns for guided AI exam generation in Admin,
 * and tracks pattern provenance (id + version) in generation_jobs.
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS question_patterns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      cognitive_level VARCHAR(50) DEFAULT 'clinical_reasoning',
      system_instructions TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_question_patterns_active
      ON question_patterns (is_active)
      WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS question_pattern_examples (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_pattern_id UUID NOT NULL REFERENCES question_patterns(id) ON DELETE CASCADE,
      source_quiz_question_id UUID REFERENCES quiz_questions(id) ON DELETE SET NULL,
      question TEXT NOT NULL,
      choices JSONB NOT NULL,
      correct_answer JSONB NOT NULL,
      explanation TEXT,
      clinical_context TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_question_pattern_examples_pattern
      ON question_pattern_examples (question_pattern_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_question_pattern_examples_source_question
      ON question_pattern_examples (source_quiz_question_id);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'question_pattern_id'
      ) THEN
        ALTER TABLE generation_jobs
          ADD COLUMN question_pattern_id UUID REFERENCES question_patterns(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_jobs' AND column_name = 'question_pattern_version'
      ) THEN
        ALTER TABLE generation_jobs
          ADD COLUMN question_pattern_version INTEGER;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_generation_jobs_question_pattern
      ON generation_jobs (question_pattern_id)
      WHERE question_pattern_id IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE generation_jobs DROP COLUMN IF EXISTS question_pattern_version;
    ALTER TABLE generation_jobs DROP COLUMN IF EXISTS question_pattern_id;
    DROP TABLE IF EXISTS question_pattern_examples CASCADE;
    DROP TABLE IF EXISTS question_patterns CASCADE;
  `);
}
