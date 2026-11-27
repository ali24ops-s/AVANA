/**
 * AVANA Exam Studio — Multi-Chapter AI Generation Queue (Phase 2).
 *
 * Defines the BullMQ queue, job type, and lightweight payload for batched
 * question generation jobs.
 *
 * Architecture Rule:
 * The queue payload contains strictly entity identifiers. It NEVER carries
 * raw lesson markdown text, large snapshots, or sensitive data.
 */

import { Queue, type ConnectionOptions } from "bullmq";

export const STUDIO_EXAM_BATCH_QUEUE_NAME = "studio_exam_batch_generate";
export const STUDIO_EXAM_BATCH_JOB_NAME = "studio_exam_batch";

export interface StudioExamBatchJobPayload {
  operationId: string;
  taskId: string;
  batchId: string;
}

export interface StudioExamQueue {
  readonly queueName: string;
  add(
    name: string,
    data: StudioExamBatchJobPayload,
    opts?: { jobId?: string; attempts?: number; backoff?: { type: "exponential" | "fixed"; delay: number } },
  ): Promise<void>;
  getWaitingCount(): Promise<number>;
  close(): Promise<void>;
}

export interface BullMqStudioExamQueueOptions {
  connection: ConnectionOptions;
  queueName?: string;
  timeoutMs?: number;
}

export class BullMqStudioExamQueue implements StudioExamQueue {
  readonly queueName: string;
  private readonly queue: Queue<StudioExamBatchJobPayload>;
  private readonly timeoutMs: number;

  constructor(options: BullMqStudioExamQueueOptions) {
    this.queueName = options.queueName ?? STUDIO_EXAM_BATCH_QUEUE_NAME;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.queue = new Queue<StudioExamBatchJobPayload>(this.queueName, {
      connection: options.connection,
    });
  }

  async add(
    name: string,
    data: StudioExamBatchJobPayload,
    opts?: { jobId?: string; attempts?: number; backoff?: { type: "exponential" | "fixed"; delay: number } },
  ): Promise<void> {
    const jobId = opts?.jobId ?? `batch_${data.batchId}`;

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `BullMQ queue.add timed out after ${this.timeoutMs}ms for job ${jobId}`,
          ),
        );
      }, this.timeoutMs);
    });

    const addPromise = this.queue.add(name, data, {
      jobId,
      attempts: opts?.attempts ?? 5,
      backoff: opts?.backoff ?? {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    try {
      await Promise.race([addPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async getWaitingCount(): Promise<number> {
    return this.queue.getWaitingCount();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
