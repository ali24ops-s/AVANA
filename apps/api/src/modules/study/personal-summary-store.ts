/**
 * Personal Summary Store (Drizzle PostgreSQL & In-Memory Implementations).
 *
 * Implements persistence, lease tracking, version incrementation, and
 * query retrieval for user personal contents (summaries, snapshots, transactions).
 */

import { randomUUID } from "node:crypto";
import { eq, and, or, desc, sql, lte, gt } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  userPersonalContents,
  lessonAnnotations,
  lessons,
} from "@avana/database/schema";
import { DomainError, type UserId, type CourseId } from "@avana/domain";
import type {
  PersonalContentType,
  PersonalContentStatus,
  PersonalRefundStatus,
  PersonalContentSnapshot,
  PersonalAnnotationSnapshotItem,
} from "@avana/contracts";

export interface PersonalSummaryRecord {
  id: string;
  userId: string;
  courseId: string;
  moduleId: string;
  contentType: PersonalContentType;
  version: number;
  status: PersonalContentStatus;
  payload: Record<string, unknown>;
  inputSnapshot: PersonalContentSnapshot;
  highlightsCount: number;
  notesCount: number;
  costToman: number;
  transactionId: string | null;
  refundTransactionId: string | null;
  refundStatus: PersonalRefundStatus;
  failureReason: string | null;
  workerId: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonalSummaryRecordParams {
  id?: string;
  userId: string;
  courseId: string;
  moduleId: string;
  contentType?: PersonalContentType;
  version: number;
  status?: PersonalContentStatus;
  payload?: Record<string, unknown>;
  inputSnapshot: PersonalContentSnapshot;
  highlightsCount: number;
  notesCount: number;
  costToman?: number;
  transactionId?: string | null;
  refundTransactionId?: string | null;
  refundStatus?: PersonalRefundStatus;
  failureReason?: string | null;
  idempotencyKey: string;
  workerId?: string | null;
  leaseExpiresAt?: Date | null;
}

export interface PersonalSummaryStore {
  findLatestCompleted(
    userId: UserId,
    moduleId: string,
    contentType?: PersonalContentType,
  ): Promise<PersonalSummaryRecord | null>;

  findActivePending(
    userId: UserId,
    moduleId: string,
    contentType?: PersonalContentType,
  ): Promise<PersonalSummaryRecord | null>;

  findById(id: string): Promise<PersonalSummaryRecord | null>;

  findByIdempotencyKey(key: string): Promise<PersonalSummaryRecord | null>;

  getNextVersion(
    userId: UserId,
    moduleId: string,
    contentType?: PersonalContentType,
  ): Promise<number>;

  createPending(
    params: CreatePersonalSummaryRecordParams,
  ): Promise<PersonalSummaryRecord>;

  updateHeartbeat(
    id: string,
    workerId: string,
    leaseExpiresAt: Date,
  ): Promise<void>;

  updateTransactionId(
    id: string,
    transactionId: string,
  ): Promise<void>;

  markCompleted(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<PersonalSummaryRecord>;

  markFailed(
    id: string,
    failureReason: string,
    refundTransactionId?: string | null,
    refundStatus?: PersonalRefundStatus,
  ): Promise<PersonalSummaryRecord>;

  updateRefundStatus(
    id: string,
    refundTransactionId: string,
    refundStatus: PersonalRefundStatus,
  ): Promise<void>;

  findExpiredPending(now: Date): Promise<PersonalSummaryRecord[]>;

  claimExpiredPending(
    workerId: string,
    leaseDurationSeconds?: number,
    limit?: number,
  ): Promise<PersonalSummaryRecord[]>;

  listVersions(
    userId: UserId,
    moduleId: string,
    contentType?: PersonalContentType,
  ): Promise<PersonalSummaryRecord[]>;

  findByVersion(
    userId: UserId,
    moduleId: string,
    version: number,
    contentType?: PersonalContentType,
  ): Promise<PersonalSummaryRecord | null>;

  updatePayload(
    id: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<PersonalSummaryRecord>;

  findAnnotationsForModule(
    userId: UserId,
    moduleId: string,
  ): Promise<PersonalAnnotationSnapshotItem[]>;
}

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return new Date().toISOString();
}

export class DrizzlePersonalSummaryStore implements PersonalSummaryStore {
  constructor(private readonly db: DbClient) {}

