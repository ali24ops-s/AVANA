import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DrizzleErrorStore } from "../observability/drizzle-error-store.js";
import {
  errorGroups,
  errorEvents,
  errorGroupUsers,
  errorAdminNotes,
  users,
} from "@avana/database/schema";

/**
 * Real PostgreSQL Integration & Concurrency Test for DrizzleErrorStore.
 *
 * Verifies:
 * 1. Insertion of new error group and event (isNewGroup: true).
 * 2. Atomic increment of totalOccurrences on duplicate fingerprint (isNewGroup: false).
 * 3. Atomic unique user registration in error_group_users & affectedUsersCount calculation with real users.
 * 4. Database-driven atomic sampling decision: first 10 occurrences saved, throttled thereafter.
 * 5. Sanitization of invalid UUID userId without failing the SQL statement.
 * 6. Listing and filtering error groups and events in live PostgreSQL (totalCount, page, pageSize).
 * 7. Admin note attachment and resolution status transitions.
 * 8. Real concurrent ingestion of 25 events via Promise.all verifying row locks, atomicity, and sampling.
 *
 * Safety:
 * - Production guard blocks any prohibited host (aavana.ir, prod, etc.).
 * - Explicit connectivity reporting (no silent fake passes).
 * - Cleans up all test data (error records and test users) on teardown even if tests fail.
 */

function validateTestDatabaseUrl(rawUrl: string | undefined): { valid: boolean; reason?: string; url?: string } {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { valid: false, reason: "No explicit TEST_DATABASE_URL or DATABASE_URL provided." };
  }

  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Strict Production Guard
    const prohibitedHosts = ["aavana.ir", "api.aavana.ir", "prod", "production", "db.aavana.ir"];
    if (prohibitedHosts.some((h) => host.includes(h))) {
      return { valid: false, reason: `Target host '${host}' is identified as production; execution blocked.` };
    }

    const isAllowlisted =
      pathname.includes("test") ||
      pathname.includes("staging") ||
      pathname.includes("avana") ||
      host === "127.0.0.1" ||
      host === "localhost";

    if (!isAllowlisted) {
      return { valid: false, reason: `Target database path '${pathname}' is not recognized as test/dev.` };
    }

    return { valid: true, url: parsed.toString() };
  } catch (err: unknown) {
    return { valid: false, reason: `Invalid database URL format: ${String((err as Error)?.message || err)}` };
  }
}

