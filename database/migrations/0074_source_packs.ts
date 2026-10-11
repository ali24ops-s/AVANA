import { sql } from "drizzle-orm";

/**
 * Migration 0074: Source Packs & Source Pack Documents (Source Pack MVP).
 *
 * Implements persistent grouping of course documents into named Source Packs,
 * designating PRIMARY and SUPPLEMENTARY roles for unified content generation.
 * Idempotent (IF NOT EXISTS / IF EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
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

    CREATE TABLE IF NOT EXISTS source_pack_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_pack_id UUID NOT NULL REFERENCES source_packs(id) ON DELETE CASCADE,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'supplementary',
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
  `);
}
