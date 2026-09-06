import { sql } from "drizzle-orm";

/**
 * Migration 0032: Resumable & Incremental Generation Chunks Table.
 *
 * Tracks granular AI generation chunks/steps (planning, session lessons,
 * session flashcards, session quizzes, review summary) with immediate
 * persistence and resumption capabilities.
 *
 * Idempotency & Concurrency:
 * - (document_id, chunk_key) UNIQUE index ensures that only one chunk record
 *   exists per active generation step on a document.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS generation_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
      generation_job_id uuid REFERENCES generation_jobs(id) ON DELETE SET NULL,
      stage varchar(50) NOT NULL,
      chunk_index integer NOT NULL DEFAULT 0,
      chunk_key varchar(100) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending',
      payload jsonb,
      token_usage jsonb,
      attempts integer NOT NULL DEFAULT 0,
      error_code varchar(100),
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      deleted_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_chunks_doc_key
      ON generation_chunks (document_id, chunk_key)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_generation_chunks_doc_stage
      ON generation_chunks (document_id, stage);

    CREATE INDEX IF NOT EXISTS idx_generation_chunks_job
      ON generation_chunks (generation_job_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS generation_chunks;
  `);
}
