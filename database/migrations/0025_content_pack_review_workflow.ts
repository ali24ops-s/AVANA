import { sql } from "drizzle-orm";

/**
 * Migration 0025: Content Pack Review Workflow & Pricing.
 *
 * Updates content_packs status default to 'pending_review' and adds indexes
 * for efficient status-based moderation queries.
 *
 * Idempotent (IF NOT EXISTS / ALTER) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Alter default status to 'pending_review' for new user submissions
    ALTER TABLE content_packs ALTER COLUMN status SET DEFAULT 'pending_review';

    -- 2. Index for filtering content packs by status and creation time in admin panel
    CREATE INDEX IF NOT EXISTS idx_content_packs_status_created
      ON content_packs (status, created_at DESC);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_content_packs_status_created;
    ALTER TABLE content_packs ALTER COLUMN status SET DEFAULT 'published';
  `);
}
