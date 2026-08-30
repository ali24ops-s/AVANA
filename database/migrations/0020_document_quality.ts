import { sql } from "drizzle-orm";

/**
 * Migration 0020: Add Quality Score fields to documents
 */

export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_score integer;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_level varchar(20);
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_report jsonb;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS quality_analyzed_at timestamp with time zone;
  `);
}

export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE documents DROP COLUMN IF EXISTS quality_score;
    ALTER TABLE documents DROP COLUMN IF EXISTS quality_level;
    ALTER TABLE documents DROP COLUMN IF EXISTS quality_report;
    ALTER TABLE documents DROP COLUMN IF EXISTS quality_analyzed_at;
  `);
}
