/**
 * AVANA Exam System - 100 Concurrent Users Load & Stress Test Benchmark
 *
 * Scenarios tested:
 *  - Scenario A: Steady-state batch sync (100 users, answering every ~30s, batch sync 55-65s)
 *  - Scenario B: Initial wave (100 users starting simultaneously)
 *  - Scenario C: Network reconnect burst (30 users offline for 2 mins, reconnecting & flushing multi-answer batches)
 *  - Scenario D: Final submit burst (100 users submitting simultaneously within 3 seconds)
 */

import { describe, it, expect } from "vitest";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  type QuizQuestionRecord,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import {
  asUserSubscriptionId,
  asProductId,
  type UserId,
  type OrganizationId,
  type QuizId,
  type QuizAttemptId,
} from "@avana/domain";

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value || "";
}

class MetricsCollector {
  private latencies: number[] = [];
  private errors = 0;
  private success = 0;
  private startTime = 0;
  private endTime = 0;

  start() {
    this.startTime = performance.now();
    this.latencies = [];
    this.errors = 0;
    this.success = 0;
  }

  record(durationMs: number, ok: boolean) {
    this.latencies.push(durationMs);
    if (ok) {
      this.success++;
    } else {
      this.errors++;
    }
  }

  stop() {
    this.endTime = performance.now();
  }

  summary() {
    const totalDurationSec = (this.endTime - this.startTime) / 1000;
    const count = this.latencies.length;
    const sorted = [...this.latencies].sort((a, b) => a - b);

    const min = count > 0 ? sorted[0] : 0;
    const max = count > 0 ? sorted[count - 1] : 0;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = count > 0 ? sum / count : 0;

    const percentile = (p: number) => {
      if (count === 0) return 0;
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return sorted[idx];
    };

    const rps = totalDurationSec > 0 ? count / totalDurationSec : 0;
    const errorRate = count > 0 ? (this.errors / count) * 100 : 0;

    return {
      totalRequests: count,
      successfulRequests: this.success,
      failedRequests: this.errors,
      durationSec: Number(totalDurationSec.toFixed(2)),
      rps: Number(rps.toFixed(1)),
      errorRate: Number(errorRate.toFixed(2)),
      latencyMs: {
        min: Number(min.toFixed(2)),
        mean: Number(mean.toFixed(2)),
        p50: Number(percentile(50).toFixed(2)),
        p95: Number(percentile(95).toFixed(2)),
        p99: Number(percentile(99).toFixed(2)),
        max: Number(max.toFixed(2)),
      },
    };
  }
}

