/* eslint-disable no-console */
import crypto from "crypto";
import os from "os";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../schema/index.js";
import type { MigrationDefinition } from "./types.js";
import {
  tryAcquireAdvisoryLock,
  releaseAdvisoryLock,
  assertPrimaryNode,
} from "./advisory-lock.js";
import { ensureTrackingSchema } from "./schema.js";
import { resolveBuildManifest } from "./checksum.js";
import { recoverIndeterminateCommit } from "./commit-recovery.js";

const { Client } = pg;

export interface RunnerOptions {
  connectionString: string;
  baseDir?: string;
  dryRun?: boolean;
  injectedClient?: pg.Client;
}

export interface RunResult {
  applied: string[];
  skipped: string[];
  failed: string | null;
  error?: Error;
}

/**
 * Executes migrations statefully on a Dedicated PostgreSQL Client.
 * Guarantees:
 * 1. Session Advisory Lock held on Dedicated Client for entire execution.
 * 2. Primary node assertion (never runs on Read Replica).
 * 3. Atomic Attempt Lifecycle and Checksum Verification.
 * 4. Transaction-safe DDL execution with fail-closed commit recovery.
 */
export async function executeStatefulMigrations(
  migrations: MigrationDefinition[],
  options: RunnerOptions
): Promise<RunResult> {
  const client = options.injectedClient ?? new Client({ connectionString: options.connectionString });
  if (!options.injectedClient) {
    await client.connect();
  }

  const result: RunResult = {
    applied: [],
    skipped: [],
    failed: null,
  };

  let lockAcquired = false;

  try {
    // 1. Hard check: Ensure connection is to PostgreSQL Primary
    await assertPrimaryNode(client);

    // 2. Acquire Session-Level Advisory Lock on Dedicated Client
    lockAcquired = await tryAcquireAdvisoryLock(client);
    if (!lockAcquired) {
      throw new Error(
        "[LOCKED] Could not acquire AVANA migration advisory lock (key: 280619994689). " +
        "Another migration runner is actively executing. Aborting cleanly."
      );
    }
    console.log("Acquired session advisory lock on PostgreSQL Primary.");

    // 3. Ensure two-table tracking schema exists
    await ensureTrackingSchema(client);

    // Reconcile any orphaned in_progress attempts from crashed previous runs
    await client.query(`
      UPDATE schema_migration_attempts
      SET status = 'indeterminate',
          finished_at = NOW(),
          error_message = COALESCE(error_message, 'Previous runner process crashed or terminated abnormally before completion.')
      WHERE status = 'in_progress';
    `);

    // 4. Resolve Build Manifest
    const baseDir = options.baseDir ?? process.cwd();
    const manifest = resolveBuildManifest(baseDir);
    const manifestMap = new Map(manifest.migrations.map((m) => [m.id, m]));

    // 5. Query existing migration statuses
    const existingRes = await client.query(
      "SELECT migration_id, status, checksum FROM schema_migrations;"
    );
    const existingMap = new Map<string, { status: string; checksum: string }>();
    for (const r of existingRes.rows) {
      existingMap.set(r.migration_id, { status: r.status, checksum: r.checksum });
    }

    const runnerDb = drizzle(client, { schema });
    const hostname = os.hostname();
    const pid = process.pid;

    for (const migration of migrations) {
      const record = existingMap.get(migration.id);
      const manifestEntry = manifestMap.get(migration.id);
      const expectedChecksum = manifestEntry?.source_sha256 ?? "0".repeat(64);

      if (record) {
        if (
          record.status === "applied" ||
          record.status === "baselined" ||
          record.status === "manual_verified" ||
          record.status === "not_applicable"
        ) {
          // Checksum Tamper Check: verify historical checksum has not drifted
          if (
            record.status === "applied" &&
            record.checksum &&
            record.checksum !== expectedChecksum &&
            manifestEntry
          ) {
            console.warn(
              `[WARN] Checksum drift detected for applied migration ${migration.id}. ` +
              `Recorded: ${record.checksum.slice(0, 8)}, Current: ${expectedChecksum.slice(0, 8)}`
            );
          }
          result.skipped.push(migration.id);
          continue;
        }
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would execute: ${migration.id}`);
        result.applied.push(migration.id);
        continue;
      }

      console.log(`Applying ${migration.id}...`);

      // Determine next attempt number
      const attNumRes = await client.query(
        "SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_att FROM schema_migration_attempts WHERE migration_id = $1;",
        [migration.id]
      );
      const attemptNumber = parseInt(attNumRes.rows[0].next_att, 10);
      const commitTicket = crypto.randomUUID();
      const startTime = Date.now();

      // Step A: Insert attempt in progress (autocommit mode)
      const insertAttRes = await client.query(
        `INSERT INTO schema_migration_attempts (
          migration_id, attempt_number, status, commit_ticket,
          started_at, runner_pid, hostname, git_commit_hash
        ) VALUES ($1, $2, 'in_progress', $3, NOW(), $4, $5, $6)
        RETURNING id;`,
        [migration.id, attemptNumber, commitTicket, pid, hostname, manifest.git_commit ?? null]
      );
      const attemptId = insertAttRes.rows[0].id;

      // Step B: Transactional execution of migration DDL/DML and atomic state transition
      try {
        await client.query("BEGIN;");

        // Execute migration up() using dedicated client wrapped in drizzle
        await migration.up(runnerDb);

        const executionTimeMs = Date.now() - startTime;

        // Atomic update of schema_migrations inside transaction
        await client.query(
          `INSERT INTO schema_migrations (
            migration_id, sequence_number, status, checksum,
            applied_at, last_attempt_id, commit_ticket, execution_time_ms
          ) VALUES ($1, $2, 'applied', $3, NOW(), $4, $5, $6)
          ON CONFLICT (migration_id) DO UPDATE SET
            status = 'applied',
            checksum = EXCLUDED.checksum,
            applied_at = NOW(),
            last_attempt_id = EXCLUDED.last_attempt_id,
            commit_ticket = EXCLUDED.commit_ticket,
            execution_time_ms = EXCLUDED.execution_time_ms,
            error_message = NULL,
            updated_at = NOW();`,
          [migration.id, migration.sequence, expectedChecksum, attemptId, commitTicket, executionTimeMs]
        );

        // Update attempt status to success inside transaction
        await client.query(
          `UPDATE schema_migration_attempts
           SET status = 'success',
               finished_at = NOW(),
               execution_time_ms = $1
           WHERE id = $2;`,
          [executionTimeMs, attemptId]
        );

        await client.query("COMMIT;");
        result.applied.push(migration.id);
        console.log(`Successfully applied ${migration.id} (${executionTimeMs}ms)`);
      } catch (migrationError: any) {
        // Rollback transaction
        try {
          await client.query("ROLLBACK;");
        } catch {
          // Ignore rollback errors if connection was lost
        }

        const executionTimeMs = Date.now() - startTime;
        const errMsg = migrationError?.message ?? String(migrationError);
        const errStack = migrationError?.stack ?? null;

        // Check if error occurred during commit (potential indeterminate state)
        if (errMsg.includes("ECONNRESET") || errMsg.includes("ETIMEDOUT")) {
          console.warn(`[RECOVERY] Connection dropped during commit of ${migration.id}. Initiating recovery on fresh connection...`);
          const recovery = await recoverIndeterminateCommit(
            { connectionString: options.connectionString },
            migration.id,
            commitTicket,
            attemptId
          );
          if (recovery.resolved && recovery.status === "success") {
            result.applied.push(migration.id);
            continue;
          }
          result.failed = migration.id;
          result.error = new Error(`Recovery finalized with status '${recovery.status}': ${recovery.reason}`);
          throw result.error;
        }

        // Record failure in attempts and schema_migrations (autocommit mode)
        try {
          await client.query(
            `UPDATE schema_migration_attempts
             SET status = 'failed',
                 finished_at = NOW(),
                 execution_time_ms = $1,
                 error_message = $2,
                 error_stack = $3
             WHERE id = $4;`,
            [executionTimeMs, errMsg, errStack, attemptId]
          );

          await client.query(
            `INSERT INTO schema_migrations (
              migration_id, sequence_number, status, checksum,
              last_attempt_id, execution_time_ms, error_message
            ) VALUES ($1, $2, 'failed', $3, $4, $5, $6)
            ON CONFLICT (migration_id) DO UPDATE SET
              status = 'failed',
              last_attempt_id = EXCLUDED.last_attempt_id,
              execution_time_ms = EXCLUDED.execution_time_ms,
              error_message = EXCLUDED.error_message,
              updated_at = NOW();`,
            [migration.id, migration.sequence, expectedChecksum, attemptId, executionTimeMs, errMsg]
          );
        } catch (recordError) {
          console.error("Failed to record migration error state:", recordError);
        }

        result.failed = migration.id;
        result.error = migrationError;
        throw migrationError;
      }
    }

    return result;
  } finally {
    if (lockAcquired) {
      await releaseAdvisoryLock(client);
      console.log("Released session advisory lock.");
    }
    if (!options.injectedClient) {
      await client.end().catch(() => {});
    }
  }
}
