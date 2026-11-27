/**
 * AVANA Pocket — Assertion Publishing Store Interface & In-Memory Implementation.
 *
 * Implements Phase 2C-3 (Atomic Publishing Workflow) persistence contracts for:
 * - pocket_scientific_assertions (publishing & superseding)
 * - pocket_entity_version_registry (monotonic entity version bump)
 * - pocket_outbox (transactional event publishing)
 */

import type { TransactionClient } from "@avana/database/client";
import type { ScientificAssertionRecord } from "./assertion-review-store.js";

export const PUBLISHED_ROOT_UNIQUE_INDEX_NAME = "uq_pocket_published_assertion_root";

/**
 * Deterministic advisory lock key for serializing all publish operations
 * targeting the same conceptual `assertionRootId`.
 */
export function buildPublishRootLockKey(assertionRootId: string): string {
  return `pocket:publish:root:${assertionRootId}`;
}

export interface EntityVersionRecord {
  aggregateType: string;
  aggregateId: string;
  currentVersion: number;
  updatedAt: Date;
}

export interface PocketOutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseExpiresAt?: Date | null;
  leaseToken?: string | null;
  lastError?: string | null;
  globalEpoch: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface EnqueuePocketOutboxInput {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  globalEpoch?: number;
}

export interface AssertionPublishingStore {
  /**
   * Acquire a transaction-scoped PostgreSQL advisory lock (`pg_advisory_xact_lock`)
   * keyed by `assertionRootId` to serialize concurrent publish operations on the
   * same conceptual assertion root before acquiring row locks.
   */
  lockPublishRoot(assertionRootId: string, tx?: TransactionClient): Promise<void>;

  /**
   * Lock all assertion versions belonging to `assertionRootId` in deterministic
   * ascending ID order (`ORDER BY id ASC FOR UPDATE`) to prevent deadlocks
   * against multi-assertion conflict operations.
   */
  lockRootAssertionsForUpdate(assertionRootId: string, tx?: TransactionClient): Promise<void>;

  /**
   * Lock related reviewer credentials, active safety overrides, and active
   * clinical conflicts for an assertion inside a publishing transaction in a
   * deterministic order (`id ASC`) to prevent stale-state publishing races.
   */
  lockClinicalGateInputsForPublish(
    assertionId: string,
    aggregateType: string,
    aggregateId: string,
    tx?: TransactionClient,
  ): Promise<void>;

