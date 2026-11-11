import { Worker, type Job } from "bullmq";
import type {
  CampaignExecutionStatus,
} from "@avana/domain";
import type { CrmStore } from "./crm-store.js";
import {
  CrmChannelAdapterRegistry,
  sanitizeContact,
} from "./crm-channel-adapter.js";
import type { CrmCampaignJobPayload } from "./crm-campaign-queue.js";

export interface CrmCampaignProcessorDeps {
  store: CrmStore;
  channelAdapterRegistry: CrmChannelAdapterRegistry;
  batchSize?: number;
  maxAttempts?: number;
}

export interface ProcessExecutionResult {
  executionId: string;
  status: CampaignExecutionStatus;
  total: number;
  processed: number;
  successful: number;
  failed: number;
}

export class CrmCampaignProcessor {
  private store: CrmStore;
  private channelAdapterRegistry: CrmChannelAdapterRegistry;
  private batchSize: number;
  private maxAttempts: number;

  constructor(deps: CrmCampaignProcessorDeps) {
    this.store = deps.store;
    this.channelAdapterRegistry = deps.channelAdapterRegistry;
    this.batchSize = deps.batchSize ?? 50;
    this.maxAttempts = deps.maxAttempts ?? 3;
  }

  /**
   * Interpolates template variables like {{name}}, {{phone}}, {{email}}
   */
  private interpolateContent(
    template: string,
    contact: { name: string | null; phoneNumber: string | null; email: string | null },
  ): string {
    return template
      .replace(/\{\{\s*name\s*\}\}/g, contact.name || "کاربر گرامی")
      .replace(/\{\{\s*phone\s*\}\}/g, contact.phoneNumber || "")
      .replace(/\{\{\s*email\s*\}\}/g, contact.email || "");
  }

