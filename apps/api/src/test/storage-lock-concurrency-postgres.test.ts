import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { organizations } from "@avana/database/schema";
import { StorageLockCoordinator } from "../modules/documents/storage-lock-coordinator.js";

/**
 * Real PostgreSQL Concurrency Test: StorageLockCoordinator Across Independent Connections.
 *
 * Verifies that StorageLockCoordinator using session-level advisory locks
 * strictly blocks a second independent database connection from accessing the same
 * storage resource until the first connection has completed and released the lock.
 *
 * If live PostgreSQL is not reachable in the isolated sandbox, gracefully skips.
 */
import {
  assertSafeDestructiveTestOperation,
  resolveSafePostgresTestUrl,
} from "./pg-test-guard.js";

describe("Real PostgreSQL: StorageLockCoordinator Across Independent Connections", () => {
  let dbUrl = "";
  let client1: ReturnType<typeof createDbClient> | null = null;
  let client2: ReturnType<typeof createDbClient> | null = null;
  let isConnected = false;
  let testOrgId: string;

  beforeAll(async () => {
    dbUrl = resolveSafePostgresTestUrl();
    client1 = createDbClient(dbUrl);
    client2 = createDbClient(dbUrl);

    await client1.db.execute(sql`SELECT 1;`);
    await client2.db.execute(sql`SELECT 1;`);
    isConnected = true;

    testOrgId = randomUUID();
    await client1.db.insert(organizations).values({
      id: testOrgId,
      name: "Storage Lock Test Org",
      slug: `storage-lock-org-${Date.now()}`,
    });
  });

  afterAll(async () => {
    if (client1 && testOrgId) {
      assertSafeDestructiveTestOperation("storage_lock_cleanup", dbUrl);
      try {
        await client1.db.delete(organizations).where(sql`id = ${testOrgId}`);
      } catch {
        // teardown cleanup
      }
    }
  });

  it("Client 1 holding advisory lock blocks independent Client 2 on the same storageKey", async () => {
    if (!isConnected || !client1 || !client2) {
      console.warn("Skipping real PG storage lock test: database not connected in sandbox.");
      return;
    }

    const testStorageKey = `uploads/concurrent-${Date.now()}.pdf`;
    let client1Step = 0;
    let client2AcquiredAtStep = 0;

    // Client 1 acquires lock on testStorageKey and holds it for 100ms
    const client1Promise = StorageLockCoordinator.withLock(
      testOrgId,
      testStorageKey,
      client1.db,
      async () => {
        client1Step = 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        client1Step = 2;
      },
    );

    // Give Client 1 a moment to acquire the lock in PostgreSQL
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Client 2 attempts to acquire lock on the exact same testStorageKey
    const client2Promise = StorageLockCoordinator.withLock(
      testOrgId,
      testStorageKey,
      client2.db,
      async () => {
        // Must only be reached AFTER Client 1 has released the lock (client1Step === 2)
        client2AcquiredAtStep = client1Step;
      },
    );

    await Promise.all([client1Promise, client2Promise]);

    // Client 2 MUST have waited until Client 1 finished step 2
    expect(client2AcquiredAtStep).toBe(2);
  });
});
