import { sql } from "drizzle-orm";

/**
 * Migration 0024: Official Courses and Products.
 *
 * Adds lifecycle status, description, and official flag to `courses` table:
 * - `status` varchar(30) NOT NULL DEFAULT 'published' ('draft' | 'generating' | 'review' | 'approved' | 'published' | 'archived')
 * - `description` text
 * - `is_official` boolean NOT NULL DEFAULT false
 *
 * Adds performance indexes:
 * - `idx_courses_official_status` on (is_official, status)
 * - `idx_courses_org_status` on (organization_id, status)
 *
 * Ensures canonical AVANA OFFICIAL organization exists matching config.systemOrganizationId:
 * - 'b4a0b464-16db-4087-92b7-163a1e6f6776' / 'avana-official'
 *
 * Safe and fully idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Add official course lifecycle columns
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'published';
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

    -- 2. Create optimized indexes
    CREATE INDEX IF NOT EXISTS idx_courses_official_status ON courses(is_official, status);
    CREATE INDEX IF NOT EXISTS idx_courses_org_status ON courses(organization_id, status);

    -- 3. Ensure canonical system organization (AVANA OFFICIAL) exists
    INSERT INTO organizations (id, name, slug, created_at, updated_at)
    VALUES (
      'b4a0b464-16db-4087-92b7-163a1e6f6776',
      'AVANA OFFICIAL',
      'avana-official',
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET name = 'AVANA OFFICIAL', slug = 'avana-official';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_courses_official_status;
    DROP INDEX IF EXISTS idx_courses_org_status;
    ALTER TABLE courses DROP COLUMN IF EXISTS is_official;
    ALTER TABLE courses DROP COLUMN IF EXISTS description;
    ALTER TABLE courses DROP COLUMN IF EXISTS status;
  `);
}
