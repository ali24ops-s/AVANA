import { sql } from "drizzle-orm";

/**
 * PR6-5 — Additive generation_jobs lifecycle table.
 *
 * Tracks asynchronous AI generation job lifecycle (queued/running/succeeded/
 * failed) as a domain/application record. This is intentionally NOT a mirror
 * of any specific queue (BullMQ) — it stores only the minimal lifecycle
 * fields needed for job status reads, retry accounting, and failure recovery.
 * It remains valid even if the queue implementation changes in the future.
 *
 * Additive and reversible. `job_id` is nullable so the table is meaningful
 * before/without a queue.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      type varchar(30) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'queued',
      generation_key varchar(64),
      job_id varchar(100),
      attempts integer NOT NULL DEFAULT 0,
      error_code varchar(100),
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz,
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_generation_jobs_org_status
      ON generation_jobs (organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_document
      ON generation_jobs (document_id);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_job_id
      ON generation_jobs (job_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS generation_jobs;
  `);
}