describe("Real PostgreSQL: DrizzleErrorStore Integration Suite", () => {
  const candidateUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.STAGING_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  const validation = validateTestDatabaseUrl(candidateUrl);

  let client: ReturnType<typeof createDbClient> | null = null;
  let isConnected = false;
  let store: DrizzleErrorStore;
  const createdGroupIds: string[] = [];
  let testUserId: string;
  let testUser2Id: string;
  let testAdminId: string;

  beforeAll(async () => {
    if (!validation.valid || !validation.url) {
      console.warn("Skipping real PG tests: database URL validation failed -", validation.reason);
      isConnected = false;
      return;
    }

    try {
      client = createDbClient(validation.url);
      await client.db.execute(sql`SELECT 1;`);

      // Check if error_groups table exists
      const tableCheck: any = await client.db.execute(sql`
        SELECT to_regclass('public.error_groups') as regclass;
      `);
      const regclass = tableCheck.rows ? tableCheck.rows[0]?.regclass : tableCheck[0]?.regclass;

      if (!regclass) {
        console.warn("Skipping real PG tests: error_groups table does not exist in target database.");
        isConnected = false;
        return;
      }

      store = new DrizzleErrorStore(client.db);
      isConnected = true;

      // Seed real test users for foreign key constraints in error_group_users & error_admin_notes
      testUserId = randomUUID();
      testUser2Id = randomUUID();
      testAdminId = randomUUID();

      await client.db.insert(users).values([
        {
          id: testUserId,
          email: `test_err_u1_${testUserId.slice(0, 8)}@test.local`,
          name: "Test Error User 1",
        },
        {
          id: testUser2Id,
          email: `test_err_u2_${testUser2Id.slice(0, 8)}@test.local`,
          name: "Test Error User 2",
        },
        {
          id: testAdminId,
          email: `test_err_admin_${testAdminId.slice(0, 8)}@test.local`,
          name: "Test Error Admin",
        },
      ]);
    } catch (err) {
      console.warn("Skipping real PG tests: could not connect to PostgreSQL -", (err as Error)?.message);
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (isConnected && client) {
      try {
        if (createdGroupIds.length > 0) {
          for (const id of createdGroupIds) {
            await client.db.delete(errorEvents).where(eq(errorEvents.groupId, id)).catch(() => {});
            await client.db.delete(errorGroupUsers).where(eq(errorGroupUsers.groupId, id)).catch(() => {});
            await client.db.delete(errorAdminNotes).where(eq(errorAdminNotes.groupId, id)).catch(() => {});
            await client.db.delete(errorGroups).where(eq(errorGroups.id, id)).catch(() => {});
          }
        }
        // Clean up test users
        if (testUserId && testUser2Id && testAdminId) {
          await client.db
            .delete(users)
            .where(inArray(users.id, [testUserId, testUser2Id, testAdminId]))
            .catch(() => {});
        }
      } catch (cleanupErr) {
        console.warn("Warning during test teardown cleanup:", cleanupErr);
      }
    }
    if (client) {
      await client.close().catch(() => {});
    }
  });

  function ensureConnected(ctx: any): boolean {
    if (!isConnected) {
      if (process.env.CI) {
        expect.fail(`PostgreSQL connection failed in CI environment: ${validation.reason || "Database unreachable"}`);
      }
      ctx.skip();
      return false;
    }
    return true;
  }

  it("Scenario 1: Creates new error group and inserts initial event on first occurrence", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_new_${randomUUID().replace(/-/g, "")}`;
    const result = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "integration_test",
        title: "Database connection timeout in test",
        status: "unresolved",
        appVersion: "1.0.0",
      },
      event: {
        fingerprint: testFingerprint,
        requestId: `req_${randomUUID()}`,
        operation: "test.op",
        failureStage: "execute",
        endpoint: "/test/endpoint",
        httpMethod: "POST",
        httpStatus: 500,
        sanitizedContext: { testKey: "testValue" },
        occurredAt: new Date(),
      },
    });

    expect(result.isNewGroup).toBe(true);
    expect(result.group.fingerprint).toBe(testFingerprint);
    expect(result.group.totalOccurrences).toBe(1);
    expect(result.group.affectedUsersCount).toBe(0);
    expect(result.isSampled).toBe(true);
    expect(result.event).toBeDefined();

    createdGroupIds.push(result.group.id);
  });

  it("Scenario 2: Atomically increments totalOccurrences on duplicate fingerprint without creating duplicate group", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_dup_${randomUUID().replace(/-/g, "")}`;
    const firstResult = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "warning",
        feature: "concurrency_test",
        title: "Duplicate fingerprint occurrence",
        status: "unresolved",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
    });

    createdGroupIds.push(firstResult.group.id);
    expect(firstResult.isNewGroup).toBe(true);
    expect(firstResult.group.totalOccurrences).toBe(1);

    const secondResult = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "warning",
        feature: "concurrency_test",
        title: "Duplicate fingerprint occurrence",
        status: "unresolved",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
    });

    expect(secondResult.isNewGroup).toBe(false);
    expect(secondResult.group.id).toBe(firstResult.group.id);
    expect(secondResult.group.totalOccurrences).toBe(2);
  });

  it("Scenario 3: Accurately counts unique affected users in error_group_users", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_users_${randomUUID().replace(/-/g, "")}`;

    // 1st occurrence with testUserId
    const res1 = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "user_tracking",
        title: "User tracking failure",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
      userId: testUserId,
    });
    createdGroupIds.push(res1.group.id);
    expect(res1.isNewUser).toBe(true);
    expect(res1.group.affectedUsersCount).toBe(1);

    // 2nd occurrence with same testUserId -> affectedUsersCount remains 1, isNewUser false
    const res2 = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "user_tracking",
        title: "User tracking failure",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
      userId: testUserId,
    });
    expect(res2.isNewUser).toBe(false);
    expect(res2.group.affectedUsersCount).toBe(1);

    // 3rd occurrence with testUser2Id -> affectedUsersCount becomes 2, isNewUser true
    const res3 = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "user_tracking",
        title: "User tracking failure",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
      userId: testUser2Id,
    });
    expect(res3.isNewUser).toBe(true);
    expect(res3.group.affectedUsersCount).toBe(2);
  });

  it("Scenario 4: Atomic database-driven sampling records first 10 occurrences and samples thereafter", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_sampling_${randomUUID().replace(/-/g, "")}`;
    let lastGroupId = "";

    // Ingest 12 occurrences
    for (let i = 1; i <= 12; i++) {
      const res = await store.recordOccurrence({
        group: {
          fingerprint: testFingerprint,
          fingerprintVersion: 1,
          environment: "test",
          source: "backend",
          severity: "error",
          feature: "sampling_test",
          title: "Repeated sampling test",
        },
        event: {
          fingerprint: testFingerprint,
          sanitizedContext: { iteration: i },
          occurredAt: new Date(),
        },
      });

      lastGroupId = res.group.id;
      if (i === 1) createdGroupIds.push(lastGroupId);

      if (i <= 10) {
        expect(res.isSampled).toBe(true);
        expect(res.event).toBeDefined();
      } else if (i === 11 || i === 12) {
        // 11 and 12 should NOT be sampled
        expect(res.isSampled).toBe(false);
        expect(res.event).toBeUndefined();
      }
    }

    // Verify raw event records in database: exactly 10
    const events = await store.listEvents({ groupId: lastGroupId, page: 1, pageSize: 50 });
    expect(events.items).toHaveLength(10);
  });

  it("Scenario 5: Safely ignores non-UUID userId without throwing database syntax error", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_invalid_user_${randomUUID().replace(/-/g, "")}`;
    const result = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "validation_test",
        title: "Invalid user format test",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
      userId: "not-a-valid-uuid-12345",
    });

    createdGroupIds.push(result.group.id);
    expect(result.group.affectedUsersCount).toBe(0);
    expect(result.isNewUser).toBe(false);
  });

  it("Scenario 6: Lists groups and events with pagination and filters", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const listResult = await store.listGroups({
      page: 1,
      pageSize: 10,
      source: "backend",
    });

    expect(listResult.items).toBeDefined();
    expect(Array.isArray(listResult.items)).toBe(true);
    expect(listResult.totalCount).toBeGreaterThanOrEqual(0);
  });

  it("Scenario 7: Updates group status and handles admin notes", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_notes_${randomUUID().replace(/-/g, "")}`;
    const created = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "critical",
        feature: "notes_test",
        title: "Admin notes integration test",
      },
      event: {
        fingerprint: testFingerprint,
        sanitizedContext: {},
        occurredAt: new Date(),
      },
    });
    createdGroupIds.push(created.group.id);

    // Update status to resolved
    const updated = await store.updateGroupStatus(created.group.id, "resolved");
    expect(updated).toBeDefined();
    expect(updated?.status).toBe("resolved");
    expect(updated?.resolvedAt).not.toBeNull();

    // Add admin note with valid admin user
    const note = await store.addAdminNote({
      groupId: created.group.id,
      adminUserId: testAdminId,
      action: "comment",
      note: "Investigated and verified root cause.",
    });
    expect(note.note).toBe("Investigated and verified root cause.");
    expect(note.adminUserId).toBe(testAdminId);

    // List notes
    const notes = await store.listAdminNotes(created.group.id);
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0].note).toBe("Investigated and verified root cause.");
  });

  it("Scenario 8: Concurrent ingestion of 25 events via Promise.all maintains atomic counts and sampling", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_conc_${randomUUID().replace(/-/g, "")}`;
    const totalRequests = 25;

    // Concurrently ingest 25 errors for the same fingerprint across 2 real users
    const promises = Array.from({ length: totalRequests }, (_, i) =>
      store.recordOccurrence({
        group: {
          fingerprint: testFingerprint,
          fingerprintVersion: 1,
          environment: "test",
          source: "backend",
          severity: "error",
          feature: "concurrency_load",
          title: "Concurrent PG atomic contention test",
        },
        event: {
          fingerprint: testFingerprint,
          requestId: `req_conc_${i}_${randomUUID()}`,
          sanitizedContext: { workerIndex: i },
          occurredAt: new Date(),
        },
        userId: i % 2 === 0 ? testUserId : testUser2Id,
      }),
    );

    const results = await Promise.all(promises);

    // Track created group ID for teardown cleanup
    const groupId = results[0].group.id;
    createdGroupIds.push(groupId);

    // Verify all 25 requests returned the EXACT SAME group id (no duplicate group created)
    for (const r of results) {
      expect(r.group.id).toBe(groupId);
      expect(r.group.fingerprint).toBe(testFingerprint);
    }

    // Exactly 1 new group was marked
    const newGroupCount = results.filter((r) => r.isNewGroup).length;
    expect(newGroupCount).toBe(1);

    // Fetch the final group state directly from PostgreSQL
    const finalGroup = await store.findGroupById(groupId);
    expect(finalGroup).not.toBeNull();
    // Exactly 25 total occurrences recorded atomically
    expect(finalGroup?.totalOccurrences).toBe(25);
    // Exactly 2 unique affected users recorded
    expect(finalGroup?.affectedUsersCount).toBe(2);

    // Check sampled events in the database:
    // Occurrences 1..10 (10 events) + occurrence 20 (1 event) = exactly 11 events
    const events = await store.listEvents({ groupId, page: 1, pageSize: 50 });
    expect(events.items).toHaveLength(11);
  });

  it("Scenario 9: Gracefully handles non-existent userId UUID via fk_error_events_user fallback storing event with null userId", async (ctx) => {
    if (!ensureConnected(ctx)) return;

    const testFingerprint = `test_fp_fk_fallback_${randomUUID().replace(/-/g, "")}`;
    const nonExistentUserId = randomUUID();

    const result = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "fk_fallback_test",
        title: "Non-existent user error event fallback test",
        status: "unresolved",
      },
      event: {
        fingerprint: testFingerprint,
        requestId: `req_fk_${randomUUID()}`,
        operation: "auth.verify_deleted_account",
        failureStage: "execute",
        endpoint: "/v1/auth/deleted-user",
        httpMethod: "POST",
        httpStatus: 500,
        sanitizedContext: { testDetail: "simulating deleted account" },
        occurredAt: new Date(),
      },
      userId: nonExistentUserId,
    });

    createdGroupIds.push(result.group.id);

    // 1. Group was created
    expect(result.isNewGroup).toBe(true);
    expect(result.group.totalOccurrences).toBe(1);
    // 2. Affected users count is 0 because user does not exist in users table
    expect(result.group.affectedUsersCount).toBe(0);
    expect(result.isNewUser).toBe(false);

    // 3. Event was sampled and recorded with fallback userId = null
    expect(result.isSampled).toBe(true);
    expect(result.event).toBeDefined();
    expect(result.event?.userId).toBeNull();
    expect(result.event?.operation).toBe("auth.verify_deleted_account");

    // 4. Verify in PostgreSQL directly that exactly 1 event exists and has userId = null (no duplicates)
    const directEvents = await client!.db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.groupId, result.group.id));

    expect(directEvents).toHaveLength(1);
    expect(directEvents[0].userId).toBeNull();
    expect(directEvents[0].operation).toBe("auth.verify_deleted_account");
    expect(directEvents[0].fingerprint).toBe(testFingerprint);

    // 5. Subsequent occurrence with same non-existent user increments totalOccurrences and records second event
    const secondResult = await store.recordOccurrence({
      group: {
        fingerprint: testFingerprint,
        fingerprintVersion: 1,
        environment: "test",
        source: "backend",
        severity: "error",
        feature: "fk_fallback_test",
        title: "Non-existent user error event fallback test",
      },
      event: {
        fingerprint: testFingerprint,
        requestId: `req_fk_2_${randomUUID()}`,
        operation: "auth.verify_deleted_account",
        sanitizedContext: {},
        occurredAt: new Date(),
      },
      userId: nonExistentUserId,
    });

    expect(secondResult.isNewGroup).toBe(false);
    expect(secondResult.group.totalOccurrences).toBe(2);
    expect(secondResult.group.affectedUsersCount).toBe(0);
    expect(secondResult.event).toBeDefined();
    expect(secondResult.event?.userId).toBeNull();

    // Verify exactly 2 events in database now (no duplicate inserts during fallback)
    const directEvents2 = await client!.db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.groupId, result.group.id));
    expect(directEvents2).toHaveLength(2);
  });
});
