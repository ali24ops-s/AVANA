import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { executeStatefulMigrations } from "../tracker/runner.js";
import { tryAcquireAdvisoryLock, releaseAdvisoryLock } from "../tracker/advisory-lock.js";
import { recoverIndeterminateCommit } from "../tracker/commit-recovery.js";
import type { MigrationDefinition } from "../tracker/types.js";

const { Client } = pg;
const TEST_DB_URL = "postgres://avana:avana@127.0.0.1:5432/avana_test_tracker_isolated";

describe("Live PostgreSQL Operational Test Suite on Isolated DB", () => {
  let mainClient: pg.Client;

  beforeAll(async () => {
    mainClient = new Client({ connectionString: TEST_DB_URL });
    await mainClient.connect();
    // Clean tables inside isolated test database
    await mainClient.query("DROP TABLE IF EXISTS test_table_alpha CASCADE;");
    await mainClient.query("DROP TABLE IF EXISTS test_table_beta CASCADE;");
    await mainClient.query("DROP TABLE IF EXISTS schema_migrations CASCADE;");
    await mainClient.query("DROP TABLE IF EXISTS schema_migration_attempts CASCADE;");
  });

  afterAll(async () => {
    await mainClient.end().catch(() => {});
  });

  it("Step 1 & 2 & 3: Initial Tracker run creates tracking tables and applies test migration atomically", async () => {
    const testMigration1: MigrationDefinition = {
      id: "0001_test_init",
      sequence: 1,
      up: async (db) => {
        await db.execute(`
          CREATE TABLE test_table_alpha (
            id serial PRIMARY KEY,
            name varchar(100) NOT NULL
          );
        `);
      },
    };

    const runResult = await executeStatefulMigrations([testMigration1], {
      connectionString: TEST_DB_URL,
    });

    expect(runResult.applied).toEqual(["0001_test_init"]);
    expect(runResult.skipped).toEqual([]);
    expect(runResult.failed).toBeNull();

    // Verify test_table_alpha exists in PostgreSQL
    const tableRes = await mainClient.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_table_alpha';"
    );
    expect(tableRes.rows[0].count).toBe(1);

    // Verify schema_migrations has 1 applied record
    const migRes = await mainClient.query(
      "SELECT migration_id, status, commit_ticket FROM schema_migrations WHERE migration_id = '0001_test_init';"
    );
    expect(migRes.rows.length).toBe(1);
    expect(migRes.rows[0].status).toBe("applied");
    expect(migRes.rows[0].commit_ticket).toBeDefined();

    // Verify schema_migration_attempts has 1 success record
    const attRes = await mainClient.query(
      "SELECT attempt_number, status, commit_ticket FROM schema_migration_attempts WHERE migration_id = '0001_test_init';"
    );
    expect(attRes.rows.length).toBe(1);
    expect(attRes.rows[0].attempt_number).toBe(1);
    expect(attRes.rows[0].status).toBe("success");
    expect(attRes.rows[0].commit_ticket).toBe(migRes.rows[0].commit_ticket);
  });

  it("Step 4: Re-running Runner skips already applied migration (Idempotency)", async () => {
    let executedAgain = false;
    const testMigration1: MigrationDefinition = {
      id: "0001_test_init",
      sequence: 1,
      up: async () => {
        executedAgain = true;
      },
    };

    const runResult = await executeStatefulMigrations([testMigration1], {
      connectionString: TEST_DB_URL,
    });

    expect(runResult.applied).toEqual([]);
    expect(runResult.skipped).toEqual(["0001_test_init"]);
    expect(runResult.failed).toBeNull();
    expect(executedAgain).toBe(false);

    // Verify no new attempt was created
    const attCount = await mainClient.query(
      "SELECT count(*)::int AS count FROM schema_migration_attempts WHERE migration_id = '0001_test_init';"
    );
    expect(attCount.rows[0].count).toBe(1);
  });

  it("Step 5: Deliberate failure rolls back transaction and records failure in attempts", async () => {
    const failingMigration: MigrationDefinition = {
      id: "0002_test_failing",
      sequence: 2,
      up: async (db) => {
        // Step 1: create a table
        await db.execute("CREATE TABLE test_table_beta (id serial PRIMARY KEY);");
        // Step 2: throw error to trigger rollback
        throw new Error("Deliberate failure during test migration 0002");
      },
    };

    await expect(
      executeStatefulMigrations([failingMigration], {
        connectionString: TEST_DB_URL,
      })
    ).rejects.toThrow("Deliberate failure during test migration 0002");

    // Verify test_table_beta was ROLLED BACK and does NOT exist
    const tableRes = await mainClient.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_table_beta';"
    );
    expect(tableRes.rows[0].count).toBe(0);

    // Verify schema_migrations records failed status
    const migRes = await mainClient.query(
      "SELECT status, error_message FROM schema_migrations WHERE migration_id = '0002_test_failing';"
    );
    expect(migRes.rows.length).toBe(1);
    expect(migRes.rows[0].status).toBe("failed");
    expect(migRes.rows[0].error_message).toContain("Deliberate failure");

    // Verify schema_migration_attempts recorded attempt 1 as failed
    const attRes = await mainClient.query(
      "SELECT attempt_number, status, error_message FROM schema_migration_attempts WHERE migration_id = '0002_test_failing';"
    );
    expect(attRes.rows.length).toBe(1);
    expect(attRes.rows[0].attempt_number).toBe(1);
    expect(attRes.rows[0].status).toBe("failed");
  });

  it("Step 6 & 7: Concurrent execution of two runners on separate real PostgreSQL connections", async () => {
    const conn1 = new Client({ connectionString: TEST_DB_URL });
    const conn2 = new Client({ connectionString: TEST_DB_URL });
    await conn1.connect();
    await conn2.connect();

    try {
      // Runner 1 acquires the session advisory lock
      const lock1 = await tryAcquireAdvisoryLock(conn1);
      expect(lock1).toBe(true);

      // Runner 2 attempts to acquire the lock and is REJECTED
      const lock2 = await tryAcquireAdvisoryLock(conn2);
      expect(lock2).toBe(false);

      // Runner 2 attempting full migration fails cleanly with locked error
      await expect(
        executeStatefulMigrations([], {
          connectionString: TEST_DB_URL,
          injectedClient: conn2,
        })
      ).rejects.toThrow(/Another migration runner is actively executing/);

      // Runner 1 releases lock
      const unlock1 = await releaseAdvisoryLock(conn1);
      expect(unlock1).toBe(true);

      // Now Runner 2 can acquire the lock
      const lock2After = await tryAcquireAdvisoryLock(conn2);
      expect(lock2After).toBe(true);
      await releaseAdvisoryLock(conn2);
    } finally {
      await conn1.end().catch(() => {});
      await conn2.end().catch(() => {});
    }
  });

  it("Step 8 (Crash / Lock Holding Recovery): Recovery keeps state indeterminate while Session 1 holds lock, then resolves after release", async () => {
    const session1 = new Client({ connectionString: TEST_DB_URL });
    await session1.connect();

    try {
      // Session 1 holds the advisory lock (simulating a zombie/in-flight backend process)
      const lockHeld = await tryAcquireAdvisoryLock(session1);
      expect(lockHeld).toBe(true);

      // Session 2 initiates commit recovery for an uncommitted migration
      const dummyTicket = "00000000-0000-0000-0000-000000009999";
      const recoveryResult1 = await recoverIndeterminateCommit(
        { connectionString: TEST_DB_URL, maxRetries: 1, retryDelayMs: 10 },
        "0003_test_zombie",
        dummyTicket,
        1
      );

      // CRITICAL ASSERTION:
      // While Session 1 holds the lock, Recovery MUST NOT declare rollback!
      // It must return status: 'indeterminate' and resolved: false!
      expect(recoveryResult1.resolved).toBe(false);
      expect(recoveryResult1.status).toBe("indeterminate");
      expect(recoveryResult1.reason).toContain("State remains indeterminate");

      // Now Session 1 terminates and releases the lock
      await releaseAdvisoryLock(session1);
      await session1.end();

      // Session 2 retries recovery now that Session 1 has terminated
      const recoveryResult2 = await recoverIndeterminateCommit(
        { connectionString: TEST_DB_URL, maxRetries: 3, retryDelayMs: 50 },
        "0003_test_zombie",
        dummyTicket,
        1
      );

      // Now that lock is acquired and prior backend is proven dead, rollback is proven!
      expect(recoveryResult2.resolved).toBe(true);
      expect(recoveryResult2.status).toBe("indeterminate_rolled_back");
      expect(recoveryResult2.reason).toContain("Definitive rollback proven");
    } finally {
      await session1.end().catch(() => {});
    }
  });
});
