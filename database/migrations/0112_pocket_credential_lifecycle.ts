/* eslint-disable no-secrets/no-secrets */
import { sql } from "drizzle-orm";

/**
 * Migration 0112: Clinical Reviewer Credential Lifecycle Separation & Event History.
 *
 * 1. Adds `revoked_at`, `revoked_by`, and `revocation_reason` to
 *    `pocket_clinical_reviewer_credentials` without modifying historical rows.
 * 2. Creates append-only `pocket_reviewer_credential_events` table for
 *    `granted`, `suspended`, `reactivated`, and `revoked` lifecycle events.
 * 3. Attaches a PostgreSQL BEFORE UPDATE OR DELETE trigger enforcing
 *    strict append-only immutability on `pocket_reviewer_credential_events`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE pocket_clinical_reviewer_credentials
      ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

    CREATE TABLE IF NOT EXISTS pocket_reviewer_credential_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      credential_id UUID NOT NULL REFERENCES pocket_clinical_reviewer_credentials(id) ON DELETE RESTRICT,
      actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('granted', 'suspended', 'reactivated', 'revoked')),
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_cred_events_lookup
      ON pocket_reviewer_credential_events (credential_id, created_at, id);

    CREATE OR REPLACE FUNCTION pocket_reviewer_credential_events_append_only()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'pocket_reviewer_credential_events is append-only: % is not permitted', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_pocket_cred_events_append_only ON pocket_reviewer_credential_events;
    CREATE TRIGGER trg_pocket_cred_events_append_only
      BEFORE UPDATE OR DELETE ON pocket_reviewer_credential_events
      FOR EACH ROW
      EXECUTE FUNCTION pocket_reviewer_credential_events_append_only();
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS trg_pocket_cred_events_append_only ON pocket_reviewer_credential_events;
    DROP FUNCTION IF EXISTS pocket_reviewer_credential_events_append_only();
    DROP TABLE IF EXISTS pocket_reviewer_credential_events;

    ALTER TABLE pocket_clinical_reviewer_credentials
      DROP COLUMN IF EXISTS revocation_reason,
      DROP COLUMN IF EXISTS revoked_by,
      DROP COLUMN IF EXISTS revoked_at;
  `);
}