  private mapRow(row: typeof userPersonalContents.$inferSelect): PersonalSummaryRecord {
    return {
      id: row.id,
      userId: row.userId,
      courseId: row.courseId,
      moduleId: row.moduleId,
      contentType: row.contentType as PersonalContentType,
      version: row.version,
      status: row.status as PersonalContentStatus,
      payload: (row.payload as Record<string, unknown>) ?? {},
      inputSnapshot: (row.inputSnapshot as unknown as PersonalContentSnapshot) ?? {
        capturedAt: new Date().toISOString(),
        moduleId: row.moduleId,
        moduleTitle: "",
        courseId: row.courseId,
        totalHighlights: row.highlightsCount,
        totalNotes: row.notesCount,
        items: [],
      },
      highlightsCount: row.highlightsCount,
      notesCount: row.notesCount,
      costToman: row.costToman,
      transactionId: row.transactionId,
      refundTransactionId: row.refundTransactionId,
      refundStatus: row.refundStatus as PersonalRefundStatus,
      failureReason: row.failureReason,
      workerId: row.workerId,
      heartbeatAt: row.heartbeatAt ? toIsoString(row.heartbeatAt) : null,
      leaseExpiresAt: row.leaseExpiresAt ? toIsoString(row.leaseExpiresAt) : null,
      idempotencyKey: row.idempotencyKey,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    };
  }

