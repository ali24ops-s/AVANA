import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  organizations,
  users,
  courses,
  modules,
  lessons,
  marketingQuizzes,
  studioExamGenerationOperations,
  studioExamGenerationTasks,
  studioExamGenerationBatches,
} from "@avana/database/schema";
import { up } from "../../../../database/migrations/0108_studio_exam_generation.js";
import { up as up0109 } from "../../../../database/migrations/0109_studio_exam_question_review.js";
import {
  DrizzleStudioExamStore,
  FencingTokenStaleError,
  WorkerStopError,
} from "../modules/studio/studio-exam-store.js";
import { DomainError } from "@avana/domain";
import {
  assertSafeDestructiveTestOperation,
  resolveSafePostgresTestUrl,
} from "./pg-test-guard.js";

describe("Real PostgreSQL: Studio Exam Concurrency, Fencing & Transactions", () => {
  let dbUrl = "";
  let clientA: ReturnType<typeof createDbClient>;
  let clientB: ReturnType<typeof createDbClient>;
  let storeA: DrizzleStudioExamStore;
  let storeB: DrizzleStudioExamStore;
  let isConnected = false;

  let testOrgId: string;
  let testUserId: string;
  let testCourseId: string;
  let testModuleId: string;
  let testQuizId: string;

  beforeAll(async () => {
    dbUrl = resolveSafePostgresTestUrl();
    try {
      clientA = createDbClient(dbUrl);
      clientB = createDbClient(dbUrl);

      await clientA.db.execute(sql`SELECT 1;`);
      await clientB.db.execute(sql`SELECT 1;`);
      isConnected = true;

      assertSafeDestructiveTestOperation("studio_exam_migrations", dbUrl);
      // Apply migrations 0108 & 0109 idempotently if needed
      await up(clientA.db).catch(() => {});
      await up0109(clientA.db).catch(() => {});

      // Seed core entities
      testOrgId = randomUUID();
      testUserId = randomUUID();
      testCourseId = randomUUID();
      testModuleId = randomUUID();
      testQuizId = randomUUID();

      await clientA.db.insert(organizations).values({
        id: testOrgId,
        name: "Test Exam Org",
        slug: `exam-org-${Date.now()}`,
      });

      await clientA.db.insert(users).values({
        id: testUserId,
        email: `exam-user-${Date.now()}@avana.test`,
        name: "Exam Admin",
        globalRole: "platform_admin",
      });

      await clientA.db.insert(courses).values({
        id: testCourseId,
        organizationId: testOrgId,
        name: "Test Pharmacology Course",
        version: 1,
        status: "published",
      });

      await clientA.db.insert(modules).values({
        id: testModuleId,
        courseId: testCourseId,
        title: "فصل ۱: فارماکوکینتیک",
        sortOrder: 1,
      });

      await clientA.db.insert(lessons).values({
        id: randomUUID(),
        moduleId: testModuleId,
        title: "مقدمه بر جذب و توزیع",
        contentType: "markdown",
        contentMarkdown: "متن کامل درس فارماکوکینتیک داروها و مفاهیم نیمه‌عمر و حجم توزیع.",
        sortOrder: 1,
        publicationStatus: "published",
      });

      await clientA.db.insert(marketingQuizzes).values({
        id: testQuizId,
        organizationId: testOrgId,
        slug: `exam-quiz-${Date.now()}`,
        title: "آزمون استودیو فارماکولوژی",
        status: "draft",
      });

      storeA = new DrizzleStudioExamStore(clientA.db);
      storeB = new DrizzleStudioExamStore(clientB.db);
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    try {
      if (isConnected) {
        assertSafeDestructiveTestOperation("studio_exam_cleanup", dbUrl);
        await clientA.db.execute(sql`
          DELETE FROM studio_exam_generation_operations WHERE quiz_id = ${testQuizId}::uuid
        `);
        await clientA.db.execute(sql`
          DELETE FROM marketing_quizzes WHERE id = ${testQuizId}::uuid
        `);
        await clientA.db.execute(sql`
          DELETE FROM lessons WHERE module_id = ${testModuleId}::uuid
        `);
        await clientA.db.execute(sql`
          DELETE FROM modules WHERE id = ${testModuleId}::uuid
        `);
        await clientA.db.execute(sql`
          DELETE FROM courses WHERE id = ${testCourseId}::uuid
        `);
        await clientA.db.execute(sql`
          DELETE FROM users WHERE id = ${testUserId}::uuid
        `);
        await clientA.db.execute(sql`
          DELETE FROM organizations WHERE id = ${testOrgId}::uuid
        `);
      }
    } finally {
      try {
        if (clientA) await clientA.close();
      } finally {
        if (clientB) await clientB.close();
      }
    }
  });

  async function createTestBatchFixture(targetCount = 5) {
    const opId = randomUUID();
    const taskId = randomUUID();
    const batchId = randomUUID();

    await clientA.db.insert(studioExamGenerationOperations).values({
      id: opId,
      quizId: testQuizId,
      organizationId: testOrgId,
      createdBy: testUserId,
      totalRequestedQuestions: targetCount,
      status: "pending",
      config: { difficulty: "medium" },
      patternSnapshots: [
        {
          patternId: "pat-1",
          patternVersion: 1,
          title: "مفهومی",
          category: "exam",
          cognitiveLevel: "analysis",
          skills: ["critical_thinking"],
          systemInstructions: "generate conceptual question",
          examples: [],
        },
      ],
    });

    await clientA.db.insert(studioExamGenerationTasks).values({
      id: taskId,
      operationId: opId,
      courseId: testCourseId,
      moduleId: testModuleId,
      targetQuestionCount: targetCount,
      status: "pending",
    });

    await clientA.db.insert(studioExamGenerationBatches).values({
      id: batchId,
      taskId,
      batchIndex: 1,
      targetCount,
      generatedCount: 0,
      status: "pending",
      retryCount: 0,
      patternAllocations: Array.from({ length: targetCount }, (_, i) => ({
        questionIndex: i + 1,
        patternId: "pat-1",
        patternVersion: 1,
      })),
    });

    return { opId, taskId, batchId };
  }

  it("1. concurrent claim by two independent connections: exactly one claims and token increments", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);

    // Concurrently issue claimBatch from clientA and clientB
    const [resA, resB] = await Promise.all([
      storeA.claimBatch(batchId, 120),
      storeB.claimBatch(batchId, 120),
    ]);

    const winner = resA.claimed ? resA : resB;
    const loser = resA.claimed ? resB : resA;

    expect(winner.claimed).toBe(true);
    expect(winner.fencingToken).toBe(1);

    expect(loser.claimed).toBe(false);
    expect(loser.reason).toBe("active_lease_held");

    // Verify DB state
    const check = await clientA.db.execute<{ status: string; retry_count: number }>(sql`
      SELECT status, retry_count FROM studio_exam_generation_batches WHERE id = ${batchId}::uuid;
    `);
    const row = check.rows[0];
    expect(row.status).toBe("processing");
    expect(row.retry_count).toBe(1);
  });

  it("2. valid heartbeat extends lease timestamp", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    const claim = await storeA.claimBatch(batchId, 120);
    expect(claim.claimed).toBe(true);
    const token = claim.fencingToken!;

    // Set updated_at to 60s ago
    await clientA.db.execute(sql`
      UPDATE studio_exam_generation_batches
      SET updated_at = NOW() - INTERVAL '60 seconds'
      WHERE id = ${batchId}::uuid;
    `);

    const renewed = await storeA.heartbeatBatch(batchId, token, 120);
    expect(renewed).toBe(true);

    const check = await clientA.db.execute<{ is_fresh: boolean }>(sql`
      SELECT (updated_at >= NOW() - INTERVAL '5 seconds') AS is_fresh
      FROM studio_exam_generation_batches WHERE id = ${batchId}::uuid;
    `);
    expect(check.rows[0].is_fresh).toBe(true);
  });

  it("3. rejects heartbeat with stale token", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    await storeA.claimBatch(batchId, 120); // token is 1

    // Simulate second claim incrementing retry_count to 2
    await clientA.db.execute(sql`
      UPDATE studio_exam_generation_batches
      SET retry_count = 2, updated_at = NOW()
      WHERE id = ${batchId}::uuid;
    `);

    // Worker A with old token 1 attempts heartbeat
    const renewed = await storeA.heartbeatBatch(batchId, 1, 120);
    expect(renewed).toBe(false);
  });

  it("4. rejects heartbeat after lease expiry (> 120s silence)", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Artificially age the batch beyond lease window (150 seconds ago)
    await clientA.db.execute(sql`
      UPDATE studio_exam_generation_batches
      SET updated_at = NOW() - INTERVAL '150 seconds'
      WHERE id = ${batchId}::uuid;
    `);

    // Worker A tries to revive expired lease
    const renewed = await storeA.heartbeatBatch(batchId, token, 120);
    expect(renewed).toBe(false); // MUST BE FALSE: Expired lease cannot be revived!
  });

  it("5. race between expired heartbeat and re-claim by new worker", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    const claim1 = await storeA.claimBatch(batchId, 120);
    const oldToken = claim1.fencingToken!;

    // Age lease beyond 120s
    await clientA.db.execute(sql`
      UPDATE studio_exam_generation_batches
      SET updated_at = NOW() - INTERVAL '130 seconds'
      WHERE id = ${batchId}::uuid;
    `);

    // Worker B claims while Worker A tries to heartbeat
    const [hbResult, claim2] = await Promise.all([
      storeA.heartbeatBatch(batchId, oldToken, 120),
      storeB.claimBatch(batchId, 120),
    ]);

    expect(hbResult).toBe(false);
    expect(claim2.claimed).toBe(true);
    expect(claim2.fencingToken).toBe(2);
  });

  it("6. blocks zombie worker from saving output with stale token", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    await storeA.claimBatch(batchId, 120); // Worker A got token 1

    // Worker B took over and got token 2
    await clientA.db.execute(sql`
      UPDATE studio_exam_generation_batches
      SET retry_count = 2, updated_at = NOW()
      WHERE id = ${batchId}::uuid;
    `);

    // Worker A wakes up and attempts to commit questions with old token 1
    await expect(
      storeA.saveBatchQuestionsAndFinalize({
        batchId,
        fencingToken: 1, // Stale!
        questions: [
          {
            questionIndex: 1,
            patternId: "pat-1",
            question: "سؤال ثبت شده توسط ورکر زامبی که باید رد شود",
            choices: ["الف", "ب", "ج", "د"],
            correctAnswer: "الف",
            explanation: "توضیح",
          },
        ],
      }),
    ).rejects.toThrow(FencingTokenStaleError);

    // Verify no questions were inserted
    const countCheck = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM studio_exam_generated_questions WHERE batch_id = ${batchId}::uuid;
    `);
    expect(countCheck.rows[0].count).toBe(0);
  });

  it("7. real database transaction rollback on error: zero partial rows committed", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Pass one valid question and one question with invalid boundary (index 99 > targetCount 5)
    await expect(
      storeA.saveBatchQuestionsAndFinalize({
        batchId,
        fencingToken: token,
        questions: [
          {
            questionIndex: 1,
            patternId: "pat-1",
            question: "سؤال معتبر اول",
            choices: ["الف", "ب", "ج", "د"],
            correctAnswer: "الف",
            explanation: "توضیح",
          },
          {
            questionIndex: 99, // INVALID!
            patternId: "pat-1",
            question: "سؤال دوم نامعتبر",
            choices: ["الف", "ب", "ج", "د"],
            correctAnswer: "الف",
            explanation: "توضیح",
          },
        ],
      }),
    ).rejects.toThrow(/خارج از بازه مجاز/);

    // Verify that question 1 was also rolled back completely
    const countCheck = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM studio_exam_generated_questions WHERE batch_id = ${batchId}::uuid;
    `);
    expect(countCheck.rows[0].count).toBe(0);
  });

  it("8. already_completed idempotency: detects completed batch without writing duplicates", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(2);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Save 2 questions and complete batch
    await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: token,
      questions: [
        {
          questionIndex: 1,
          patternId: "pat-1",
          question: "سؤال شماره یک کامل",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۱",
          explanation: "توضیح ۱",
        },
        {
          questionIndex: 2,
          patternId: "pat-1",
          question: "سؤال شماره دو کامل",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۲",
          explanation: "توضیح ۲",
        },
      ],
    });

    // Re-issue claim on completed batch
    const reClaim = await storeB.claimBatch(batchId, 120);
    expect(reClaim.claimed).toBe(false);
    expect(reClaim.reason).toBe("already_completed");
  });

  it("9. generated_count strictly matches actual physical COUNT(*) of questions", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { batchId } = await createTestBatchFixture(5);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Partial save: 3 questions out of 5
    const res = await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: token,
      questions: [
        {
          questionIndex: 1,
          patternId: "pat-1",
          question: "سؤال ۱ برای آزمون شمارش",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۱",
          explanation: "توضیح ۱",
        },
        {
          questionIndex: 2,
          patternId: "pat-1",
          question: "سؤال ۲ برای آزمون شمارش",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۲",
          explanation: "توضیح ۲",
        },
        {
          questionIndex: 3,
          patternId: "pat-1",
          question: "سؤال ۳ برای آزمون شمارش",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۳",
          explanation: "توضیح ۳",
        },
      ],
    });

    expect(res.generatedCount).toBe(3);
    expect(res.isCompleted).toBe(false);

    const batchCheck = await clientA.db.execute<{ generated_count: number }>(sql`
      SELECT generated_count FROM studio_exam_generation_batches WHERE id = ${batchId}::uuid;
    `);
    const qCountCheck = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM studio_exam_generated_questions WHERE batch_id = ${batchId}::uuid;
    `);

    expect(batchCheck.rows[0].generated_count).toBe(3);
    expect(qCountCheck.rows[0].count).toBe(3);
  });

  it("10. reconciles Task & Operation status deterministically under row lock", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, taskId, batchId } = await createTestBatchFixture(1);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Complete the batch
    await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: token,
      questions: [
        {
          questionIndex: 1,
          patternId: "pat-1",
          question: "سؤال تست تطبیق وضعیت",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۱",
          explanation: "توضیح",
        },
      ],
    });

    // Execute reconcile
    const reconcileResult = await storeA.reconcileTaskAndOperation(taskId, opId);

    expect(reconcileResult.taskStatus).toBe("completed");
    expect(reconcileResult.taskGeneratedCount).toBe(1);
    expect(reconcileResult.operationStatus).toBe("completed");
    expect(reconcileResult.operationGeneratedCount).toBe(1);

    // Verify DB
    const taskCheck = await clientA.db.execute<{ status: string }>(sql`
      SELECT status FROM studio_exam_generation_tasks WHERE id = ${taskId}::uuid;
    `);
    expect(taskCheck.rows[0].status).toBe("completed");

    const opCheck = await clientA.db.execute<{ status: string }>(sql`
      SELECT status FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
    expect(opCheck.rows[0].status).toBe("completed");
  });

  it("11. atomic cancel blocks subsequent save: no questions are saved once cancel commits", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, batchId } = await createTestBatchFixture(1);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Cancel operation concurrently via Connection B
    const cancelRes = await storeB.cancelOperation(opId, "Test cancellation");
    expect(cancelRes.cancelled).toBe(true);

    // Now Connection A attempts to save questions with its fencing token
    await expect(
      storeA.saveBatchQuestionsAndFinalize({
        batchId,
        fencingToken: token,
        questions: [
          {
            questionIndex: 1,
            patternId: "pat-1",
            question: "سؤال که نباید ذخیره شود",
            choices: ["۱", "۲", "۳", "۴"],
            correctAnswer: "۱",
          },
        ],
      }),
    ).rejects.toThrow(WorkerStopError);

    // Verify ZERO questions were saved
    const countCheck = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM studio_exam_generated_questions WHERE batch_id = ${batchId}::uuid;
    `);
    expect(countCheck.rows[0].count).toBe(0);
  });

  it("12. claim is rejected after cancelOperation", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, batchId } = await createTestBatchFixture(1);
    await storeA.cancelOperation(opId, "Cancellation before claim");

    // Attempt to claim
    const claimRes = await storeB.claimBatch(batchId, 120);
    expect(claimRes.claimed).toBe(false);
    expect(claimRes.reason).toBe("operation_cancelled");
  });

  it("13. cancelOperation keeps completed batches intact and marks operation partial if questions exist", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, batchId } = await createTestBatchFixture(2);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    // Complete batch 1
    await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: token,
      questions: [
        {
          questionIndex: 1,
          question: "سؤال یک تکمیل شده",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۱",
        },
        {
          questionIndex: 2,
          question: "سؤال دو تکمیل شده",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۲",
        },
      ],
    });

    // Now cancel operation
    const cancelRes = await storeB.cancelOperation(opId, "Partial cancellation");
    expect(cancelRes.cancelled).toBe(true);
    expect(cancelRes.reason).toBe("partial");

    // Verify operation status is partial, not cancelled
    const opCheck = await clientA.db.execute<{ status: string; total_generated_questions: number }>(sql`
      SELECT status, total_generated_questions FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
    expect(opCheck.rows[0].status).toBe("partial");
    expect(opCheck.rows[0].total_generated_questions).toBe(2);
  });

  it("14. handleBatchFinalFailureAndReconcile sets batch failed and updates operation status safely", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, taskId, batchId } = await createTestBatchFixture(1);
    const claim = await storeA.claimBatch(batchId, 120);
    const token = claim.fencingToken!;

    await storeA.handleBatchFinalFailureAndReconcile({
      batchId,
      fencingToken: token,
      errorCode: "exhausted_retries",
      errorMessage: "Max retry limit reached",
      taskId,
      operationId: opId,
    });

    const batchCheck = await clientA.db.execute<{ status: string; error_code: string }>(sql`
      SELECT status, error_code FROM studio_exam_generation_batches WHERE id = ${batchId}::uuid;
    `);
    expect(batchCheck.rows[0].status).toBe("failed");
    expect(batchCheck.rows[0].error_code).toBe("exhausted_retries");

    const opCheck = await clientA.db.execute<{ status: string }>(sql`
      SELECT status FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
    expect(opCheck.rows[0].status).toBe("failed");
  });

  it("15. Race Condition: concurrent createOperationWithTasksAndBatches allows exactly one to succeed and rejects the other with conflict", async (ctx) => {
    if (!isConnected) return ctx.skip();

    // Create a dedicated quiz to test concurrent creation from an empty slate
    const concurrentQuizId = randomUUID();
    await clientA.db.insert(marketingQuizzes).values({
      id: concurrentQuizId,
      organizationId: testOrgId,
      slug: `concurrent-quiz-${Date.now()}-${randomUUID().slice(0, 8)}`,
      title: "Concurrent Race Test Quiz",
      status: "draft",
    });

    const createParams = {
      quizId: concurrentQuizId,
      organizationId: testOrgId,
      createdBy: testUserId,
      totalRequestedQuestions: 5,
      config: { difficulty: "medium" },
      patternSnapshots: [],
      tasks: [
        {
          courseId: testCourseId,
          moduleId: testModuleId,
          targetQuestionCount: 5,
          batches: [
            {
              batchIndex: 1,
              targetCount: 5,
              patternAllocations: [],
            },
          ],
        },
      ],
    };

    // Run storeA and storeB simultaneously against real PostgreSQL
    const results = await Promise.allSettled([
      storeA.createOperationWithTasksAndBatches(createParams),
      storeB.createOperationWithTasksAndBatches(createParams),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed and exactly one must fail
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // The rejected request must be a DomainError with conflict
    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedError).toBeInstanceOf(DomainError);
    expect((rejectedError as DomainError).code).toBe("conflict");

    // Verify in database: exactly ONE operation exists for this quiz
    const opCount = await clientA.db.execute<{ count: string }>(sql`
      SELECT count(*)::text as count
      FROM studio_exam_generation_operations
      WHERE quiz_id = ${concurrentQuizId}::uuid;
    `);
    expect(opCount.rows[0].count).toBe("1");

    // Cleanup
    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE quiz_id = ${concurrentQuizId}::uuid;
    `);
    await clientA.db.execute(sql`
      DELETE FROM marketing_quizzes WHERE id = ${concurrentQuizId}::uuid;
    `);
  });

  it("16. Recovery: reconcileStaleBatches re-enqueues orphaned pending batches via queue.add with deterministic jobId", async (ctx) => {
    if (!isConnected) return ctx.skip();

    // Create an operation and batch directly in DB with status = 'pending' and an older created_at
    const opId = randomUUID();
    const taskId = randomUUID();
    const batchId = randomUUID();

    await clientA.db.insert(studioExamGenerationOperations).values({
      id: opId,
      quizId: testQuizId,
      organizationId: testOrgId,
      createdBy: testUserId,
      totalRequestedQuestions: 5,
      status: "pending",
      config: {},
      patternSnapshots: [],
    });

    await clientA.db.insert(studioExamGenerationTasks).values({
      id: taskId,
      operationId: opId,
      courseId: testCourseId,
      moduleId: testModuleId,
      targetQuestionCount: 5,
      status: "pending",
    });

    await clientA.db.insert(studioExamGenerationBatches).values({
      id: batchId,
      taskId,
      batchIndex: 1,
      targetCount: 5,
      patternAllocations: Array.from({ length: 5 }, (_, i) => ({
        questionIndex: i + 1,
        patternId: "pat-1",
        patternVersion: 1,
      })),
      status: "pending",
      retryCount: 0,
      fencingToken: 0,
    });

    // Insert an un-allocated pending batch (patternAllocations: []) that must NOT be re-enqueued
    const emptyAllocBatchId = crypto.randomUUID();
    await clientA.db.insert(studioExamGenerationBatches).values({
      id: emptyAllocBatchId,
      taskId,
      batchIndex: 2,
      targetCount: 2,
      patternAllocations: [],
      status: "pending",
      retryCount: 0,
      fencingToken: 0,
    });

    // Insert a completed batch that must NOT be re-enqueued
    const completedBatchId = crypto.randomUUID();
    await clientA.db.insert(studioExamGenerationBatches).values({
      id: completedBatchId,
      taskId,
      batchIndex: 3,
      targetCount: 2,
      patternAllocations: [
        { questionIndex: 1, patternId: "pat-1", patternVersion: 1 },
        { questionIndex: 2, patternId: "pat-1", patternVersion: 1 },
      ],
      status: "completed",
      retryCount: 1,
      fencingToken: 1,
    });

    // Mock tracking queue with deterministic jobId deduplication (matching BullMQ semantics)
    const enqueuedJobs: Array<{ name: string; data: unknown; jobId?: string }> = [];
    const seenJobIds = new Set<string>();
    const mockQueue = {
      async add(name: string, data: { operationId: string; taskId: string; batchId: string }, opts?: { jobId?: string }) {
        const jid = opts?.jobId ?? `${name}:${data.batchId}`;
        if (!seenJobIds.has(jid)) {
          seenJobIds.add(jid);
          enqueuedJobs.push({ name, data, jobId: opts?.jobId });
        }
      },
    };

    // Run sweeper with pendingGraceSeconds: 0 to catch the freshly inserted valid pending batch
    const reconcileResult = await storeA.reconcileStaleBatches({
      pendingGraceSeconds: 0,
      queue: mockQueue,
    });

    expect(reconcileResult.reenqueuedBatchesCount).toBeGreaterThanOrEqual(1);
    expect(reconcileResult.reenqueuedBatchIds).toContain(batchId);
    expect(reconcileResult.reenqueuedBatchIds).not.toContain(emptyAllocBatchId);
    expect(reconcileResult.reenqueuedBatchIds).not.toContain(completedBatchId);

    const match = enqueuedJobs.find((j) => j.jobId === `batch_${batchId}`);
    expect(match).toBeDefined();
    expect(match?.data).toEqual({
      operationId: opId,
      taskId,
      batchId,
    });

    // Re-running sweeper must preserve deterministic jobId deduplication (no duplicate jobs in queue)
    await storeA.reconcileStaleBatches({
      pendingGraceSeconds: 0,
      queue: mockQueue,
    });
    expect(enqueuedJobs.filter((j) => j.jobId === `batch_${batchId}`)).toHaveLength(1);

    // Active processing batch with valid lease must not be recovered or re-enqueued
    const activeClaim = await storeA.claimBatch(batchId, 120);
    expect(activeClaim.claimed).toBe(true);
    const activeReconcile = await storeA.reconcileStaleBatches({
      pendingGraceSeconds: 0,
      leaseDurationSeconds: 120,
      gracePeriodSeconds: 180,
      queue: mockQueue,
    });
    expect(activeReconcile.recoveredBatchIds).not.toContain(batchId);
    expect(activeReconcile.reenqueuedBatchIds).not.toContain(batchId);

    // Cleanup
    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
  });

  // -------------------------------------------------------------------------
  // Phase 2.8 — Migration 0109, History Aggregation, Review, Transfer & Locking
  // -------------------------------------------------------------------------
  async function seedGeneratedQuestions(count = 4, targetQuizId = testQuizId) {
    const opId = randomUUID();
    const taskId = randomUUID();
    const batchId = randomUUID();

    await clientA.db.insert(studioExamGenerationOperations).values({
      id: opId,
      quizId: targetQuizId,
      organizationId: testOrgId,
      createdBy: testUserId,
      totalRequestedQuestions: count,
      status: "pending",
      config: { difficulty: "medium" },
      patternSnapshots: [],
    });

    await clientA.db.insert(studioExamGenerationTasks).values({
      id: taskId,
      operationId: opId,
      courseId: testCourseId,
      moduleId: testModuleId,
      targetQuestionCount: count,
      status: "pending",
    });

    await clientA.db.insert(studioExamGenerationBatches).values({
      id: batchId,
      taskId,
      batchIndex: 1,
      targetCount: count,
      generatedCount: 0,
      status: "pending",
      retryCount: 0,
      patternAllocations: [],
    });

    const claim = await storeA.claimBatch(batchId, 120);
    await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: claim.fencingToken!,
      questions: Array.from({ length: count }, (_, idx) => ({
        questionIndex: idx + 1,
        question: `سؤال واقعی دیتابیس ${idx + 1}`,
        choices: [
          { id: "a", text: "گزینه ۱" },
          { id: "b", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "a" },
        explanation: "توضیح",
        difficulty: "medium",
        topic: "فارماکولوژی",
      })),
    });

    const staged = await storeA.getGeneratedQuestions({ operationId: opId });
    return { opId, taskId, batchId, staged };
  }

  it("17. validates Migration 0108 & 0109 schema, constraints, indexes, and ON DELETE SET NULL behavior", async (ctx) => {
    if (!isConnected) return ctx.skip();

    // Check indexes exist in pg_indexes
    const idxRes = await clientA.db.execute<{ indexname: string }>(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE indexname IN (
        'idx_studio_exam_ops_quiz',
        'idx_studio_gen_q_op_review_status',
        'uq_marketing_quiz_q_staging_source'
      );
    `);
    const idxNames = ((idxRes as { rows?: Array<{ indexname: string }> }).rows ?? []).map(
      (r) => r.indexname,
    );
    expect(idxNames).toContain("idx_studio_exam_ops_quiz");
    expect(idxNames).toContain("idx_studio_gen_q_op_review_status");
    expect(idxNames).toContain("uq_marketing_quiz_q_staging_source");

    // Check CHECK constraint rejects invalid review_status
    const { opId, staged } = await seedGeneratedQuestions(1);
    await expect(
      clientA.db.execute(sql`
        UPDATE studio_exam_generated_questions
        SET review_status = 'invalid_status'
        WHERE id = ${staged[0].id}::uuid;
      `),
    ).rejects.toThrow();

    // Transfer and verify ON DELETE SET NULL when target quiz question is deleted
    await storeA.reviewGeneratedQuestions({
      operationId: opId,
      questionIds: [staged[0].id],
      decision: "accepted",
    });
    const transferRes = await storeA.transferGeneratedQuestionsToQuiz({
      operationId: opId,
      questionIds: [staged[0].id],
    });
    const createdQuizQId = transferRes.createdQuestions[0].id;

    await clientA.db.execute(sql`
      DELETE FROM marketing_quiz_questions WHERE id = ${createdQuizQId}::uuid;
    `);

    const [afterDelete] = await storeA.getGeneratedQuestions({ operationId: opId });
    expect(afterDelete.id).toBe(staged[0].id);
    expect(afterDelete.transferredQuestionId).toBeNull();
    expect(afterDelete.reviewStatus).toBe("transferred");

    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
  });

  it("18. lists persistent quiz operation history with real PostgreSQL FILTER/GROUP BY stagingStats, sorting, pagination, and isolation", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const otherQuizId = randomUUID();
    await clientA.db.insert(marketingQuizzes).values({
      id: otherQuizId,
      organizationId: testOrgId,
      slug: `other-quiz-${Date.now()}`,
      title: "آزمون ایزوله",
      status: "draft",
    });
    const otherOp = await seedGeneratedQuestions(2, otherQuizId);

    // Seed Op 1 (older, 4 questions: 1 pending, 1 accepted, 1 rejected, 1 transferred)
    const op1 = await seedGeneratedQuestions(4, testQuizId);
    await clientA.db.execute(sql`
      UPDATE studio_exam_generation_operations
      SET created_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${op1.opId}::uuid;
    `);

    await storeA.reviewGeneratedQuestions({
      operationId: op1.opId,
      questionIds: [op1.staged[1].id, op1.staged[3].id],
      decision: "accepted",
    });
    await storeA.reviewGeneratedQuestions({
      operationId: op1.opId,
      questionIds: [op1.staged[2].id],
      decision: "rejected",
    });
    await storeA.transferGeneratedQuestionsToQuiz({
      operationId: op1.opId,
      questionIds: [op1.staged[3].id],
    });

    // Seed Op 2 (newer, 2 pending)
    const op2 = await seedGeneratedQuestions(2, testQuizId);

    // List all for testQuizId
    const res = await storeA.listOperationsByQuizId({
      quizId: testQuizId,
      organizationId: testOrgId,
      limit: 20,
      offset: 0,
    });

    expect(res.total).toBeGreaterThanOrEqual(2);
    expect(res.operations.some((o) => o.id === otherOp.opId)).toBe(false);

    const idxOp2 = res.operations.findIndex((o) => o.id === op2.opId);
    const idxOp1 = res.operations.findIndex((o) => o.id === op1.opId);
    expect(idxOp2).toBeGreaterThanOrEqual(0);
    expect(idxOp1).toBeGreaterThan(idxOp2);

    const op1Item = res.operations[idxOp1];
    expect(op1Item.stagingStats).toEqual({
      totalCount: 4,
      pendingReviewCount: 1,
      acceptedCount: 1,
      rejectedCount: 1,
      transferredCount: 1,
    });

    // Pagination check
    const page2 = await storeA.listOperationsByQuizId({
      quizId: testQuizId,
      organizationId: testOrgId,
      limit: 1,
      offset: 1,
    });
    expect(page2.operations.length).toBe(1);

    // Cleanup
    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id IN (${op1.opId}::uuid, ${op2.opId}::uuid, ${otherOp.opId}::uuid)
    `);
    await clientA.db.execute(sql`
      DELETE FROM marketing_quizzes WHERE id = ${otherQuizId}::uuid
    `);
  });

  it("19. enforces real PostgreSQL FOR UPDATE serialization on concurrent review and transfer, and blocks modifying transferred questions", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, staged } = await seedGeneratedQuestions(3);
    const [q1, q2, q3] = staged;

    // Accept q1 & q2
    await storeA.reviewGeneratedQuestions({
      operationId: opId,
      questionIds: [q1.id, q2.id],
      decision: "accepted",
    });

    // Concurrent transfer on q1 from two independent connections
    const [tResA, tResB] = await Promise.all([
      storeA.transferGeneratedQuestionsToQuiz({ operationId: opId, questionIds: [q1.id] }),
      storeB.transferGeneratedQuestionsToQuiz({ operationId: opId, questionIds: [q1.id] }),
    ]);

    expect(tResA.transferredCount + tResB.transferredCount).toBe(1);
    expect(tResA.alreadyTransferredIds.length + tResB.alreadyTransferredIds.length).toBe(1);

    // Overlapping batch transfer ([q1, q2] & [q2, q3] after accepting q3)
    await storeA.reviewGeneratedQuestions({
      operationId: opId,
      questionIds: [q3.id],
      decision: "accepted",
    });
    const [ovA, ovB] = await Promise.all([
      storeA.transferGeneratedQuestionsToQuiz({ operationId: opId, questionIds: [q1.id, q2.id] }),
      storeB.transferGeneratedQuestionsToQuiz({ operationId: opId, questionIds: [q2.id, q3.id] }),
    ]);
    expect(ovA.transferredCount + ovB.transferredCount).toBe(2); // q2 once, q3 once

    // Verify physical count in marketing_quiz_questions for this operation is exactly 3
    const physCountRes = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM marketing_quiz_questions
      WHERE source_staging_question_id IN (${q1.id}::uuid, ${q2.id}::uuid, ${q3.id}::uuid);
    `);
    const physCount = ((physCountRes as { rows?: Array<{ count: number }> }).rows ?? [])[0]?.count;
    expect(physCount).toBe(3);

    // Verify Unique Constraint uq_marketing_quiz_q_staging_source directly blocks raw duplicate insert
    await expect(
      clientA.db.execute(sql`
        INSERT INTO marketing_quiz_questions (
          marketing_quiz_id, source_staging_question_id, question, choices, correct_answer, sort_order
        ) VALUES (
          ${testQuizId}::uuid, ${q1.id}::uuid, 'duplicate', '[]'::jsonb, '{}'::jsonb, 99
        );
      `),
    ).rejects.toThrow();

    // Concurrent review & transfer on a fresh accepted question never leaves inconsistent state
    const opExtra = await seedGeneratedQuestions(1);
    const qExtra = opExtra.staged[0];
    await storeA.reviewGeneratedQuestions({
      operationId: opExtra.opId,
      questionIds: [qExtra.id],
      decision: "accepted",
    });

    await Promise.allSettled([
      storeA.transferGeneratedQuestionsToQuiz({ operationId: opExtra.opId, questionIds: [qExtra.id] }),
      storeB.reviewGeneratedQuestions({
        operationId: opExtra.opId,
        questionIds: [qExtra.id],
        decision: "rejected",
      }),
    ]);

    const [finalQExtra] = await storeA.getGeneratedQuestions({ operationId: opExtra.opId });
    if (finalQExtra.transferredQuestionId) {
      expect(finalQExtra.reviewStatus).toBe("transferred");
      expect(finalQExtra.isAccepted).toBe(true);
    }

    await clientA.db.execute(sql`
      DELETE FROM marketing_quiz_questions WHERE marketing_quiz_id = ${testQuizId}::uuid
    `);
    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id IN (${opId}::uuid, ${opExtra.opId}::uuid)
    `);
  });

  it("20. rolls back PostgreSQL transactions atomically on mid-batch review and transfer failures", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, staged } = await seedGeneratedQuestions(2);
    const [q1, q2] = staged;

    // Accept q1, leave q2 pending_review
    await storeA.reviewGeneratedQuestions({
      operationId: opId,
      questionIds: [q1.id],
      decision: "accepted",
    });

    // Mid-batch transfer failure ([accepted q1, pending q2]) must roll back q1 completely
    await expect(
      storeA.transferGeneratedQuestionsToQuiz({
        operationId: opId,
        questionIds: [q1.id, q2.id],
      }),
    ).rejects.toThrow(DomainError);

    const quizRowsRes = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM marketing_quiz_questions
      WHERE source_staging_question_id IN (${q1.id}::uuid, ${q2.id}::uuid);
    `);
    expect(((quizRowsRes as { rows?: Array<{ count: number }> }).rows ?? [])[0]?.count).toBe(0);

    const [q1After] = await storeA.getGeneratedQuestions({ operationId: opId });
    expect(q1After.reviewStatus).toBe("accepted");
    expect(q1After.transferredQuestionId).toBeNull();

    // Mid-batch review failure (including a non-existent UUID) must roll back q2
    await expect(
      storeA.reviewGeneratedQuestions({
        operationId: opId,
        questionIds: [q2.id, randomUUID()],
        decision: "rejected",
      }),
    ).rejects.toThrow(DomainError);

    const afterReviewErr = await storeA.getGeneratedQuestions({ operationId: opId });
    expect(afterReviewErr[1].reviewStatus).toBe("pending_review");

    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
  });

  it("21. normalizes raw string[] choices and string correctAnswer on read and transfer to marketing_quiz_questions", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const opId = randomUUID();
    const taskId = randomUUID();
    const batchId = randomUUID();

    await clientA.db.insert(studioExamGenerationOperations).values({
      id: opId,
      quizId: testQuizId,
      organizationId: testOrgId,
      createdBy: testUserId,
      totalRequestedQuestions: 1,
      status: "pending",
      config: { difficulty: "medium" },
      patternSnapshots: [],
    });

    await clientA.db.insert(studioExamGenerationTasks).values({
      id: taskId,
      operationId: opId,
      courseId: testCourseId,
      moduleId: testModuleId,
      targetQuestionCount: 1,
      status: "pending",
    });

    await clientA.db.insert(studioExamGenerationBatches).values({
      id: batchId,
      taskId,
      batchIndex: 1,
      targetCount: 1,
      generatedCount: 0,
      status: "pending",
      retryCount: 0,
      patternAllocations: [],
    });

    const claim = await storeA.claimBatch(batchId, 120);
    await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: claim.fencingToken!,
      questions: [
        {
          questionIndex: 1,
          question: "کدام آنزیم مرحله محدودکننده سرعت بیوسنتز کاتکول‌آمین‌ها است؟",
          choices: [
            "فنیل‌اتانولامین ان-متیل‌ترانسفراز",
            "تیروزین هیدروکسیلاز",
            "ال-آمینو اسید دکربوکسیلاز",
            "دوپامین بتا-هیدروکسیلاز",
          ],
          correctAnswer: "تیروزین هیدروکسیلاز",
          explanation: "تیروزین هیدروکسیلاز مرحله محدودکننده سرعت است.",
          difficulty: "medium",
          topic: "فارماکولوژی",
          questionType: "multiple_choice",
        },
      ],
    });

    const staged = await storeA.getGeneratedQuestions({ operationId: opId });
    expect(staged).toHaveLength(1);
    expect(staged[0].choices).toEqual([
      { id: "1", text: "فنیل‌اتانولامین ان-متیل‌ترانسفراز" },
      { id: "2", text: "تیروزین هیدروکسیلاز" },
      { id: "3", text: "ال-آمینو اسید دکربوکسیلاز" },
      { id: "4", text: "دوپامین بتا-هیدروکسیلاز" },
    ]);
    expect(staged[0].correctAnswer).toEqual({ choiceId: "2" });

    await storeA.reviewGeneratedQuestions({
      operationId: opId,
      questionIds: [staged[0].id],
      decision: "accepted",
    });

    const transferRes = await storeA.transferGeneratedQuestionsToQuiz({
      operationId: opId,
      questionIds: [staged[0].id],
    });
    expect(transferRes.transferredCount).toBe(1);
    expect(transferRes.createdQuestions[0].choices).toEqual(staged[0].choices);
    expect(transferRes.createdQuestions[0].correctAnswer).toEqual({ choiceId: "2" });

    const quizRowRes = await clientA.db.execute<{ choices: unknown; correct_answer: unknown }>(sql`
      SELECT choices, correct_answer
      FROM marketing_quiz_questions
      WHERE source_staging_question_id = ${staged[0].id}::uuid;
    `);
    const quizRow = ((quizRowRes as { rows?: Array<{ choices: unknown; correct_answer: unknown }> }).rows ?? [])[0];
    expect(quizRow?.choices).toEqual(staged[0].choices);
    expect(quizRow?.correct_answer).toEqual({ choiceId: "2" });

    await clientA.db.execute(sql`
      DELETE FROM marketing_quiz_questions WHERE source_staging_question_id = ${staged[0].id}::uuid;
    `);
    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
  });

  it("22. rolls back entire PostgreSQL transfer transaction when an accepted question has an unmappable correctAnswer", async (ctx) => {
    if (!isConnected) return ctx.skip();

    const { opId, batchId } = await createTestBatchFixture(2);
    const claim = await storeA.claimBatch(batchId, 120);
    expect(claim.claimed).toBe(true);

    await storeA.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: claim.fencingToken!,
      questions: [
        {
          questionIndex: 1,
          patternId: "pat-1",
          patternVersion: 1,
          question: "کدام دارو مهارکننده انتخابی SGLT2 است؟",
          choices: ["سیتاگلیپتین", "امپاگلیفلوزین", "لوزارتان", "آتنولول"],
          correctAnswer: "امپاگلیفلوزین",
          explanation: "امپاگلیفلوزین مهارکننده SGLT2 است.",
          difficulty: "medium",
          topic: "نارسایی قلبی",
          questionType: "multiple_choice",
        },
        {
          questionIndex: 2,
          patternId: "pat-1",
          patternVersion: 1,
          question: "کدام دارو مهارکننده ACE است؟",
          choices: ["کاپتوپریل", "لوزارتان", "آملودیپین", "پروپرانولول"],
          correctAnswer: "پاسخ نامعتبر خارج از گزینه‌ها",
          explanation: "کاپتوپریل مهارکننده ACE است.",
          difficulty: "medium",
          topic: "نارسایی قلبی",
          questionType: "multiple_choice",
        },
      ],
    });

    const staged = await storeA.getGeneratedQuestions({ operationId: opId });
    expect(staged).toHaveLength(2);
    const [q1, q2] = staged;

    await storeA.reviewGeneratedQuestions({
      operationId: opId,
      questionIds: [q1.id, q2.id],
      decision: "accepted",
    });

    await expect(
      storeA.transferGeneratedQuestionsToQuiz({
        operationId: opId,
        questionIds: [q1.id, q2.id],
      }),
    ).rejects.toThrow(DomainError);

    const quizRowsRes = await clientA.db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM marketing_quiz_questions
      WHERE source_staging_question_id IN (${q1.id}::uuid, ${q2.id}::uuid);
    `);
    expect(((quizRowsRes as { rows?: Array<{ count: number }> }).rows ?? [])[0]?.count).toBe(0);

    const stagingRes = await clientA.db.execute<{
      id: string;
      review_status: string;
      transferred_question_id: string | null;
    }>(sql`
      SELECT id, review_status, transferred_question_id
      FROM studio_exam_generated_questions
      WHERE id IN (${q1.id}::uuid, ${q2.id}::uuid)
      ORDER BY question_index ASC;
    `);
    const stagingRows = (stagingRes as {
      rows?: Array<{
        id: string;
        review_status: string;
        transferred_question_id: string | null;
      }>;
    }).rows ?? [];
    expect(stagingRows).toHaveLength(2);
    expect(stagingRows[0].review_status).toBe("accepted");
    expect(stagingRows[0].transferred_question_id).toBeNull();
    expect(stagingRows[1].review_status).toBe("accepted");
    expect(stagingRows[1].transferred_question_id).toBeNull();

    await clientA.db.execute(sql`
      DELETE FROM studio_exam_generation_operations WHERE id = ${opId}::uuid;
    `);
  });
});
