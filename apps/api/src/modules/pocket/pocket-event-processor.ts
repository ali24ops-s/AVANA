/**
 * AVANA Pocket — Event Processor & Worker (Phase 2C-4B).
 *
 * Implements BullMQ job processing for pocket outbox events:
 * 1. Two-phase lease rotation: dsp_<uuid> -> exe_<uuid> (300s lease)
 * 2. Missing handler fallback: postponeDelivery (preserves attempts)
 * 3. 25-second execution timeout AbortSignal
 * 4. Success ACK via markSent (status: 'sent', lease cleared)
 * 5. Failure retry via scheduleDeliveryRetry (attempts incremented, exponential backoff)
 */

import { randomUUID } from "node:crypto";
import { Worker, type Job, type ConnectionOptions } from "bullmq";
import type { AssertionPublishingStore } from "./assertion-publishing-store.js";
import {
  POCKET_DELIVERY_QUEUE_NAME,
  type PocketEventJobData,
} from "./pocket-delivery-queue.js";
import type {
  PocketEventHandlerRegistry,
  PocketEventPayload,
} from "./pocket-event-handler.js";

export interface PocketEventProcessorDeps {
  store: AssertionPublishingStore;
  handlerRegistry: PocketEventHandlerRegistry;
  executionLeaseSeconds?: number;
  handlerTimeoutMs?: number;
  logger?: (msg: string) => void;
}

export async function processPocketEventJob(
  jobData: PocketEventJobData,
  deps: PocketEventProcessorDeps,
): Promise<void> {
  const logger = deps.logger ?? (() => {});
  const executionLeaseSeconds = Math.max(10, deps.executionLeaseSeconds ?? 300);
  const handlerTimeoutMs = Math.max(1000, deps.handlerTimeoutMs ?? 25_000);

  // 1. Generate execution lease token
  const executionToken = `exe_${randomUUID()}`;

  // 2. Pre-execution atomic lease token rotation dsp_* -> exe_*
  const rotated = await deps.store.refreshExecutionLease(
    jobData.outboxId,
    jobData.dispatchToken,
    executionToken,
    executionLeaseSeconds,
  );

  if (!rotated) {
    logger(
      `[pocket-processor] Stale dispatch lease or concurrent execution for event ${jobData.outboxId} (dispatchToken: ${jobData.dispatchToken}). Dropping duplicate job.`,
    );
    return;
  }

  // 3. Lookup event handler
  const handler = deps.handlerRegistry.get(jobData.eventType);
  if (!handler) {
    logger(
      `[pocket-processor] No handler registered for eventType '${jobData.eventType}'. Postponing event ${jobData.outboxId}.`,
    );
    try {
      await deps.store.postponeDelivery(jobData.outboxId, executionToken, 60);
    } catch (postponeErr) {
      logger(
        `[pocket-processor] Error postponing event ${jobData.outboxId}: ${String(postponeErr)}`,
      );
    }
    return;
  }

  // 4. Execute handler with timeout signal
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Handler execution timed out after ${handlerTimeoutMs}ms`));
  }, handlerTimeoutMs);

  const payload: PocketEventPayload = {
    id: jobData.outboxId,
    aggregateType: jobData.aggregateType,
    aggregateId: jobData.aggregateId,
    eventType: jobData.eventType,
    payload: jobData.payload,
    globalEpoch: jobData.globalEpoch,
    attempts: 0,
  };

  try {
    await handler.handle(payload, controller.signal);
    clearTimeout(timeoutId);

    // 5. Successful execution ACK
    const acked = await deps.store.markSent(jobData.outboxId, executionToken);
    if (!acked) {
      logger(
        `[pocket-processor] Warning: markSent returned false for event ${jobData.outboxId} (lease may have expired during processing).`,
      );
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const errMsg = err instanceof Error ? err.message : String(err);
    logger(`[pocket-processor] Handler failure for event ${jobData.outboxId}: ${errMsg}`);

    // 6. Schedule retry with backoff or dead letter
    try {
      await deps.store.scheduleDeliveryRetry(jobData.outboxId, executionToken, errMsg);
    } catch (retryErr) {
      logger(
        `[pocket-processor] Error scheduling retry for event ${jobData.outboxId}: ${String(retryErr)}`,
      );
    }
  }
}

export interface CreatePocketEventWorkerOptions {
  concurrency?: number;
}

export function createPocketEventWorker(
  connection: ConnectionOptions,
  deps: PocketEventProcessorDeps,
  opts?: CreatePocketEventWorkerOptions,
): Worker<PocketEventJobData> {
  const concurrency = opts?.concurrency ?? 5;
  return new Worker<PocketEventJobData>(
    POCKET_DELIVERY_QUEUE_NAME,
    async (job: Job<PocketEventJobData>) => {
      await processPocketEventJob(job.data, deps);
    },
    {
      connection,
      concurrency,
    },
  );
}
