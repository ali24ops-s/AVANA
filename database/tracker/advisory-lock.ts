import type pg from "pg";

/**
 * AVANA Migration Advisory Lock Key:
 * ASCII representation of "AVANA":
 * 0x41 0x56 0x41 0x4E 0x41
 * In decimal: 280619994689 (fits inside signed 64-bit integer, BigInt in JS).
 */
export const AVANA_ADVISORY_LOCK_KEY = 280619994689n;

/**
 * Attempts to acquire the session-level advisory lock on a dedicated PostgreSQL client.
 * Returns true if the lock was successfully acquired, false if held by another session.
 */
export async function tryAcquireAdvisoryLock(client: pg.Client): Promise<boolean> {
  const result = await client.query(
    "SELECT pg_try_advisory_lock($1::bigint) AS locked;",
    [AVANA_ADVISORY_LOCK_KEY.toString()]
  );
  return Boolean(result.rows[0]?.locked);
}

/**
 * Releases the session-level advisory lock on the dedicated PostgreSQL client.
 */
export async function releaseAdvisoryLock(client: pg.Client): Promise<boolean> {
  try {
    const result = await client.query(
      "SELECT pg_advisory_unlock($1::bigint) AS unlocked;",
      [AVANA_ADVISORY_LOCK_KEY.toString()]
    );
    return Boolean(result.rows[0]?.unlocked);
  } catch {
    return false;
  }
}

/**
 * Asserts that the client is connected to a PostgreSQL Primary (not a Read Replica).
 * Throws a fatal fail-closed error if connected to a recovery/replica node.
 */
export async function assertPrimaryNode(client: pg.Client): Promise<void> {
  const result = await client.query("SELECT pg_is_in_recovery() AS in_recovery;");
  const inRecovery = Boolean(result.rows[0]?.in_recovery);
  if (inRecovery) {
    throw new Error(
      "[FATAL] Dedicated migration client is connected to a PostgreSQL Read Replica (pg_is_in_recovery = true). " +
      "Migrations and Recovery MUST run directly on the Primary node to avoid replication lag and split-brain states."
    );
  }
}
