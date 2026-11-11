import pg from "pg";
import {
  tryAcquireAdvisoryLock,
  releaseAdvisoryLock,
  assertPrimaryNode,
} from "./advisory-lock.js";

const { Client } = pg;

export interface RecoveryResult {
  resolved: boolean;
  status: "success" | "indeterminate_rolled_back" | "indeterminate";
  reason: string;
}

export interface RecoveryOptions {
  connectionString: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Recovers an indeterminate migration commit state by inspecting the PostgreSQL Primary
 * on a NEW dedicated client with strict session advisory locking.
 *
 * Strict Rules:
 * 1. Must connect directly to Primary (fails closed on Replica).
 * 2. Must acquire the AVANA session advisory lock to prove the previous backend has fully terminated.
 * 3. If lock CANNOT be acquired, state MUST remain 'indeterminate' (fails closed, no rollback declared).
 * 4. Only AFTER lock is held:
 *    - Matching commit_ticket proves definitive COMMIT ('success').
 *    - Missing/different ticket proves definitive ROLLBACK ('indeterminate_rolled_back').
 */
export async function recoverIndeterminateCommit(
  options: RecoveryOptions,
  migrationId: string,
  expectedTicket: string,
  attemptId: number,
  injectedClient?: pg.Client
): Promise<RecoveryResult> {
  const recoveryClient = injectedClient ?? new Client({ connectionString: options.connectionString });
  if (!injectedClient) {
    await recoveryClient.connect();
  }

  let lockAcquired = false;

  try {
    // 1. Assert connection is directly to PostgreSQL Primary
    await assertPrimaryNode(recoveryClient);

    // 2. Attempt to acquire the Advisory Lock with bounded retries
    // The previous backend may take brief moments to exit after socket termination.
    const maxRetries = options.maxRetries ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 500;

    for (let i = 0; i < maxRetries; i++) {
      lockAcquired = await tryAcquireAdvisoryLock(recoveryClient);
      if (lockAcquired) break;
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    if (!lockAcquired) {
      // Previous backend is still alive or another session holds the lock.
      // Must NOT declare rollback! Keep status as indeterminate.
      await recoveryClient.query(
        `UPDATE schema_migration_attempts
         SET status = 'indeterminate',
             error_message = COALESCE(error_message, 'Connection dropped during commit. Could not acquire advisory lock during recovery because prior backend is still active.')
         WHERE id = $1;`,
        [attemptId]
      );

      return {
        resolved: false,
        status: "indeterminate",
        reason:
          "Fail-closed: Advisory lock could not be acquired during recovery. " +
          "Previous database session may still be in-flight. State remains indeterminate.",
      };
    }

    // 3. Lock acquired: Prior backend has terminated, so transaction state is definitive.
    const res = await recoveryClient.query(
      "SELECT commit_ticket, status FROM schema_migrations WHERE migration_id = $1;",
      [migrationId]
    );

    const row = res.rows[0];

    if (row && row.commit_ticket === expectedTicket) {
      // Definitive Commit: Transaction completed on Primary before socket drop
      await recoveryClient.query(
        `UPDATE schema_migration_attempts
         SET status = 'success', finished_at = NOW()
         WHERE id = $1;`,
        [attemptId]
      );

      return {
        resolved: true,
        status: "success",
        reason: `Definitive commit proven on Primary node: commit_ticket ${expectedTicket} matched in schema_migrations.`,
      };
    }

    // Definitive Rollback: Prior backend terminated and ticket was NOT written
    await recoveryClient.query(
      `UPDATE schema_migration_attempts
       SET status = 'indeterminate_rolled_back',
           finished_at = NOW(),
           error_message = COALESCE(error_message, 'Connection dropped during commit; Primary confirmed rollback after prior backend terminated.')
       WHERE id = $1;`,
      [attemptId]
    );

    return {
      resolved: true,
      status: "indeterminate_rolled_back",
      reason: `Definitive rollback proven on Primary node: commit_ticket ${expectedTicket} was NOT written to schema_migrations.`,
    };
  } finally {
    if (lockAcquired) {
      await releaseAdvisoryLock(recoveryClient);
    }
    if (!injectedClient) {
      await recoveryClient.end().catch(() => {});
    }
  }
}
