/**
 * Support Notification Queue & Dispatcher
 *
 * Provides a resilient, decoupled queue for outbound notifications (email, SMS)
 * triggered when support agents reply to tickets.
 *
 * Core Guarantees:
 * - Isolation: Ticket reply creation NEVER fails if email or queue processing fails.
 * - Persistence & Resilience: Backed by BullMQ (when Redis is available) with auto-retries
 *   and exponential backoff, preventing lost jobs on worker restarts.
 * - Strict Idempotency: Uses `ticket_reply:${messageId}` to prevent duplicate sends
 *   both at enqueue time and during worker execution.
 * - Channel Status Tracking: Records in_site, email, and sms statuses in notification metadata.
 * - Privacy: PII (email, phone, message content) is masked or excluded from logs.
 */

import { Queue, Worker, type Job } from "bullmq";
import { asUserId } from "@avana/domain";
import type { EmailService } from "../identity/email-service.js";
import type { NotificationStore } from "../notifications/notification-store.js";
import type { UserStore } from "../identity/user-store.js";
import type { SupportStore } from "./support-store.js";

export interface SupportNotificationJobPayload {
  ticketId: string;
  messageId: string;
  userId: string;
  ticketTitle: string;
  userEmail?: string;
  userPhone?: string;
}

export interface SupportNotificationChannelStatuses {
  in_site: {
    status: "sent";
    sentAt: string;
  };
  email: {
    status: "pending" | "sent" | "failed";
    recipient?: string;
    sentAt?: string;
    lastError?: string;
    attempts?: number;
    reason?: string;
  };
  sms: {
    status: "skipped" | "not_supported" | "sent" | "failed";
    reason?: string;
  };
}

export interface SupportNotificationProcessorDeps {
  emailService?: EmailService;
  notificationStore?: NotificationStore;
  userStore?: UserStore;
  appUrl?: string;
  logger?: (msg: string) => void;
}

