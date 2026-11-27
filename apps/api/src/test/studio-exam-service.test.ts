import { describe, it, expect, beforeEach } from "vitest";
import { StudioService } from "../modules/studio/studio-service.js";
import {
  InMemoryMarketingQuizStore,
  InMemoryMarketingQuestionBankStore,
  InMemoryMarketingQuizAttemptStore,
} from "../modules/studio/studio-stores.js";
import {
  InMemoryStudioExamStore,
  sanitizeErrorMessage,
} from "../modules/studio/studio-exam-store.js";
import type {
  StudioExamQueue,
  StudioExamBatchJobPayload,
} from "../modules/studio/studio-exam-queue.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryQuestionPatternStore } from "../modules/generation/question-patterns-store.js";
import { processStudioExamBatchJob } from "../modules/studio/studio-exam-processor.js";
import type { ModelGateway } from "../modules/generation/gateway/types.js";
import type { Job } from "bullmq";
import fs from "node:fs";
import path from "node:path";
import {
  type Actor,
  DomainError,
  asOrganizationId,
  asQuestionPatternId,
  asUserId,
} from "@avana/domain";

class MockStudioExamQueue implements StudioExamQueue {
  readonly queueName = "studio_exam_batch_generate";
  public jobs: Array<{
    name: string;
    data: StudioExamBatchJobPayload;
    opts?: { jobId?: string };
  }> = [];

  async add(
    name: string,
    data: StudioExamBatchJobPayload,
    opts?: { jobId?: string },
  ): Promise<void> {
    this.jobs.push({ name, data, opts });
  }

  async getWaitingCount(): Promise<number> {
    return this.jobs.length;
  }

  async close(): Promise<void> {}
}

