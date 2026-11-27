/**
 * AVANA Pocket — Outbox Dispatcher (Phase 2C-4B).
 *
 * Polls pocket_outbox for pending/expired events, claims them with a dispatch lease,
 * and pushes them onto BullMQ for worker execution.
 *
 * Implements:
 * - Two-phase lease token generation (dsp_<uuid>)
 * - Backpressure fencing on queue waiting count
 * - BullMQ queue.add failure release to pending (with 15s delay to prevent hot looping)
 * - Automatic background expired lease recovery
 * - Graceful shutdown and immediate trigger support
 */

import { randomUUID } from "node:crypto";
import type { AssertionPublishingStore } from "./assertion-publishing-store.js";
import type { PocketDeliveryQueue } from "./pocket-delivery-queue.js";

export interface PocketOutboxDispatcherOptions {
  store: AssertionPublishingStore;
  queue: PocketDeliveryQueue;
  batchSize?: number;
  pollIntervalMs?: number;
  dispatchLeaseSeconds?: number;
  maxWaitingJobs?: number;
  logger?: (msg: string) => void;
}

export class PocketOutboxDispatcher {
  private readonly store: AssertionPublishingStore;
  private readonly queue: PocketDeliveryQueue;
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly dispatchLeaseSeconds: number;
  private readonly maxWaitingJobs: number;
  private readonly logger: (msg: string) => void;

  private isRunning = false;
  private isStopping = false;
  private loopPromise: Promise<void> | null = null;
  private wakeUpResolver: (() => void) | null = null;
  private activeProcessingPromise: Promise<number> | null = null;

  constructor(options: PocketOutboxDispatcherOptions) {
    this.store = options.store;
    this.queue = options.queue;
    this.batchSize = Math.max(1, options.batchSize ?? 10);
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 2000);
    this.dispatchLeaseSeconds = Math.max(10, options.dispatchLeaseSeconds ?? 60);
    this.maxWaitingJobs = Math.max(1, options.maxWaitingJobs ?? 20);
    this.logger = options.logger ?? (() => {});
  }

  start(): void {
    if (this.isRunning || this.isStopping) {
      return;
    }
    this.isRunning = true;
    this.isStopping = false;
    this.loopPromise = this.runLoop();
    this.logger("[pocket-outbox] Dispatcher started");
  }

  trigger(): void {
    if (!this.isRunning || this.isStopping) return;
    if (this.wakeUpResolver) {
      this.wakeUpResolver();
      this.wakeUpResolver = null;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isStopping = true;
    this.isRunning = false;

    if (this.wakeUpResolver) {
      this.wakeUpResolver();
      this.wakeUpResolver = null;
    }

    if (this.activeProcessingPromise) {
      try {
        await this.activeProcessingPromise;
      } catch {
        // active processing errors are handled internally
      }
    }

    if (this.loopPromise) {
      try {
        await this.loopPromise;
      } catch {
        // loop errors are handled internally
      }
    }

    this.logger("[pocket-outbox] Dispatcher stopped gracefully");
  }

  async dispatchOnce(): Promise<number> {
    if (this.activeProcessingPromise) {
      return this.activeProcessingPromise;
    }

    this.activeProcessingPromise = this.processNextBatch();
    try {
      return await this.activeProcessingPromise;
    } finally {
      this.activeProcessingPromise = null;
    }
  }

  private async processNextBatch(): Promise<number> {
    try {
      // 1. Check queue backpressure
      const waitingCount = await this.queue.getWaitingCount();
      if (waitingCount >= this.maxWaitingJobs) {
        this.logger(
          `[pocket-outbox] Queue backpressure (${waitingCount} >= ${this.maxWaitingJobs}), skipping dispatch tick`,
        );
        return 0;
      }

      // 2. Periodic recovery sweep for any expired leases
      try {
        await this.store.recoverExpiredLeases(50);
      } catch (recErr) {
        this.logger(`[pocket-outbox] Expired lease recovery warning: ${String(recErr)}`);
      }

      // 3. Claim candidate batch with atomic dispatch lease token
      const dispatchToken = `dsp_${randomUUID()}`;
      const batch = await this.store.claimBatchForDispatch(
        this.batchSize,
        this.dispatchLeaseSeconds,
        dispatchToken,
      );

      if (batch.length === 0) {
        return 0;
      }

      this.logger(`[pocket-outbox] Claimed ${batch.length} events for dispatch with token ${dispatchToken}`);

      // 4. Enqueue to BullMQ
      for (const item of batch) {
        const jobId = `pocket_${item.id}_${dispatchToken}`;
        try {
          await this.queue.add(
            "deliver_event",
            {
              outboxId: item.id,
              dispatchToken,
              aggregateType: item.aggregateType,
              aggregateId: item.aggregateId,
              eventType: item.eventType,
              payload: item.payload,
              globalEpoch: item.globalEpoch,
            },
            { jobId },
          );
        } catch (enqueueErr) {
          const errMsg = enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
          this.logger(
            `[pocket-outbox] Failed to enqueue event ${item.id} to BullMQ: ${errMsg}. Releasing dispatch lease.`,
          );
          try {
            await this.store.releaseDispatchFailure(item.id, dispatchToken, errMsg);
          } catch (relErr) {
            this.logger(
              `[pocket-outbox] Error releasing dispatch failure for ${item.id}: ${String(relErr)}`,
            );
          }
        }
      }

      return batch.length;
    } catch (err) {
      this.logger(`[pocket-outbox] Dispatch tick error: ${String(err)}`);
      return 0;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning && !this.isStopping) {
      let processedCount = 0;
      try {
        processedCount = await this.dispatchOnce();
      } catch (err) {
        this.logger(`[pocket-outbox] Unhandled loop error: ${String(err)}`);
      }

      if (!this.isRunning || this.isStopping) {
        break;
      }

      // If a full batch was processed, poll again quickly to drain queue
      if (processedCount >= this.batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }

      // Sleep until next interval or immediate wakeUp
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.wakeUpResolver = null;
          resolve();
        }, this.pollIntervalMs);

        this.wakeUpResolver = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  }
}
