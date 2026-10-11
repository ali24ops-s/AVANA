import { sql } from "drizzle-orm";

/**
 * Migration 0073: Generation Job Sources Join Table (Multi-Source Unified Generation MVP).
 *
 * Persists multiple source documents linked to a single generation job with deterministic order_index.
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS generation_job_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      generation_job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_job_sources_job_doc
      ON generation_job_sources (generation_job_id, document_id);

    CREATE INDEX IF NOT EXISTS idx_gen_job_sources_job_order
      ON generation_job_sources (generation_job_id, order_index);

    CREATE INDEX IF NOT EXISTS idx_gen_job_sources_doc
      ON generation_job_sources (document_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS generation_job_sources CASCADE;
  `);
}
