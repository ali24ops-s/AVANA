import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { InMemoryAssertionPublishingStore } from "../assertion-publishing-store.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";
import {
  InMemoryPocketDeliveryQueue,
  type PocketEventJobData,
  type PocketDeliveryQueue,
} from "../pocket-delivery-queue.js";
import {
  PocketEventHandlerRegistry,
  type PocketEventDeliveryHandler,
  type PocketEventPayload,
} from "../pocket-event-handler.js";
import { PocketOutboxDispatcher } from "../pocket-outbox-dispatcher.js";
import {
  processPocketEventJob,
  type PocketEventProcessorDeps,
} from "../pocket-event-processor.js";

describe("AVANA Pocket Phase 2C-4B: Durable Outbox Processing & Event Delivery", () => {
  let store: InMemoryAssertionPublishingStore;
  let queue: InMemoryPocketDeliveryQueue;
  let registry: PocketEventHandlerRegistry;
  let dispatcher: PocketOutboxDispatcher;

  beforeEach(() => {
    store = new InMemoryAssertionPublishingStore();
    queue = new InMemoryPocketDeliveryQueue();
    registry = new PocketEventHandlerRegistry();
    dispatcher = new PocketOutboxDispatcher({
      store,
      queue,
      batchSize: 10,
      pollIntervalMs: 50,
      dispatchLeaseSeconds: 60,
      maxWaitingJobs: 20,
    });
  });

  describe("1. Two-Phase Lease Claim & Dispatch to Queue", () => {
    it("claims pending event with dsp_<uuid> lease and pushes to delivery queue", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-123",
        eventType: "assertion.published",
        payload: { assertionId: "as-1" },
      });

      const processed = await dispatcher.dispatchOnce();
      expect(processed).toBe(1);

      const events = store.getOutboxEvents();
      const updated = events.find((e) => e.id === enqueued.id)!;
      expect(updated.status).toBe("sending");
      expect(updated.leaseToken).toMatch(/^dsp_[a-f0-9-]+$/);
      expect(updated.leaseExpiresAt).toBeInstanceOf(Date);
      expect(updated.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());

      const jobs = queue.getJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].jobId).toBe(`pocket_${enqueued.id}_${updated.leaseToken}`);
      expect(jobs[0].data.outboxId).toBe(enqueued.id);
      expect(jobs[0].data.dispatchToken).toBe(updated.leaseToken);
      expect(jobs[0].data.eventType).toBe("assertion.published");
    });

    it("respects batchSize limits during dispatch claim", async () => {
      for (let i = 0; i < 15; i++) {
        await store.enqueueOutboxEvent({
          aggregateType: "drug",
          aggregateId: `drug-${i}`,
          eventType: "assertion.published",
          payload: { idx: i },
        });
      }

      const processed = await dispatcher.dispatchOnce();
      expect(processed).toBe(10);
      expect(queue.getJobs().length).toBe(10);
    });

    it("preserves globalEpoch from outbox event into queue job", async () => {
      const epoch = Date.now();
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-epoch",
        eventType: "assertion.published",
        payload: { epochTest: true },
        globalEpoch: epoch,
      });

      await dispatcher.dispatchOnce();
      const job = queue.getJobs().find((j) => j.data.outboxId === enqueued.id)!;
      expect(job.data.globalEpoch).toBe(epoch);
    });
  });

  describe("2. Worker Lease Rotation & Handler Execution", () => {
    it("rotates dispatch lease (dsp_*) to execution lease (exe_*) and successfully marks sent on completion", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-101",
        eventType: "assertion.published",
        payload: { assertionId: "as-101" },
      });

      await dispatcher.dispatchOnce();
      const job = queue.shiftJob()!;

      let receivedPayload: PocketEventPayload | null = null;
      let receivedSignal: AbortSignal | null = null;

      const handler: PocketEventDeliveryHandler = {
        eventType: "assertion.published",
        async handle(event, signal) {
          receivedPayload = event;
          receivedSignal = signal;
        },
      };
      registry.register(handler);

      const deps: PocketEventProcessorDeps = {
        store,
        handlerRegistry: registry,
        executionLeaseSeconds: 300,
      };

      await processPocketEventJob(job.data, deps);

      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload!.id).toBe(enqueued.id);
      expect(receivedPayload!.eventType).toBe("assertion.published");
      expect(receivedSignal).not.toBeNull();
      expect(receivedSignal!.aborted).toBe(false);

      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.status).toBe("sent");
      expect(record.sentAt).toBeInstanceOf(Date);
      expect(record.leaseToken).toBeNull();
      expect(record.leaseExpiresAt).toBeNull();
    });

    it("postpones delivery without burning attempts when no handler is registered", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "disease",
        aggregateId: "dis-200",
        eventType: "unhandled.event.type",
        payload: { foo: "bar" },
      });

      await dispatcher.dispatchOnce();
      const job = queue.shiftJob()!;

      const deps: PocketEventProcessorDeps = {
        store,
        handlerRegistry: registry,
      };

      await processPocketEventJob(job.data, deps);

      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.status).toBe("pending");
      expect(record.attempts).toBe(0); // attempts preserved
      expect(record.leaseToken).toBeNull();
      expect(record.leaseExpiresAt).toBeNull();
      expect(record.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    });

    it("increments attempts, calculates exponential backoff, and records lastError on handler failure", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "emergency",
        aggregateId: "em-300",
        eventType: "assertion.published",
        payload: { failure: true },
      });

      await dispatcher.dispatchOnce();
      const job = queue.shiftJob()!;

      const failingHandler: PocketEventDeliveryHandler = {
        eventType: "assertion.published",
        async handle() {
          throw new Error("Downstream service connection refused");
        },
      };
      registry.register(failingHandler);

      const deps: PocketEventProcessorDeps = {
        store,
        handlerRegistry: registry,
      };

      await processPocketEventJob(job.data, deps);

      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.status).toBe("pending");
      expect(record.attempts).toBe(1);
      expect(record.lastError).toContain("Downstream service connection refused");
      expect(record.leaseToken).toBeNull();
      expect(record.leaseExpiresAt).toBeNull();
      // Backoff for 0 attempts prior is 30s
      expect(record.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
    });

    it("transitions to dead_letter when maxAttempts is reached", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-max",
        eventType: "assertion.published",
        payload: { crash: true },
      });

      // Simulate record already at attempt 4 of 5
      store.updateOutboxRecordForTest(enqueued.id, {
        attempts: 4,
        maxAttempts: 5,
      });

      // Re-claim
      const claimed = await store.claimBatchForDispatch(1, 60, "dsp_test-max");
      expect(claimed.length).toBe(1);

      const jobData: PocketEventJobData = {
        outboxId: enqueued.id,
        dispatchToken: "dsp_test-max",
        aggregateType: "drug",
        aggregateId: "drug-max",
        eventType: "assertion.published",
        payload: {},
        globalEpoch: 1234,
      };

      const failingHandler: PocketEventDeliveryHandler = {
        eventType: "assertion.published",
        async handle() {
          throw new Error("Permanent fatal validation error");
        },
      };
      registry.register(failingHandler);

      await processPocketEventJob(jobData, {
        store,
        handlerRegistry: registry,
      });

      const updated = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(updated.status).toBe("dead_letter");
      expect(updated.attempts).toBe(5);
      expect(updated.lastError).toContain("Permanent fatal validation error");
      expect(updated.leaseToken).toBeNull();
      expect(updated.leaseExpiresAt).toBeNull();
    });
  });

  describe("3. Concurrency, Token Fencing & Clock Expiration", () => {
    it("drops execution if dispatch token does not match (stale duplicate job)", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "treatment",
        aggregateId: "trt-400",
        eventType: "assertion.published",
        payload: { stale: true },
      });

      await store.claimBatchForDispatch(1, 60, "dsp_valid-token");

      let handlerCalled = false;
      registry.register({
        eventType: "assertion.published",
        async handle() {
          handlerCalled = true;
        },
      });

      // Attempt execution with an invalid / outdated dispatch token
      await processPocketEventJob(
        {
          outboxId: enqueued.id,
          dispatchToken: "dsp_outdated-token",
          aggregateType: "treatment",
          aggregateId: "trt-400",
          eventType: "assertion.published",
          payload: {},
          globalEpoch: 1,
        },
        { store, handlerRegistry: registry },
      );

      expect(handlerCalled).toBe(false);
      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.leaseToken).toBe("dsp_valid-token");
      expect(record.status).toBe("sending");
    });

    it("fences ACK if execution lease has expired", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-500",
        eventType: "assertion.published",
        payload: { expire: true },
      });

      await store.claimBatchForDispatch(1, 60, "dsp_tok");
      await store.refreshExecutionLease(enqueued.id, "dsp_tok", "exe_tok", 60);

      // Artificially expire the lease
      store.updateOutboxRecordForTest(enqueued.id, {
        leaseExpiresAt: new Date(Date.now() - 5000),
      });

      const ackResult = await store.markSent(enqueued.id, "exe_tok");
      expect(ackResult).toBe(false);

      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.status).not.toBe("sent");
    });

    it("fences concurrent workers: second worker cannot ACK with different token", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-concurrent",
        eventType: "assertion.published",
        payload: {},
      });

      await store.claimBatchForDispatch(1, 60, "dsp_tok");
      await store.refreshExecutionLease(enqueued.id, "dsp_tok", "exe_worker1", 60);

      const ackWorker2 = await store.markSent(enqueued.id, "exe_worker2");
      expect(ackWorker2).toBe(false);

      const ackWorker1 = await store.markSent(enqueued.id, "exe_worker1");
      expect(ackWorker1).toBe(true);

      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.status).toBe("sent");
    });
  });

  describe("4. Backpressure & Queue Failure Recovery", () => {
    it("skips dispatch polling when queue waiting jobs reach backpressure threshold", async () => {
      const smallDispatcher = new PocketOutboxDispatcher({
        store,
        queue,
        maxWaitingJobs: 2,
        batchSize: 5,
      });

      await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-bp-1",
        eventType: "assertion.published",
        payload: {},
      });

      // Pre-fill queue with 2 waiting jobs
      await queue.add("deliver_event", {
        outboxId: "dummy-1",
        dispatchToken: "dsp_d1",
        aggregateType: "drug",
        aggregateId: "d1",
        eventType: "e1",
        payload: {},
        globalEpoch: 1,
      });
      await queue.add("deliver_event", {
        outboxId: "dummy-2",
        dispatchToken: "dsp_d2",
        aggregateType: "drug",
        aggregateId: "d2",
        eventType: "e2",
        payload: {},
        globalEpoch: 2,
      });

      const processed = await smallDispatcher.dispatchOnce();
      expect(processed).toBe(0);

      const pending = store.getOutboxEvents().find((e) => e.aggregateId === "drug-bp-1")!;
      expect(pending.status).toBe("pending");
    });

    it("releases dispatch lease to pending with 15s delay on BullMQ add failure without burning attempts", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-redis-err",
        eventType: "assertion.published",
        payload: {},
      });

      // Mock queue that rejects
      const failingQueue = new InMemoryPocketDeliveryQueue();
      failingQueue.add = async () => {
        throw new Error("Redis connection closed");
      };

      const failingDispatcher = new PocketOutboxDispatcher({
        store,
        queue: failingQueue,
      });

      await failingDispatcher.dispatchOnce();

      const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(record.status).toBe("pending");
      expect(record.attempts).toBe(0); // attempts NOT burned
      expect(record.leaseToken).toBeNull();
      expect(record.leaseExpiresAt).toBeNull();
      expect(record.lastError).toContain("Redis connection closed");
      expect(record.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 10_000);
    });

    it("handles 5000ms queue.add timeout failure, releases lease with 15s delay, and rejects late execution", async () => {
      vi.useFakeTimers();

      try {
        const enqueued = await store.enqueueOutboxEvent({
          aggregateType: "drug",
          aggregateId: "drug-timeout-test",
          eventType: "assertion.published",
          payload: { test: "timeout" },
        });

        let lateResolveCallback: (() => void) | undefined;
        let lateCompletedJob: PocketEventJobData | undefined;

        const timeoutQueue: PocketDeliveryQueue = {
          queueName: "pocket_event_delivery",
          async add(name: string, data: PocketEventJobData, opts?: { jobId?: string }): Promise<void> {
            const jobId = opts?.jobId ?? `pocket_${data.outboxId}_${data.dispatchToken}`;
            const timeoutMs = 5000;
            let timer: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error(`BullMQ queue.add timed out after ${timeoutMs}ms for job ${jobId}`));
              }, timeoutMs);
            });

            const hangingPromise = new Promise<void>((resolve) => {
              lateResolveCallback = () => {
                lateCompletedJob = data;
                resolve();
              };
            });

            try {
              await Promise.race([hangingPromise, timeoutPromise]);
            } finally {
              if (timer) clearTimeout(timer);
            }
          },
          async getWaitingCount(): Promise<number> {
            return 0;
          },
          async close(): Promise<void> {},
        };

        const timeoutDispatcher = new PocketOutboxDispatcher({
          store,
          queue: timeoutQueue,
        });

        // Start dispatch
        const dispatchPromise = timeoutDispatcher.dispatchOnce();

        // Advance fake timers by 5001ms to trigger timeout
        await vi.advanceTimersByTimeAsync(5001);
        await dispatchPromise;

        // 1. Verify lease released to pending, attempts preserved, 15s delay applied
        const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
        expect(record.status).toBe("pending");
        expect(record.attempts).toBe(0);
        expect(record.leaseToken).toBeNull();
        expect(record.leaseExpiresAt).toBeNull();
        expect(record.lastError).toContain("timed out after 5000ms");
        expect(record.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 10_000);

        // 2. Now simulate late queue.add completion delivering the timed-out job to worker
        expect(lateResolveCallback).toBeDefined();
        lateResolveCallback!();
        expect(lateCompletedJob).toBeDefined();

        // 3. Worker tries to process this late/stale job
        let handlerExecuted = false;
        registry.register({
          eventType: "assertion.published",
          async handle() {
            handlerExecuted = true;
          },
        });

        await processPocketEventJob(lateCompletedJob!, {
          store,
          handlerRegistry: registry,
        });

        // 4. Verify PostgreSQL token fencing rejected execution of the late job
        expect(handlerExecuted).toBe(false);
        const postLateRecord = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
        expect(postLateRecord.status).toBe("pending");
        expect(postLateRecord.attempts).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("5. Deterministic Expired Lease Recovery Policies", () => {
    it("recovers expired dsp_* lease to pending without incrementing attempts", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-dsp-exp",
        eventType: "assertion.published",
        payload: {},
      });

      await store.claimBatchForDispatch(1, 1, "dsp_expired-token");

      // Expire lease
      store.updateOutboxRecordForTest(enqueued.id, {
        leaseExpiresAt: new Date(Date.now() - 5000),
      });

      const recoveredCount = await store.recoverExpiredLeases(10);
      expect(recoveredCount).toBe(1);

      const recovered = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(recovered.status).toBe("pending");
      expect(recovered.attempts).toBe(0); // preserved
      expect(recovered.leaseToken).toBeNull();
      expect(recovered.leaseExpiresAt).toBeNull();
    });

    it("recovers expired exe_* lease by incrementing attempts and scheduling retry", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "disease",
        aggregateId: "dis-exe-exp",
        eventType: "assertion.published",
        payload: {},
      });

      await store.claimBatchForDispatch(1, 60, "dsp_init");
      await store.refreshExecutionLease(enqueued.id, "dsp_init", "exe_crashed-worker", 60);

      // Worker crashed, lease expired
      store.updateOutboxRecordForTest(enqueued.id, {
        leaseExpiresAt: new Date(Date.now() - 5000),
      });

      const recoveredCount = await store.recoverExpiredLeases(10);
      expect(recoveredCount).toBe(1);

      const recovered = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(recovered.status).toBe("pending");
      expect(recovered.attempts).toBe(1); // incremented
      expect(recovered.lastError).toBe("Execution lease expired");
      expect(recovered.leaseToken).toBeNull();
      expect(recovered.leaseExpiresAt).toBeNull();
    });

    it("recovers expired exe_* lease to dead_letter if attempts reaches maxAttempts", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "emergency",
        aggregateId: "em-exe-fatal",
        eventType: "assertion.published",
        payload: {},
      });

      store.updateOutboxRecordForTest(enqueued.id, {
        attempts: 4,
        maxAttempts: 5,
      });

      await store.claimBatchForDispatch(1, 60, "dsp_init");
      await store.refreshExecutionLease(enqueued.id, "dsp_init", "exe_final-crash", 60);

      store.updateOutboxRecordForTest(enqueued.id, {
        leaseExpiresAt: new Date(Date.now() - 5000),
      });

      await store.recoverExpiredLeases(10);

      const recovered = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(recovered.status).toBe("dead_letter");
      expect(recovered.attempts).toBe(5);
      expect(recovered.lastError).toBe("Execution lease expired");
    });

    it("recovers malformed or NULL expired token safely to pending without burning attempts", async () => {
      const enqueued = await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-malformed",
        eventType: "assertion.published",
        payload: {},
      });

      store.updateOutboxRecordForTest(enqueued.id, {
        status: "sending",
        leaseToken: "unknown_prefix_123",
        leaseExpiresAt: new Date(Date.now() - 5000),
      });

      await store.recoverExpiredLeases(10);

      const recovered = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
      expect(recovered.status).toBe("pending");
      expect(recovered.attempts).toBe(0);
      expect(recovered.lastError).toBe("Malformed lease token recovered");
      expect(recovered.leaseToken).toBeNull();
      expect(recovered.leaseExpiresAt).toBeNull();
    });
  });

  describe("6. Dispatcher Lifecycle: Start, Trigger & Stop", () => {
    it("starts background polling and stops gracefully on stop()", async () => {
      dispatcher.start();

      await store.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId: "drug-life",
        eventType: "assertion.published",
        payload: {},
      });

      // Immediate trigger wakeup
      dispatcher.trigger();

      // Wait a tick for polling loop
      await new Promise((res) => setTimeout(res, 120));

      const events = store.getOutboxEvents();
      const event = events.find((e) => e.aggregateId === "drug-life")!;
      expect(event.status).toBe("sending");

      await dispatcher.stop();
    });
  });

  describe("7. Real PostgreSQL Database Integration (DrizzleAssertionPublishingStore)", () => {
    let client: ReturnType<typeof createDbClient> | null = null;
    let drizzleStore: DrizzleAssertionPublishingStore | null = null;
    let isConnected = false;

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
      drizzleStore = new DrizzleAssertionPublishingStore(client.db);
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it("executes claimBatchForDispatch with SKIP LOCKED and verifies clock_timestamp fencing", async (ctx) => {
      if (!isConnected || !drizzleStore || !client) {
        ctx.skip();
        return;
      }

      const aggregateId = `pg-del-${Date.now()}`;
      const enqueued = await drizzleStore.enqueueOutboxEvent({
        aggregateType: "drug",
        aggregateId,
        eventType: "assertion.published",
        payload: { pgTest: true },
      });

      const dispatchToken = `dsp_${randomUUID()}`;
      const claimed = await drizzleStore.claimBatchForDispatch(100, 60, dispatchToken);
      const target = claimed.find((c) => c.id === enqueued.id);
      expect(target).toBeDefined();
      expect(target!.status).toBe("sending");
      expect(target!.leaseToken).toBe(dispatchToken);
      expect(target!.leaseExpiresAt).toBeInstanceOf(Date);

      // Pre-execution lease rotation
      const executionToken = `exe_${randomUUID()}`;
      const rotated = await drizzleStore.refreshExecutionLease(
        enqueued.id,
        dispatchToken,
        executionToken,
        300,
      );
      expect(rotated).toBe(true);

      // Mark sent
      const sent = await drizzleStore.markSent(enqueued.id, executionToken);
      expect(sent).toBe(true);

      // Verify in DB
      const result = await client.db.execute(sql`
        SELECT status, sent_at, lease_token, lease_expires_at
        FROM pocket_outbox
        WHERE id = ${enqueued.id}::uuid;
      `);
      const row = (result.rows ?? result)[0] as Record<string, unknown>;
      expect(row.status).toBe("sent");
      expect(row.sent_at).not.toBeNull();
      expect(row.lease_token).toBeNull();
      expect(row.lease_expires_at).toBeNull();
    });

    it("verifies scheduleDeliveryRetry and recoverExpiredLeases in real PostgreSQL", async (ctx) => {
      if (!isConnected || !drizzleStore || !client) {
        ctx.skip();
        return;
      }

      const aggregateId = `pg-retry-${Date.now()}`;
      const enqueued = await drizzleStore.enqueueOutboxEvent({
        aggregateType: "disease",
        aggregateId,
        eventType: "assertion.published",
        payload: { willFail: true },
      });

      const dspToken = `dsp_${randomUUID()}`;
      await drizzleStore.claimBatchForDispatch(5, 60, dspToken);

      const exeToken = `exe_${randomUUID()}`;
      await drizzleStore.refreshExecutionLease(enqueued.id, dspToken, exeToken, 60);

      // Trigger delivery failure retry
      const retried = await drizzleStore.scheduleDeliveryRetry(
        enqueued.id,
        exeToken,
        "PG simulated downstream error",
      );
      expect(retried).toBe(true);

      const verifyRetry = await client.db.execute(sql`
        SELECT status, attempts, last_error, lease_token, next_attempt_at
        FROM pocket_outbox
        WHERE id = ${enqueued.id}::uuid;
      `);
      const retryRow = (verifyRetry.rows ?? verifyRetry)[0] as Record<string, unknown>;
      expect(retryRow.status).toBe("pending");
      expect(Number(retryRow.attempts)).toBe(1);
      expect(String(retryRow.last_error)).toBe("PG simulated downstream error");
      expect(retryRow.lease_token).toBeNull();

      // Expired lease recovery test: set status back to sending with expired lease
      await client.db.execute(sql`
        UPDATE pocket_outbox
        SET status = 'sending',
            lease_token = 'exe_crashed_token',
            lease_expires_at = clock_timestamp() - INTERVAL '10 seconds'
        WHERE id = ${enqueued.id}::uuid;
      `);

      const recoveredCount = await drizzleStore.recoverExpiredLeases(10);
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      const verifyRecovery = await client.db.execute(sql`
        SELECT status, attempts, last_error
        FROM pocket_outbox
        WHERE id = ${enqueued.id}::uuid;
      `);
      const recRow = (verifyRecovery.rows ?? verifyRecovery)[0] as Record<string, unknown>;
      expect(recRow.status).toBe("pending");
      expect(Number(recRow.attempts)).toBe(2);
      expect(String(recRow.last_error)).toBe("Execution lease expired");

      // Cleanup
      await client.db.execute(sql`
        DELETE FROM pocket_outbox WHERE id = ${enqueued.id}::uuid;
      `);
    });
  });
});
