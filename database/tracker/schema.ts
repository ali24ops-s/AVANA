import type pg from "pg";

/**
 * Ensures the two-table migration tracking infrastructure exists.
 * Designed with safe, idempotent DDL and strict integrity constraints.
 */
export async function ensureTrackingSchema(client: pg.Client): Promise<void> {
  // 1. Create schema_migration_attempts table
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration_attempts (
      id BIGSERIAL PRIMARY KEY,
      migration_id VARCHAR(255) NOT NULL,
      attempt_number INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL,
      commit_ticket UUID NOT NULL UNIQUE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      execution_time_ms INTEGER,
      error_message TEXT,
      error_stack TEXT,
      runner_pid INTEGER NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      git_commit_hash VARCHAR(40),
      CONSTRAINT uq_migration_attempt UNIQUE (migration_id, attempt_number)
    );
  `);

  // 2. Create schema_migrations table
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(255) PRIMARY KEY,
      sequence_number INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ,
      last_attempt_id BIGINT,
      commit_ticket UUID UNIQUE,
      execution_time_ms INTEGER,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 3. Create indices and foreign key constraint if not already present
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migration_attempts_ticket 
      ON schema_migration_attempts (commit_ticket);

    CREATE INDEX IF NOT EXISTS idx_schema_migration_attempts_lookup 
      ON schema_migration_attempts (migration_id, started_at DESC);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_schema_migrations_attempt'
          AND table_name = 'schema_migrations'
      ) THEN
        ALTER TABLE schema_migrations 
        ADD CONSTRAINT fk_schema_migrations_attempt 
        FOREIGN KEY (last_attempt_id) REFERENCES schema_migration_attempts(id) 
        ON DELETE RESTRICT;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_attempt_status'
      ) THEN
        ALTER TABLE schema_migration_attempts
        ADD CONSTRAINT chk_attempt_status
        CHECK (status IN ('in_progress', 'success', 'failed', 'indeterminate', 'indeterminate_rolled_back'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_migration_status'
      ) THEN
        ALTER TABLE schema_migrations
        ADD CONSTRAINT chk_migration_status
        CHECK (status IN ('pending', 'applied', 'baselined', 'manual_verified', 'not_applicable', 'failed'));
      END IF;
    END $$;
  `);
}
