import { Queue } from "bullmq";
import type { CrmCampaignId, CrmCampaignExecutionId } from "@avana/domain";

export interface CampaignJobPayload {
  campaignId: CrmCampaignId;
  executionId: CrmCampaignExecutionId;
  batchSize?: number;
}

export type CrmCampaignJobPayload = CampaignJobPayload;

export interface CrmCampaignQueue {
  enqueueCampaignExecution(payload: CampaignJobPayload): Promise<{ jobId: string }>;
  close?(): Promise<void>;
}

export type BullMqCampaignQueueOptions = {
  connection: { url: string };
  queueName?: string;
};

/**
 * BullMQ-backed campaign queue implementation.
 *
 * Uses executionId as the BullMQ jobId to guarantee strict deduplication:
 * if an execution is enqueued multiple times concurrently or re-requested,
 * BullMQ rejects or ignores duplicate active job IDs.
 */
export class BullMqCampaignQueue implements CrmCampaignQueue {
  private readonly queue: Queue;
  public readonly queueName: string;

  constructor(options: BullMqCampaignQueueOptions) {
    this.queueName = options.queueName ?? "crm_campaign_dispatch";
    this.queue = new Queue(this.queueName, {
      connection: { url: options.connection.url },
    });
  }

  async enqueueCampaignExecution(payload: CampaignJobPayload): Promise<{ jobId: string }> {
    const jobId = String(payload.executionId);

    // BullMQ jobId deduplication: an active job with this id cannot be re-added
    await this.queue.add("dispatch_campaign", payload, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        count: 1000,
        age: 7 * 24 * 3600,
      },
      removeOnFail: {
        count: 5000,
        age: 14 * 24 * 3600,
      },
    });

    return { jobId };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

/**
 * In-memory Campaign Queue implementation for test suites, CI, and local dev without Redis.
 */
export class InMemoryCampaignQueue implements CrmCampaignQueue {
  public readonly enqueuedJobs: Array<{ jobId: string; payload: CampaignJobPayload }> = [];
  private jobHandler?: (payload: CampaignJobPayload) => Promise<void>;

  setJobHandler(handler: (payload: CampaignJobPayload) => Promise<void>): void {
    this.jobHandler = handler;
  }

  setHandler(handler: (payload: CampaignJobPayload) => Promise<void>): void {
    this.setJobHandler(handler);
  }

  getJobs(): Array<{ jobId: string; payload: CampaignJobPayload }> {
    return [...this.enqueuedJobs];
  }

  async enqueueCampaignExecution(payload: CampaignJobPayload): Promise<{ jobId: string }> {
    const jobId = String(payload.executionId);

    // Enqueue deduplication: do not add duplicate job if already queued
    const existing = this.enqueuedJobs.find((j) => j.jobId === jobId);
    if (!existing) {
      this.enqueuedJobs.push({ jobId, payload });
    }

    // If an asynchronous processor handler is attached, run it without blocking HTTP thread
    if (this.jobHandler) {
      const handler = this.jobHandler;
      queueMicrotask(() => {
        void handler(payload).catch((err) => {
          // Worker-level exception handled inside handler
          process.stderr.write(`[InMemoryCampaignQueue] Job error: ${String(err)}\n`);
        });
      });
    }

    return { jobId };
  }

  async close(): Promise<void> {
    this.enqueuedJobs.length = 0;
  }

  clear(): void {
    this.enqueuedJobs.length = 0;
  }
}