  /**
   * Find an active published version belonging to the same conceptual root.
   */
  findActivePublishedByRootId(
    assertionRootId: string,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord | null>;

  /**
   * Transition an assertion version to 'published'.
   * Leaves scientific statements intact.
   */
  markAssertionPublished(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord>;

  /**
   * Controlled supersede transition for an existing published assertion.
   * Sets status = 'superseded' and supersededAt = now().
   * Strictly preserves statementText and clinical pillar linkage.
   */
  markAssertionSuperseded(
    assertionId: string,
    supersededAt?: Date,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord>;

  /**
   * Increment (or initialize) monotonic version in pocket_entity_version_registry.
   * Returns the new current version number.
   */
  incrementEntityVersion(
    aggregateType: string,
    aggregateId: string,
    tx?: TransactionClient,
  ): Promise<EntityVersionRecord>;

  /**
   * Enqueue an atomic publication event in pocket_outbox.
   */
  enqueueOutboxEvent(
    input: EnqueuePocketOutboxInput,
    tx?: TransactionClient,
  ): Promise<PocketOutboxRecord>;

  /**
   * Claim a batch of ready/expired-dsp outbox events with a dispatch lease token.
   * Atomic SKIP LOCKED concurrency fencing.
   */
  claimBatchForDispatch(
    batchSize: number,
    leaseSeconds: number,
    dispatchToken: string,
    tx?: TransactionClient,
  ): Promise<PocketOutboxRecord[]>;

  /**
   * Rotate dispatch lease token (dsp_*) to execution lease token (exe_*) before worker execution.
   * Extends lease window for job processing.
   */
  refreshExecutionLease(
    id: string,
    currentDispatchToken: string,
    newExecutionToken: string,
    leaseSeconds: number,
    tx?: TransactionClient,
  ): Promise<boolean>;

  /**
   * Mark outbox record as successfully sent with execution token and clock fencing.
   */
  markSent(
    id: string,
    executionToken: string,
    tx?: TransactionClient,
  ): Promise<boolean>;

  /**
   * Schedule delivery retry with exponential backoff on execution failure.
   * Transitions to 'dead_letter' when attempts reaches max_attempts.
   */
  scheduleDeliveryRetry(
    id: string,
    executionToken: string,
    errorMessage: string,
    tx?: TransactionClient,
  ): Promise<boolean>;

  /**
   * Release dispatch lease immediately upon Redis / queue failure without burning attempts.
   * Adds short backoff delay to prevent tight polling loops.
   */
  releaseDispatchFailure(
    id: string,
    dispatchToken: string,
    errorMessage: string,
    tx?: TransactionClient,
  ): Promise<boolean>;

  /**
   * Postpone delivery when no event handler is registered.
   * Preserves attempts and reschedules for later processing.
   */
  postponeDelivery(
    id: string,
    executionToken: string,
    delaySeconds: number,
    tx?: TransactionClient,
  ): Promise<boolean>;

  /**
   * Background sweep recovering expired leases using deterministic token prefix policies.
   */
  recoverExpiredLeases(
    batchSize?: number,
    tx?: TransactionClient,
  ): Promise<number>;
}

/**
 * In-memory implementation of AssertionPublishingStore for unit tests and local isolation.
 */
export class InMemoryAssertionPublishingStore implements AssertionPublishingStore {
  private readonly assertions: Map<string, ScientificAssertionRecord>;
  private readonly versionRegistry = new Map<string, EntityVersionRecord>();
  private readonly outboxEvents: PocketOutboxRecord[] = [];

  constructor(sharedAssertionsMap?: Map<string, ScientificAssertionRecord>) {
    this.assertions = sharedAssertionsMap ?? new Map<string, ScientificAssertionRecord>();
  }

  async lockPublishRoot(): Promise<void> {
    // In-memory store runs single-process; PostgreSQL advisory lock is enforced in DrizzleAssertionPublishingStore.
  }

  async lockRootAssertionsForUpdate(): Promise<void> {
    // In-memory store runs single-process; PostgreSQL row lock is enforced in DrizzleAssertionPublishingStore.
  }

  async lockClinicalGateInputsForPublish(): Promise<void> {
    // No-op in single-threaded in-memory store
  }

  async findActivePublishedByRootId(
    assertionRootId: string,
  ): Promise<ScientificAssertionRecord | null> {
    for (const record of this.assertions.values()) {
      if (
        record.assertionRootId === assertionRootId &&
        record.status === "published" &&
        record.supersededAt === null
      ) {
        return { ...record };
      }
    }
    return null;
  }

  async markAssertionPublished(assertionId: string): Promise<ScientificAssertionRecord> {
    const existing = this.assertions.get(assertionId);
    if (!existing) {
      throw new Error(`Assertion ${assertionId} not found`);
    }

    const updated: ScientificAssertionRecord = {
      ...existing,
      status: "published",
      updatedAt: new Date(),
    };

    this.assertions.set(assertionId, updated);
    return { ...updated };
  }

  async markAssertionSuperseded(
    assertionId: string,
    supersededAt?: Date,
  ): Promise<ScientificAssertionRecord> {
    const existing = this.assertions.get(assertionId);
    if (!existing) {
      throw new Error(`Assertion ${assertionId} not found`);
    }

    const now = supersededAt ?? new Date();
    const updated: ScientificAssertionRecord = {
      ...existing,
      status: "superseded",
      supersededAt: now,
      updatedAt: now,
    };

    this.assertions.set(assertionId, updated);
    return { ...updated };
  }

  async incrementEntityVersion(
    aggregateType: string,
    aggregateId: string,
  ): Promise<EntityVersionRecord> {
    const key = `${aggregateType}:${aggregateId}`;
    const existing = this.versionRegistry.get(key);
    const now = new Date();

    const newVersion = existing ? existing.currentVersion + 1 : 1;
    const record: EntityVersionRecord = {
      aggregateType,
      aggregateId,
      currentVersion: newVersion,
      updatedAt: now,
    };

    this.versionRegistry.set(key, record);
    return { ...record };
  }

  async enqueueOutboxEvent(input: EnqueuePocketOutboxInput): Promise<PocketOutboxRecord> {
    const id = input.id ?? `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();

    const record: PocketOutboxRecord = {
      id,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: now,
      leaseExpiresAt: null,
      leaseToken: null,
      lastError: null,
      globalEpoch: input.globalEpoch ?? Date.now(),
      createdAt: now,
      updatedAt: now,
      sentAt: null,
    };

    this.outboxEvents.push(record);
    return { ...record };
  }

  async claimBatchForDispatch(
    batchSize: number,
    leaseSeconds: number,
    dispatchToken: string,
  ): Promise<PocketOutboxRecord[]> {
    const now = new Date();
    const candidates = this.outboxEvents.filter((record) => {
      const isPendingReady = record.status === "pending" && record.nextAttemptAt <= now;
      const isDspExpired =
        record.status === "sending" &&
        record.leaseExpiresAt !== null &&
        record.leaseExpiresAt !== undefined &&
        record.leaseExpiresAt <= now &&
        typeof record.leaseToken === "string" &&
        record.leaseToken.startsWith("dsp_");
      return isPendingReady || isDspExpired;
    });

    candidates.sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime());
    const claimed = candidates.slice(0, batchSize);

    const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
    for (const record of claimed) {
      record.status = "sending";
      record.leaseToken = dispatchToken;
      record.leaseExpiresAt = leaseExpiresAt;
      record.updatedAt = new Date();
    }

    return claimed.map((r) => ({ ...r }));
  }

  async refreshExecutionLease(
    id: string,
    currentDispatchToken: string,
    newExecutionToken: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const now = new Date();
    const record = this.outboxEvents.find((r) => r.id === id);
    if (!record) return false;

    if (
      record.status === "sending" &&
      record.leaseToken === currentDispatchToken &&
      record.leaseExpiresAt !== null &&
      record.leaseExpiresAt !== undefined &&
      record.leaseExpiresAt > now
    ) {
      record.leaseToken = newExecutionToken;
      record.leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
      record.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async markSent(id: string, executionToken: string): Promise<boolean> {
    const now = new Date();
    const record = this.outboxEvents.find((r) => r.id === id);
    if (!record) return false;

    if (
      record.status === "sending" &&
      record.leaseToken === executionToken &&
      record.leaseExpiresAt !== null &&
      record.leaseExpiresAt !== undefined &&
      record.leaseExpiresAt > now
    ) {
      record.status = "sent";
      record.sentAt = new Date();
      record.leaseToken = null;
      record.leaseExpiresAt = null;
      record.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async scheduleDeliveryRetry(
    id: string,
    executionToken: string,
    errorMessage: string,
  ): Promise<boolean> {
    const now = new Date();
    const record = this.outboxEvents.find((r) => r.id === id);
    if (!record) return false;

    if (
      record.status === "sending" &&
      record.leaseToken === executionToken &&
      record.leaseExpiresAt !== null &&
      record.leaseExpiresAt !== undefined &&
      record.leaseExpiresAt > now
    ) {
      const oldAttempts = record.attempts;
      const newAttempts = oldAttempts + 1;
      const isDeadLetter = newAttempts >= record.maxAttempts;
      record.status = isDeadLetter ? "dead_letter" : "pending";
      record.attempts = newAttempts;
      const backoffSec = Math.pow(2, oldAttempts) * 30;
      record.nextAttemptAt = new Date(now.getTime() + backoffSec * 1000);
      record.leaseToken = null;
      record.leaseExpiresAt = null;
      record.lastError = errorMessage.slice(0, 1000);
      record.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async releaseDispatchFailure(
    id: string,
    dispatchToken: string,
    errorMessage: string,
  ): Promise<boolean> {
    const record = this.outboxEvents.find((r) => r.id === id);
    if (!record) return false;

    if (record.status === "sending" && record.leaseToken === dispatchToken) {
      const now = new Date();
      record.status = "pending";
      record.nextAttemptAt = new Date(now.getTime() + 15_000);
      record.leaseToken = null;
      record.leaseExpiresAt = null;
      record.lastError = errorMessage.slice(0, 1000);
      record.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async postponeDelivery(
    id: string,
    executionToken: string,
    delaySeconds: number,
  ): Promise<boolean> {
    const now = new Date();
    const record = this.outboxEvents.find((r) => r.id === id);
    if (!record) return false;

    if (
      record.status === "sending" &&
      record.leaseToken === executionToken &&
      record.leaseExpiresAt !== null &&
      record.leaseExpiresAt !== undefined &&
      record.leaseExpiresAt > now
    ) {
      record.status = "pending";
      record.nextAttemptAt = new Date(now.getTime() + delaySeconds * 1000);
      record.leaseToken = null;
      record.leaseExpiresAt = null;
      record.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async recoverExpiredLeases(batchSize: number = 50): Promise<number> {
    const now = new Date();
    const expiredCandidates = this.outboxEvents
      .filter(
        (r) =>
          r.status === "sending" &&
          r.leaseExpiresAt !== null &&
          r.leaseExpiresAt !== undefined &&
          r.leaseExpiresAt <= now,
      )
      .slice(0, batchSize);

    for (const record of expiredCandidates) {
      const token = record.leaseToken ?? "";
      if (token.startsWith("exe_")) {
        const oldAttempts = record.attempts;
        const newAttempts = oldAttempts + 1;
        record.attempts = newAttempts;
        record.status = newAttempts >= record.maxAttempts ? "dead_letter" : "pending";
        const backoffSec = Math.pow(2, oldAttempts) * 30;
        record.nextAttemptAt = new Date(now.getTime() + backoffSec * 1000);
        record.lastError = "Execution lease expired";
      } else if (token.startsWith("dsp_")) {
        record.status = "pending";
        record.nextAttemptAt = new Date();
      } else {
        record.status = "pending";
        record.nextAttemptAt = new Date();
        record.lastError = "Malformed lease token recovered";
      }
      record.leaseToken = null;
      record.leaseExpiresAt = null;
      record.updatedAt = new Date();
    }

    return expiredCandidates.length;
  }

  getOutboxEvents(): PocketOutboxRecord[] {
    return this.outboxEvents.map((e) => ({ ...e }));
  }

  updateOutboxRecordForTest(id: string, updates: Partial<PocketOutboxRecord>): void {
    const record = this.outboxEvents.find((e) => e.id === id);
    if (record) {
      Object.assign(record, updates);
    }
  }

  getEntityVersion(aggregateType: string, aggregateId: string): EntityVersionRecord | null {
    const record = this.versionRegistry.get(`${aggregateType}:${aggregateId}`);
    return record ? { ...record } : null;
  }
}
