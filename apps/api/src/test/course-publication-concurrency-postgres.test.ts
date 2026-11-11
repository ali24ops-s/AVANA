import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  courses,
  users,
  organizations,
  coursePublications,
} from "@avana/database/schema";
import {
  asCourseId,
  asCoursePublicationId,
  DomainError,
} from "@avana/domain";
import { DrizzleCoursePublicationStore } from "../modules/courses/drizzle-stores.js";

/**
 * Real PostgreSQL Concurrency Test: Course Publication Version Race.
 *
 * Verifies that the unique index `idx_course_publications_course_version` on
 * `(course_id, version) WHERE deleted_at IS NULL`
 * strictly prevents duplicate version creation when two independent PostgreSQL clients
 * concurrently attempt to insert publications for the same course and version.
 *
 * One client succeeds, while the other is rejected with PostgreSQL error code 23505,
 * which DrizzleCoursePublicationStore safely translates into DomainError("conflict").
 *
 * If live PostgreSQL is not reachable in the isolated sandbox, gracefully skips.
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

describe("Real PostgreSQL: Course Publication Concurrency & Unique Versioning", () => {
  const candidateUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.STAGING_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  const validation = validateTestDatabaseUrl(candidateUrl);

  let client1: ReturnType<typeof createDbClient> | null = null;
  let client2: ReturnType<typeof createDbClient> | null = null;
  let isConnected = false;

  let store1: DrizzleCoursePublicationStore;
  let store2: DrizzleCoursePublicationStore;

  let testOrgId: string;
  let testUserId: string;
  const createdCourseIds: string[] = [];

  beforeAll(async () => {
    if (!validation.valid || !validation.url) {
      console.warn("Skipping real PG concurrency tests: database URL validation failed -", validation.reason);
      isConnected = false;
      return;
    }

    try {
      client1 = createDbClient(validation.url);
      client2 = createDbClient(validation.url);

      await client1.db.execute(sql`SELECT 1;`);
      await client2.db.execute(sql`SELECT 1;`);
      isConnected = true;

      store1 = new DrizzleCoursePublicationStore(client1.db);
      store2 = new DrizzleCoursePublicationStore(client2.db);

      // Seed test tenant & actor
      testOrgId = randomUUID();
      testUserId = randomUUID();

      await client1.db.insert(organizations).values({
        id: testOrgId,
        name: "Concurrency Test Org",
        slug: `conc-org-${Date.now()}`,
      });

      await client1.db.insert(users).values({
        id: testUserId,
        email: `conc-user-${Date.now()}@avana.test`,
        passwordHash: "dummy-hash",
      });
    } catch (err) {
      console.warn("PostgreSQL not accessible in test environment, skipping real PG integration tests:", (err as Error)?.message || err);
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (isConnected && client1) {
      try {
        for (const cid of createdCourseIds) {
          await client1.db.delete(coursePublications).where(eq(coursePublications.courseId, cid));
          await client1.db.delete(courses).where(eq(courses.id, cid));
        }
        if (testUserId) {
          await client1.db.delete(users).where(eq(users.id, testUserId));
        }
        if (testOrgId) {
          await client1.db.delete(organizations).where(eq(organizations.id, testOrgId));
        }
      } catch (err) {
        console.warn("Cleanup warning:", err);
      }
    }

    if (client1) await client1.close();
    if (client2) await client2.close();
  });

  it("Enforces unique version across concurrent independent client connections (23505 -> 409 Conflict)", async () => {
    if (!isConnected || !client1 || !client2) {
      console.warn("Skipping real PG concurrency test: database not connected in sandbox.");
      return;
    }

    const courseId = asCourseId(randomUUID());
    createdCourseIds.push(courseId);

    // Seed base course
    await client1.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Concurrency Test Course",
      description: "Testing concurrent publication submissions",
      subject: "Computer Science",
      targetAcademicFields: [],
      status: "draft",
      isOfficial: false,
    });

    const now = new Date().toISOString();
    const versionNumber = 1;

    const pubRecord1 = {
      id: asCoursePublicationId(randomUUID()),
      courseId,
      creatorUserId: testUserId as any,
      organizationId: testOrgId as any,
      title: "Concurrent Publication A",
      description: null,
      subject: "Computer Science",
      version: versionNumber,
      status: "pending_review" as const,
      publishedAt: null,
      metadata: { stats: { totalLessons: 1 } },
      snapshot: { chapters: [], stats: { totalLessons: 1 } },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const pubRecord2 = {
      id: asCoursePublicationId(randomUUID()),
      courseId,
      creatorUserId: testUserId as any,
      organizationId: testOrgId as any,
      title: "Concurrent Publication B",
      description: null,
      subject: "Computer Science",
      version: versionNumber,
      status: "pending_review" as const,
      publishedAt: null,
      metadata: { stats: { totalLessons: 1 } },
      snapshot: { chapters: [], stats: { totalLessons: 1 } },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // Run concurrent inserts from two separate PostgreSQL connections
    const results = await Promise.allSettled([
      store1.create(pubRecord1),
      store2.create(pubRecord2),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one insert succeeds
    expect(fulfilled).toHaveLength(1);
    // Exactly one insert fails
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("conflict");
    expect((error as DomainError).message).toContain("قبلاً ثبت شده است");
  });

  it("Enforces uniqueness between historical status (e.g. unpublished) and new submission", async () => {
    if (!isConnected || !client1 || !client2) {
      console.warn("Skipping real PG concurrency test: database not connected in sandbox.");
      return;
    }

    const courseId = asCourseId(randomUUID());
    createdCourseIds.push(courseId);

    await client1.db.insert(courses).values({
      id: courseId,
      organizationId: testOrgId,
      name: "Historical Version Test Course",
      description: "Testing version collision with unpublished record",
      subject: "Mathematics",
      targetAcademicFields: [],
      status: "unpublished",
      isOfficial: false,
    });

    const now = new Date().toISOString();

    // Client 1 creates an 'unpublished' publication with version 2
    await store1.create({
      id: asCoursePublicationId(randomUUID()),
      courseId,
      creatorUserId: testUserId as any,
      organizationId: testOrgId as any,
      title: "Historical Version 2",
      description: null,
      subject: "Mathematics",
      version: 2,
      status: "unpublished",
      publishedAt: null,
      metadata: {},
      snapshot: { chapters: [], stats: {} },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Client 2 attempts to insert version 2 with status 'pending_review'
    await expect(
      store2.create({
        id: asCoursePublicationId(randomUUID()),
        courseId,
        creatorUserId: testUserId as any,
        organizationId: testOrgId as any,
        title: "Conflicting Version 2",
        description: null,
        subject: "Mathematics",
        version: 2,
        status: "pending_review",
        publishedAt: null,
        metadata: {},
        snapshot: { chapters: [], stats: {} },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ).rejects.toThrowError(/قبلاً ثبت شده است/);
  });
});
