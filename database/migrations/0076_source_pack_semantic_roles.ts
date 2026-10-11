import { sql } from "drizzle-orm";

/**
 * Migration 0076: Source Pack Semantic Roles and Generation Job Sources Role Snapshot.
 *
 * Expands source_pack_documents role column to VARCHAR(50) and maps legacy roles.
 * Adds role VARCHAR(50) column to generation_job_sources for immutable job snapshots.
 * Idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Expand role column in source_pack_documents to support semantic roles
    ALTER TABLE source_pack_documents
      ALTER COLUMN role TYPE VARCHAR(50);

    -- Map existing legacy roles to semantic equivalents
    UPDATE source_pack_documents
      SET role = 'primary_notes'
      WHERE role = 'primary';

    UPDATE source_pack_documents
      SET role = 'supplementary_reference'
      WHERE role = 'supplementary';

    ALTER TABLE source_pack_documents
      ALTER COLUMN role SET DEFAULT 'supplementary_reference';

    -- 2. Add role column to generation_job_sources for immutable job snapshots
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generation_job_sources' AND column_name = 'role'
      ) THEN
        ALTER TABLE generation_job_sources
          ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'primary_notes';
      END IF;
    END $$;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE generation_job_sources DROP COLUMN IF EXISTS role;
    ALTER TABLE source_pack_documents ALTER COLUMN role TYPE VARCHAR(20);
    ALTER TABLE source_pack_documents ALTER COLUMN role SET DEFAULT 'supplementary';
  `);
}
