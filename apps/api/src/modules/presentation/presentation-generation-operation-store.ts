/**
 * Presentation Generation Operation Store Interface and Implementations.
 *
 * Provides persistent, audit-safe storage for Presentation Assistant generation operations.
 * Enforces atomic concurrency control (Claim-Before-Debit), finite state machine
 * transitions, recovery locking, and complete debit/refund traceability.
 */

import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import { presentationGenerationOperations } from "@avana/database/schema";
import {
  type UUID,
  type UserId,
  type PresentationProjectId,
  type PresentationSlideId,
  type PresentationBatchId,
  type PresentationGenerationOperationId,
  type PresentationGenerationOperationStatus,
  type PresentationGenerationOperationRecord,
  type WalletTransactionId,
  asPresentationProjectId,
  asPresentationSlideId,
  asPresentationBatchId,
  asPresentationGenerationOperationId,
  asUserId,
  asWalletTransactionId,
  DomainError,
} from "@avana/domain";

export interface CreatePresentationGenerationOperationParams {
  id?: PresentationGenerationOperationId;
  projectId: PresentationProjectId;
  slideId: PresentationSlideId;
  userId: UserId;
  batchId?: PresentationBatchId | null;
  costToman: number;
  idempotencyKey: string;
}

export interface UpdatePresentationGenerationOperationParams {
  expectedCurrentStatuses?: PresentationGenerationOperationStatus[];
  status: PresentationGenerationOperationStatus;
  debitTransactionId?: WalletTransactionId | null;
  refundTransactionId?: WalletTransactionId | null;
  completedAt?: string | null;
  refundedAt?: string | null;
  lastError?: string | null;
  recoveryWorkerId?: string | null;
  recoveryLockedUntil?: string | null;
}

export interface PresentationGenerationOperationStore {
  claimOperation(
    params: CreatePresentationGenerationOperationParams,
  ): Promise<PresentationGenerationOperationRecord>;

  updateStatus(
    id: PresentationGenerationOperationId,
    params: UpdatePresentationGenerationOperationParams,
  ): Promise<PresentationGenerationOperationRecord>;

  claimStaleOperation(
    id: PresentationGenerationOperationId,
    workerId: string,
    lockDurationSeconds?: number,
  ): Promise<PresentationGenerationOperationRecord | null>;

  findStaleOperations(
    staleThresholdMs: number,
  ): Promise<PresentationGenerationOperationRecord[]>;

  findById(
    id: PresentationGenerationOperationId,
  ): Promise<PresentationGenerationOperationRecord | null>;

  findByIdempotencyKey(
    key: string,
  ): Promise<PresentationGenerationOperationRecord | null>;

  findActiveBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord | null>;

  findBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord[]>;

  findByBatchId(
    batchId: PresentationBatchId,
  ): Promise<PresentationGenerationOperationRecord[]>;

  findLatestCompletedBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord | null>;
}

// ---------------------------------------------------------------------------
// Drizzle Implementation (PostgreSQL)
// ---------------------------------------------------------------------------

