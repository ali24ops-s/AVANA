import { sql } from "drizzle-orm";

/**
 * Migration 0095: Presentation Assistant Core (Phase 1).
 *
 * Creates tables for the Presentation Assistant feature:
 * - presentation_projects: Root presentation project with settings, timing, and lifecycle.
 * - presentation_slides: Individual extracted slides preserving order and structural data.
 * - presentation_references: Supplementary scientific and academic references.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  // 1. presentation_projects
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS presentation_projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      pptx_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
      target_duration_minutes INTEGER NOT NULL DEFAULT 15,
      academic_level VARCHAR(30) NOT NULL DEFAULT 'intermediate',
      tone VARCHAR(30) NOT NULL DEFAULT 'formal_scientific',
      elaboration_depth VARCHAR(30) NOT NULL DEFAULT 'balanced',
      status VARCHAR(30) NOT NULL DEFAULT 'created',
      current_stage VARCHAR(50),
      total_slides INTEGER NOT NULL DEFAULT 0,
      overall_introduction TEXT,
      overall_conclusion TEXT,
      total_estimated_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT chk_presentation_projects_duration
        CHECK (target_duration_minutes IN (5, 10, 15, 20, 30)),
      CONSTRAINT chk_presentation_projects_total_slides
        CHECK (total_slides >= 0),
      CONSTRAINT chk_presentation_projects_estimated_seconds
        CHECK (total_estimated_seconds >= 0),
      CONSTRAINT chk_presentation_projects_academic_level
        CHECK (academic_level IN ('introductory', 'intermediate', 'advanced')),
      CONSTRAINT chk_presentation_projects_tone
        CHECK (tone IN ('formal_scientific', 'fluent_student')),
      CONSTRAINT chk_presentation_projects_depth
        CHECK (elaboration_depth IN ('concise', 'balanced', 'comprehensive')),
      CONSTRAINT chk_presentation_projects_status
        CHECK (status IN ('created', 'extracting', 'analyzing', 'generating', 'completed', 'failed'))
    );

    CREATE INDEX IF NOT EXISTS idx_presentation_projects_org_owner
      ON presentation_projects (organization_id, owner_user_id);

    CREATE INDEX IF NOT EXISTS idx_presentation_projects_status
      ON presentation_projects (status);

    CREATE INDEX IF NOT EXISTS idx_presentation_projects_doc
      ON presentation_projects (pptx_document_id);
  `);

  // 2. presentation_slides
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS presentation_slides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES presentation_projects(id) ON DELETE CASCADE,
      slide_index INTEGER NOT NULL,
      title VARCHAR(500),
      raw_text TEXT NOT NULL DEFAULT '',
      extracted_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
      speaker_notes TEXT,
      has_visuals BOOLEAN NOT NULL DEFAULT FALSE,
      visual_summary TEXT,
      media_storage_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      extraction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_presentation_slides_index
        CHECK (slide_index > 0)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_slides_project_slide
      ON presentation_slides (project_id, slide_index);

    CREATE INDEX IF NOT EXISTS idx_presentation_slides_project
      ON presentation_slides (project_id);
  `);

  // 3. presentation_references
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS presentation_references (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES presentation_projects(id) ON DELETE CASCADE,
      document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
      type VARCHAR(30) NOT NULL,
      title VARCHAR(500) NOT NULL,
      source_identifier TEXT,
      access_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      bibliographic_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      extracted_content TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_presentation_refs_type
        CHECK (type IN ('text', 'pdf', 'docx', 'url', 'doi', 'pubmed')),
      CONSTRAINT chk_presentation_refs_access_status
        CHECK (access_status IN ('pending', 'full_text_available', 'abstract_only', 'metadata_only', 'manual_text_provided', 'failed_to_fetch'))
    );

    CREATE INDEX IF NOT EXISTS idx_presentation_refs_project
      ON presentation_references (project_id);

    CREATE INDEX IF NOT EXISTS idx_presentation_refs_doc
      ON presentation_references (document_id);

    CREATE INDEX IF NOT EXISTS idx_presentation_refs_status
      ON presentation_references (access_status);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS presentation_references;
    DROP TABLE IF EXISTS presentation_slides;
    DROP TABLE IF EXISTS presentation_projects;
  `);
}
