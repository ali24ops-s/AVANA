import { sql } from "drizzle-orm";

/**
 * Migration 0034: Generation Lease & Heartbeat Infrastructure.
 *
 * Adds heartbeat and lease expiration tracking columns and indexes to:
 * - generation_jobs: `heartbeat_at`
 * - generation_chunks: `heartbeat_at`, `lease_expires_at`
 * - indexes for status + heartbeat / status + updated_at
 *
 * Pure DDL migration: does NOT mutate existing application data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS generation_jobs
      ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
      ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

    ALTER TABLE IF EXISTS generation_chunks
      ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
      ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

    CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_heartbeat
      ON generation_jobs (status, heartbeat_at);

    CREATE INDEX IF NOT EXISTS idx_generation_chunks_status_heartbeat
      ON generation_chunks (status, heartbeat_at);

    CREATE INDEX IF NOT EXISTS idx_courses_status_updated
      ON courses (status, updated_at);

    CREATE INDEX IF NOT EXISTS idx_documents_status_updated
      ON documents (status, updated_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_documents_status_updated;
    DROP INDEX IF EXISTS idx_courses_status_updated;
    DROP INDEX IF EXISTS idx_generation_chunks_status_heartbeat;
    DROP INDEX IF EXISTS idx_generation_jobs_status_heartbeat;

    ALTER TABLE IF EXISTS generation_chunks
      DROP COLUMN IF EXISTS lease_expires_at,
      DROP COLUMN IF EXISTS heartbeat_at;

    ALTER TABLE IF EXISTS generation_jobs
      DROP COLUMN IF EXISTS heartbeat_at;
  `);
}