export class DrizzlePresentationGenerationOperationStore
  implements PresentationGenerationOperationStore
{
  constructor(private readonly db: DbClient) {}

  private mapRow(
    row: typeof presentationGenerationOperations.$inferSelect,
  ): PresentationGenerationOperationRecord {
    return {
      id: asPresentationGenerationOperationId(row.id as UUID),
      projectId: asPresentationProjectId(row.projectId as UUID),
      slideId: asPresentationSlideId(row.slideId as UUID),
      userId: asUserId(row.userId as UUID),
      batchId: row.batchId ? asPresentationBatchId(row.batchId as UUID) : null,
      status: row.status as PresentationGenerationOperationStatus,
      costToman: row.costToman,
      debitTransactionId: row.debitTransactionId
        ? asWalletTransactionId(row.debitTransactionId as UUID)
        : null,
      refundTransactionId: row.refundTransactionId
        ? asWalletTransactionId(row.refundTransactionId as UUID)
        : null,
      idempotencyKey: row.idempotencyKey,
      recoveryWorkerId: row.recoveryWorkerId,
      recoveryLockedUntil: row.recoveryLockedUntil
        ? row.recoveryLockedUntil.toISOString()
        : null,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async claimOperation(
    params: CreatePresentationGenerationOperationParams,
  ): Promise<PresentationGenerationOperationRecord> {
    const id = params.id ?? (asPresentationGenerationOperationId(randomUUID() as UUID));
    const now = new Date();

    try {
      const [row] = await this.db
        .insert(presentationGenerationOperations)
        .values({
          id,
          projectId: params.projectId,
          slideId: params.slideId,
          userId: params.userId,
          batchId: params.batchId ?? null,
          status: "pending",
          costToman: params.costToman,
          idempotencyKey: params.idempotencyKey,
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return this.mapRow(row);
    } catch (err: unknown) {
      if (err && typeof err === "object") {
        const pgErr = err as { code?: string; constraint?: string; detail?: string; message?: string };
        if (pgErr.code === "23505") {
          const constraint = pgErr.constraint ?? "";
          const detail = pgErr.detail ?? "";
          const message = pgErr.message ?? "";

          if (
            constraint.includes("idx_pres_gen_ops_active_slide") ||
            detail.includes("slide_id")
          ) {
            throw new DomainError(
              "conflict",
              "فرآیند تولید متن سخنرانی برای این اسلاید هم‌اکنون در جریان است. لطفاً شکیبا باشید.",
            );
          }

          if (
            constraint.includes("idx_pres_gen_ops_idempotency") ||
            detail.includes("idempotency_key") ||
            message.includes("idempotency")
          ) {
            throw new DomainError(
              "conflict",
              "درخواست تکراری با این کلید یکتا قبلاً ثبت شده است.",
            );
          }
        }
      }
      throw err;
    }
  }

  async updateStatus(
    id: PresentationGenerationOperationId,
    params: UpdatePresentationGenerationOperationParams,
  ): Promise<PresentationGenerationOperationRecord> {
    const now = new Date();
    const updateValues: Record<string, unknown> = {
      status: params.status,
      updatedAt: now,
    };

    if (params.debitTransactionId !== undefined) {
      updateValues.debitTransactionId = params.debitTransactionId;
    }
    if (params.refundTransactionId !== undefined) {
      updateValues.refundTransactionId = params.refundTransactionId;
    }
    if (params.completedAt !== undefined) {
      updateValues.completedAt = params.completedAt ? new Date(params.completedAt) : null;
    }
    if (params.refundedAt !== undefined) {
      updateValues.refundedAt = params.refundedAt ? new Date(params.refundedAt) : null;
    }
    if (params.lastError !== undefined) {
      updateValues.lastError = params.lastError;
    }
    if (params.recoveryWorkerId !== undefined) {
      updateValues.recoveryWorkerId = params.recoveryWorkerId;
    }
    if (params.recoveryLockedUntil !== undefined) {
      updateValues.recoveryLockedUntil = params.recoveryLockedUntil
        ? new Date(params.recoveryLockedUntil)
        : null;
    }

    const whereConditions = [eq(presentationGenerationOperations.id, id)];
    if (params.expectedCurrentStatuses && params.expectedCurrentStatuses.length > 0) {
      whereConditions.push(
        inArray(presentationGenerationOperations.status, params.expectedCurrentStatuses),
      );
    }

    const [row] = await this.db
      .update(presentationGenerationOperations)
      .set(updateValues)
      .where(and(...whereConditions))
      .returning();

    if (!row) {
      throw new DomainError(
        "conflict",
        `انتقال غیرمعتبر وضعیت عملیات: عملیات ${id} در وضعیت مورد انتظار یافت نشد.`,
      );
    }

    return this.mapRow(row);
  }

  async claimStaleOperation(
    id: PresentationGenerationOperationId,
    workerId: string,
    lockDurationSeconds = 120,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const lockUntil = new Date(Date.now() + lockDurationSeconds * 1000);
    const now = new Date();

    const [row] = await this.db
      .update(presentationGenerationOperations)
      .set({
        recoveryWorkerId: workerId,
        recoveryLockedUntil: lockUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(presentationGenerationOperations.id, id),
          inArray(presentationGenerationOperations.status, [
            "pending",
            "debited",
            "generating",
            "refund_pending",
          ]),
          or(
            isNull(presentationGenerationOperations.recoveryLockedUntil),
            lte(presentationGenerationOperations.recoveryLockedUntil, now),
          ),
        ),
      )
      .returning();

    return row ? this.mapRow(row) : null;
  }

  async findStaleOperations(
    staleThresholdMs: number,
  ): Promise<PresentationGenerationOperationRecord[]> {
    const thresholdDate = new Date(Date.now() - staleThresholdMs);
    const now = new Date();

    const rows = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(
        and(
          inArray(presentationGenerationOperations.status, [
            "pending",
            "debited",
            "generating",
            "refund_pending",
          ]),
          lte(presentationGenerationOperations.startedAt, thresholdDate),
          or(
            isNull(presentationGenerationOperations.recoveryLockedUntil),
            lte(presentationGenerationOperations.recoveryLockedUntil, now),
          ),
        ),
      )
      .orderBy(presentationGenerationOperations.startedAt);

    return rows.map((r) => this.mapRow(r));
  }

  async findById(
    id: PresentationGenerationOperationId,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(eq(presentationGenerationOperations.id, id))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async findByIdempotencyKey(
    key: string,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(eq(presentationGenerationOperations.idempotencyKey, key))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async findActiveBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(
        and(
          eq(presentationGenerationOperations.slideId, slideId),
          inArray(presentationGenerationOperations.status, [
            "pending",
            "debited",
            "generating",
            "refund_pending",
          ]),
        ),
      )
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async findBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord[]> {
    const rows = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(eq(presentationGenerationOperations.slideId, slideId))
      .orderBy(desc(presentationGenerationOperations.createdAt));

    return rows.map((r) => this.mapRow(r));
  }

  async findByBatchId(
    batchId: PresentationBatchId,
  ): Promise<PresentationGenerationOperationRecord[]> {
    const rows = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(eq(presentationGenerationOperations.batchId, batchId))
      .orderBy(presentationGenerationOperations.startedAt);

    return rows.map((r) => this.mapRow(r));
  }

  async findLatestCompletedBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationGenerationOperations)
      .where(
        and(
          eq(presentationGenerationOperations.slideId, slideId),
          eq(presentationGenerationOperations.status, "completed"),
        ),
      )
      .orderBy(desc(presentationGenerationOperations.completedAt))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }
}

// ---------------------------------------------------------------------------
// In-Memory Implementation (for Testing)
// ---------------------------------------------------------------------------

export class InMemoryPresentationGenerationOperationStore
  implements PresentationGenerationOperationStore
{
  private readonly operations = new Map<string, PresentationGenerationOperationRecord>();

  async claimOperation(
    params: CreatePresentationGenerationOperationParams,
  ): Promise<PresentationGenerationOperationRecord> {
    // 1. Idempotency Check
    for (const op of this.operations.values()) {
      if (op.idempotencyKey === params.idempotencyKey) {
        throw new DomainError(
          "conflict",
          "درخواست تکراری با این کلید یکتا قبلاً ثبت شده است.",
        );
      }
    }

    // 2. Concurrency Lock Check (partial unique index behavior)
    for (const op of this.operations.values()) {
      if (
        op.slideId === params.slideId &&
        ["pending", "debited", "generating", "refund_pending"].includes(op.status)
      ) {
        throw new DomainError(
          "conflict",
          "فرآیند تولید متن سخنرانی برای این اسلاید هم‌اکنون در جریان است. لطفاً شکیبا باشید.",
        );
      }
    }

    const id = params.id ?? (asPresentationGenerationOperationId(randomUUID() as UUID));
    const now = new Date().toISOString();

    const record: PresentationGenerationOperationRecord = {
      id,
      projectId: params.projectId,
      slideId: params.slideId,
      userId: params.userId,
      batchId: params.batchId ?? null,
      status: "pending",
      costToman: params.costToman,
      debitTransactionId: null,
      refundTransactionId: null,
      idempotencyKey: params.idempotencyKey,
      recoveryWorkerId: null,
      recoveryLockedUntil: null,
      startedAt: now,
      completedAt: null,
      refundedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };

    this.operations.set(id, record);
    return { ...record };
  }

  async updateStatus(
    id: PresentationGenerationOperationId,
    params: UpdatePresentationGenerationOperationParams,
  ): Promise<PresentationGenerationOperationRecord> {
    const existing = this.operations.get(id);
    if (!existing) {
      throw new DomainError("not_found", `عملیات ${id} یافت نشد.`);
    }

    if (
      params.expectedCurrentStatuses &&
      params.expectedCurrentStatuses.length > 0 &&
      !params.expectedCurrentStatuses.includes(existing.status)
    ) {
      throw new DomainError(
        "conflict",
        `انتقال غیرمعتبر وضعیت عملیات: عملیات ${id} در وضعیت مورد انتظار یافت نشد.`,
      );
    }

    const now = new Date().toISOString();
    const updated: PresentationGenerationOperationRecord = {
      ...existing,
      status: params.status,
      debitTransactionId:
        params.debitTransactionId !== undefined
          ? params.debitTransactionId
          : existing.debitTransactionId,
      refundTransactionId:
        params.refundTransactionId !== undefined
          ? params.refundTransactionId
          : existing.refundTransactionId,
      completedAt:
        params.completedAt !== undefined ? params.completedAt : existing.completedAt,
      refundedAt:
        params.refundedAt !== undefined ? params.refundedAt : existing.refundedAt,
      lastError:
        params.lastError !== undefined ? params.lastError : existing.lastError,
      recoveryWorkerId:
        params.recoveryWorkerId !== undefined
          ? params.recoveryWorkerId
          : existing.recoveryWorkerId,
      recoveryLockedUntil:
        params.recoveryLockedUntil !== undefined
          ? params.recoveryLockedUntil
          : existing.recoveryLockedUntil,
      updatedAt: now,
    };

    this.operations.set(id, updated);
    return { ...updated };
  }

  async claimStaleOperation(
    id: PresentationGenerationOperationId,
    workerId: string,
    lockDurationSeconds = 120,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const existing = this.operations.get(id);
    if (!existing) return null;

    if (!["pending", "debited", "generating", "refund_pending"].includes(existing.status)) {
      return null;
    }

    const now = new Date();
    if (existing.recoveryLockedUntil && new Date(existing.recoveryLockedUntil) > now) {
      return null;
    }

    const lockUntil = new Date(Date.now() + lockDurationSeconds * 1000).toISOString();
    const updated: PresentationGenerationOperationRecord = {
      ...existing,
      recoveryWorkerId: workerId,
      recoveryLockedUntil: lockUntil,
      updatedAt: now.toISOString(),
    };

    this.operations.set(id, updated);
    return { ...updated };
  }

  async findStaleOperations(
    staleThresholdMs: number,
  ): Promise<PresentationGenerationOperationRecord[]> {
    const threshold = Date.now() - staleThresholdMs;
    const now = new Date();
    const result: PresentationGenerationOperationRecord[] = [];

    for (const op of this.operations.values()) {
      if (
        ["pending", "debited", "generating", "refund_pending"].includes(op.status) &&
        new Date(op.startedAt).getTime() <= threshold &&
        (!op.recoveryLockedUntil || new Date(op.recoveryLockedUntil) <= now)
      ) {
        result.push({ ...op });
      }
    }

    return result.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
  }

  async findById(
    id: PresentationGenerationOperationId,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const op = this.operations.get(id);
    return op ? { ...op } : null;
  }

  async findByIdempotencyKey(
    key: string,
  ): Promise<PresentationGenerationOperationRecord | null> {
    for (const op of this.operations.values()) {
      if (op.idempotencyKey === key) {
        return { ...op };
      }
    }
    return null;
  }

  async findActiveBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord | null> {
    for (const op of this.operations.values()) {
      if (
        op.slideId === slideId &&
        ["pending", "debited", "generating", "refund_pending"].includes(op.status)
      ) {
        return { ...op };
      }
    }
    return null;
  }

  async findBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord[]> {
    const result: PresentationGenerationOperationRecord[] = [];
    for (const op of this.operations.values()) {
      if (op.slideId === slideId) {
        result.push({ ...op });
      }
    }
    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async findByBatchId(
    batchId: PresentationBatchId,
  ): Promise<PresentationGenerationOperationRecord[]> {
    const result: PresentationGenerationOperationRecord[] = [];
    for (const op of this.operations.values()) {
      if (op.batchId === batchId) {
        result.push({ ...op });
      }
    }
    return result.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
  }

  async findLatestCompletedBySlideId(
    slideId: PresentationSlideId,
  ): Promise<PresentationGenerationOperationRecord | null> {
    const completed: PresentationGenerationOperationRecord[] = [];
    for (const op of this.operations.values()) {
      if (op.slideId === slideId && op.status === "completed") {
        completed.push({ ...op });
      }
    }
    if (completed.length === 0) return null;
    completed.sort(
      (a, b) =>
        new Date(b.completedAt || b.updatedAt).getTime() -
        new Date(a.completedAt || a.updatedAt).getTime(),
    );
    return { ...completed[0] };
  }
}
