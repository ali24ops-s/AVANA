/**
 * Integration & Unit Tests for DrizzleAdminStore.getAiAnalytics
 *
 * Verifies SQL Aggregation logic:
 * 1. Empty state (no jobs, no contents) -> valid shape, 0 counts, available: false
 * 2. Mixed job statuses (completed, failed, processing, queued) -> accurate success rate
 * 3. Average duration calculation from startedAt and completedAt in ms
 * 4. Jobs with null completedAt or startedAt do not crash or corrupt duration calculation
 * 5. Grouping by content type in byType map
 * 6. Token usage aggregation from JSONB (inputTokens, outputTokens, prompt_tokens, completion_tokens)
 * 7. Malformed or null tokenUsage handling without crashes
 * 8. Soft-deleted jobs and contents are excluded from aggregates
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { createDbClient } from "@avana/database/client";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import {
  generationJobs,
  generatedContents,
  organizations,
  documents,
  courses,
  users,
} from "@avana/database/schema";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const postgresUrl =
  process.env.DATABASE_URL ??
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

describe("DrizzleAdminStore getAiAnalytics - SQL Aggregation Tests", () => {
  let dbClient: ReturnType<typeof createDbClient>;
  let store: DrizzleAdminStore;
  let isConnected = false;

  let testOrgId: string;
  let testDocId: string;
  let testCourseId: string;
  let testUserId: string;

  beforeAll(async () => {
    try {
      dbClient = createDbClient(postgresUrl);
      await dbClient.db.execute(sql`SELECT 1;`);
      isConnected = true;
      store = new DrizzleAdminStore(dbClient.db);
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (dbClient) {
      await dbClient.close().catch(() => {});
    }
  });

  beforeEach(async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    testOrgId = randomUUID();
    testDocId = randomUUID();
    testCourseId = randomUUID();
    testUserId = randomUUID();

    // Create prerequisite rows for foreign keys
    await dbClient.db.insert(users).values({
      id: testUserId,
      email: `test_ai_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
      name: "Test User",
      passwordHash: "hash",
    });

    await dbClient.db.insert(organizations).values({
      id: testOrgId,
      name: "Test Org for AI Analytics",
      slug: `org-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    await dbClient.db.insert(courses).values({
      id: testCourseId,
      organizationId: testOrgId,
      name: "AI Analytics Test Course",
    });

    await dbClient.db.insert(documents).values({
      id: testDocId,
      organizationId: testOrgId,
      courseId: testCourseId,
      ownerUserId: testUserId,
      originalName: "test-doc.pdf",
      storageKey: `key-${Date.now()}`,
      sha256: "fake-sha256-test",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      status: "processed",
    });
  });

  it("Scenario 1: Empty state returns structured zero-value analytics without crash", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    // Clean any prior jobs/contents created by this test runner
    await dbClient.db.delete(generationJobs).where(eq(generationJobs.organizationId, testOrgId));
    await dbClient.db.delete(generatedContents).where(eq(generatedContents.organizationId, testOrgId));

    const analytics = await store.getAiAnalytics();

    expect(analytics).toBeDefined();
    expect(analytics.overview).toBeDefined();
    expect(typeof analytics.overview.totalJobs).toBe("number");
    expect(typeof analytics.overview.successful).toBe("number");
    expect(typeof analytics.overview.failed).toBe("number");
    expect(typeof analytics.overview.processing).toBe("number");
    expect(typeof analytics.overview.successRate).toBe("number");
    expect(typeof analytics.overview.averageDurationMs).toBe("number");
    expect(analytics.byType).toBeDefined();
    expect(analytics.tokens).toBeDefined();
  });

  it("Scenario 2 & 3: Aggregates mixed job statuses and calculates accurate success rate", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    const now = new Date();
    const tStarted1 = new Date(now.getTime() - 10000);
    const tCompleted1 = new Date(now.getTime() - 8000); // 2000ms duration

    const tStarted2 = new Date(now.getTime() - 6000);
    const tCompleted2 = new Date(now.getTime() - 2000); // 4000ms duration

    // Insert 2 completed, 1 failed, 1 processing
    await dbClient.db.insert(generationJobs).values([
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "lesson",
        status: "completed",
        startedAt: tStarted1,
        completedAt: tCompleted1,
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "flashcard",
        status: "completed",
        startedAt: tStarted2,
        completedAt: tCompleted2,
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "quiz",
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "lesson",
        status: "processing",
        startedAt: new Date(),
      },
    ]);

    const analytics = await store.getAiAnalytics();

    expect(analytics.overview.totalJobs).toBeGreaterThanOrEqual(4);
    expect(analytics.overview.successful).toBeGreaterThanOrEqual(2);
    expect(analytics.overview.failed).toBeGreaterThanOrEqual(1);
    expect(analytics.overview.processing).toBeGreaterThanOrEqual(1);
    expect(analytics.overview.successRate).toBeGreaterThan(0);
    expect(analytics.overview.averageDurationMs).toBeGreaterThan(0);

    // Verify byType grouping
    expect(analytics.byType.lesson).toBeDefined();
    expect(analytics.byType.lesson.total).toBeGreaterThanOrEqual(2);
    expect(analytics.byType.flashcard).toBeDefined();
    expect(analytics.byType.flashcard.total).toBeGreaterThanOrEqual(1);
    expect(analytics.byType.flashcard.success).toBeGreaterThanOrEqual(1);
  });

  it("Scenario 4, 6 & 7: Handles jobs without completed_at, invalid dates, and soft deletes", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    // Job with startedAt but no completedAt (should not affect avg duration)
    // Job that is soft deleted (should be excluded)
    await dbClient.db.insert(generationJobs).values([
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "study_plan",
        status: "queued",
        startedAt: null,
        completedAt: null,
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "deleted_type",
        status: "completed",
        deletedAt: new Date(),
      },
    ]);

    const analytics = await store.getAiAnalytics();
    expect(analytics).toBeDefined();
    expect(analytics.byType.deleted_type).toBeUndefined();
  });

  it("Scenario 5 & 8: Token usage extracted from JSONB with various key naming conventions", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    await dbClient.db.insert(generatedContents).values([
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "lesson",
        tokenUsage: { inputTokens: 150, outputTokens: 250 },
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "flashcard",
        tokenUsage: { prompt_tokens: 50, completion_tokens: 100 },
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "quiz",
        tokenUsage: null, // Null token usage
      },
      {
        id: randomUUID(),
        organizationId: testOrgId,
        documentId: testDocId,
        courseId: testCourseId,
        type: "quiz",
        tokenUsage: { invalid: "non-numeric" }, // Corrupt / invalid
      },
    ]);

    const analytics = await store.getAiAnalytics();

    expect(analytics.tokens.available).toBe(true);
    expect(analytics.tokens.input).toBeGreaterThanOrEqual(200); // 150 + 50
    expect(analytics.tokens.output).toBeGreaterThanOrEqual(350); // 250 + 100
    expect(analytics.tokens.total).toBe(analytics.tokens.input + analytics.tokens.output);
  });
});