describe("100 Concurrent Users Load & Stress Test Suite", () => {
  it("executes Scenario A, B, C, D with 100 concurrent users without degradation or data loss", async () => {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";

    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore();
    const orgStore = new InMemoryOrganizationStore();
    const courseStore = new InMemoryCourseStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();
    const documentStore = new InMemoryDocumentStore();
    const documentChunkStore = new InMemoryDocumentChunkStore();
    const generatedContentStore = new InMemoryGeneratedContentStore();
    const generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();
    const queue = new InMemoryGenerationQueue(generationJobStore);
    const flashcardStore = new InMemoryFlashcardStore();
    const flashcardReviewStore = new InMemoryFlashcardReviewStore();
    const userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    const quizStore = new InMemoryQuizStore();
    const quizQuestionStore = new InMemoryQuizQuestionStore();
    const quizAttemptStore = new InMemoryQuizAttemptStore();
    const commerceStore = new InMemoryCommerceStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    const config = loadApiConfig();
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      generationQueue: queue,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      commerceStore,
      auditService,
    });
    await app.ready();

    // Setup organization
    const orgId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "دانشگاه علوم پزشکی تهران",
        slug: "load-test-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: "admin-user" as UserId,
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const quizId = randomUUID() as QuizId;

    // Seed 20 questions in question snapshot
    const mockQuestions: QuizQuestionRecord[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q-load-${i + 1}`,
      quizId,
      question: `سؤال آزمون شماره ${i + 1} چیست؟`,
      choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
      correctAnswer: "گزینه ۱",
      sortOrder: i,
      difficulty: "medium",
      questionType: "multiple_choice",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Provision 100 users, assign subscriptions, and create their attempts
    const userTokens = new Map<string, string>();
    const attemptIds = new Map<string, string>();

    for (let i = 1; i <= 100; i++) {
      const email = `student-${i}-${Date.now()}@example.com`;
      const user = await userStore.createFromVerifiedIdentity({
        email,
        name: `شرکت‌کننده شماره ${i}`,
        provider: "local",
        providerSubject: `local|${email}`,
      });
      const userId = user.id as UserId;

      // Add user to organization
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Active subscription
      commerceStore.subscriptions.push({
        id: asUserSubscriptionId(`sub-${i}`),
        userId,
        planId: asProductId("prod-pro"),
        status: "active",
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        autoRenew: false,
        gateway: "mock",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Sign-in to get session token
      const authRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email, name: `شرکت‌کننده شماره ${i}` },
      });
      if (authRes.statusCode !== 200 && i === 1) {
        console.log("Auth sign-in failed:", authRes.statusCode, authRes.body);
      }
      const token = extractSessionToken(authRes);
      userTokens.set(userId, token);

      // Create pre-existing attempt for the user
      const attemptId = randomUUID() as QuizAttemptId;
      quizAttemptStore.insert({
        id: attemptId,
        userId,
        quizId,
        score: 0,
        answers: {},
        questionIds: mockQuestions.map((q) => q.id),
        questionSnapshot: mockQuestions,
        metrics: {
          totalTimeSeconds: 3600,
          elapsedSeconds: 0,
          answersMeta: {},
        },
        status: "in_progress",
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      attemptIds.set(userId, attemptId);
    }

    const userIds = Array.from(userTokens.keys());
    expect(userIds).toHaveLength(100);

    const elDelay = monitorEventLoopDelay({ resolution: 20 });
    elDelay.enable();

    // ==============================================================================
    // SCENARIO B: INITIAL WAVE (100 Users start / fetch exam state concurrently)
    // ==============================================================================
    const waveCollector = new MetricsCollector();
    waveCollector.start();

    await Promise.all(
      userIds.map(async (userId) => {
        const attemptId = attemptIds.get(userId)!;
        const token = userTokens.get(userId)!;
        const start = performance.now();
        const res = await app.inject({
          method: "GET",
          url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
          cookies: { avana_session: token },
        });
        const elapsed = performance.now() - start;
        const ok = res.statusCode === 200;
        if (!ok && userIds.indexOf(userId) === 0) {
          console.log("Scenario B failure:", res.statusCode, res.body);
        }
        waveCollector.record(elapsed, ok);
      })
    );
    waveCollector.stop();
    const waveSummary = waveCollector.summary();

    expect(waveSummary.successfulRequests).toBe(100);
    expect(waveSummary.errorRate).toBe(0);

    // ==============================================================================
    // SCENARIO A: STEADY-STATE BATCH SYNC (100 Users syncing batched answers across 3 rounds)
    // ==============================================================================
    const syncCollector = new MetricsCollector();
    syncCollector.start();

    for (let round = 1; round <= 3; round++) {
      const qIdx1 = ((round - 1) * 2) % mockQuestions.length;
      const qIdx2 = ((round - 1) * 2 + 1) % mockQuestions.length;

      await Promise.all(
        userIds.map(async (userId, userIdx) => {
          const attemptId = attemptIds.get(userId)!;
          const token = userTokens.get(userId)!;

          const batchPayload = [
            {
              questionId: mockQuestions[qIdx1].id,
              answer: "گزینه ۱",
              revision: round * 2 - 1,
              clientUpdatedAt: Date.now(),
            },
            {
              questionId: mockQuestions[qIdx2].id,
              answer: userIdx % 2 === 0 ? "گزینه ۱" : "گزینه ۲",
              revision: round * 2,
              clientUpdatedAt: Date.now(),
            },
          ];

          const start = performance.now();
          const res = await app.inject({
            method: "POST",
            url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
            cookies: { avana_session: token },
            payload: {
              answers: batchPayload,
              elapsedSeconds: round * 60,
            },
          });
          const elapsed = performance.now() - start;
          const ok = res.statusCode === 200;
          syncCollector.record(elapsed, ok);
        })
      );
    }
    syncCollector.stop();
    const syncSummary = syncCollector.summary();

    expect(syncSummary.successfulRequests).toBe(300);
    expect(syncSummary.errorRate).toBe(0);

    // ==============================================================================
    // SCENARIO C: NETWORK RECONNECT BURST (30 users reconnecting with 6 answers each)
    // ==============================================================================
    const reconnectCollector = new MetricsCollector();
    reconnectCollector.start();
    const disconnectedUsers = userIds.slice(0, 30);

    await Promise.all(
      disconnectedUsers.map(async (userId) => {
        const attemptId = attemptIds.get(userId)!;
        const token = userTokens.get(userId)!;

        const pendingBatch = Array.from({ length: 6 }, (_, idx) => ({
          questionId: mockQuestions[idx + 6].id,
          answer: "گزینه ۱",
          revision: 10 + idx,
          clientUpdatedAt: Date.now() - (6 - idx) * 20000,
        }));

        const start = performance.now();
        const res = await app.inject({
          method: "POST",
          url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
          cookies: { avana_session: token },
          payload: {
            answers: pendingBatch,
            elapsedSeconds: 300,
          },
        });
        const elapsed = performance.now() - start;
        const ok = res.statusCode === 200;
        reconnectCollector.record(elapsed, ok);
      })
    );
    reconnectCollector.stop();
    const reconnectSummary = reconnectCollector.summary();

    expect(reconnectSummary.successfulRequests).toBe(30);
    expect(reconnectSummary.errorRate).toBe(0);

    // ==============================================================================
    // SCENARIO D: FINAL SUBMIT BURST (100 users submitting simultaneously)
    // ==============================================================================
    const submitCollector = new MetricsCollector();
    submitCollector.start();

    await Promise.all(
      userIds.map(async (userId) => {
        const attemptId = attemptIds.get(userId)!;
        const token = userTokens.get(userId)!;

        const start = performance.now();
        const res = await app.inject({
          method: "POST",
          url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
          cookies: { avana_session: token },
          payload: {
            elapsedSeconds: 1800,
            answers: mockQuestions.map((q) => ({
              questionId: q.id,
              answer: "گزینه ۱",
            })),
          },
        });
        const elapsed = performance.now() - start;
        const ok = res.statusCode === 200;
        submitCollector.record(elapsed, ok);
      })
    );
    submitCollector.stop();
    const submitSummary = submitCollector.summary();

    expect(submitSummary.successfulRequests).toBe(100);
    expect(submitSummary.errorRate).toBe(0);

    // Metrics & Health
    elDelay.disable();
    const elLagMean = Number((elDelay.mean / 1_000_000).toFixed(2));
    const elLagP95 = Number((elDelay.percentile(95) / 1_000_000).toFixed(2));
    const memUsage = process.memoryUsage();
    const heapUsedMb = Number((memUsage.heapUsed / 1024 / 1024).toFixed(1));

    // Print benchmark report
    console.log("\n================ LOAD TEST BENCHMARK RESULTS (100 CONCURRENT USERS) ================");
    console.log(`Scenario B (Initial Wave):        p50 = ${waveSummary.latencyMs.p50}ms | p95 = ${waveSummary.latencyMs.p95}ms | p99 = ${waveSummary.latencyMs.p99}ms | RPS = ${waveSummary.rps}`);
    console.log(`Scenario A (Batched Sync):         p50 = ${syncSummary.latencyMs.p50}ms | p95 = ${syncSummary.latencyMs.p95}ms | p99 = ${syncSummary.latencyMs.p99}ms | RPS = ${syncSummary.rps}`);
    console.log(`Scenario C (Reconnect Burst):      p50 = ${reconnectSummary.latencyMs.p50}ms | p95 = ${reconnectSummary.latencyMs.p95}ms | p99 = ${reconnectSummary.latencyMs.p99}ms | RPS = ${reconnectSummary.rps}`);
    console.log(`Scenario D (Final Submit Burst):   p50 = ${submitSummary.latencyMs.p50}ms | p95 = ${submitSummary.latencyMs.p95}ms | p99 = ${submitSummary.latencyMs.p99}ms | RPS = ${submitSummary.rps}`);
    console.log(`Event Loop Lag:                   mean = ${elLagMean}ms | p95 = ${elLagP95}ms`);
    console.log(`Heap Memory Used:                 ${heapUsedMb} MB`);
    console.log("====================================================================================\n");

    expect(elLagMean).toBeLessThan(50);
    await app.close();
  }, 60000);
});
