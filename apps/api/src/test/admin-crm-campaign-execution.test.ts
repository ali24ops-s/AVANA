import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CrmService,
  InMemoryCrmStore,
  InMemoryCampaignQueue,
  CrmCampaignProcessor,
  CrmChannelAdapterRegistry,
  DisabledDryRunChannelAdapter,
  MockCrmChannelAdapter,
  sanitizeContact,
} from "../modules/admin/crm/index.js";

describe("Admin CRM Campaign Execution Engine (Phase 4)", () => {
  let store: InMemoryCrmStore;
  let queue: InMemoryCampaignQueue;
  let adapterRegistry: CrmChannelAdapterRegistry;
  let processor: CrmCampaignProcessor;
  let service: CrmService;
  let segmentId: string;

  const adminId = randomUUID();

  beforeEach(() => {
    store = new InMemoryCrmStore();
    queue = new InMemoryCampaignQueue();
    adapterRegistry = new CrmChannelAdapterRegistry();

    // Default adapters: DisabledDryRun for all channels
    adapterRegistry.register(new DisabledDryRunChannelAdapter("sms"));
    adapterRegistry.register(new DisabledDryRunChannelAdapter("email"));
    adapterRegistry.register(new DisabledDryRunChannelAdapter("telegram"));
    adapterRegistry.register(new DisabledDryRunChannelAdapter("in_app"));

    processor = new CrmCampaignProcessor({
      store,
      channelAdapterRegistry: adapterRegistry,
      batchSize: 10,
      maxAttempts: 3,
    });

    service = new CrmService(store, undefined, queue, adapterRegistry);

    // Seed test segment with valid UUID
    segmentId = randomUUID();
    store.memorySegments.push({
      id: segmentId,
      name: "دانشجویان فعال",
      description: null,
      filterRules: [],
      matchOperator: "all",
      isActive: true,
      createdById: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed test users
    store.memoryUsers.push(
      {
        id: randomUUID(),
        name: "علی رضایی",
        email: "ali@example.com",
        phoneNumber: "09121111111",
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        name: "سارا حسینی",
        email: "sara@example.com",
        phoneNumber: "09122222222",
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        name: "محمد اکبری",
        email: "mohammad@example.com",
        phoneNumber: "09123333333",
        createdAt: new Date().toISOString(),
      },
    );
  });

  it("1. Asynchronous dispatch via queue without HTTP blocking", async () => {
    const campaign = await service.createCampaign(
      {
        name: "کمپین شروع ترم پاییز",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "سلام {{name}} عزیز، ترم جدید آغاز شد!",
      },
      adminId,
    );

    // Bind processor to queue worker
    queue.setHandler(async (payload) => {
      await processor.processExecution(payload.executionId);
    });

    const executionResult = await service.executeCampaign(campaign.id, adminId);

    // Returns immediately with execution ID and running status
    expect(executionResult.execution.id).toBeDefined();
    expect(executionResult.execution.jobId).toBe(executionResult.execution.id);
    expect(executionResult.recipientsQueued).toBe(3);

    // Let queue handler process jobs
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Execution should now be completed
    const latest = await store.findExecutionById(executionResult.execution.id);
    expect(latest?.status).toBe("completed");
    expect(latest?.processedRecipients).toBe(3);
    expect(latest?.successfulRecipients).toBe(3);
    expect(latest?.failedRecipients).toBe(0);

    // Verify recipients were updated to sent with dry-run provider IDs
    const recipients = await store.listCampaignRecipients(executionResult.execution.id);
    expect(recipients.totalCount).toBe(3);
    expect(recipients.recipients.every((r) => r.status === "sent")).toBe(true);
    expect(recipients.recipients[0].attempts).toBe(1);
    expect(recipients.recipients[0].sentAt).toBeDefined();
  });

  it("2. Queue deduplication guarantees duplicate trigger calls do not duplicate queue jobs", async () => {
    const campaign = await service.createCampaign(
      {
        name: "کمپین تخفیف",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "تخفیف ویژه",
      },
      adminId,
    );

    const exec = await store.createCampaignExecution(campaign.id, adminId, 3, "running");

    // Enqueue twice with the exact same executionId
    const res1 = await queue.enqueueCampaignExecution({
      campaignId: campaign.id,
      executionId: exec.id,
    });
    const res2 = await queue.enqueueCampaignExecution({
      campaignId: campaign.id,
      executionId: exec.id,
    });

    expect(res1.jobId).toBe(exec.id);
    expect(res2.jobId).toBe(exec.id);
    expect(queue.getJobs().length).toBe(1); // Queue deduplicated duplicate job
  });

  it("3. Worker concurrency: multiple concurrent workers claim batches without double-processing recipients", async () => {
    // Add 17 more users to reach 20 total
    for (let i = 4; i <= 20; i++) {
      store.memoryUsers.push({
        id: randomUUID(),
        name: `کاربر ${i}`,
        email: `user${i}@example.com`,
        phoneNumber: `091200000${i < 10 ? "0" + i : i}`,
        createdAt: new Date().toISOString(),
      });
    }

    const campaign = await service.createCampaign(
      {
        name: "کمپین مقیاس بالا",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "اطلاعیه مهم",
      },
      adminId,
    );

    const executionResult = await service.executeCampaign(campaign.id, adminId);
    expect(executionResult.recipientsQueued).toBe(20);

    // Run 3 concurrent worker processors with batch size 5
    const workerProcessor = new CrmCampaignProcessor({
      store,
      channelAdapterRegistry: adapterRegistry,
      batchSize: 5,
      maxAttempts: 3,
    });

    await Promise.all([
      workerProcessor.processExecution(executionResult.execution.id),
      workerProcessor.processExecution(executionResult.execution.id),
      workerProcessor.processExecution(executionResult.execution.id),
    ]);

    // Total processed across workers should match 20
    const finalCounts = await store.getExecutionCounts(executionResult.execution.id);
    expect(finalCounts.total).toBe(20);
    expect(finalCounts.processed).toBe(20);
    expect(finalCounts.successful).toBe(20);
    expect(finalCounts.failed).toBe(0);
    expect(finalCounts.pending).toBe(0);

    // Ensure every single recipient was processed exactly once
    const allRecipients = await store.listCampaignRecipients(executionResult.execution.id, {
      pageSize: 50,
    });
    expect(allRecipients.totalCount).toBe(20);
    for (const r of allRecipients.recipients) {
      expect(r.status).toBe("sent");
      expect(r.attempts).toBe(1);
    }
  });

  it("4. Pause, Resume, and Cancellation lifecycle", async () => {
    const campaign = await service.createCampaign(
      {
        name: "کمپین کنترل‌پذیر",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "پیام تستی",
      },
      adminId,
    );

    const execResult = await service.executeCampaign(campaign.id, adminId);

    // 4a. Pause Campaign
    await service.pauseCampaign(campaign.id, adminId);
    const pausedExec = await store.findExecutionById(execResult.execution.id);
    expect(pausedExec?.status).toBe("paused");

    // Worker stops when paused, pending recipients remain untouched
    const pauseResult = await processor.processExecution(execResult.execution.id);
    expect(pauseResult.status).toBe("paused");
    const countsDuringPause = await store.getExecutionCounts(execResult.execution.id);
    expect(countsDuringPause.pending).toBe(3);
    expect(countsDuringPause.processed).toBe(0);

    // 4b. Resume Campaign
    await service.resumeCampaign(campaign.id, adminId);
    const resumedExec = await store.findExecutionById(execResult.execution.id);
    expect(resumedExec?.status).toBe("running");

    // 4c. Cancel Campaign: un-sent recipients must be marked as skipped with CAMPAIGN_CANCELLED
    await service.cancelCampaign(campaign.id, adminId);
    const cancelledExec = await store.findExecutionById(execResult.execution.id);
    expect(cancelledExec?.status).toBe("cancelled");

    const countsAfterCancel = await store.getExecutionCounts(execResult.execution.id);
    expect(countsAfterCancel.pending).toBe(0);
    expect(countsAfterCancel.failed).toBe(3); // 3 skipped recipients counted under failed

    const recipients = await store.listCampaignRecipients(execResult.execution.id);
    expect(recipients.recipients.every((r) => r.status === "skipped")).toBe(true);
    expect(recipients.recipients.every((r) => r.errorCode === "CAMPAIGN_CANCELLED")).toBe(true);
  });

  it("5. Permanent vs Transient failure separation and retry policy", async () => {
    // User with missing phone number
    const missingPhoneUserId = randomUUID();
    store.memoryUsers.push({
      id: missingPhoneUserId,
      name: "کاربر بدون شماره",
      email: "nophone@example.com",
      phoneNumber: null,
      createdAt: new Date().toISOString(),
    });

    const user2Id = store.memoryUsers[1].id;

    let attemptCount = 0;
    const mockSmsAdapter = new MockCrmChannelAdapter("sms", async (payload) => {
      attemptCount++;
      if (payload.userId === user2Id) {
        // User 2 experiences transient connection failure
        return {
          success: false,
          error: {
            code: "SMS_GATEWAY_TIMEOUT",
            message: "درگاه پیامک موقتاً پاسخ نداد.",
            isTransient: true,
          },
        };
      }
      return { success: true, providerMessageId: `mock-sms-${attemptCount}` };
    });

    adapterRegistry.register(mockSmsAdapter);

    const campaign = await service.createCampaign(
      {
        name: "کمپین تست تاب‌آوری و خطا",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "سلام {{name}}",
      },
      adminId,
    );

    const execResult = await service.executeCampaign(campaign.id, adminId);

    // First worker pass
    await processor.processExecution(execResult.execution.id);

    const list1 = await store.listCampaignRecipients(execResult.execution.id, { pageSize: 50 });
    const missingContactRecipient = list1.recipients.find((r) => r.userId === missingPhoneUserId);
    expect(missingContactRecipient?.status).toBe("failed");
    expect(missingContactRecipient?.errorCode).toBe("CONTACT_INFO_MISSING");
    expect(missingContactRecipient?.attempts).toBe(1); // Permanent failure, zero retries

    const transientRecipient1 = list1.recipients.find((r) => r.userId === user2Id);
    // Transient failure returned to pending with attempt = 1
    expect(transientRecipient1?.status).toBe("pending");
    expect(transientRecipient1?.attempts).toBe(1);
    expect(transientRecipient1?.errorCode).toBe("SMS_GATEWAY_TIMEOUT");

    // Second worker pass (retry 1)
    await processor.processExecution(execResult.execution.id);
    const list2 = await store.listCampaignRecipients(execResult.execution.id, { pageSize: 50 });
    const transientRecipient2 = list2.recipients.find((r) => r.userId === user2Id);
    expect(transientRecipient2?.status).toBe("pending");
    expect(transientRecipient2?.attempts).toBe(2);

    // Third worker pass (retry 2 -> reaches maxAttempts = 3)
    await processor.processExecution(execResult.execution.id);
    const list3 = await store.listCampaignRecipients(execResult.execution.id, { pageSize: 50 });
    const transientRecipient3 = list3.recipients.find((r) => r.userId === user2Id);
    expect(transientRecipient3?.status).toBe("failed");
    expect(transientRecipient3?.attempts).toBe(3);
    expect(transientRecipient3?.errorCode).toBe("MAX_RETRIES_EXCEEDED");
  });

  it("6. Default dry-run boundary safety and PII masking", async () => {
    // Ensure default adapter is DisabledDryRun
    const dryRunAdapter = new DisabledDryRunChannelAdapter("sms");
    const sendResult = await dryRunAdapter.send({
      campaignId: "c1",
      executionId: "e1",
      recipientId: "r1",
      userId: "u1",
      channel: "sms",
      recipientContact: "09129876543",
      messageContent: "متن پیام",
    });

    expect(sendResult.success).toBe(true);
    expect(sendResult.providerMessageId).toContain("dryrun-sms-");

    // PII masking checks
    expect(sanitizeContact("09129876543")).toBe("0912***543");
    expect(sanitizeContact("user.test@example.com")).toBe("us***t@example.com");
    expect(sanitizeContact("")).toBe("—");
  });

  it("7. Worker crash and restart recovery picks up pending recipients without re-sending", async () => {
    const user1Id = store.memoryUsers[0].id;
    let sentCount = 0;
    const sentRecipients: string[] = [];

    const mockEmailAdapter = new MockCrmChannelAdapter("email", async (payload) => {
      sentCount++;
      sentRecipients.push(payload.userId);
      if (sentCount === 2) {
        // Simulate unexpected crash after processing 2 recipients
        throw new Error("Worker unexpected crash!");
      }
      return { success: true, providerMessageId: `email-${sentCount}` };
    });

    adapterRegistry.register(mockEmailAdapter);

    const campaign = await service.createCampaign(
      {
        name: "کمپین بازیابی از خطا",
        targetSegmentId: segmentId,
        channel: "email",
        messageContent: "خوش آمدید {{name}}",
      },
      adminId,
    );

    const execResult = await service.executeCampaign(campaign.id, adminId);

    // Run first processor run that crashes at recipient 2
    const crashProcessor = new CrmCampaignProcessor({
      store,
      channelAdapterRegistry: adapterRegistry,
      batchSize: 1, // 1 by 1
      maxAttempts: 3,
    });

    await crashProcessor.processExecution(execResult.execution.id);

    // Restart worker with fresh processor instance
    const recoveredProcessor = new CrmCampaignProcessor({
      store,
      channelAdapterRegistry: adapterRegistry,
      batchSize: 10,
      maxAttempts: 3,
    });

    await recoveredProcessor.processExecution(execResult.execution.id);

    const finalCounts = await store.getExecutionCounts(execResult.execution.id);
    expect(finalCounts.pending).toBe(0);
    // User 1 was sent successfully in pass 1 and was NOT sent again
    const user1Sends = sentRecipients.filter((uid) => uid === user1Id);
    expect(user1Sends.length).toBe(1);
  });

  it("8. Unconfirmed timeout (DELIVERY_UNCONFIRMED_TIMEOUT) does NOT retry, remains durable in DB, and transient errors still retry", async () => {
    const user1Id = store.memoryUsers[0].id;
    const user2Id = store.memoryUsers[1].id;
    const user3Id = store.memoryUsers[2].id;

    const invocations: Record<string, number> = {
      [user1Id]: 0,
      [user2Id]: 0,
      [user3Id]: 0,
    };

    const mockSmsAdapter = new MockCrmChannelAdapter("sms", async (payload) => {
      invocations[payload.userId] = (invocations[payload.userId] || 0) + 1;

      if (payload.userId === user1Id) {
        // User 1: Gateway Timeout with unconfirmed delivery status (MUST NOT retry)
        return {
          success: false,
          error: {
            code: "DELIVERY_UNCONFIRMED_TIMEOUT",
            message: "ارتباط با درگاه با وقفه زمانی مواجه شد. وضعیت تحویل نامشخص است؛ تلاش مجدد خودکار غیرفعال شد.",
            isTransient: false,
          },
        };
      }

      if (payload.userId === user2Id) {
        // User 2: Transient 503 Provider Unavailable (MUST retry)
        if (invocations[user2Id] === 1) {
          return {
            success: false,
            error: {
              code: "SMS_PROVIDER_UNAVAILABLE",
              message: "درگاه موقتاً در دسترس نیست.",
              isTransient: true,
            },
          };
        }
        return { success: true, providerMessageId: "retry-sms-user2" };
      }

      // User 3: Success on first try
      return { success: true, providerMessageId: "sms-user3" };
    });

    adapterRegistry.register(mockSmsAdapter);

    const campaign = await service.createCampaign(
      {
        name: "کمپین بررسی دقیق تایم‌اوت",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "سلام {{name}}",
      },
      adminId,
    );

    const execResult = await service.executeCampaign(campaign.id, adminId);

    // --- Pass 1 ---
    await processor.processExecution(execResult.execution.id);

    const recipientsPass1 = await store.listCampaignRecipients(execResult.execution.id);
    const r1 = recipientsPass1.recipients.find((r) => r.userId === user1Id);
    const r2 = recipientsPass1.recipients.find((r) => r.userId === user2Id);
    const r3 = recipientsPass1.recipients.find((r) => r.userId === user3Id);

    // User 1 (Timeout): Marked failed with DELIVERY_UNCONFIRMED_TIMEOUT, attempts = 1
    expect(r1?.status).toBe("failed");
    expect(r1?.errorCode).toBe("DELIVERY_UNCONFIRMED_TIMEOUT");
    expect(r1?.attempts).toBe(1);
    expect(invocations[user1Id]).toBe(1);

    // User 2 (Transient): Marked pending for retry, attempts = 1
    expect(r2?.status).toBe("pending");
    expect(r2?.errorCode).toBe("SMS_PROVIDER_UNAVAILABLE");
    expect(r2?.attempts).toBe(1);
    expect(invocations[user2Id]).toBe(1);

    // User 3 (Success): Sent, attempts = 1
    expect(r3?.status).toBe("sent");
    expect(r3?.attempts).toBe(1);
    expect(invocations[user3Id]).toBe(1);

    // --- Pass 2 (Retry cycle) ---
    await processor.processExecution(execResult.execution.id);

    const recipientsPass2 = await store.listCampaignRecipients(execResult.execution.id);
    const r1After = recipientsPass2.recipients.find((r) => r.userId === user1Id);
    const r2After = recipientsPass2.recipients.find((r) => r.userId === user2Id);

    // User 1 (Timeout) was NOT retried (attempts and invocations remain 1)
    expect(invocations[user1Id]).toBe(1);
    expect(r1After?.status).toBe("failed");
    expect(r1After?.attempts).toBe(1);
    expect(r1After?.errorCode).toBe("DELIVERY_UNCONFIRMED_TIMEOUT");

    // User 2 (Transient) WAS retried and now succeeded
    expect(invocations[user2Id]).toBe(2);
    expect(r2After?.status).toBe("sent");
    expect(r2After?.attempts).toBe(2);

    // Final execution counts: All 3 recipients processed (2 successful, 1 unconfirmed timeout failure)
    const finalCounts = await store.getExecutionCounts(execResult.execution.id);
    expect(finalCounts.total).toBe(3);
    expect(finalCounts.processed).toBe(3);
    expect(finalCounts.pending).toBe(0);
    expect(finalCounts.successful).toBe(2);
    expect(finalCounts.failed).toBe(1);

    const finalExec = await store.findExecutionById(execResult.execution.id);
    expect(finalExec?.status).toBe("completed");
    expect(finalExec?.processedRecipients).toBe(3);
    expect(finalExec?.successfulRecipients).toBe(2);
    expect(finalExec?.failedRecipients).toBe(1);
  });
});

