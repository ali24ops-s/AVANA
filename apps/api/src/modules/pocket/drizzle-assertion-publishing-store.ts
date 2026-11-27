/**
 * Drizzle-backed implementation of AssertionPublishingStore.
 *
 * Implements Phase 2C-3 persistence contracts for:
 * - pocket_scientific_assertions (publishing & superseding)
 * - pocket_entity_version_registry (atomic UPSERT with monotonic version increment)
 * - pocket_outbox (transactional event queueing)
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbClient, DbRunner, TransactionClient } from "@avana/database/client";
import {
  pocketScientificAssertions,
  pocketEntityVersionRegistry,
  pocketOutbox,
} from "@avana/database/schema";
import { DomainError } from "@avana/domain";
import {
  buildPublishRootLockKey,
  PUBLISHED_ROOT_UNIQUE_INDEX_NAME,
  type AssertionPublishingStore,
  type EntityVersionRecord,
  type EnqueuePocketOutboxInput,
  type PocketOutboxRecord,
} from "./assertion-publishing-store.js";
import type {
  ScientificAssertionRecord,
  ScientificAssertionStatus,
} from "./assertion-review-store.js";

type AssertionRow = typeof pocketScientificAssertions.$inferSelect;
type VersionRegistryRow = typeof pocketEntityVersionRegistry.$inferSelect;

function toDate(val: unknown): Date {
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return new Date();
}

function mapRowToAssertion(row: AssertionRow): ScientificAssertionRecord {
  return {
    id: row.id,
    assertionRootId: row.assertionRootId,
    versionNumber: row.versionNumber,
    previousVersionId: row.previousVersionId ?? null,
    drugId: row.drugId ?? null,
    diseaseId: row.diseaseId ?? null,
    treatmentId: row.treatmentId ?? null,
    emergencyId: row.emergencyId ?? null,
    assertionType: row.assertionType,
    assertionKey: row.assertionKey,
    statementText: row.statementText,
    jurisdiction: row.jurisdiction,
    targetPopulation: row.targetPopulation,
    clinicalSetting: row.clinicalSetting,
    status: row.status as ScientificAssertionStatus,
    releaseId: row.releaseId ?? null,
    validUntilDate: row.validUntilDate ? String(row.validUntilDate) : null,
    supersededAt: row.supersededAt ? toDate(row.supersededAt) : null,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function mapRowToOutbox(row: Record<string, unknown>): PocketOutboxRecord {
  return {
    id: String(row.id),
    aggregateType: String(row.aggregateType ?? row.aggregate_type),
    aggregateId: String(row.aggregateId ?? row.aggregate_id),
    eventType: String(row.eventType ?? row.event_type),
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: String(row.status),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.maxAttempts ?? row.max_attempts ?? 5),
    nextAttemptAt: toDate(row.nextAttemptAt ?? row.next_attempt_at),
    leaseExpiresAt: (row.leaseExpiresAt ?? row.lease_expires_at)
      ? toDate(row.leaseExpiresAt ?? row.lease_expires_at)
      : null,
    leaseToken: (row.leaseToken ?? row.lease_token)
      ? String(row.leaseToken ?? row.lease_token)
      : null,
    lastError: (row.lastError ?? row.last_error)
      ? String(row.lastError ?? row.last_error)
      : null,
    globalEpoch: Number(row.globalEpoch ?? row.global_epoch),
    createdAt: toDate(row.createdAt ?? row.created_at),
    updatedAt: toDate(row.updatedAt ?? row.updated_at),
    sentAt: (row.sentAt ?? row.sent_at) ? toDate(row.sentAt ?? row.sent_at) : null,
  };
}

function mapRowToVersionRecord(row: VersionRegistryRow): EntityVersionRecord {
  return {
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    currentVersion: Number(row.currentVersion),
    updatedAt: toDate(row.updatedAt),
  };
}

export class DrizzleAssertionPublishingStore implements AssertionPublishingStore {
  constructor(private readonly db: DbClient) {}

  private getRunner(tx?: TransactionClient): DbRunner {
    return tx ?? this.db;
  }

  async lockPublishRoot(assertionRootId: string, tx?: TransactionClient): Promise<void> {
    if (!tx) {
      return;
    }

    const lockKey = buildPublishRootLockKey(assertionRootId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  }

  async lockRootAssertionsForUpdate(assertionRootId: string, tx?: TransactionClient): Promise<void> {
    if (!tx) {
      return;
    }

    await tx.execute(sql`
      SELECT id
      FROM pocket_scientific_assertions
      WHERE assertion_root_id = ${assertionRootId}::uuid
      ORDER BY id ASC
      FOR UPDATE
    `);
  }

  async lockClinicalGateInputsForPublish(
    assertionId: string,
    aggregateType: string,
    aggregateId: string,
    tx?: TransactionClient,
  ): Promise<void> {
    if (!tx) {
      return;
    }

    // Consistent lock ordering after assertion row lock:
    // 1. Involved reviewer credentials (ordered by id ASC)
    await tx.execute(sql`
      SELECT id
      FROM pocket_clinical_reviewer_credentials
      WHERE user_id IN (
        SELECT DISTINCT reviewer_user_id
        FROM pocket_assertion_verifications
        WHERE assertion_id = ${assertionId}::uuid
      )
      ORDER BY id ASC
      FOR UPDATE
    `);

    // 2. Active safety overrides targeting this assertion or its parent aggregate (ordered by id ASC)
    await tx.execute(sql`
      SELECT id
      FROM pocket_safety_overrides
      WHERE is_active = true
        AND (
          (target_entity_type = 'assertion' AND target_entity_id = ${assertionId}::uuid)
          OR (target_entity_type = ${aggregateType} AND target_entity_id = ${aggregateId}::uuid)
        )
      ORDER BY id ASC
      FOR UPDATE
    `);

    // 3. Active and resolved clinical conflicts involving this assertion (ordered by id ASC)
    await tx.execute(sql`
      SELECT id
      FROM pocket_clinical_conflicts
      WHERE status IN ('active_discrepancy', 'resolved')
        AND (assertion_a_id = ${assertionId}::uuid OR assertion_b_id = ${assertionId}::uuid)
      ORDER BY id ASC
      FOR UPDATE
    `);
  }

  async findActivePublishedByRootId(
    assertionRootId: string,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord | null> {
    const runner = this.getRunner(tx);
    const baseQuery = runner
      .select()
      .from(pocketScientificAssertions)
      .where(
        and(
          eq(pocketScientificAssertions.assertionRootId, assertionRootId),
          eq(pocketScientificAssertions.status, "published"),
          isNull(pocketScientificAssertions.supersededAt),
        ),
      )
      .limit(1);

    const rows = tx ? await baseQuery.for("update") : await baseQuery;

    if (rows.length === 0) {
      return null;
    }

    return mapRowToAssertion(rows[0]);
  }

  async markAssertionPublished(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    let updated: AssertionRow | undefined;
    try {
      [updated] = await runner
        .update(pocketScientificAssertions)
        .set({
          status: "published",
          updatedAt: now,
        })
        .where(eq(pocketScientificAssertions.id, assertionId))
        .returning();
    } catch (err: unknown) {
      const cause = (err as { cause?: unknown })?.cause;
      const pgCode =
        (err as { code?: string })?.code ?? (cause as { code?: string })?.code;
      const pgConstraint =
        (err as { constraint?: string })?.constraint ??
        (cause as { constraint?: string })?.constraint;

      if (pgCode === "23505" && pgConstraint === PUBLISHED_ROOT_UNIQUE_INDEX_NAME) {
        throw new DomainError(
          "conflict",
          "Another version of this assertion root is already published",
        );
      }
      throw err;
    }

    if (!updated) {
      throw new DomainError("not_found", `Assertion ${assertionId} not found`);
    }

    return mapRowToAssertion(updated);
  }

  async markAssertionSuperseded(
    assertionId: string,
    supersededAt?: Date,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord> {
    const runner = this.getRunner(tx);
    const now = supersededAt ?? new Date();

    const [updated] = await runner
      .update(pocketScientificAssertions)
      .set({
        status: "superseded",
        supersededAt: now,
        updatedAt: now,
      })
      .where(eq(pocketScientificAssertions.id, assertionId))
      .returning();

    if (!updated) {
      throw new DomainError("not_found", `Assertion ${assertionId} not found`);
    }

    return mapRowToAssertion(updated);
  }

  async incrementEntityVersion(
    aggregateType: string,
    aggregateId: string,
    tx?: TransactionClient,
  ): Promise<EntityVersionRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    const [result] = await runner
      .insert(pocketEntityVersionRegistry)
      .values({
        aggregateType,
        aggregateId,
        currentVersion: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          pocketEntityVersionRegistry.aggregateType,
          pocketEntityVersionRegistry.aggregateId,
        ],
        set: {
          currentVersion: sql`${pocketEntityVersionRegistry.currentVersion} + 1`,
          updatedAt: now,
        },
      })
      .returning();

    if (!result) {
      throw new DomainError("internal_error", "Failed to update entity version registry");
    }

    return mapRowToVersionRecord(result);
  }

  async enqueueOutboxEvent(
    input: EnqueuePocketOutboxInput,
    tx?: TransactionClient,
  ): Promise<PocketOutboxRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    const values: typeof pocketOutbox.$inferInsert = {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: now,
      globalEpoch: input.globalEpoch ?? Date.now(),
      createdAt: now,
      updatedAt: now,
    };

    if (input.id) {
      values.id = input.id;
    }

    const [result] = await runner
      .insert(pocketOutbox)
      .values(values)
      .returning();

    if (!result) {
      throw new DomainError("internal_error", "Failed to enqueue pocket outbox event");
    }

    return mapRowToOutbox(result);
  }

  async claimBatchForDispatch(
    batchSize: number,
    leaseSeconds: number,
    dispatchToken: string,
    tx?: TransactionClient,
  ): Promise<PocketOutboxRecord[]> {
    const runner = this.getRunner(tx);
    const boundedBatchSize = Math.max(1, batchSize);
    const boundedLeaseSeconds = Math.max(1, leaseSeconds);

    const queryResult = await runner.execute(sql`
      UPDATE pocket_outbox
      SET
        status = 'sending',
        lease_token = ${dispatchToken},
        lease_expires_at = clock_timestamp() + (${boundedLeaseSeconds} || ' seconds')::interval,
        updated_at = clock_timestamp()
      WHERE id IN (
        SELECT id FROM pocket_outbox
        WHERE (status = 'pending' AND next_attempt_at <= clock_timestamp())
           OR (status = 'sending' AND lease_expires_at <= clock_timestamp() AND left(lease_token, 4) = 'dsp_')
        ORDER BY next_attempt_at ASC
        LIMIT ${boundedBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        aggregate_type AS "aggregateType",
        aggregate_id AS "aggregateId",
        event_type AS "eventType",
        payload,
        status,
        attempts,
        max_attempts AS "maxAttempts",
        next_attempt_at AS "nextAttemptAt",
        lease_expires_at AS "leaseExpiresAt",
        lease_token AS "leaseToken",
        last_error AS "lastError",
        global_epoch AS "globalEpoch",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        sent_at AS "sentAt";
    `);

    const rows: Record<string, unknown>[] = Array.isArray(queryResult)
      ? (queryResult as unknown as Record<string, unknown>[])
      : (((queryResult as { rows?: Record<string, unknown>[] })?.rows ?? []) as Record<string, unknown>[]);

    return rows.map(mapRowToOutbox);
  }

  async refreshExecutionLease(
    id: string,
    currentDispatchToken: string,
    newExecutionToken: string,
    leaseSeconds: number,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const runner = this.getRunner(tx);
    const boundedLeaseSeconds = Math.max(1, leaseSeconds);

    const result = await runner.execute(sql`
      UPDATE pocket_outbox
      SET
        lease_token = ${newExecutionToken},
        lease_expires_at = clock_timestamp() + (${boundedLeaseSeconds} || ' seconds')::interval,
        updated_at = clock_timestamp()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND lease_token = ${currentDispatchToken}
        AND lease_expires_at > clock_timestamp()
      RETURNING id;
    `);

    const rows = Array.isArray(result)
      ? result
      : (((result as { rows?: unknown[] })?.rows ?? []) as unknown[]);
    const count = (result as { rowCount?: number })?.rowCount ?? rows.length;
    return count > 0;
  }

  async markSent(
    id: string,
    executionToken: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const runner = this.getRunner(tx);

    const result = await runner.execute(sql`
      UPDATE pocket_outbox
      SET
        status = 'sent',
        sent_at = clock_timestamp(),
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND lease_token = ${executionToken}
        AND lease_expires_at > clock_timestamp()
      RETURNING id;
    `);

    const rows = Array.isArray(result)
      ? result
      : (((result as { rows?: unknown[] })?.rows ?? []) as unknown[]);
    const count = (result as { rowCount?: number })?.rowCount ?? rows.length;
    return count > 0;
  }

  async scheduleDeliveryRetry(
    id: string,
    executionToken: string,
    errorMessage: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const runner = this.getRunner(tx);
    const truncatedError = errorMessage.slice(0, 1000);

    const result = await runner.execute(sql`
      UPDATE pocket_outbox
      SET
        status = CASE
          WHEN attempts + 1 >= max_attempts THEN 'dead_letter'
          ELSE 'pending'
        END,
        attempts = attempts + 1,
        next_attempt_at = clock_timestamp() + (power(2, attempts) * 30 || ' seconds')::interval,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = ${truncatedError},
        updated_at = clock_timestamp()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND lease_token = ${executionToken}
        AND lease_expires_at > clock_timestamp()
      RETURNING id;
    `);

    const rows = Array.isArray(result)
      ? result
      : (((result as { rows?: unknown[] })?.rows ?? []) as unknown[]);
    const count = (result as { rowCount?: number })?.rowCount ?? rows.length;
    return count > 0;
  }

  async releaseDispatchFailure(
    id: string,
    dispatchToken: string,
    errorMessage: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const runner = this.getRunner(tx);
    const truncatedError = errorMessage.slice(0, 1000);

    const result = await runner.execute(sql`
      UPDATE pocket_outbox
      SET
        status = 'pending',
        next_attempt_at = clock_timestamp() + INTERVAL '15 seconds',
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = ${truncatedError},
        updated_at = clock_timestamp()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND lease_token = ${dispatchToken}
      RETURNING id;
    `);

    const rows = Array.isArray(result)
      ? result
      : (((result as { rows?: unknown[] })?.rows ?? []) as unknown[]);
    const count = (result as { rowCount?: number })?.rowCount ?? rows.length;
    return count > 0;
  }

  async postponeDelivery(
    id: string,
    executionToken: string,
    delaySeconds: number,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const runner = this.getRunner(tx);
    const boundedDelay = Math.max(1, delaySeconds);

    const result = await runner.execute(sql`
      UPDATE pocket_outbox
      SET
        status = 'pending',
        next_attempt_at = clock_timestamp() + (${boundedDelay} || ' seconds')::interval,
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = clock_timestamp()
      WHERE id = ${id}::uuid
        AND status = 'sending'
        AND lease_token = ${executionToken}
        AND lease_expires_at > clock_timestamp()
      RETURNING id;
    `);

    const rows = Array.isArray(result)
      ? result
      : (((result as { rows?: unknown[] })?.rows ?? []) as unknown[]);
    const count = (result as { rowCount?: number })?.rowCount ?? rows.length;
    return count > 0;
  }

  async recoverExpiredLeases(
    batchSize: number = 50,
    tx?: TransactionClient,
  ): Promise<number> {
    const runner = this.getRunner(tx);
    const boundedBatchSize = Math.max(1, batchSize);

    const result = await runner.execute(sql`
      WITH expired_candidates AS (
        SELECT id, attempts, max_attempts, lease_token
        FROM pocket_outbox
        WHERE status = 'sending'
          AND lease_expires_at <= clock_timestamp()
        LIMIT ${boundedBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE pocket_outbox AS o
      SET
        status = CASE
          WHEN left(c.lease_token, 4) = 'exe_' AND c.attempts + 1 >= c.max_attempts THEN 'dead_letter'
          ELSE 'pending'
        END,
        attempts = CASE
          WHEN left(c.lease_token, 4) = 'exe_' THEN c.attempts + 1
          ELSE c.attempts
        END,
        next_attempt_at = CASE
          WHEN left(c.lease_token, 4) = 'exe_' THEN clock_timestamp() + (power(2, c.attempts) * 30 || ' seconds')::interval
          ELSE clock_timestamp()
        END,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = CASE
          WHEN left(c.lease_token, 4) = 'exe_' THEN 'Execution lease expired'
          WHEN left(c.lease_token, 4) = 'dsp_' THEN o.last_error
          ELSE 'Malformed lease token recovered'
        END,
        updated_at = clock_timestamp()
      FROM expired_candidates c
      WHERE o.id = c.id
      RETURNING o.id;
    `);

    const rows = Array.isArray(result)
      ? result
      : (((result as { rows?: unknown[] })?.rows ?? []) as unknown[]);
    const count = (result as { rowCount?: number })?.rowCount ?? rows.length;
    return count;
  }
}
