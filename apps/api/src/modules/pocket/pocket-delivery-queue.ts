/**
 * AVANA Pocket — Event Delivery Queue (Phase 2C-4B).
 *
 * BullMQ abstraction for delivering pocket outbox events to apps/worker.
 * Provides BullMqPocketDeliveryQueue and InMemoryPocketDeliveryQueue.
 */

import { Queue, type ConnectionOptions } from "bullmq";

export const POCKET_DELIVERY_QUEUE_NAME = "pocket_event_delivery";

export interface PocketEventJobData {
  outboxId: string;
  dispatchToken: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  globalEpoch: number;
}

export interface PocketDeliveryQueue {
  readonly queueName: string;
  add(name: string, data: PocketEventJobData, opts?: { jobId?: string }): Promise<void>;
  getWaitingCount(): Promise<number>;
  close(): Promise<void>;
}

export interface BullMqPocketDeliveryQueueOptions {
  connection: ConnectionOptions;
  queueName?: string;
  timeoutMs?: number;
}

export class BullMqPocketDeliveryQueue implements PocketDeliveryQueue {
  readonly queueName: string;
  private readonly queue: Queue<PocketEventJobData>;
  private readonly timeoutMs: number;

  constructor(options: BullMqPocketDeliveryQueueOptions) {
    this.queueName = options.queueName ?? POCKET_DELIVERY_QUEUE_NAME;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.queue = new Queue<PocketEventJobData>(this.queueName, {
      connection: options.connection,
    });
  }

  async add(name: string, data: PocketEventJobData, opts?: { jobId?: string }): Promise<void> {
    const jobId = opts?.jobId ?? `pocket_${data.outboxId}_${data.dispatchToken}`;

    // 5000ms timeout race to prevent indefinite hang on Redis stalls
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`BullMQ queue.add timed out after ${this.timeoutMs}ms for job ${jobId}`));
      }, this.timeoutMs);
    });

    const addPromise = this.queue.add(name, data, {
      jobId,
      attempts: 1, // BullMQ retries disabled; PostgreSQL manages retries
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    });

    try {
      await Promise.race([addPromise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async getWaitingCount(): Promise<number> {
    try {
      return await this.queue.getWaitingCount();
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class InMemoryPocketDeliveryQueue implements PocketDeliveryQueue {
  readonly queueName: string;
  private jobs: { name: string; data: PocketEventJobData; jobId: string }[] = [];
  private isClosed = false;

  constructor(queueName = POCKET_DELIVERY_QUEUE_NAME) {
    this.queueName = queueName;
  }

  async add(name: string, data: PocketEventJobData, opts?: { jobId?: string }): Promise<void> {
    if (this.isClosed) {
      throw new Error("Queue is closed");
    }
    const jobId = opts?.jobId ?? `pocket_${data.outboxId}_${data.dispatchToken}`;
    this.jobs.push({ name, data, jobId });
  }

  async getWaitingCount(): Promise<number> {
    return this.jobs.length;
  }

  async close(): Promise<void> {
    this.isClosed = true;
    this.jobs = [];
  }

  getJobs(): readonly { name: string; data: PocketEventJobData; jobId: string }[] {
    return [...this.jobs];
  }

  shiftJob(): { name: string; data: PocketEventJobData; jobId: string } | undefined {
    return this.jobs.shift();
  }

  clear(): void {
    this.jobs = [];
  }
}
