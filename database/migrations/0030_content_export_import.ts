import { sql } from "drizzle-orm";

/**
 * Migration 0030: Content Export & Import Provenance System.
 *
 * Adds content_import_batches and imported_entities tables for tracking
 * educational content import packages, stable exportId mapping, provenance,
 * and two-tier duplicate detection across environments.
 *
 * Idempotent (IF NOT EXISTS) for safe application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Create content_import_batches table
    CREATE TABLE IF NOT EXISTS content_import_batches (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source varchar(100) NOT NULL DEFAULT 'unknown',
      format_version integer NOT NULL DEFAULT 1,
      package_checksum char(64),
      manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
      stats jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(30) NOT NULL DEFAULT 'completed',
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_content_import_batches_org
      ON content_import_batches (organization_id, created_at DESC);

    -- 2. Create imported_entities table for stable provenance and duplicate detection
    CREATE TABLE IF NOT EXISTS imported_entities (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      batch_id uuid REFERENCES content_import_batches(id) ON DELETE SET NULL,
      entity_type varchar(50) NOT NULL,
      export_id varchar(255) NOT NULL,
      target_entity_id uuid NOT NULL,
      content_hash char(64) NOT NULL,
      natural_key varchar(500),
      imported_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_imported_entities_org_type_export UNIQUE (organization_id, entity_type, export_id)
    );

    CREATE INDEX IF NOT EXISTS idx_imported_entities_target
      ON imported_entities (entity_type, target_entity_id);

    CREATE INDEX IF NOT EXISTS idx_imported_entities_hash
      ON imported_entities (organization_id, entity_type, content_hash);

    CREATE INDEX IF NOT EXISTS idx_imported_entities_natural
      ON imported_entities (organization_id, entity_type, natural_key);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS imported_entities CASCADE;
    DROP TABLE IF EXISTS content_import_batches CASCADE;
  `);
}
