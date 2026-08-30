import { sql } from "drizzle-orm";

/**
 * Migration 0021: Content Packs & Public Library.
 *
 * Adds content_packs, content_pack_items, and content_pack_usages tables
 * for immutable educational content pack publishing, searching, and usage tracking.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Make document_id nullable for course materialization without source documents
    ALTER TABLE flashcards ALTER COLUMN document_id DROP NOT NULL;
    ALTER TABLE generated_contents ALTER COLUMN document_id DROP NOT NULL;

    -- 1. Create content_packs table
    CREATE TABLE IF NOT EXISTS content_packs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      creator_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
      source_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
      title varchar(255) NOT NULL,
      description text,
      subject varchar(255),
      status varchar(30) NOT NULL DEFAULT 'published',
      published_at timestamptz NOT NULL DEFAULT now(),
      usage_count integer NOT NULL DEFAULT 0,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_packs_active_source_doc
      ON content_packs (source_document_id)
      WHERE status = 'published' AND deleted_at IS NULL AND source_document_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_content_packs_status_usage
      ON content_packs (status, usage_count DESC);

    CREATE INDEX IF NOT EXISTS idx_content_packs_subject_status
      ON content_packs (subject, status);

    CREATE INDEX IF NOT EXISTS idx_content_packs_creator
      ON content_packs (creator_user_id);

    CREATE INDEX IF NOT EXISTS idx_content_packs_source_doc
      ON content_packs (source_document_id);

    -- 2. Create content_pack_items table
    CREATE TABLE IF NOT EXISTS content_pack_items (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      content_pack_id uuid NOT NULL REFERENCES content_packs(id) ON DELETE CASCADE,
      content_type varchar(30) NOT NULL,
      source_generated_content_id uuid REFERENCES generated_contents(id) ON DELETE SET NULL,
      payload_snapshot jsonb NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_pack_items_pack_type
      ON content_pack_items (content_pack_id, content_type);

    -- 3. Create content_pack_usages table
    CREATE TABLE IF NOT EXISTS content_pack_usages (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      content_pack_id uuid NOT NULL REFERENCES content_packs(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      target_module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
      added_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_pack_usages_pack_user_course
      ON content_pack_usages (content_pack_id, user_id, target_course_id);

    CREATE INDEX IF NOT EXISTS idx_content_pack_usages_user_pack
      ON content_pack_usages (content_pack_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_content_pack_usages_target_course
      ON content_pack_usages (target_course_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS content_pack_usages CASCADE;
    DROP TABLE IF EXISTS content_pack_items CASCADE;
    DROP TABLE IF EXISTS content_packs CASCADE;
  `);
}
