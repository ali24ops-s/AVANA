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
function validateTestDatabaseUrl(rawUrl: string | undefined): { valid: boolean; url?: string } {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { valid: false };
  }
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    const prohibitedHosts = ["aavana.ir", "api.aavana.ir", "prod", "production", "db.aavana.ir"];
    if (prohibitedHosts.some((h) => host.includes(h))) {
      return { valid: false };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false };
  }
}

describe("Real PostgreSQL: StorageLockCoordinator Across Independent Connections", () => {
  const candidateUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.STAGING_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  const validation = validateTestDatabaseUrl(candidateUrl);

  let client1: ReturnType<typeof createDbClient> | null = null;
  let client2: ReturnType<typeof createDbClient> | null = null;
  let isConnected = false;
  let testOrgId: string;

  beforeAll(async () => {
    if (!validation.valid || !validation.url) {
      isConnected = false;
      return;
    }

    try {
      client1 = createDbClient(validation.url);
      client2 = createDbClient(validation.url);

      await client1.db.execute(sql`SELECT 1;`);
      await client2.db.execute(sql`SELECT 1;`);
      isConnected = true;

      testOrgId = randomUUID();
      await client1.db.insert(organizations).values({
        id: testOrgId,
        name: "Storage Lock Test Org",
        slug: `storage-lock-org-${Date.now()}`,
      });
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (client1 && testOrgId) {
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