  /**
   * Processes a single campaign execution until all recipients are processed,
   * or until execution is paused/cancelled.
   */
  async processExecution(executionId: string): Promise<ProcessExecutionResult> {
    const attemptedInPassIds = new Set<string>();

    while (true) {
      // 1. Check current execution status
      const execution = await this.store.findExecutionById(executionId);
      if (!execution) {
        return {
          executionId,
          status: "failed",
          total: 0,
          processed: 0,
          successful: 0,
          failed: 0,
        };
      }

      if (execution.status === "cancelled") {
        await this.store.batchSkipRecipients(executionId, "کمپین لغو شده است.", "CAMPAIGN_CANCELLED");
        const counts = await this.store.getExecutionCounts(executionId);
        return {
          executionId,
          status: "cancelled",
          ...counts,
        };
      }

      if (execution.status === "paused") {
        const counts = await this.store.getExecutionCounts(executionId);
        return {
          executionId,
          status: "paused",
          ...counts,
        };
      }

      if (execution.status === "completed" || execution.status === "failed") {
        const counts = await this.store.getExecutionCounts(executionId);
        return {
          executionId,
          status: execution.status,
          ...counts,
        };
      }

      // Check campaign status as well
      const campaign = await this.store.findCampaignById(execution.campaignId);
      if (!campaign) {
        await this.store.updateCampaignExecution(executionId, {
          status: "failed",
          completedAt: new Date().toISOString(),
        });
        const counts = await this.store.getExecutionCounts(executionId);
        return { executionId, status: "failed", ...counts };
      }

      if (campaign.status === "cancelled") {
        await this.store.updateCampaignExecution(executionId, {
          status: "cancelled",
          completedAt: new Date().toISOString(),
        });
        await this.store.batchSkipRecipients(executionId, "کمپین لغو شده است.", "CAMPAIGN_CANCELLED");
        const counts = await this.store.getExecutionCounts(executionId);
        return { executionId, status: "cancelled", ...counts };
      }

      if (campaign.status === "paused") {
        await this.store.updateCampaignExecution(executionId, { status: "paused" });
        const counts = await this.store.getExecutionCounts(executionId);
        return { executionId, status: "paused", ...counts };
      }

      // 2. Claim batch of pending recipients atomically, excluding ones already attempted in this pass
      const batch = await this.store.claimPendingRecipients(
        executionId,
        this.batchSize,
        Array.from(attemptedInPassIds),
      );

      if (batch.length === 0) {
        // No pending items claimed. Check if everything is done.
        const counts = await this.store.getExecutionCounts(executionId);
        if (counts.pending === 0) {
          const finalStatus: CampaignExecutionStatus =
            counts.successful > 0 || counts.total === 0 ? "completed" : "failed";
          const now = new Date().toISOString();

          await this.store.updateCampaignExecution(executionId, {
            status: finalStatus,
            processedRecipients: counts.processed,
            successfulRecipients: counts.successful,
            failedRecipients: counts.failed,
            completedAt: now,
          });

          await this.store.updateCampaign(campaign.id, {
            status: "completed",
          });

          return {
            executionId,
            status: finalStatus,
            ...counts,
          };
        } else {
          // Some recipients are in 'processing' by another concurrent worker or retrying in subsequent pass
          return {
            executionId,
            status: execution.status,
            ...counts,
          };
        }
      }

      // 3. Process claimed batch
      const adapter = this.channelAdapterRegistry.get(campaign.channel);

      for (const recipient of batch) {
        attemptedInPassIds.add(recipient.id);
        // Inter-recipient pause/cancel check
        const freshExec = await this.store.findExecutionById(executionId);
        if (freshExec?.status === "paused") {
          const counts = await this.store.getExecutionCounts(executionId);
          return { executionId, status: "paused", ...counts };
        }
        if (freshExec?.status === "cancelled") {
          await this.store.batchSkipRecipients(executionId, "کمپین لغو شده است.", "CAMPAIGN_CANCELLED");
          const counts = await this.store.getExecutionCounts(executionId);
          return { executionId, status: "cancelled", ...counts };
        }

        const now = new Date().toISOString();
        const contact = await this.store.getUserContact(recipient.userId);
        const contactData = {
          name: contact?.name ?? recipient.userName ?? null,
          phoneNumber: contact?.phoneNumber ?? recipient.userPhoneNumber ?? null,
          email: contact?.email ?? recipient.userEmail ?? null,
        };

        let contactTarget: string | null = null;
        if (campaign.channel === "sms") {
          contactTarget = contactData.phoneNumber;
        } else if (campaign.channel === "email") {
          contactTarget = contactData.email;
        } else {
          contactTarget = contactData.name || recipient.userId;
        }

        // Validate contact existence (Permanent failure if absent)
        if (!contactTarget || contactTarget.trim().length === 0) {
          const attempts = (recipient.attempts ?? 0) + 1;
          await this.store.updateCampaignRecipientStatus(recipient.id, {
            status: "failed",
            attempts,
            lastAttemptAt: now,
            errorCode: "CONTACT_INFO_MISSING",
            errorMessage:
              campaign.channel === "sms"
                ? "شماره موبایل کاربر در دسترس نیست."
                : campaign.channel === "email"
                  ? "ایمیل کاربر در دسترس نیست."
                  : "اطلاعات شناسایی کاربر نامعتبر است.",
          });
          continue;
        }

        // Interpolate content
        const templateContent = campaign.messageContent ?? "";
        const interpolatedContent = this.interpolateContent(templateContent, contactData);

        // Attempt delivery via channel adapter
        try {
          const sendResult = await adapter.send({
            campaignId: campaign.id,
            executionId,
            recipientId: recipient.id,
            userId: recipient.userId,
            channel: campaign.channel,
            recipientContact: contactTarget,
            messageContent: interpolatedContent,
          });

          const attempts = (recipient.attempts ?? 0) + 1;

          if (sendResult.success) {
            await this.store.updateCampaignRecipientStatus(recipient.id, {
              status: "sent",
              sentAt: now,
              attempts,
              lastAttemptAt: now,
              errorMessage: null,
              errorCode: null,
            });
          } else {
            const err = sendResult.error;
            const isTransient = err?.isTransient ?? false;

            // Check transient vs permanent failure
            if (isTransient && attempts < this.maxAttempts) {
              // Retryable transient error: return to pending
              await this.store.updateCampaignRecipientStatus(recipient.id, {
                status: "pending",
                attempts,
                lastAttemptAt: now,
                errorCode: err?.code ?? "TRANSIENT_NETWORK_ERROR",
                errorMessage: err?.message ?? "خطای موقت در اتصال به کانال ارسال",
              });
            } else {
              // Non-transient permanent failure or reached max retry attempts
              const finalErrorCode =
                isTransient && attempts >= this.maxAttempts
                  ? "MAX_RETRIES_EXCEEDED"
                  : err?.code ?? "DELIVERY_FAILED";

              await this.store.updateCampaignRecipientStatus(recipient.id, {
                status: "failed",
                attempts,
                lastAttemptAt: now,
                errorCode: finalErrorCode,
                errorMessage: err?.message ?? "خطا در ارسال پیام به گیرنده",
              });
            }
          }
        } catch (err: any) {
          const attempts = (recipient.attempts ?? 0) + 1;
          const isOverLimit = attempts >= this.maxAttempts;
          await this.store.updateCampaignRecipientStatus(recipient.id, {
            status: isOverLimit ? "failed" : "pending",
            attempts,
            lastAttemptAt: now,
            errorCode: isOverLimit ? "MAX_RETRIES_EXCEEDED" : "UNHANDLED_EXCEPTION",
            errorMessage: err?.message || "خطای ناشناخته در زمان ارسال پیام",
          });
        }
      }

      // Update intermediate execution progress
      const progressCounts = await this.store.getExecutionCounts(executionId);
      await this.store.updateCampaignExecution(executionId, {
        processedRecipients: progressCounts.processed,
        successfulRecipients: progressCounts.successful,
        failedRecipients: progressCounts.failed,
      });
    }
  }

  /**
   * Helper to format a safe diagnostic string with masked contact
   */
  formatSafeDiagnostic(channel: string, contact: string, status: string): string {
    return `[${channel}] contact=${sanitizeContact(contact)} status=${status}`;
  }
}

/**
 * Factory to create a BullMQ Worker bound to CrmCampaignProcessor
 */
export function createBullMqCampaignWorker(
  connection: { url: string },
  queueName: string,
  processor: CrmCampaignProcessor,
  options?: { concurrency?: number },
): Worker<CrmCampaignJobPayload> {
  return new Worker<CrmCampaignJobPayload>(
    queueName,
    async (job: Job<CrmCampaignJobPayload>) => {
      const { executionId } = job.data;
      return processor.processExecution(executionId);
    },
    {
      connection: { url: connection.url },
      concurrency: options?.concurrency ?? 2,
      lockDuration: 300_000,
    },
  );
}
