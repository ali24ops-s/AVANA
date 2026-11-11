import { sql } from "drizzle-orm";

/**
 * Migration 0099: CRM Customer Campaign Management Tables.
 *
 * Implements:
 * 1. crm_campaigns table:
 *    - Allows admins to define, schedule, and track customer communication campaigns
 *    - Linked to dynamic target segments (crm_segments)
 *    - Supports multi-channel targeting (sms, email, telegram, in_app)
 *    - Lifecycle statuses: draft, scheduled, running, paused, completed, cancelled
 * 2. crm_campaign_executions table:
 *    - Records each execution run of a campaign
 *    - Tracks recipient counts (total, processed, successful, failed)
 *    - Idempotency and run history tracking
 * 3. crm_campaign_recipients table:
 *    - Per-recipient delivery status and result records
 *    - Prepared for future BullMQ worker dispatch without sending actual messages now
 *    - Unique constraint on (execution_id, user_id) to prevent duplicate delivery
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_campaigns (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name varchar(150) NOT NULL,
      description text,
      target_segment_id uuid NOT NULL REFERENCES crm_segments(id) ON DELETE RESTRICT,
      channel varchar(30) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'draft',
      message_content text,
      scheduled_at timestamptz,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status
      ON crm_campaigns (status);

    CREATE INDEX IF NOT EXISTS idx_crm_campaigns_segment
      ON crm_campaigns (target_segment_id);

    CREATE INDEX IF NOT EXISTS idx_crm_campaigns_created_by
      ON crm_campaigns (created_by);

    CREATE INDEX IF NOT EXISTS idx_crm_campaigns_created_at
      ON crm_campaigns (created_at DESC);

    CREATE TABLE IF NOT EXISTS crm_campaign_executions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
      status varchar(30) NOT NULL DEFAULT 'pending',
      total_recipients integer NOT NULL DEFAULT 0,
      processed_recipients integer NOT NULL DEFAULT 0,
      successful_recipients integer NOT NULL DEFAULT 0,
      failed_recipients integer NOT NULL DEFAULT 0,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      triggered_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_executions_campaign
      ON crm_campaign_executions (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_executions_status
      ON crm_campaign_executions (status);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_executions_created_at
      ON crm_campaign_executions (created_at DESC);

    CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      campaign_id uuid NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
      execution_id uuid NOT NULL REFERENCES crm_campaign_executions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel varchar(30) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending',
      error_message text,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_crm_campaign_recipients_exec_user UNIQUE (execution_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign
      ON crm_campaign_recipients (campaign_id);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_execution
      ON crm_campaign_recipients (execution_id);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_user
      ON crm_campaign_recipients (user_id);

    CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_status
      ON crm_campaign_recipients (status);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS crm_campaign_recipients CASCADE;
    DROP TABLE IF EXISTS crm_campaign_executions CASCADE;
    DROP TABLE IF EXISTS crm_campaigns CASCADE;
  `);
}