describe("Studio Exam Application Service & Store (Phase 3.2)", () => {
  let quizStore: InMemoryMarketingQuizStore;
  let bankStore: InMemoryMarketingQuestionBankStore;
  let attemptStore: InMemoryMarketingQuizAttemptStore;
  let orgStore: InMemoryOrganizationStore;
  let examStore: InMemoryStudioExamStore;
  let examQueue: MockStudioExamQueue;
  let service: StudioService;

  const orgIdA = asOrganizationId("org-a");
  const orgIdB = asOrganizationId("org-b");

  const platformAdmin: Actor = {
    userId: asUserId("admin-platform"),
    email: "admin@avana.ir",
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const orgAdminA: Actor = {
    userId: asUserId("admin-a"),
    email: "admin-a@avana.ir",
    role: "organization_admin",
    memberships: [{ organizationId: orgIdA, role: "organization_admin" }],
  };

  const orgAdminB: Actor = {
    userId: asUserId("admin-b"),
    email: "admin-b@avana.ir",
    role: "organization_admin",
    memberships: [{ organizationId: orgIdB, role: "organization_admin" }],
  };

  const contentWorkerA: Actor = {
    userId: asUserId("worker-a"),
    email: "worker-a@avana.ir",
    role: "content_worker",
    globalRole: "content_worker",
    memberships: [{ organizationId: orgIdA, role: "content_worker" }],
  };

  const studentUser: Actor = {
    userId: asUserId("student-1"),
    email: "student@avana.ir",
    role: "student",
    globalRole: "student",
  };

  let testQuizId: string;
  const module1 = "mod-1111-1111-1111-1111";
  const module2 = "mod-2222-2222-2222-2222";
  const module3 = "mod-3333-3333-3333-3333";

  beforeEach(async () => {
    quizStore = new InMemoryMarketingQuizStore();
    bankStore = new InMemoryMarketingQuestionBankStore();
    attemptStore = new InMemoryMarketingQuizAttemptStore();
    orgStore = new InMemoryOrganizationStore();
    examStore = new InMemoryStudioExamStore();
    examQueue = new MockStudioExamQueue();

    orgStore.addOrganization({
      id: orgIdA,
      name: "Org Alpha",
      slug: "org-alpha",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    orgStore.addOrganization({
      id: orgIdB,
      name: "Org Beta",
      slug: "org-beta",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create target quiz under org A
    const quiz = await quizStore.create({
      organizationId: orgIdA,
      slug: "test-pharma-exam",
      title: "آزمون جامع فارماکولوژی",
      description: "تولید چندفصلی هوشمند",
      status: "draft",
      settings: {},
    });
    testQuizId = quiz.id;

    service = new StudioService(
      quizStore,
      bankStore,
      attemptStore,
      undefined,
      orgStore,
      undefined, // db omitted to use in-memory store cleanly
      examStore,
      examQueue,
    );
  });

  // -------------------------------------------------------------------------
  // 1. Successful Operation Creation with Automatic Balanced Distribution
  // -------------------------------------------------------------------------
  it("creates an operation with balanced chapter quotas, tasks, and batches", async () => {
    const res = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 25,
      moduleIds: [module1, module2, module3],
      difficulty: "hard",
      instructions: "تمرکز بر فارماکوکینتیک بالینی",
    });

    expect(res.operation.id).toBeDefined();
    expect(res.operation.quizId).toBe(testQuizId);
    expect(res.operation.organizationId).toBe(orgIdA);
    expect(res.operation.totalRequestedQuestions).toBe(25);
    expect(res.operation.status).toBe("pending");

    // 25 questions across 3 chapters: 9, 8, 8
    expect(res.tasks).toHaveLength(3);
    expect(res.tasks[0].moduleId).toBe(module1);
    expect(res.tasks[0].targetQuestionCount).toBe(9);
    expect(res.tasks[1].moduleId).toBe(module2);
    expect(res.tasks[1].targetQuestionCount).toBe(8);
    expect(res.tasks[2].moduleId).toBe(module3);
    expect(res.tasks[2].targetQuestionCount).toBe(8);

    // Each task <= 10 questions has 1 batch
    expect(res.batches).toHaveLength(3);
    expect(res.batches[0].targetCount).toBe(9);
    expect(res.batches[1].targetCount).toBe(8);
    expect(res.batches[2].targetCount).toBe(8);

    // BullMQ job enqueuing
    expect(examQueue.jobs).toHaveLength(3);
    for (const job of examQueue.jobs) {
      expect(job.name).toBe("studio_exam_batch");
      expect(job.opts?.jobId).toBe(`batch_${job.data.batchId}`);
      expect(job.data.operationId).toBe(res.operation.id);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Custom Chapter Allocations
  // -------------------------------------------------------------------------
  it("creates an operation with custom chapter allocations and multi-batch splitting", async () => {
    // 35 questions total: mod1=25 (split into 10, 10, 5), mod2=10 (10)
    const res = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 35,
      chapterAllocations: [
        { moduleId: module1, quota: 25 },
        { moduleId: module2, quota: 10 },
      ],
    });

    expect(res.operation.totalRequestedQuestions).toBe(35);
    expect(res.tasks).toHaveLength(2);

    const task1 = res.tasks.find((t) => t.moduleId === module1)!;
    expect(task1.targetQuestionCount).toBe(25);

    const task1Batches = res.batches.filter((b) => b.taskId === task1.id);
    expect(task1Batches).toHaveLength(3);
    expect(task1Batches[0].targetCount).toBe(10);
    expect(task1Batches[1].targetCount).toBe(10);
    expect(task1Batches[2].targetCount).toBe(5);

    const task2 = res.tasks.find((t) => t.moduleId === module2)!;
    expect(task2.targetQuestionCount).toBe(10);
    const task2Batches = res.batches.filter((b) => b.taskId === task2.id);
    expect(task2Batches).toHaveLength(1);
    expect(task2Batches[0].targetCount).toBe(10);

    expect(res.batches).toHaveLength(4);
    expect(examQueue.jobs).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // 3. Conflict Prevention: Active Operation Already Running
  // -------------------------------------------------------------------------
  it("rejects creating a new operation if an active operation is already pending/processing", async () => {
    await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 10,
      moduleIds: [module1],
    });

    // Attempt second creation on the same quiz while first is pending
    await expect(
      service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 5,
        moduleIds: [module2],
      }),
    ).rejects.toThrow(DomainError);

    try {
      await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 5,
        moduleIds: [module2],
      });
    } catch (err) {
      const dErr = err as DomainError;
      expect(dErr.code).toBe("conflict");
      expect(dErr.message).toContain("یک عملیات فعال");
    }
  });

  // -------------------------------------------------------------------------
  // 4. Input Validations
  // -------------------------------------------------------------------------
  it("rejects totalQuestions outside 1..100 bounds", async () => {
    await expect(
      service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 0,
        moduleIds: [module1],
      }),
    ).rejects.toThrow(DomainError);

    await expect(
      service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 101,
        moduleIds: [module1],
      }),
    ).rejects.toThrow(DomainError);
  });

  it("rejects empty or duplicate chapter lists", async () => {
    await expect(
      service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 10,
        moduleIds: [],
      }),
    ).rejects.toThrow(DomainError);

    await expect(
      service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 10,
        moduleIds: [module1, module1],
      }),
    ).rejects.toThrow(DomainError);
  });

  it("rejects custom allocations when sum does not match totalQuestions", async () => {
    await expect(
      service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 20,
        chapterAllocations: [
          { moduleId: module1, quota: 10 },
          { moduleId: module2, quota: 5 }, // sum is 15 != 20
        ],
      }),
    ).rejects.toThrow(DomainError);
  });

  // -------------------------------------------------------------------------
  // 5. Active Operation Query
  // -------------------------------------------------------------------------
  it("retrieves the active operation for a quiz", async () => {
    const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 10,
      moduleIds: [module1],
    });

    const active = await service.getActiveExamGenerationOperation(orgAdminA, testQuizId);
    expect(active).not.toBeNull();
    expect(active?.id).toBe(created.operation.id);
    expect(active?.status).toBe("pending");
    expect(active?.totalRequestedQuestions).toBe(10);
  });

  it("returns null when no active operation exists", async () => {
    const active = await service.getActiveExamGenerationOperation(orgAdminA, testQuizId);
    expect(active).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 6. Full Operation Details & Error Sanitization
  // -------------------------------------------------------------------------
  it("retrieves full operation details and sanitizes sensitive errors", async () => {
    const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 10,
      moduleIds: [module1],
    });

    const batchId = created.batches[0].id;
    const batch = examStore.batches.get(batchId)!;
    batch.errorCode = "gemini_timeout";
    // eslint-disable-next-line no-secrets/no-secrets
    batch.errorMessage = "https://generativelanguage.googleapis.com/v1beta/models?key=mock-key-12345: Request timed out at AxiosError (node:internal)";

    const details = await service.getExamGenerationOperationDetails(orgAdminA, created.operation.id);
    expect(details.operation.id).toBe(created.operation.id);
    expect(details.tasks).toHaveLength(1);
    expect(details.batches).toHaveLength(1);

    // Verifies sensitive URL / API Key is completely masked
    const batchDetail = details.batches[0];
    expect(batchDetail.errorCode).toBe("gemini_timeout");
    expect(batchDetail.errorMessage).toBe("پاسخ مدل هوش مصنوعی با تأخیر مواجه شد.");
    expect(batchDetail.errorMessage).not.toContain("mock-key");
    expect(batchDetail.errorMessage).not.toContain("googleapis");
  });

  // -------------------------------------------------------------------------
  // 7. Progress Contract & Calculations
  // -------------------------------------------------------------------------
  it("provides lightweight progress contract with accurate percentages", async () => {
    const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 20,
      moduleIds: [module1, module2],
    });

    // Initial progress: 0%
    let progress = await service.getExamGenerationProgress(orgAdminA, created.operation.id);
    expect(progress.operationId).toBe(created.operation.id);
    expect(progress.totalRequestedQuestions).toBe(20);
    expect(progress.totalGeneratedQuestions).toBe(0);
    expect(progress.progressPercentage).toBe(0);
    expect(progress.tasks).toHaveLength(2);

    // Simulate task 1 completion (10 questions)
    const task1 = created.tasks[0];
    const task1Record = examStore.tasks.get(task1.id)!;
    task1Record.generatedQuestionCount = 10;
    task1Record.status = "completed";

    progress = await service.getExamGenerationProgress(orgAdminA, created.operation.id);
    expect(progress.totalGeneratedQuestions).toBe(10);
    expect(progress.progressPercentage).toBe(50);
  });

  // -------------------------------------------------------------------------
  // 8. Staging Questions Retrieval & Isolation
  // -------------------------------------------------------------------------
  it("retrieves staged questions without modifying live quiz questions bank", async () => {
    const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 5,
      moduleIds: [module1],
    });

    // Simulate batch execution storing questions into staging
    const batchId = created.batches[0].id;
    const claim = await examStore.claimBatch(batchId);
    expect(claim.claimed).toBe(true);

    await examStore.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken: claim.fencingToken!,
      questions: [
        {
          questionIndex: 1,
          question: "نیمه‌عمر حذف دارو با کدام پارامتر نسبت عکس دارد؟",
          choices: [
            { id: "1", text: "کلیرانس" },
            { id: "2", text: "حجم توزیع" },
            { id: "3", text: "فراهمی زیستی" },
            { id: "4", text: "دوز مصرفی" },
          ],
          correctAnswer: { choiceId: "1" },
          difficulty: "medium",
          explanation: "بر اساس فرمول t1/2 = 0.693 * Vd / CL",
        },
      ],
    });

    // Query staging questions via service
    const staged = await service.getExamGenerationQuestions(orgAdminA, created.operation.id);
    expect(staged).toHaveLength(1);
    expect(staged[0].question).toContain("نیمه‌عمر");
    expect(staged[0].moduleId).toBe(module1);

    // Verify live quiz questions remain 0 (staging isolation preserved!)
    const liveQuestions = await quizStore.getQuestions(testQuizId);
    expect(liveQuestions).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 9. Multi-Tenant Authorization & Isolation
  // -------------------------------------------------------------------------
  it("rejects unauthorized cross-tenant access to operations", async () => {
    const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 10,
      moduleIds: [module1],
    });

    // Admin of Org B cannot access Org A's operation
    await expect(
      service.getExamGenerationOperationDetails(orgAdminB, created.operation.id),
    ).rejects.toThrow(DomainError);

    await expect(
      service.getExamGenerationProgress(orgAdminB, created.operation.id),
    ).rejects.toThrow(DomainError);

    await expect(
      service.getExamGenerationQuestions(orgAdminB, created.operation.id),
    ).rejects.toThrow(DomainError);

    await expect(
      service.cancelExamGenerationOperation(orgAdminB, created.operation.id),
    ).rejects.toThrow(DomainError);
  });

  // -------------------------------------------------------------------------
  // 10. Role-Based Permissions
  // -------------------------------------------------------------------------
  it("allows content_worker and platform_admin while forbidding student", async () => {
    // Content worker in Org A can create
    const created = await service.createExamGenerationOperation(contentWorkerA, testQuizId, {
      totalQuestions: 10,
      moduleIds: [module1],
    });
    expect(created.operation.id).toBeDefined();

    // Platform admin has global access
    const details = await service.getExamGenerationOperationDetails(
      platformAdmin,
      created.operation.id,
    );
    expect(details.operation.id).toBe(created.operation.id);

    // Student is forbidden
    await expect(
      service.createExamGenerationOperation(studentUser, testQuizId, {
        totalQuestions: 5,
        moduleIds: [module1],
      }),
    ).rejects.toThrow(DomainError);

    await expect(
      service.getExamGenerationOperationDetails(studentUser, created.operation.id),
    ).rejects.toThrow(DomainError);
  });

  // -------------------------------------------------------------------------
  // 11. Operation Cancellation
  // -------------------------------------------------------------------------
  it("cancels an active operation and updates in-flight batches", async () => {
    const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 10,
      moduleIds: [module1],
    });

    const cancelRes = await service.cancelExamGenerationOperation(
      orgAdminA,
      created.operation.id,
      "توقف به درخواست مدرس",
    );
    expect(cancelRes.cancelled).toBe(true);

    const details = await service.getExamGenerationOperationDetails(
      orgAdminA,
      created.operation.id,
    );
    expect(details.operation.status).toBe("cancelled");
    expect(details.tasks[0].status).toBe("cancelled");
    expect(details.batches[0].status).toBe("cancelled");
    expect(details.batches[0].errorMessage).toBe("عملیات توسط کاربر لغو شد.");
  });

  // -------------------------------------------------------------------------
  // 12. Helper sanitizeErrorMessage test
  // -------------------------------------------------------------------------
  it("correctly sanitizes known error codes and raw exceptions", () => {
    expect(sanitizeErrorMessage("insufficient_content", "raw err")).toBe(
      "محتوای متنی درس‌های این فصل برای تولید سؤال کافی نیست.",
    );
    expect(sanitizeErrorMessage("rate_limit_exceeded", "429 Too Many Requests")).toBe(
      "محدودیت تعداد درخواست به مدل هوش مصنوعی.",
    );
    expect(sanitizeErrorMessage("unknown_code", "Internal server error with api_key=xyz")).toBe(
      "خطای غیرمنتظره در ارتباط با سرویس هوش مصنوعی.",
    );
    expect(sanitizeErrorMessage("custom", "درس مربوطه یافت نشد")).toBe(
      "درس مربوطه یافت نشد",
    );
  });

  // -------------------------------------------------------------------------
  // 13. Queue Enqueue Failure & Auto-cancellation
  // -------------------------------------------------------------------------
  it("auto-cancels operation if BullMQ queue.add fails during creation", async () => {
    const failingQueue = {
      queueName: "failing_queue",
      async add() {
        throw new Error("Redis connection lost");
      },
      async getWaitingCount() {
        return 0;
      },
      async close() {},
    };

    const failingService = new StudioService(
      quizStore,
      bankStore,
      attemptStore,
      undefined,
      orgStore,
      undefined,
      examStore,
      failingQueue,
    );

    await expect(
      failingService.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 5,
        moduleIds: [module1],
      }),
    ).rejects.toThrow(DomainError);

    // The active operation check should now return null because the operation was auto-cancelled
    const active = await examStore.getActiveOperationByQuizId(testQuizId);
    expect(active).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 14. Pending Batch Re-enqueuing and Idempotent Recovery
  // -------------------------------------------------------------------------
  it("re-enqueues pending batches idempotently when requested", async () => {
    const enqueuedJobs: Array<{ name: string; data: unknown; jobId?: string }> = [];
    const trackingQueue = {
      queueName: "tracking_queue",
      async add(name: string, data: unknown, opts?: { jobId?: string }) {
        enqueuedJobs.push({ name, data, jobId: opts?.jobId });
      },
      async getWaitingCount() {
        return enqueuedJobs.length;
      },
      async close() {},
    };

    // Create operation without queue initially (simulating queue down or skipped)
    const noQueueService = new StudioService(
      quizStore,
      bankStore,
      attemptStore,
      undefined,
      orgStore,
      undefined,
      examStore,
      undefined,
    );

    const created = await noQueueService.createExamGenerationOperation(orgAdminA, testQuizId, {
      totalQuestions: 15, // 2 batches (10 + 5)
      moduleIds: [module1],
    });
    expect(created.batches.length).toBe(2);

    // Now attach queue and call reenqueuePendingBatches
    const recoveryService = new StudioService(
      quizStore,
      bankStore,
      attemptStore,
      undefined,
      orgStore,
      undefined,
      examStore,
      trackingQueue,
    );

    const res = await recoveryService.reenqueuePendingBatches(orgAdminA, created.operation.id);
    expect(res.reenqueuedCount).toBe(2);
    expect(res.batchIds.length).toBe(2);
    expect(enqueuedJobs.length).toBe(2);
    expect(enqueuedJobs[0].jobId).toBe(`batch_${created.batches[0].id}`);
    expect(enqueuedJobs[1].jobId).toBe(`batch_${created.batches[1].id}`);

    // Reconcile stale batches also picks up pending batches when pendingGraceSeconds is exceeded
    const sweeperRes = await examStore.reconcileStaleBatches({
      pendingGraceSeconds: 0,
      queue: trackingQueue,
    });
    expect(sweeperRes.reenqueuedBatchesCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 15. Phase 2.2.2 — Staging Question Review Lifecycle & Idempotent Transfer
  // -------------------------------------------------------------------------
  describe("Staging Question Review Lifecycle & Transfer (Phase 2.2.2)", () => {
    async function seedOperationWithQuestions(count = 4) {
      const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: count,
        moduleIds: [module1],
      });
      const batch = created.batches[0];
      const claim = await examStore.claimBatch(batch.id);
      const questionsPayload = Array.from({ length: count }, (_, idx) => ({
        questionIndex: idx + 1,
        question: `سؤال تستی شماره ${idx + 1}`,
        choices: [
          { id: "a", text: "گزینه الف" },
          { id: "b", text: "گزینه ب" },
          { id: "c", text: "گزینه ج" },
          { id: "d", text: "گزینه د" },
        ],
        correctAnswer: { choiceId: "a" },
        explanation: `توضیح تشریحی ${idx + 1}`,
        difficulty: "medium",
        topic: "فارماکولوژی",
      }));

      await examStore.saveBatchQuestionsAndFinalize({
        batchId: batch.id,
        fencingToken: claim.fencingToken!,
        questions: questionsPayload,
      });

      const staged = await service.getExamGenerationQuestions(orgAdminA, created.operation.id);
      return { operation: created.operation, staged };
    }

    it("supports single/batch accept, reject, reset to pending_review, re-accept, and idempotent repeats", async () => {
      const { operation, staged } = await seedOperationWithQuestions(3);
      const [q1, q2, q3] = staged;

      expect(q1.reviewStatus).toBe("pending_review");
      expect(q1.isAccepted).toBe(false);

      // 1. Accept single question
      const resAccept1 = await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q1.id],
        decision: "accepted",
      });
      expect(resAccept1.updatedCount).toBe(1);
      expect(resAccept1.questions[0].reviewStatus).toBe("accepted");
      expect(resAccept1.questions[0].isAccepted).toBe(true);

      // 2. Idempotent repeat of same decision
      const resRepeat = await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q1.id],
        decision: "accepted",
      });
      expect(resRepeat.updatedCount).toBe(0);
      expect(resRepeat.questions[0].reviewStatus).toBe("accepted");

      // 3. Batch reject q2, q3
      const resReject = await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q2.id, q3.id],
        decision: "rejected",
      });
      expect(resReject.updatedCount).toBe(2);
      expect(resReject.questions.every((q) => q.reviewStatus === "rejected" && !q.isAccepted)).toBe(true);

      // 4. Reset rejected q2 back to pending_review, then re-accept
      const resReset = await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q2.id],
        decision: "pending_review",
      });
      expect(resReset.updatedCount).toBe(1);
      expect(resReset.questions[0].reviewStatus).toBe("pending_review");
      expect(resReset.questions[0].isAccepted).toBe(false);

      const resReaccept = await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q2.id],
        decision: "accepted",
      });
      expect(resReaccept.updatedCount).toBe(1);
      expect(resReaccept.questions[0].reviewStatus).toBe("accepted");
      expect(resReaccept.questions[0].isAccepted).toBe(true);

      // 5. Filter compatibility with isAccepted & reviewStatus
      const acceptedList = await service.getExamGenerationQuestions(orgAdminA, operation.id, {
        isAccepted: true,
      });
      expect(acceptedList.map((q) => q.id)).toEqual([q1.id, q2.id]);

      const rejectedList = await service.getExamGenerationQuestions(orgAdminA, operation.id, {
        reviewStatus: "rejected",
      });
      expect(rejectedList.map((q) => q.id)).toEqual([q3.id]);
    });

    it("rejects reviewing questionIds belonging to a different operation", async () => {
      const { operation: op1, staged: staged1 } = await seedOperationWithQuestions(2);
      const quiz2 = await service.createQuiz(orgAdminA, {
        title: "آزمون دوم",
        organizationId: orgIdA,
      });
      const created2 = await service.createExamGenerationOperation(orgAdminA, quiz2.id, {
        totalQuestions: 1,
        moduleIds: [module2],
      });
      const claim2 = await examStore.claimBatch(created2.batches[0].id);
      await examStore.saveBatchQuestionsAndFinalize({
        batchId: created2.batches[0].id,
        fencingToken: claim2.fencingToken!,
        questions: [
          {
            questionIndex: 1,
            question: "سؤال عملیات دوم",
            choices: [{ id: "a", text: "۱" }, { id: "b", text: "۲" }],
            correctAnswer: { choiceId: "a" },
          },
        ],
      });
      const staged2 = await service.getExamGenerationQuestions(orgAdminA, created2.operation.id);

      await expect(
        service.reviewExamGenerationQuestions(orgAdminA, op1.id, {
          questionIds: [staged1[0].id, staged2[0].id],
          decision: "accepted",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("transfers accepted questions atomically with dual references and blocks modifying transferred status", async () => {
      const { operation, staged } = await seedOperationWithQuestions(3);
      const [q1, q2, q3] = staged;

      await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q1.id, q2.id],
        decision: "accepted",
      });

      // Transfer q1 & q2
      const transferRes = await service.transferExamGenerationQuestions(
        orgAdminA,
        operation.id,
        [q1.id, q2.id],
      );

      expect(transferRes.transferredCount).toBe(2);
      expect(transferRes.alreadyTransferredIds).toEqual([]);
      expect(transferRes.createdQuestions.length).toBe(2);
      expect(transferRes.createdQuestions[0].sourceStagingQuestionId).toBe(q1.id);
      expect(transferRes.createdQuestions[1].sourceStagingQuestionId).toBe(q2.id);

      // Verify quizStore actually persisted them in the authoritative quiz
      const quizQuestions = await quizStore.getQuestions(testQuizId);
      expect(quizQuestions.length).toBe(2);
      expect(quizQuestions.map((q) => q.sourceStagingQuestionId)).toEqual([q1.id, q2.id]);

      // Verify staging records updated with transferredQuestionId & transferredAt
      const refreshed = await service.getExamGenerationQuestions(orgAdminA, operation.id);
      expect(refreshed[0].reviewStatus).toBe("transferred");
      expect(refreshed[0].isAccepted).toBe(true);
      expect(refreshed[0].transferredQuestionId).toBe(transferRes.createdQuestions[0].id);
      expect(refreshed[0].transferredAt).toBeTruthy();

      // Attempting to reject or reset transferred question q1 leaves it unchanged
      const reviewAfterTransfer = await service.reviewExamGenerationQuestions(
        orgAdminA,
        operation.id,
        {
          questionIds: [q1.id, q3.id],
          decision: "rejected",
        },
      );
      expect(reviewAfterTransfer.skippedTransferredIds).toEqual([q1.id]);
      expect(reviewAfterTransfer.updatedCount).toBe(1); // Only q3 updated
      const afterCheck = await service.getExamGenerationQuestions(orgAdminA, operation.id);
      expect(afterCheck[0].reviewStatus).toBe("transferred");
      expect(afterCheck[0].isAccepted).toBe(true);
      expect(afterCheck[2].reviewStatus).toBe("rejected");
    });

    it("prevents transferring pending_review or rejected questions and rolls back atomically on mid-batch failure", async () => {
      const { operation, staged } = await seedOperationWithQuestions(3);
      const [q1, q2, q3] = staged;

      // q1 = accepted, q2 = pending_review, q3 = rejected
      await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q1.id],
        decision: "accepted",
      });
      await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q3.id],
        decision: "rejected",
      });

      // Attempt batch transfer containing q1 (accepted) + q2 (pending_review) -> must fail and rollback q1
      await expect(
        service.transferExamGenerationQuestions(orgAdminA, operation.id, [q1.id, q2.id]),
      ).rejects.toThrow(DomainError);

      // Zero questions added to quiz, and q1 remains 'accepted'
      expect((await quizStore.getQuestions(testQuizId)).length).toBe(0);
      const afterPendingErr = await service.getExamGenerationQuestions(orgAdminA, operation.id);
      expect(afterPendingErr[0].reviewStatus).toBe("accepted");
      expect(afterPendingErr[0].transferredQuestionId).toBeNull();

      // Attempt batch transfer containing q1 (accepted) + q3 (rejected) -> must fail
      await expect(
        service.transferExamGenerationQuestions(orgAdminA, operation.id, [q1.id, q3.id]),
      ).rejects.toThrow(DomainError);
      expect((await quizStore.getQuestions(testQuizId)).length).toBe(0);
    });

    it("handles duplicate transfer requests idempotently and serializes concurrent transfers", async () => {
      const { operation, staged } = await seedOperationWithQuestions(2);
      const [q1, q2] = staged;

      await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q1.id, q2.id],
        decision: "accepted",
      });

      // Concurrent transfer calls for q1
      const [r1, r2] = await Promise.all([
        service.transferExamGenerationQuestions(orgAdminA, operation.id, [q1.id]),
        service.transferExamGenerationQuestions(orgAdminA, operation.id, [q1.id]),
      ]);

      expect(r1.transferredCount + r2.transferredCount).toBe(1);
      expect(r1.alreadyTransferredIds.length + r2.alreadyTransferredIds.length).toBe(1);
      expect((await quizStore.getQuestions(testQuizId)).length).toBe(1);

      // Retry batch [q1, q2] -> skips q1 (alreadyTransferredIds) and transfers q2
      const r3 = await service.transferExamGenerationQuestions(orgAdminA, operation.id, [
        q1.id,
        q2.id,
      ]);
      expect(r3.transferredCount).toBe(1);
      expect(r3.alreadyTransferredIds).toEqual([q1.id]);
      expect(r3.createdQuestions[0].sourceStagingQuestionId).toBe(q2.id);
      expect((await quizStore.getQuestions(testQuizId)).length).toBe(2);
    });

    it("enforces organization tenant isolation and blocks unauthorized roles", async () => {
      const { operation, staged } = await seedOperationWithQuestions(1);
      const [q1] = staged;

      await expect(
        service.reviewExamGenerationQuestions(orgAdminB, operation.id, {
          questionIds: [q1.id],
          decision: "accepted",
        }),
      ).rejects.toThrow(DomainError);

      await expect(
        service.reviewExamGenerationQuestions(studentUser, operation.id, {
          questionIds: [q1.id],
          decision: "accepted",
        }),
      ).rejects.toThrow(DomainError);

      await service.reviewExamGenerationQuestions(orgAdminA, operation.id, {
        questionIds: [q1.id],
        decision: "accepted",
      });

      await expect(
        service.transferExamGenerationQuestions(orgAdminB, operation.id, [q1.id]),
      ).rejects.toThrow(DomainError);

      await expect(
        service.transferExamGenerationQuestions(studentUser, operation.id, [q1.id]),
      ).rejects.toThrow(DomainError);
    });
  });

  // -------------------------------------------------------------------------
  // 16. Phase 2.6 — Partial & Insufficient Content Lifecycle + Cancel Guard
  // -------------------------------------------------------------------------
  describe("Partial & Insufficient Content Lifecycle (Phase 2.6)", () => {
    it("finalizes as partial when one chapter succeeds and another fails, preserves successful questions for review/transfer, and blocks re-cancelling finalized partial", async () => {
      const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 4,
        chapterAllocations: [
          { moduleId: module1, quota: 2 },
          { moduleId: module2, quota: 2 },
        ],
      });

      const task1 = created.tasks.find((t) => t.moduleId === module1)!;
      const task2 = created.tasks.find((t) => t.moduleId === module2)!;
      const batch1 = created.batches.find((b) => b.taskId === task1.id)!;
      const batch2 = created.batches.find((b) => b.taskId === task2.id)!;

      // Batch 1 succeeds with 2 questions
      const c1 = await examStore.claimBatch(batch1.id);
      await examStore.saveBatchQuestionsAndFinalize({
        batchId: batch1.id,
        fencingToken: c1.fencingToken!,
        questions: [
          {
            questionIndex: 1,
            question: "سؤال موفق فصل اول ۱",
            choices: [{ id: "a", text: "۱" }, { id: "b", text: "۲" }],
            correctAnswer: { choiceId: "a" },
          },
          {
            questionIndex: 2,
            question: "سؤال موفق فصل اول ۲",
            choices: [{ id: "a", text: "۱" }, { id: "b", text: "۲" }],
            correctAnswer: { choiceId: "b" },
          },
        ],
      });

      // Batch 2 fails with insufficient_content
      const c2 = await examStore.claimBatch(batch2.id);
      await examStore.handleBatchFinalFailureAndReconcile({
        batchId: batch2.id,
        fencingToken: c2.fencingToken!,
        errorCode: "insufficient_content",
        errorMessage: "محتوای فصل دوم کافی نیست.",
        taskId: task2.id,
        operationId: created.operation.id,
      });

      // Operation should be finalized as 'partial' with 2 generated questions
      const progress = await service.getExamGenerationProgress(orgAdminA, created.operation.id);
      expect(progress.status).toBe("partial");
      expect(progress.totalGeneratedQuestions).toBe(2);

      // Re-cancelling a finalized 'partial' operation (no active batches) must be rejected
      await expect(
        service.cancelExamGenerationOperation(orgAdminA, created.operation.id),
      ).rejects.toThrow(DomainError);

      // Successful questions from partial operation can still be reviewed and transferred
      const staged = await service.getExamGenerationQuestions(orgAdminA, created.operation.id);
      expect(staged.length).toBe(2);
      await service.reviewExamGenerationQuestions(orgAdminA, created.operation.id, {
        questionIds: [staged[0].id],
        decision: "accepted",
      });
      const transferRes = await service.transferExamGenerationQuestions(
        orgAdminA,
        created.operation.id,
        [staged[0].id],
      );
      expect(transferRes.transferredCount).toBe(1);
    });

    it("finalizes as failed with 0 questions when all tasks fail", async () => {
      const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 2,
        moduleIds: [module1],
      });
      const batch = created.batches[0];
      const claim = await examStore.claimBatch(batch.id);
      await examStore.handleBatchFinalFailureAndReconcile({
        batchId: batch.id,
        fencingToken: claim.fencingToken!,
        errorCode: "insufficient_content",
        errorMessage: "محتوای فصل کافی نیست.",
        taskId: created.tasks[0].id,
        operationId: created.operation.id,
      });

      const progress = await service.getExamGenerationProgress(orgAdminA, created.operation.id);
      expect(progress.status).toBe("failed");
      expect(progress.totalGeneratedQuestions).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 17. Phase 2.7 — Persistent Quiz-scoped Operation History
  // -------------------------------------------------------------------------
  describe("Persistent Quiz-scoped Operation History (Phase 2.7)", () => {
    it("lists operations sorted newest first with accurate stagingStats, status filter, pagination, and tenant/quiz isolation", async () => {
      // Empty history initially
      const emptyRes = await service.listQuizExamGenerationOperations(orgAdminA, testQuizId);
      expect(emptyRes).toEqual({ operations: [], total: 0, limit: 20, offset: 0 });

      // Create another quiz in same org to verify strict quiz isolation
      const otherQuiz = await service.createQuiz(orgAdminA, {
        title: "آزمون دیگر",
        organizationId: orgIdA,
      });
      await service.createExamGenerationOperation(orgAdminA, otherQuiz.id, {
        totalQuestions: 2,
        moduleIds: [module1],
      });

      // Create Op 1 (older) -> partial with 3 questions: 1 transferred, 1 accepted, 1 rejected
      const op1 = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 4,
        chapterAllocations: [
          { moduleId: module1, quota: 3 },
          { moduleId: module2, quota: 1 },
        ],
      });
      const op1Row = examStore.operations.get(op1.operation.id)!;
      op1Row.createdAt = new Date("2026-11-25T10:00:00Z");

      const op1Batch1 = op1.batches.find((b) => b.taskId === op1.tasks[0].id)!;
      const op1Batch2 = op1.batches.find((b) => b.taskId === op1.tasks[1].id)!;
      const c1 = await examStore.claimBatch(op1Batch1.id);
      await examStore.saveBatchQuestionsAndFinalize({
        batchId: op1Batch1.id,
        fencingToken: c1.fencingToken!,
        questions: [
          {
            questionIndex: 1,
            question: "سؤال ۱",
            choices: [{ id: "a", text: "۱" }, { id: "b", text: "۲" }],
            correctAnswer: { choiceId: "a" },
          },
          {
            questionIndex: 2,
            question: "سؤال ۲",
            choices: [{ id: "a", text: "۱" }, { id: "b", text: "۲" }],
            correctAnswer: { choiceId: "a" },
          },
          {
            questionIndex: 3,
            question: "سؤال ۳",
            choices: [{ id: "a", text: "۱" }, { id: "b", text: "۲" }],
            correctAnswer: { choiceId: "a" },
          },
        ],
      });
      const c2 = await examStore.claimBatch(op1Batch2.id);
      await examStore.handleBatchFinalFailureAndReconcile({
        batchId: op1Batch2.id,
        fencingToken: c2.fencingToken!,
        errorCode: "insufficient_content",
        errorMessage: "کمبود محتوا",
        taskId: op1.tasks[1].id,
        operationId: op1.operation.id,
      });

      const stagedOp1 = await service.getExamGenerationQuestions(orgAdminA, op1.operation.id);
      await service.reviewExamGenerationQuestions(orgAdminA, op1.operation.id, {
        questionIds: [stagedOp1[0].id, stagedOp1[1].id],
        decision: "accepted",
      });
      await service.reviewExamGenerationQuestions(orgAdminA, op1.operation.id, {
        questionIds: [stagedOp1[2].id],
        decision: "rejected",
      });
      await service.transferExamGenerationQuestions(orgAdminA, op1.operation.id, [stagedOp1[0].id]);

      // Create Op 2 (newer) -> pending
      const op2 = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 2,
        moduleIds: [module1],
      });
      const op2Row = examStore.operations.get(op2.operation.id)!;
      op2Row.createdAt = new Date("2026-11-25T11:00:00Z");

      // List all for testQuizId -> sorted newest first (op2, then op1), excludes otherQuiz
      const listRes = await service.listQuizExamGenerationOperations(orgAdminA, testQuizId);
      expect(listRes.total).toBe(2);
      expect(listRes.operations.map((o) => o.id)).toEqual([op2.operation.id, op1.operation.id]);

      const op1History = listRes.operations[1];
      expect(op1History.status).toBe("partial");
      expect(op1History.stagingStats).toEqual({
        totalCount: 3,
        pendingReviewCount: 0,
        acceptedCount: 1,
        rejectedCount: 1,
        transferredCount: 1,
      });

      // Filter by status = partial
      const partialOnly = await service.listQuizExamGenerationOperations(orgAdminA, testQuizId, {
        status: "partial",
      });
      expect(partialOnly.total).toBe(1);
      expect(partialOnly.operations[0].id).toBe(op1.operation.id);

      // Pagination limit=1, offset=1
      const page2 = await service.listQuizExamGenerationOperations(orgAdminA, testQuizId, {
        limit: 1,
        offset: 1,
      });
      expect(page2.total).toBe(2);
      expect(page2.operations.length).toBe(1);
      expect(page2.operations[0].id).toBe(op1.operation.id);

      // Tenant isolation & student block
      await expect(
        service.listQuizExamGenerationOperations(orgAdminB, testQuizId),
      ).rejects.toThrow(DomainError);
      await expect(
        service.listQuizExamGenerationOperations(studentUser, testQuizId),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("7. Pattern Snapshots, End-to-End Execution, Reconciliation & Wiring", () => {
    it("populates only active exam patternSnapshots and valid patternAllocations for every slot", async () => {
      const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 5,
        moduleIds: [module1, module2],
      });

      expect(created.operation.patternSnapshots.length).toBeGreaterThan(0);
      for (const snap of created.operation.patternSnapshots) {
        expect(snap.category).toBe("exam");
      }
      const snapshotIds = new Set(created.operation.patternSnapshots.map((s) => s.patternId));

      for (const batch of created.batches) {
        expect(batch.patternAllocations.length).toBe(batch.targetCount);
        for (let idx = 1; idx <= batch.targetCount; idx++) {
          const alloc = batch.patternAllocations.find((a) => a.questionIndex === idx);
          expect(alloc).toBeDefined();
          expect(snapshotIds.has(alloc!.patternId)).toBe(true);
        }
      }
      expect(examQueue.jobs.length).toBe(created.batches.length);
    });

    it("throws explicit DomainError when no active exam patterns exist or only non-exam patterns are active", async () => {
      const patternStore = new InMemoryQuestionPatternStore();
      const allPatterns = await patternStore.listPatterns({ activeOnly: false });
      for (const p of allPatterns) {
        if (p.category === "exam") {
          await patternStore.update(asQuestionPatternId(p.id), { isActive: false });
        }
      }

      // analytical & supplementary remain active, but all exam patterns are inactive
      const remainingActive = await patternStore.listPatterns({ activeOnly: true });
      expect(remainingActive.length).toBeGreaterThan(0);
      expect(remainingActive.every((p) => p.category !== "exam")).toBe(true);

      const serviceWithoutExamPatterns = new StudioService(
        quizStore,
        bankStore,
        attemptStore,
        undefined,
        orgStore,
        undefined,
        examStore,
        examQueue,
        patternStore,
      );

      await expect(
        serviceWithoutExamPatterns.createExamGenerationOperation(orgAdminA, testQuizId, {
          totalQuestions: 3,
          moduleIds: [module1],
        }),
      ).rejects.toMatchObject({
        code: "bad_request",
      });
      expect(examStore.operations.size).toBe(0);
      expect(examQueue.jobs.length).toBe(0);
    });

    it("processes enqueued batch job end-to-end through worker processor into staging and syncs progress", async () => {
      const created = await service.createExamGenerationOperation(orgAdminA, testQuizId, {
        totalQuestions: 2,
        moduleIds: [module1],
      });

      expect(examQueue.jobs.length).toBe(1);
      const enqueued = examQueue.jobs[0];

      // Seed lesson content for InMemoryStudioExamStore.getModuleLessonContent
      const originalGetContent = examStore.getModuleLessonContent.bind(examStore);
      examStore.getModuleLessonContent = async (modId: string) => {
        if (modId === module1) {
          return {
            lessons: [
              {
                id: "lesson-1",
                title: "مبانی فارماکولوژی",
                contentMarkdown: "داروها از طریق گیرنده‌های اختصاصی عمل می‌کنند و نیمه‌عمر پلاسمایی دارند.",
                sortOrder: 1,
              },
            ],
            combinedMarkdown: "## درس ۱: مبانی فارماکولوژی\n\nداروها از طریق گیرنده‌های اختصاصی عمل می‌کنند و نیمه‌عمر پلاسمایی دارند.",
            totalLength: 105,
          };
        }
        return originalGetContent(modId);
      };

      const svcGenQuestions = [
        {
          questionIndex: 1,
          question: "کدام عامل در تعیین فاصله زمانی تجویز دارو نقش کلیدی دارد؟",
          choices: ["نیمه‌عمر پلاسمایی", "رنگ قرص", "شکل بسته‌بندی", "قیمت دارو"],
          correctAnswer: "نیمه‌عمر پلاسمایی",
          explanation: "نیمه‌عمر پلاسمایی زمان لازم برای نصف‌شدن غلظت دارو است.",
          difficulty: "medium",
        },
        {
          questionIndex: 2,
          question: "داروها معمولاً از چه طریقی اثر فارماکولوژیک خود را اعمال می‌کنند؟",
          choices: ["گیرنده‌های اختصاصی", "تغییر رنگ پوست", "کاهش دمای محیط", "افزایش رطوبت"],
          correctAnswer: "گیرنده‌های اختصاصی",
          explanation: "اتصال به گیرنده‌های اختصاصی مکانیسم اصلی اثر داروهاست.",
          difficulty: "medium",
        },
      ];
      const svcKeyByIdx = new Map(svcGenQuestions.map((q) => [q.questionIndex, q.correctAnswer]));
      const mockGeminiGateway: ModelGateway = {
        provider: "gemini",
        model: "gemini-2.5-flash",
        complete: async (req) => {
          const stage = req.stage ?? "";
          const userMsg = req.messages?.[1]?.content ?? "";
          if (stage.endsWith("_blind_eval")) {
            const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
            const start = userMsg.indexOf(marker);
            const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
            const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
              questionIndex: number;
              choices: Array<{ id: string; text: string }>;
            }>;
            return {
              text: JSON.stringify({
                questions: payload.map((item) => ({
                  questionIndex: item.questionIndex,
                  verdicts: item.choices.map((c) => ({
                    choiceId: c.id,
                    status: c.text === svcKeyByIdx.get(item.questionIndex) ? "correct" : "incorrect",
                    reason: "ارزیابی مستقل",
                  })),
                })),
              }),
              usage: { inputTokens: 60, outputTokens: 60 },
              model: "gemini-2.5-flash",
            };
          }
          if (stage.endsWith("_expl_audit")) {
            const marker = "QUESTIONS TO AUDIT:\n";
            const start = userMsg.indexOf(marker);
            const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
            const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
              questionIndex: number;
            }>;
            return {
              text: JSON.stringify({
                questions: payload.map((item) => ({
                  questionIndex: item.questionIndex,
                  explanationScientificallyCorrect: true,
                  consistentWithContext: true,
                  consistentWithBlindKey: true,
                  allDistractorRationalesDefensible: true,
                  issues: [],
                })),
              }),
              usage: { inputTokens: 60, outputTokens: 60 },
              model: "gemini-2.5-flash",
            };
          }
          return {
            text: JSON.stringify({ questions: svcGenQuestions }),
            usage: { inputTokens: 120, outputTokens: 180 },
            model: "gemini-2.5-flash",
          };
        },
      };

      const fakeJob = {
        id: enqueued.opts?.jobId ?? "job-1",
        data: enqueued.data,
        attemptsMade: 0,
        opts: { attempts: 5 },
      } as unknown as Job<StudioExamBatchJobPayload>;

      const res = await processStudioExamBatchJob(fakeJob, {
        store: examStore,
        gateway: mockGeminiGateway,
      });

      expect(res.status).toBe("succeeded");
      expect(res.isCompleted).toBe(true);

      const progress = await service.getExamGenerationProgress(orgAdminA, created.operation.id);
      expect(progress.status).toBe("completed");
      expect(progress.totalGeneratedQuestions).toBe(2);
      expect(progress.progressPercentage).toBe(100);

      const staged = await service.getExamGenerationQuestions(orgAdminA, created.operation.id);
      expect(staged.length).toBe(2);
    });

    it("reconcileStaleBatches re-enqueues valid pending batches and skips legacy empty-pattern batches until repaired", async () => {
      const op = await examStore.createOperationWithTasksAndBatches({
        quizId: testQuizId,
        organizationId: orgIdA,
        createdBy: orgAdminA.userId,
        totalRequestedQuestions: 2,
        config: {},
        patternSnapshots: [],
        tasks: [
          {
            courseId: "course-1",
            moduleId: module1,
            targetQuestionCount: 2,
            batches: [{ batchIndex: 1, targetCount: 2, patternAllocations: [] }],
          },
        ],
      });

      // Backdate batch createdAt to trigger pendingGraceSeconds
      const batchRow = examStore.batches.get(op.batches[0].id)!;
      batchRow.createdAt = new Date(Date.now() - 120_000);

      // Reconciler must NOT blindly re-enqueue batch with empty patternAllocations
      const reconBeforeRepair = await examStore.reconcileStaleBatches({
        queue: examQueue,
        pendingGraceSeconds: 60,
      });
      expect(reconBeforeRepair.reenqueuedBatchesCount).toBe(0);
      expect(examQueue.jobs.length).toBe(0);

      // Official recovery via reenqueuePendingBatches repairs patterns safely and enqueues
      const reenqueueRes = await service.reenqueuePendingBatches(orgAdminA, op.operation.id);
      expect(reenqueueRes.reenqueuedCount).toBe(1);
      expect(examQueue.jobs.length).toBe(1);

      const repairedOp = await examStore.getOperationById(op.operation.id);
      expect(repairedOp!.operation.patternSnapshots.length).toBeGreaterThan(0);
      expect(repairedOp!.batches[0].patternAllocations.length).toBe(2);
    });

    it("verifies API composition, local worker supervisor, and worker entrypoint wiring", () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../..");
      const composeProd = fs.readFileSync(
        path.join(repoRoot, "apps/api/src/server/composeProduction.ts"),
        "utf8",
      );
      const workerStart = fs.readFileSync(
        path.join(repoRoot, "tools/worker/worker-start.ts"),
        "utf8",
      );
      const workerIndex = fs.readFileSync(
        path.join(repoRoot, "apps/worker/src/index.ts"),
        "utf8",
      );

      expect(composeProd).toContain("new BullMqStudioExamQueue");
      expect(composeProd).toContain("studioExamQueue,");
      expect(composeProd).toContain("await studioExamQueue.close()");
      expect(workerStart).toContain("--workspace=@avana/worker");
      expect(workerStart).toContain("DISABLE_INLINE_WORKER");
      expect(workerIndex).toContain("createStudioExamWorker");
      expect(workerIndex).toContain("reconcileStaleBatches({");
      expect(workerIndex).toContain("queue: studioExamQueue");
    });
  });
});
