import { sql } from "drizzle-orm";

/**
 * Migration 0080: Source Packs, Source Pack Documents, and Generation Job Sources.
 *
 * Implements persistent grouping of course documents into named Source Packs
 * with four distinct semantic roles (primary_notes, question_template, primary_reference, supplementary_reference)
 * and records immutable generation sources per job.
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Generation Job Sources table
    CREATE TABLE IF NOT EXISTS generation_job_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      generation_job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL DEFAULT 'primary_notes',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_job_sources_job_doc
      ON generation_job_sources (generation_job_id, document_id);

    CREATE INDEX IF NOT EXISTS idx_gen_job_sources_job_order
      ON generation_job_sources (generation_job_id, order_index);

    CREATE INDEX IF NOT EXISTS idx_gen_job_sources_doc
      ON generation_job_sources (document_id);

    -- 2. Source Packs table
    CREATE TABLE IF NOT EXISTS source_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL DEFAULT 'پک منابع جدید',
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_source_packs_org_course
      ON source_packs (organization_id, course_id);

    CREATE INDEX IF NOT EXISTS idx_source_packs_course
      ON source_packs (course_id);

    -- 3. Source Pack Documents join table
    CREATE TABLE IF NOT EXISTS source_pack_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_pack_id UUID NOT NULL REFERENCES source_packs(id) ON DELETE CASCADE,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL DEFAULT 'supplementary_reference',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_source_pack_docs_pack_doc
      ON source_pack_documents (source_pack_id, document_id);

    CREATE INDEX IF NOT EXISTS idx_source_pack_docs_pack_role
      ON source_pack_documents (source_pack_id, role);

    CREATE INDEX IF NOT EXISTS idx_source_pack_docs_doc
      ON source_pack_documents (document_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS source_pack_documents CASCADE;
    DROP TABLE IF EXISTS source_packs CASCADE;
    DROP TABLE IF EXISTS generation_job_sources CASCADE;
  `);
}