export function maskEmailForLogs(email: string): string {
  const parts = email.trim().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

/**
 * Process a single support notification job.
 * Enforces worker-level idempotency and channel tracking.
 */
export async function processSupportNotificationJob(
  payload: SupportNotificationJobPayload,
  deps: SupportNotificationProcessorDeps,
  attemptsMade = 0,
): Promise<void> {
  const idempotencyKey = `ticket_reply:${payload.messageId}`;
  const logger = deps.logger ?? (() => {});

  // 1. Worker-level idempotency check: inspect existing notification metadata
  let existingMetadata: Record<string, unknown> = {};
  if (deps.notificationStore) {
    try {
      const existing = await deps.notificationStore.findByIdempotencyKey(idempotencyKey);
      if (existing?.metadata) {
        existingMetadata = existing.metadata;
        const channels = existing.metadata.channels as
          | Partial<SupportNotificationChannelStatuses>
          | undefined;
        if (channels?.email?.status === "sent") {
          logger(`[support-notification] Email already sent for ${idempotencyKey}, skipping duplicate.`);
          return;
        }
      }
    } catch (err: unknown) {
      logger(`[support-notification] Metadata lookup warning for ${idempotencyKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Resolve recipient email
  let recipientEmail = payload.userEmail?.trim().toLowerCase();
  if (!recipientEmail && deps.userStore) {
    try {
      const user = await deps.userStore.findById(asUserId(payload.userId));
      if (user?.email) {
        recipientEmail = user.email.trim().toLowerCase();
      }
    } catch {
      // Ignore user lookup error
    }
  }

  // 3. Handle missing email address gracefully without throwing
  const existingChannels = existingMetadata.channels as
    | Partial<SupportNotificationChannelStatuses>
    | undefined;
  const preservedInSite = existingChannels?.in_site ?? {
    status: "sent" as const,
    sentAt: new Date().toISOString(),
  };
  const preservedSms = existingChannels?.sms ?? {
    status: "skipped" as const,
    reason: "provider_otp_only",
  };

  if (!recipientEmail || !recipientEmail.includes("@")) {
    logger(`[support-notification] No valid email for user ${payload.userId}. Skipping email.`);
    if (deps.notificationStore?.updateMetadataByIdempotencyKey) {
      await deps.notificationStore.updateMetadataByIdempotencyKey(idempotencyKey, {
        ...existingMetadata,
        channels: {
          in_site: preservedInSite,
          email: { status: "failed", reason: "no_valid_email", attempts: attemptsMade + 1 },
          sms: preservedSms,
        },
      });
    }
    return;
  }

  const maskedEmail = maskEmailForLogs(recipientEmail);

  // 4. Send email via EmailService
  if (!deps.emailService || typeof deps.emailService.sendTicketReplyEmail !== "function") {
    logger(`[support-notification] EmailService not configured or sendTicketReplyEmail not implemented.`);
    if (deps.notificationStore?.updateMetadataByIdempotencyKey) {
      await deps.notificationStore.updateMetadataByIdempotencyKey(idempotencyKey, {
        ...existingMetadata,
        channels: {
          in_site: preservedInSite,
          email: { status: "failed", reason: "email_service_unavailable", attempts: attemptsMade + 1 },
          sms: preservedSms,
        },
      });
    }
    return;
  }

  try {
    await deps.emailService.sendTicketReplyEmail({
      email: recipientEmail,
      ticketId: payload.ticketId,
      ticketTitle: payload.ticketTitle,
      appUrl: deps.appUrl,
    });

    logger(`[support-notification] Successfully sent ticket reply email to ${maskedEmail} for ticket ${payload.ticketId}`);

    if (deps.notificationStore?.updateMetadataByIdempotencyKey) {
      await deps.notificationStore.updateMetadataByIdempotencyKey(idempotencyKey, {
        ...existingMetadata,
        channels: {
          in_site: preservedInSite,
          email: {
            status: "sent",
            recipient: maskedEmail,
            sentAt: new Date().toISOString(),
            attempts: attemptsMade + 1,
          },
          sms: preservedSms,
        },
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger(`[support-notification] Resend email delivery failed for ${maskedEmail} (attempt ${attemptsMade + 1}): ${errorMsg}`);

    if (deps.notificationStore?.updateMetadataByIdempotencyKey) {
      await deps.notificationStore.updateMetadataByIdempotencyKey(idempotencyKey, {
        ...existingMetadata,
        channels: {
          in_site: preservedInSite,
          email: {
            status: "failed",
            recipient: maskedEmail,
            lastError: errorMsg,
            attempts: attemptsMade + 1,
          },
          sms: preservedSms,
        },
      });
    }

    // Rethrow to trigger queue retry with backoff
    throw err;
  }
}

export interface SupportNotificationQueue {
  enqueue(payload: SupportNotificationJobPayload): Promise<void>;
  close?(): Promise<void>;
}

export interface BullMqSupportNotificationQueueOptions {
  connection: { url: string };
  queueName?: string;
  enqueueTimeoutMs?: number;
}

/**
 * BullMQ-backed persistent support notification queue.
 */
export class BullMqSupportNotificationQueue implements SupportNotificationQueue {
  private readonly queue: Queue;
  private readonly queueName: string;
  private readonly enqueueTimeoutMs: number;

  constructor(options: BullMqSupportNotificationQueueOptions) {
    this.queueName = options.queueName ?? "support_notifications";
    this.enqueueTimeoutMs = options.enqueueTimeoutMs ?? 1500;
    this.queue = new Queue(this.queueName, {
      connection: {
        url: options.connection.url,
        maxRetriesPerRequest: null,
      },
    });
  }

  async enqueue(payload: SupportNotificationJobPayload): Promise<void> {
    const jobId = `ticket_reply_${payload.messageId}`;
    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `BullMQ enqueue timed out after ${this.enqueueTimeoutMs}ms (Redis may be offline).`,
          ),
        );
      }, this.enqueueTimeoutMs);
    });

    const addPromise = this.queue.add("send_ticket_reply", payload, {
      jobId, // Strict enqueue-level idempotency (no colons in BullMQ job IDs)
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400, // 24 hours retention for audit & deduplication
      },
      removeOnFail: false,
    });

    // Guard against unhandled rejections if timeout triggers before Redis responds
    addPromise.catch(() => {});

    try {
      await Promise.race([addPromise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

/**
 * Creates BullMQ worker for the support notifications queue.
 */
export function createSupportNotificationWorker(
  connection: { url: string },
  queueName = "support_notifications",
  deps: SupportNotificationProcessorDeps,
): Worker {
  return new Worker(
    queueName,
    async (job: Job) => {
      await processSupportNotificationJob(
        job.data as SupportNotificationJobPayload,
        deps,
        job.attemptsMade,
      );
    },
    {
      connection: {
        url: connection.url,
        maxRetriesPerRequest: null,
      },
      concurrency: 5,
    },
  );
}

/**
 * In-memory support notification queue for tests and environments without Redis.
 */
export class InMemorySupportNotificationQueue implements SupportNotificationQueue {
  private jobs: SupportNotificationJobPayload[] = [];
  private readonly deps?: SupportNotificationProcessorDeps;
  private autoProcess = true;

  constructor(deps?: SupportNotificationProcessorDeps, options?: { autoProcess?: boolean }) {
    this.deps = deps;
    this.autoProcess = options?.autoProcess ?? true;
  }

  async enqueue(payload: SupportNotificationJobPayload): Promise<void> {
    this.jobs.push(payload);
    if (this.autoProcess && this.deps) {
      queueMicrotask(async () => {
        try {
          await this.processWithRetry(payload, this.deps!, 0);
        } catch {
          // Error already handled and logged in processor
        }
      });
    }
  }

  private async processWithRetry(
    payload: SupportNotificationJobPayload,
    deps: SupportNotificationProcessorDeps,
    attempt: number,
  ): Promise<void> {
    try {
      await processSupportNotificationJob(payload, deps, attempt);
    } catch (err) {
      if (attempt < 2) {
        // Retry with backoff (e.g. 50ms in-memory for testing)
        await new Promise((r) => setTimeout(r, 50));
        await this.processWithRetry(payload, deps, attempt + 1);
      }
    }
  }

  async processAll(): Promise<void> {
    if (!this.deps) return;
    for (const job of [...this.jobs]) {
      try {
        await this.processWithRetry(job, this.deps, 0);
      } catch {
        // error captured
      }
    }
  }

  getEnqueuedJobs(): SupportNotificationJobPayload[] {
    return [...this.jobs];
  }

  clear(): void {
    this.jobs = [];
  }
}

/**
 * Scans Postgres notifications for pending support ticket emails that were not enqueued
 * (e.g. due to Redis downtime) and enqueues them for processing.
 * Strictly idempotent thanks to BullMQ jobId (`ticket_reply:${messageId}`).
 */
export async function reconcilePendingSupportNotifications(
  notificationStore: NotificationStore,
  queue: SupportNotificationQueue,
  supportStore?: SupportStore,
  logger?: (msg: string) => void,
): Promise<number> {
  if (!notificationStore.findPendingSupportEmailNotifications) return 0;
  try {
    const pending = await notificationStore.findPendingSupportEmailNotifications(50);
    if (!pending || pending.length === 0) return 0;

    let enqueuedCount = 0;
    for (const record of pending) {
      const metadata = record.metadata as Record<string, unknown> | null;
      const ticketId = metadata?.ticketId as string | undefined;
      const messageId = metadata?.messageId as string | undefined;
      if (!ticketId || !messageId) continue;

      let ticketTitle = record.title || "تیکت پشتیبانی";
      let userEmail: string | undefined;

      if (supportStore) {
        try {
          const ticket = await supportStore.findTicketById(ticketId);
          if (ticket) {
            ticketTitle = ticket.title;
            userEmail = ticket.userEmail;
          }
        } catch {
          // Ignore ticket lookup errors
        }
      }

      try {
        await queue.enqueue({
          ticketId,
          messageId,
          userId: record.userId,
          ticketTitle,
          userEmail,
        });
        enqueuedCount++;
      } catch (enqueueErr) {
        logger?.(`[support-notification] Reconciliation enqueue failed (Redis may still be unavailable): ${String(enqueueErr)}`);
        break; // Stop iteration if Redis is not responding
      }
    }

    if (enqueuedCount > 0) {
      logger?.(`[support-notification] Reconciled and enqueued ${enqueuedCount} pending support notification(s)`);
    }
    return enqueuedCount;
  } catch (err) {
    logger?.(`[support-notification] Reconciliation sweep error: ${String(err)}`);
    return 0;
  }
}
