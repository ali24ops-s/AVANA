import { sql } from "drizzle-orm";

/**
 * Migration 0098: Error Monitoring & Observability Core Tables.
 *
 * Implements Phase 1 of AVANA Observability:
 * 1. error_groups table:
 *    - Aggregates similar errors by deterministic versioned fingerprint
 *    - Tracks environment, source, severity, feature, error_code, title, status
 *    - Atomic counters for total_occurrences and affected_users_count
 *    - Tracks first_seen_at, last_seen_at, resolved_at, resolved_by_user_id
 * 2. error_group_users junction table:
 *    - Tracks unique users affected per error group (exact, retention-safe)
 *    - Composite primary key (group_id, user_id)
 * 3. error_events table:
 *    - Stores individual error occurrences with request_id, correlation_id, operation, failure_stage
 *    - Stores stack_trace and sanitized_context
 *    - Cascade deleted on group deletion; prunable by retention policy
 * 4. error_admin_notes table:
 *    - Operator action audit trail and notes attached to error groups
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS error_groups (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      fingerprint varchar(64) NOT NULL UNIQUE,
      fingerprint_version integer NOT NULL DEFAULT 1,
      environment varchar(30) NOT NULL DEFAULT 'production',
      source varchar(30) NOT NULL DEFAULT 'backend',
      severity varchar(20) NOT NULL DEFAULT 'error',
      feature varchar(50) NOT NULL DEFAULT 'system',
      error_code varchar(100),
      title varchar(255) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'unresolved',
      app_version varchar(50),
      total_occurrences integer NOT NULL DEFAULT 1,
      affected_users_count integer NOT NULL DEFAULT 0,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_error_groups_status_last_seen
      ON error_groups (status, last_seen_at DESC);

    CREATE INDEX IF NOT EXISTS idx_error_groups_filter
      ON error_groups (source, severity, feature, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS error_group_users (
      group_id uuid NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_error_group_users_user
      ON error_group_users (user_id);

    CREATE TABLE IF NOT EXISTS error_events (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      group_id uuid NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
      fingerprint varchar(64) NOT NULL,
      request_id varchar(64),
      correlation_id varchar(64),
      operation varchar(80),
      failure_stage varchar(80),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      endpoint varchar(255),
      http_method varchar(10),
      http_status integer,
      stack_trace text,
      sanitized_context jsonb NOT NULL DEFAULT '{}',
      occurred_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_error_events_group_time
      ON error_events (group_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_error_events_occurred_at
      ON error_events (occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_error_events_request_id
      ON error_events (request_id);

    CREATE INDEX IF NOT EXISTS idx_error_events_correlation_id
      ON error_events (correlation_id);

    CREATE TABLE IF NOT EXISTS error_admin_notes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      group_id uuid NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
      admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action varchar(50) NOT NULL DEFAULT 'comment',
      note text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_error_notes_group_created
      ON error_admin_notes (group_id, created_at DESC);
  `);
}