  async findLatestCompleted(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord | null> {
    const [row] = await this.db
      .select()
      .from(userPersonalContents)
      .where(
        and(
          eq(userPersonalContents.userId, userId),
          eq(userPersonalContents.moduleId, moduleId),
          eq(userPersonalContents.contentType, contentType),
          eq(userPersonalContents.status, "completed"),
        ),
      )
      .orderBy(desc(userPersonalContents.version))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async findActivePending(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord | null> {
    const [row] = await this.db
      .select()
      .from(userPersonalContents)
      .where(
        and(
          eq(userPersonalContents.userId, userId),
          eq(userPersonalContents.moduleId, moduleId),
          eq(userPersonalContents.contentType, contentType),
          eq(userPersonalContents.status, "pending"),
          gt(userPersonalContents.leaseExpiresAt, new Date()),
        ),
      )
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<PersonalSummaryRecord | null> {
    const [row] = await this.db
      .select()
      .from(userPersonalContents)
      .where(eq(userPersonalContents.id, id))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<PersonalSummaryRecord | null> {
    const [row] = await this.db
      .select()
      .from(userPersonalContents)
      .where(eq(userPersonalContents.idempotencyKey, key))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async getNextVersion(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<number> {
    const [row] = await this.db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${userPersonalContents.version}), 0)::int` })
      .from(userPersonalContents)
      .where(
        and(
          eq(userPersonalContents.userId, userId),
          eq(userPersonalContents.moduleId, moduleId),
          eq(userPersonalContents.contentType, contentType),
        ),
      );

    return (row?.maxVersion ?? 0) + 1;
  }

  async createPending(
    params: CreatePersonalSummaryRecordParams,
  ): Promise<PersonalSummaryRecord> {
    const id = params.id ?? randomUUID();
    const now = new Date();

    try {
      const [row] = await this.db
        .insert(userPersonalContents)
        .values({
          id,
          userId: params.userId,
          courseId: params.courseId,
          moduleId: params.moduleId,
          contentType: params.contentType ?? "review_summary",
          version: params.version,
          status: params.status ?? "pending",
          payload: params.payload ?? {},
          inputSnapshot: params.inputSnapshot,
          highlightsCount: params.highlightsCount,
          notesCount: params.notesCount,
          costToman: params.costToman ?? 3000,
          transactionId: params.transactionId ?? null,
          refundTransactionId: params.refundTransactionId ?? null,
          refundStatus: params.refundStatus ?? "none",
          failureReason: params.failureReason ?? null,
          workerId: params.workerId ?? null,
          heartbeatAt: now,
          leaseExpiresAt: params.leaseExpiresAt !== undefined
            ? params.leaseExpiresAt
            : (params.status === "failed" || params.status === "completed" ? null : new Date(now.getTime() + 180_000)),
          idempotencyKey: params.idempotencyKey,
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

          const isVersionConflict =
            constraint.includes("uq_user_personal_contents_version") ||
            detail.includes("version") ||
            message.includes("uq_user_personal_contents_version");

          if (isVersionConflict) {
            throw new DomainError("conflict", "یک درخواست همزمان برای ایجاد این نسخه در جریان است.");
          }

          const isIdempotencyConflict =
            constraint.includes("uq_user_personal_contents_idempotency") ||
            detail.includes("idempotency_key") ||
            message.includes("uq_user_personal_contents_idempotency");

          if (isIdempotencyConflict) {
            throw new DomainError("conflict", "درخواست تکراری با این کلید یکتا قبلاً ثبت شده است.");
          }
        }

        if (pgErr.code === "23514") {
          throw new DomainError(
            "bad_request",
            `خطای اعتبارسنجی پایگاه داده در ثبت وضعیت محتوا: ${pgErr.message ?? "نقض محدودیت چک دیتابیس"}`,
          );
        }
      }
      throw err;
    }
  }

  async updateHeartbeat(
    id: string,
    workerId: string,
    leaseExpiresAt: Date,
  ): Promise<void> {
    await this.db
      .update(userPersonalContents)
      .set({
        workerId,
        heartbeatAt: new Date(),
        leaseExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(userPersonalContents.id, id));
  }

  async updateTransactionId(
    id: string,
    transactionId: string,
  ): Promise<void> {
    await this.db
      .update(userPersonalContents)
      .set({
        transactionId,
        updatedAt: new Date(),
      })
      .where(eq(userPersonalContents.id, id));
  }

  async markCompleted(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<PersonalSummaryRecord> {
    const [row] = await this.db
      .update(userPersonalContents)
      .set({
        status: "completed",
        payload,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userPersonalContents.id, id))
      .returning();

    return this.mapRow(row);
  }

  async markFailed(
    id: string,
    failureReason: string,
    refundTransactionId?: string | null,
    refundStatus: PersonalRefundStatus = "none",
  ): Promise<PersonalSummaryRecord> {
    const [row] = await this.db
      .update(userPersonalContents)
      .set({
        status: "failed",
        failureReason,
        refundTransactionId: refundTransactionId ?? null,
        refundStatus,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userPersonalContents.id, id))
      .returning();

    return this.mapRow(row);
  }

  async updateRefundStatus(
    id: string,
    refundTransactionId: string,
    refundStatus: PersonalRefundStatus,
  ): Promise<void> {
    await this.db
      .update(userPersonalContents)
      .set({
        refundTransactionId,
        refundStatus,
        updatedAt: new Date(),
      })
      .where(eq(userPersonalContents.id, id));
  }

  async findExpiredPending(now: Date): Promise<PersonalSummaryRecord[]> {
    const rows = await this.db
      .select()
      .from(userPersonalContents)
      .where(
        or(
          and(
            eq(userPersonalContents.status, "pending"),
            lte(userPersonalContents.leaseExpiresAt, now),
          ),
          and(
            eq(userPersonalContents.status, "failed"),
            eq(userPersonalContents.refundStatus, "pending"),
          ),
        ),
      );

    return rows.map((r) => this.mapRow(r));
  }

  async claimExpiredPending(
    workerId: string,
    leaseDurationSeconds = 120,
    limit = 50,
  ): Promise<PersonalSummaryRecord[]> {
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const leaseSeconds = Math.max(30, Math.min(600, leaseDurationSeconds));

    const queryResult = await this.db.execute(sql`
      UPDATE user_personal_contents
      SET
        worker_id = ${workerId},
        lease_expires_at = NOW() + (${leaseSeconds} || ' seconds')::interval,
        updated_at = NOW()
      WHERE id IN (
        SELECT id FROM user_personal_contents
        WHERE (status = 'pending' AND lease_expires_at <= NOW())
           OR (status = 'failed' AND refund_status = 'pending' AND (lease_expires_at IS NULL OR lease_expires_at <= NOW()))
        ORDER BY created_at ASC
        LIMIT ${boundedLimit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        user_id AS "userId",
        course_id AS "courseId",
        module_id AS "moduleId",
        content_type AS "contentType",
        version,
        status,
        payload,
        input_snapshot AS "inputSnapshot",
        highlights_count AS "highlightsCount",
        notes_count AS "notesCount",
        cost_toman AS "costToman",
        transaction_id AS "transactionId",
        refund_transaction_id AS "refundTransactionId",
        refund_status AS "refundStatus",
        failure_reason AS "failureReason",
        worker_id AS "workerId",
        heartbeat_at AS "heartbeatAt",
        lease_expires_at AS "leaseExpiresAt",
        idempotency_key AS "idempotencyKey",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `);

    const rows: Record<string, unknown>[] = Array.isArray(queryResult)
      ? (queryResult as unknown as Record<string, unknown>[])
      : (((queryResult as { rows?: Record<string, unknown>[] })?.rows ?? []) as Record<string, unknown>[]);

    return rows.map((row) => ({
      id: String(row.id),
      userId: row.userId as UserId,
      courseId: row.courseId as CourseId,
      moduleId: String(row.moduleId),
      contentType: row.contentType as PersonalContentType,
      version: Number(row.version),
      status: row.status as PersonalContentStatus,
      payload: (row.payload as Record<string, unknown>) ?? {},
      inputSnapshot: (row.inputSnapshot as unknown as PersonalContentSnapshot) ?? {
        capturedAt: new Date().toISOString(),
        moduleId: String(row.moduleId),
        moduleTitle: "",
        courseId: row.courseId as CourseId,
        totalHighlights: Number(row.highlightsCount ?? 0),
        totalNotes: Number(row.notesCount ?? 0),
        items: [],
      },
      highlightsCount: Number(row.highlightsCount ?? 0),
      notesCount: Number(row.notesCount ?? 0),
      costToman: Number(row.costToman ?? 3000),
      transactionId: (row.transactionId as string) ?? null,
      refundTransactionId: (row.refundTransactionId as string) ?? null,
      refundStatus: row.refundStatus as PersonalRefundStatus,
      failureReason: (row.failureReason as string) ?? null,
      workerId: (row.workerId as string) ?? null,
      heartbeatAt: row.heartbeatAt ? toIsoString(row.heartbeatAt) : null,
      leaseExpiresAt: row.leaseExpiresAt ? toIsoString(row.leaseExpiresAt) : null,
      idempotencyKey: String(row.idempotencyKey),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    }));
  }

  async listVersions(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord[]> {
    const rows = await this.db
      .select()
      .from(userPersonalContents)
      .where(
        and(
          eq(userPersonalContents.userId, userId),
          eq(userPersonalContents.moduleId, moduleId),
          eq(userPersonalContents.contentType, contentType),
        ),
      )
      .orderBy(desc(userPersonalContents.version));

    return rows.map((r) => this.mapRow(r));
  }

  async findByVersion(
    userId: UserId,
    moduleId: string,
    version: number,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord | null> {
    const [row] = await this.db
      .select()
      .from(userPersonalContents)
      .where(
        and(
          eq(userPersonalContents.userId, userId),
          eq(userPersonalContents.moduleId, moduleId),
          eq(userPersonalContents.contentType, contentType),
          eq(userPersonalContents.version, version),
        ),
      )
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async updatePayload(
    id: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<PersonalSummaryRecord> {
    if (expectedUpdatedAt) {
      const expectedDate = new Date(expectedUpdatedAt);
      if (isNaN(expectedDate.getTime())) {
        throw new DomainError("bad_request", "تاریخ clientUpdatedAt نامعتبر است.");
      }

      // Atomic Compare-And-Swap (CAS) in SQL with millisecond precision and monotonic clock
      const [row] = await this.db
        .update(userPersonalContents)
        .set({
          payload,
          updatedAt: sql`GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', ${userPersonalContents.updatedAt}) + interval '1 millisecond')`,
        })
        .where(
          and(
            eq(userPersonalContents.id, id),
            sql`date_trunc('milliseconds', ${userPersonalContents.updatedAt}) = date_trunc('milliseconds', ${expectedDate}::timestamptz)`,
          ),
        )
        .returning();

      if (!row) {
        // Distinguish between not_found and conflict
        const existing = await this.findById(id);
        if (!existing) {
          throw new DomainError("not_found", "رکورد مورد نظر یافت نشد.");
        }
        throw new DomainError(
          "conflict",
          "این سند همزمان در نشست دیگری ویرایش شده است. لطفاً صفحه را تازه‌سازی کنید.",
        );
      }

      return this.mapRow(row);
    }

    // Unconditional update when expectedUpdatedAt is not provided (preserves previous behavior)
    const [row] = await this.db
      .update(userPersonalContents)
      .set({
        payload,
        updatedAt: sql`GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', ${userPersonalContents.updatedAt}) + interval '1 millisecond')`,
      })
      .where(eq(userPersonalContents.id, id))
      .returning();

    if (!row) {
      throw new DomainError("not_found", "رکورد مورد نظر یافت نشد.");
    }

    return this.mapRow(row);
  }

  async findAnnotationsForModule(
    userId: UserId,
    moduleId: string,
  ): Promise<PersonalAnnotationSnapshotItem[]> {
    const rows = await this.db
      .select({
        id: lessonAnnotations.id,
        lessonId: lessonAnnotations.lessonId,
        lessonTitle: lessons.title,
        lessonSortOrder: lessons.sortOrder,
        type: lessonAnnotations.type,
        selectedText: lessonAnnotations.selectedText,
        prefix: lessonAnnotations.prefix,
        suffix: lessonAnnotations.suffix,
        startOffset: lessonAnnotations.startOffset,
        endOffset: lessonAnnotations.endOffset,
        color: lessonAnnotations.color,
        noteText: lessonAnnotations.noteText,
        createdAt: lessonAnnotations.createdAt,
      })
      .from(lessonAnnotations)
      .innerJoin(lessons, eq(lessonAnnotations.lessonId, lessons.id))
      .where(
        and(
          eq(lessons.moduleId, moduleId),
          eq(lessonAnnotations.userId, userId),
        ),
      )
      .orderBy(lessons.sortOrder, lessonAnnotations.createdAt);

    return rows.map((r) => ({
      id: r.id,
      lessonId: r.lessonId,
      lessonTitle: r.lessonTitle,
      lessonSortOrder: r.lessonSortOrder,
      type: r.type as "highlight" | "note",
      selectedText: r.selectedText,
      prefix: r.prefix ?? null,
      suffix: r.suffix ?? null,
      startOffset: r.startOffset ?? null,
      endOffset: r.endOffset ?? null,
      color: r.color,
      noteText: r.noteText ?? null,
      createdAt: toIsoString(r.createdAt),
    }));
  }
}

// ---------------------------------------------------------------------------
// In-Memory Implementation (For fast unit testing)
// ---------------------------------------------------------------------------

export class InMemoryPersonalSummaryStore implements PersonalSummaryStore {
  private records: PersonalSummaryRecord[] = [];
  public annotations: PersonalAnnotationSnapshotItem[] = [];

  async findLatestCompleted(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord | null> {
    const filtered = this.records
      .filter(
        (r) =>
          r.userId === userId &&
          r.moduleId === moduleId &&
          r.contentType === contentType &&
          r.status === "completed",
      )
      .sort((a, b) => b.version - a.version);

    return filtered[0] ?? null;
  }

  async findActivePending(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord | null> {
    const now = new Date();
    const found = this.records.find(
      (r) =>
        r.userId === userId &&
        r.moduleId === moduleId &&
        r.contentType === contentType &&
        r.status === "pending" &&
        r.leaseExpiresAt &&
        new Date(r.leaseExpiresAt) > now,
    );

    return found ?? null;
  }

  async findById(id: string): Promise<PersonalSummaryRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<PersonalSummaryRecord | null> {
    return this.records.find((r) => r.idempotencyKey === key) ?? null;
  }

  async getNextVersion(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<number> {
    const versions = this.records
      .filter(
        (r) =>
          r.userId === userId &&
          r.moduleId === moduleId &&
          r.contentType === contentType,
      )
      .map((r) => r.version);

    return (versions.length > 0 ? Math.max(...versions) : 0) + 1;
  }

  async createPending(
    params: CreatePersonalSummaryRecordParams,
  ): Promise<PersonalSummaryRecord> {
    const versionConflict = this.records.some(
      (r) =>
        r.userId === params.userId &&
        r.moduleId === params.moduleId &&
        r.contentType === (params.contentType ?? "review_summary") &&
        r.version === params.version,
    );
    if (versionConflict) {
      throw new DomainError("conflict", "یک درخواست همزمان برای ایجاد این نسخه در جریان است.");
    }

    const idempotencyConflict = this.records.some(
      (r) => r.idempotencyKey === params.idempotencyKey,
    );
    if (idempotencyConflict) {
      throw new DomainError("conflict", "درخواست تکراری با این کلید یکتا قبلاً ثبت شده است.");
    }

    const now = new Date();
    const id = params.id ?? randomUUID();
    const record: PersonalSummaryRecord = {
      id,
      userId: params.userId,
      courseId: params.courseId,
      moduleId: params.moduleId,
      contentType: params.contentType ?? "review_summary",
      version: params.version,
      status: params.status ?? "pending",
      payload: params.payload ?? {},
      inputSnapshot: params.inputSnapshot,
      highlightsCount: params.highlightsCount,
      notesCount: params.notesCount,
      costToman: params.costToman ?? 3000,
      transactionId: params.transactionId ?? null,
      refundTransactionId: params.refundTransactionId ?? null,
      refundStatus: params.refundStatus ?? "none",
      failureReason: params.failureReason ?? null,
      workerId: params.workerId ?? null,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: params.leaseExpiresAt !== undefined
        ? (params.leaseExpiresAt ? params.leaseExpiresAt.toISOString() : null)
        : (params.status === "failed" || params.status === "completed" ? null : new Date(now.getTime() + 180_000).toISOString()),
      idempotencyKey: params.idempotencyKey,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.records.push(record);
    return record;
  }

  async updateHeartbeat(
    id: string,
    workerId: string,
    leaseExpiresAt: Date,
  ): Promise<void> {
    const r = this.records.find((rec) => rec.id === id);
    if (r) {
      r.workerId = workerId;
      r.heartbeatAt = new Date().toISOString();
      r.leaseExpiresAt = leaseExpiresAt.toISOString();
      r.updatedAt = new Date().toISOString();
    }
  }

  async updateTransactionId(
    id: string,
    transactionId: string,
  ): Promise<void> {
    const r = this.records.find((rec) => rec.id === id);
    if (r) {
      r.transactionId = transactionId;
      r.updatedAt = new Date().toISOString();
    }
  }

  async markCompleted(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<PersonalSummaryRecord> {
    const r = this.records.find((rec) => rec.id === id);
    if (!r) throw new Error("Record not found");
    r.status = "completed";
    r.payload = payload;
    r.leaseExpiresAt = null;
    r.updatedAt = new Date().toISOString();
    return r;
  }

  async markFailed(
    id: string,
    failureReason: string,
    refundTransactionId?: string | null,
    refundStatus: PersonalRefundStatus = "none",
  ): Promise<PersonalSummaryRecord> {
    const r = this.records.find((rec) => rec.id === id);
    if (!r) throw new Error("Record not found");
    r.status = "failed";
    r.failureReason = failureReason;
    r.refundTransactionId = refundTransactionId ?? null;
    r.refundStatus = refundStatus;
    r.leaseExpiresAt = null;
    r.updatedAt = new Date().toISOString();
    return r;
  }

  async updateRefundStatus(
    id: string,
    refundTransactionId: string,
    refundStatus: PersonalRefundStatus,
  ): Promise<void> {
    const r = this.records.find((rec) => rec.id === id);
    if (r) {
      r.refundTransactionId = refundTransactionId;
      r.refundStatus = refundStatus;
      r.updatedAt = new Date().toISOString();
    }
  }

  async findExpiredPending(now: Date): Promise<PersonalSummaryRecord[]> {
    return this.records.filter(
      (r) =>
        (r.status === "pending" &&
          r.leaseExpiresAt &&
          new Date(r.leaseExpiresAt) <= now) ||
        (r.status === "failed" && r.refundStatus === "pending"),
    );
  }

  async claimExpiredPending(
    workerId: string,
    leaseDurationSeconds = 120,
    limit = 50,
  ): Promise<PersonalSummaryRecord[]> {
    const now = new Date();
    const candidates = this.records
      .filter((r) => {
        const isPendingExpired =
          r.status === "pending" &&
          r.leaseExpiresAt &&
          new Date(r.leaseExpiresAt) <= now;
        const isFailedPendingRefund =
          r.status === "failed" &&
          r.refundStatus === "pending" &&
          (!r.leaseExpiresAt || new Date(r.leaseExpiresAt) <= now);
        return isPendingExpired || isFailedPendingRefund;
      })
      .slice(0, limit);

    const leaseExpiresAt = new Date(
      now.getTime() + leaseDurationSeconds * 1000,
    ).toISOString();
    for (const r of candidates) {
      r.workerId = workerId;
      r.leaseExpiresAt = leaseExpiresAt;
      r.updatedAt = now.toISOString();
    }
    return candidates.map((r) => ({ ...r }));
  }

  async listVersions(
    userId: UserId,
    moduleId: string,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord[]> {
    return this.records
      .filter(
        (r) =>
          r.userId === userId &&
          r.moduleId === moduleId &&
          r.contentType === contentType,
      )
      .sort((a, b) => b.version - a.version);
  }

  async findByVersion(
    userId: UserId,
    moduleId: string,
    version: number,
    contentType: PersonalContentType = "review_summary",
  ): Promise<PersonalSummaryRecord | null> {
    const found = this.records.find(
      (r) =>
        r.userId === userId &&
        r.moduleId === moduleId &&
        r.contentType === contentType &&
        r.version === version,
    );
    return found ? { ...found } : null;
  }

  async updatePayload(
    id: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<PersonalSummaryRecord> {
    const existing = this.records.find((r) => r.id === id);
    if (!existing) {
      throw new DomainError("not_found", "رکورد مورد نظر یافت نشد.");
    }

    if (expectedUpdatedAt) {
      const existingTime = new Date(existing.updatedAt).getTime();
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      if (existingTime !== expectedTime) {
        throw new DomainError(
          "conflict",
          "این سند همزمان در نشست دیگری ویرایش شده است. لطفاً صفحه را تازه‌سازی کنید.",
        );
      }
    }

    // Ensure new timestamp is strictly monotonic (at least 1ms after existing)
    const now = Date.now();
    const existingMs = new Date(existing.updatedAt).getTime();
    const nextMs = now <= existingMs ? existingMs + 1 : now;

    existing.payload = payload;
    existing.updatedAt = new Date(nextMs).toISOString();
    return { ...existing };
  }

  async findAnnotationsForModule(
    _userId: UserId,
    _moduleId: string,
  ): Promise<PersonalAnnotationSnapshotItem[]> {
    return this.annotations;
  }
}
