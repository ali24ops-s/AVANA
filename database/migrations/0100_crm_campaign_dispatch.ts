import { sql } from "drizzle-orm";

/**
 * Migration 0100: CRM Campaign Execution Engine & Delivery Tracking.
 *
 * Adds:
 * 1. job_id to crm_campaign_executions for 1:1 BullMQ queue correlation & deduplication.
 * 2. attempts, last_attempt_at, error_code to crm_campaign_recipients for retry policies,
 *    transient vs permanent failure classification, and granular delivery observability.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE crm_campaign_executions
      ADD COLUMN IF NOT EXISTS job_id varchar(100);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_executions_job_id
      ON crm_campaign_executions (job_id);

    ALTER TABLE crm_campaign_recipients
      ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
      ADD COLUMN IF NOT EXISTS error_code varchar(50);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_exec_status
      ON crm_campaign_recipients (execution_id, status);
  `);
}
