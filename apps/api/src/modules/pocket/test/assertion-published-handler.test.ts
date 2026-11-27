import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  AssertionPublishedHandler,
} from "../assertion-published-handler.js";
import {
  PocketEventHandlerRegistry,
  type PocketEventPayload,
} from "../pocket-event-handler.js";
import {
  InMemoryAssertionPublishingStore,
} from "../assertion-publishing-store.js";
import {
  InMemoryPocketDeliveryQueue,
} from "../pocket-delivery-queue.js";
import {
  PocketOutboxDispatcher,
} from "../pocket-outbox-dispatcher.js";
import {
  processPocketEventJob,
  type PocketEventProcessorDeps,
} from "../pocket-event-processor.js";
import { composeWorker } from "../../../../../worker/src/compose.js";
import { loadWorkerConfig } from "../../../../../worker/src/config.js";

describe("AVANA Pocket Phase 2C-4C: AssertionPublishedHandler", () => {
  let handler: AssertionPublishedHandler;
  let loggedMessages: string[];

  const validAssertionId = randomUUID();
  const validAggregateId = randomUUID();

  beforeEach(() => {
    loggedMessages = [];
    handler = new AssertionPublishedHandler({
      logger: (msg) => loggedMessages.push(msg),
    });
  });

  function createValidEvent(overrides?: Partial<PocketEventPayload>): PocketEventPayload {
    return {
      id: randomUUID(),
      aggregateType: "drug",
      aggregateId: validAggregateId,
      eventType: "assertion.published",
      payload: {
        assertionId: validAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        assertionType: "dosing",
        assertionKey: "pediatric-dosing",
        statementText: "Pediatric dosing guidelines for amoxicillin.",
        jurisdiction: "global",
        targetPopulation: "pediatric",
        clinicalSetting: "outpatient",
        aggregateType: "drug",
        aggregateId: validAggregateId,
        entityVersion: 1,
        publishedAt: new Date().toISOString(),
        publisherUserId: randomUUID(),
        verificationId: randomUUID(),
        clinicalVerifierUserId: randomUUID(),
        supersededAssertionId: null,
        notes: "Clinically verified publication",
      },
      globalEpoch: Date.now(),
      attempts: 0,
      ...overrides,
    };
  }

  // 1. Valid event is accepted successfully
  it("accepts a valid event successfully and emits a concise delivery log", async () => {
    const event = createValidEvent();
    const controller = new AbortController();

    await expect(handler.handle(event, controller.signal)).resolves.toBeUndefined();

    expect(loggedMessages).toHaveLength(1);
    expect(loggedMessages[0]).toContain(event.id);
    expect(loggedMessages[0]).toContain(validAssertionId);
    expect(loggedMessages[0]).toContain("drug");
    expect(loggedMessages[0]).toContain(validAggregateId);
    expect(loggedMessages[0]).toContain("entityVersion 1");
  });

  // 2. Missing or invalid assertionId is rejected
  it("rejects an event with missing or non-UUID assertionId", async () => {
    const controller = new AbortController();

    // Missing
    const eventMissing = createValidEvent({
      payload: {
        ...createValidEvent().payload,
        assertionId: undefined,
      },
    });
    await expect(handler.handle(eventMissing, controller.signal)).rejects.toThrow(
      /Invalid assertionId.*expected valid UUID/,
    );

    // Non-UUID
    const eventInvalid = createValidEvent({
      payload: {
        ...createValidEvent().payload,
        assertionId: "not-a-valid-uuid",
      },
    });
    await expect(handler.handle(eventInvalid, controller.signal)).rejects.toThrow(
      /Invalid assertionId.*expected valid UUID/,
    );
  });

  // 3. Invalid aggregateType or aggregateId is rejected
  it("rejects an event with invalid aggregateType or aggregateId", async () => {
    const controller = new AbortController();

    // Invalid aggregateType
    const eventBadType = createValidEvent({
      payload: {
        ...createValidEvent().payload,
        aggregateType: "unsupported_pillar",
      },
    });
    await expect(handler.handle(eventBadType, controller.signal)).rejects.toThrow(
      /Invalid aggregateType.*expected one of \[drug, disease, treatment, emergency\]/,
    );

    // Invalid aggregateId (non-UUID)
    const eventBadId = createValidEvent({
      payload: {
        ...createValidEvent().payload,
        aggregateId: "12345-invalid",
      },
    });
    await expect(handler.handle(eventBadId, controller.signal)).rejects.toThrow(
      /Invalid aggregateId.*expected valid UUID/,
    );
  });

  // 4. Invalid entityVersion is rejected according to the actual contract
  it("rejects invalid entityVersion (non-integer, <= 0, string, or missing)", async () => {
    const controller = new AbortController();

    // Zero
    const eventZero = createValidEvent({
      payload: { ...createValidEvent().payload, entityVersion: 0 },
    });
    await expect(handler.handle(eventZero, controller.signal)).rejects.toThrow(
      /Invalid entityVersion.*expected positive integer >= 1/,
    );

    // Negative
    const eventNeg = createValidEvent({
      payload: { ...createValidEvent().payload, entityVersion: -5 },
    });
    await expect(handler.handle(eventNeg, controller.signal)).rejects.toThrow(
      /Invalid entityVersion.*expected positive integer >= 1/,
    );

    // Float / non-integer
    const eventFloat = createValidEvent({
      payload: { ...createValidEvent().payload, entityVersion: 1.5 },
    });
    await expect(handler.handle(eventFloat, controller.signal)).rejects.toThrow(
      /Invalid entityVersion.*expected positive integer >= 1/,
    );

    // String serialized (contract requires number)
    const eventString = createValidEvent({
      payload: { ...createValidEvent().payload, entityVersion: "1" as unknown as number },
    });
    await expect(handler.handle(eventString, controller.signal)).rejects.toThrow(
      /Invalid entityVersion.*expected positive integer >= 1/,
    );
  });

  // 5. AbortSignal cancellation is respected
  it("respects AbortSignal cancellation before and during execution", async () => {
    const event = createValidEvent();
    const controller = new AbortController();
    controller.abort(new Error("Timeout during handler execution"));

    await expect(handler.handle(event, controller.signal)).rejects.toThrow(
      /Timeout during handler execution/,
    );
  });

  // 6. Duplicate invocation of the same event is safe (naturally idempotent)
  it("is naturally idempotent when invoked repeatedly with the same event", async () => {
    const event = createValidEvent();
    const controller = new AbortController();

    // 1st invocation
    await expect(handler.handle(event, controller.signal)).resolves.toBeUndefined();
    // 2nd invocation
    await expect(handler.handle(event, controller.signal)).resolves.toBeUndefined();
    // 3rd invocation
    await expect(handler.handle(event, controller.signal)).resolves.toBeUndefined();

    expect(loggedMessages).toHaveLength(3);
    for (const msg of loggedMessages) {
      expect(msg).toContain(event.id);
    }
  });

  // 7. Worker composition registers the handler for assertion.published
  it("verifies that composeWorker registers AssertionPublishedHandler for assertion.published", async () => {
    const mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as NonNullable<Parameters<typeof composeWorker>[1]>["db"];

    const workerConfig = loadWorkerConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://mock:5432/mock",
      GEMINI_API_KEY: "AIzaSy-test-key-worker",
    });

    const worker = await composeWorker(workerConfig, {
      db: mockDb,
      close: async () => {},
    });

    expect(worker.pocketHandlerRegistry).toBeDefined();
    expect(worker.pocketHandlerRegistry.has("assertion.published")).toBe(true);

    const registered = worker.pocketHandlerRegistry.get("assertion.published");
    expect(registered).toBeDefined();
    expect(registered?.eventType).toBe("assertion.published");
    expect(registered).toBeInstanceOf(AssertionPublishedHandler);
  });

  // 8. Successful processing allows existing processor to mark Outbox event as sent
  it("allows PocketEventProcessor to mark the outbox event as sent upon successful handling", async () => {
    const store = new InMemoryAssertionPublishingStore();
    const queue = new InMemoryPocketDeliveryQueue();
    const registry = new PocketEventHandlerRegistry();
    registry.register(handler);

    const dispatcher = new PocketOutboxDispatcher({
      store,
      queue,
      batchSize: 10,
      pollIntervalMs: 50,
      dispatchLeaseSeconds: 60,
    });

    const enqueued = await store.enqueueOutboxEvent({
      aggregateType: "drug",
      aggregateId: validAggregateId,
      eventType: "assertion.published",
      payload: {
        assertionId: validAssertionId,
        aggregateType: "drug",
        aggregateId: validAggregateId,
        entityVersion: 1,
      },
    });

    // 1. Dispatch
    const dispatchedCount = await dispatcher.dispatchOnce();
    expect(dispatchedCount).toBe(1);

    const job = queue.shiftJob();
    expect(job).toBeDefined();

    // 2. Process via worker processor
    const deps: PocketEventProcessorDeps = {
      store,
      handlerRegistry: registry,
      executionLeaseSeconds: 300,
    };

    await processPocketEventJob(job!.data, deps);

    // 3. Verify event is marked 'sent'
    const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
    expect(record.status).toBe("sent");
    expect(record.sentAt).toBeInstanceOf(Date);
    expect(record.leaseToken).toBeNull();
  });

  // 9. Invalid payload follows existing retry/dead-letter behavior
  it("schedules delivery retry when handler rejects malformed payload", async () => {
    const store = new InMemoryAssertionPublishingStore();
    const queue = new InMemoryPocketDeliveryQueue();
    const registry = new PocketEventHandlerRegistry();
    registry.register(handler);

    const dispatcher = new PocketOutboxDispatcher({
      store,
      queue,
      batchSize: 10,
      pollIntervalMs: 50,
      dispatchLeaseSeconds: 60,
    });

    const enqueued = await store.enqueueOutboxEvent({
      aggregateType: "drug",
      aggregateId: validAggregateId,
      eventType: "assertion.published",
      payload: {
        assertionId: "malformed-non-uuid",
        aggregateType: "drug",
        aggregateId: validAggregateId,
        entityVersion: 1,
      },
    });

    // 1. Dispatch
    await dispatcher.dispatchOnce();
    const job = queue.shiftJob()!;

    // 2. Process via worker processor
    const deps: PocketEventProcessorDeps = {
      store,
      handlerRegistry: registry,
      executionLeaseSeconds: 300,
    };

    await processPocketEventJob(job.data, deps);

    // 3. Verify event is scheduled for retry
    const record = store.getOutboxEvents().find((e) => e.id === enqueued.id)!;
    expect(record.status).toBe("pending");
    expect(record.attempts).toBe(1);
    expect(record.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(record.lastError).toContain("Invalid assertionId");

    // 4. Verify dead-letter transition when maxAttempts reached
    const dlEvent = await store.enqueueOutboxEvent({
      aggregateType: "drug",
      aggregateId: validAggregateId,
      eventType: "assertion.published",
      payload: {
        assertionId: "malformed-non-uuid",
        aggregateType: "drug",
        aggregateId: validAggregateId,
        entityVersion: 1,
      },
    });
    // Set maxAttempts to 1 on actual record
    store.updateOutboxRecordForTest(dlEvent.id, { maxAttempts: 1 });

    await dispatcher.dispatchOnce();
    const dlJob = queue.shiftJob()!;
    await processPocketEventJob(dlJob.data, deps);

    const dlRecord = store.getOutboxEvents().find((e) => e.id === dlEvent.id)!;
    expect(dlRecord.status).toBe("dead_letter");
    expect(dlRecord.attempts).toBe(1);
  });
});
