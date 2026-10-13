import { sql, eq, desc } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import { telegramOutbox } from "@avana/database/schema";
import type { TelegramInlineKeyboardMarkup } from "./telegram-client.js";

export type TelegramOutboxStatus =
  | "pending"
  | "sending"
  | "sent"
  | "retry_scheduled"
  | "dead_letter";

export interface TelegramOutboxPayload {
  text: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
  disableWebPagePreview?: boolean;
}

export interface TelegramOutboxRecord {
  id: string;
  idempotencyKey: string;
  chatId: string;
  category: string;
  payload: TelegramOutboxPayload;
  status: TelegramOutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseExpiresAt: Date | null;
  leaseToken: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface EnqueueTelegramOutboxInput {
  idempotencyKey: string;
  chatId: string;
  category: string;
  payload: TelegramOutboxPayload;
  maxAttempts?: number;
  nextAttemptAt?: Date;
}

export interface RequeueDeadLetterOptions {
  resetAttempts?: boolean;
}

export interface TelegramOutboxStore {
  enqueue(
    input: EnqueueTelegramOutboxInput,
    tx?: DbClient,
  ): Promise<TelegramOutboxRecord | null>;

  claimBatch(
    limit: number,
    leaseDurationSeconds: number,
    leaseToken: string,
  ): Promise<readonly TelegramOutboxRecord[]>;

  markSent(id: string, leaseToken: string): Promise<boolean>;

  scheduleRetry(
    id: string,
    leaseToken: string,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<boolean>;

  markDeadLetter(
    id: string,
    leaseToken: string,
    lastError: string,
  ): Promise<boolean>;

  requeueDeadLetter(
    id: string,
    options?: RequeueDeadLetterOptions,
  ): Promise<boolean>;

  recoverExpiredLeases(): Promise<number>;

  findById(id: string): Promise<TelegramOutboxRecord | null>;

  findByIdempotencyKey(key: string): Promise<TelegramOutboxRecord | null>;

  listAll(options?: {
    status?: TelegramOutboxStatus;
    limit?: number;
  }): Promise<readonly TelegramOutboxRecord[]>;
}

function parseDbRow(row: Record<string, unknown>): TelegramOutboxRecord {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotencyKey ?? row.idempotency_key),
    chatId: String(row.chatId ?? row.chat_id),
    category: String(row.category),
    payload: (typeof row.payload === "string"
      ? JSON.parse(row.payload)
      : row.payload) as TelegramOutboxPayload,
    status: String(row.status) as TelegramOutboxStatus,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.maxAttempts ?? row.max_attempts ?? 10),
    nextAttemptAt: new Date((row.nextAttemptAt ?? row.next_attempt_at) as string | number | Date),
    leaseExpiresAt: (row.leaseExpiresAt ?? row.lease_expires_at)
      ? new Date((row.leaseExpiresAt ?? row.lease_expires_at) as string | number | Date)
      : null,
    leaseToken: (row.leaseToken ?? row.lease_token)
      ? String(row.leaseToken ?? row.lease_token)
      : null,
    lastError: (row.lastError ?? row.last_error)
      ? String(row.lastError ?? row.last_error)
      : null,
    createdAt: new Date((row.createdAt ?? row.created_at) as string | number | Date),
    updatedAt: new Date((row.updatedAt ?? row.updated_at) as string | number | Date),
    sentAt: (row.sentAt ?? row.sent_at)
      ? new Date((row.sentAt ?? row.sent_at) as string | number | Date)
      : null,
  };
}

export class DrizzleTelegramOutboxStore implements TelegramOutboxStore {
  constructor(private readonly db: DbClient) {}

  async enqueue(
    input: EnqueueTelegramOutboxInput,
    tx?: DbClient,
  ): Promise<TelegramOutboxRecord | null> {
    const executor = tx ?? this.db;
    const now = new Date();
    const nextAttempt = input.nextAttemptAt ?? now;

    const insertedRows = await executor
      .insert(telegramOutbox)
      .values({
        idempotencyKey: input.idempotencyKey,
        chatId: input.chatId,
        category: input.category,
        payload: input.payload,
        status: "pending",
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 10,
        nextAttemptAt: nextAttempt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (insertedRows.length > 0 && insertedRows[0]) {
      return parseDbRow(insertedRows[0] as unknown as Record<string, unknown>);
    }

    // Already exists — fetch existing for idempotency caller
    return this.findByIdempotencyKey(input.idempotencyKey);
  }

  async claimBatch(
    limit: number,
    leaseDurationSeconds: number,
    leaseToken: string,
  ): Promise<readonly TelegramOutboxRecord[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const leaseSeconds = Math.max(5, leaseDurationSeconds);

    const queryResult = await this.db.execute(sql`
      UPDATE telegram_outbox
      SET
        status = 'sending',
        lease_expires_at = NOW() + (${leaseSeconds} || ' seconds')::interval,
        lease_token = ${leaseToken},
        attempts = attempts + 1,
        updated_at = NOW()
      WHERE id IN (
        SELECT id FROM telegram_outbox
        WHERE (status IN ('pending', 'retry_scheduled') AND next_attempt_at <= NOW())
           OR (status = 'sending' AND lease_expires_at <= NOW())
        ORDER BY created_at ASC
        LIMIT ${boundedLimit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        idempotency_key AS "idempotencyKey",
        chat_id AS "chatId",
        category,
        payload,
        status,
        attempts,
        max_attempts AS "maxAttempts",
        next_attempt_at AS "nextAttemptAt",
        lease_expires_at AS "leaseExpiresAt",
        lease_token AS "leaseToken",
        last_error AS "lastError",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        sent_at AS "sentAt";
    `);

    const rows: Record<string, unknown>[] = Array.isArray(queryResult)
      ? (queryResult as unknown as Record<string, unknown>[])
      : (((queryResult as { rows?: Record<string, unknown>[] })?.rows ?? []) as Record<string, unknown>[]);

    return rows.map(parseDbRow);
  }

  async markSent(id: string, leaseToken: string): Promise<boolean> {
    const result = await this.db.execute(sql`
      UPDATE telegram_outbox
      SET
        status = 'sent',
        sent_at = NOW(),
        lease_expires_at = NULL,
        lease_token = NULL,
        updated_at = NOW()
      WHERE id = ${id}::uuid AND lease_token = ${leaseToken};
    `);

    const rowCount = (result as { rowCount?: number })?.rowCount ?? 0;
    return rowCount > 0;
  }

  async scheduleRetry(
    id: string,
    leaseToken: string,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<boolean> {
    const safeError = lastError.slice(0, 1000);
    const result = await this.db.execute(sql`
      UPDATE telegram_outbox
      SET
        status = 'retry_scheduled',
        next_attempt_at = ${nextAttemptAt.toISOString()}::timestamptz,
        last_error = ${safeError},
        lease_expires_at = NULL,
        lease_token = NULL,
        updated_at = NOW()
      WHERE id = ${id}::uuid AND lease_token = ${leaseToken};
    `);

    const rowCount = (result as { rowCount?: number })?.rowCount ?? 0;
    return rowCount > 0;
  }

  async markDeadLetter(
    id: string,
    leaseToken: string,
    lastError: string,
  ): Promise<boolean> {
    const safeError = lastError.slice(0, 1000);
    const result = await this.db.execute(sql`
      UPDATE telegram_outbox
      SET
        status = 'dead_letter',
        last_error = ${safeError},
        lease_expires_at = NULL,
        lease_token = NULL,
        updated_at = NOW()
      WHERE id = ${id}::uuid AND lease_token = ${leaseToken};
    `);

    const rowCount = (result as { rowCount?: number })?.rowCount ?? 0;
    return rowCount > 0;
  }

  async requeueDeadLetter(
    id: string,
    options?: RequeueDeadLetterOptions,
  ): Promise<boolean> {
    const resetAttempts = options?.resetAttempts ?? true;
    const result = await this.db.execute(sql`
      UPDATE telegram_outbox
      SET
        status = 'pending',
        attempts = ${resetAttempts ? 0 : sql`attempts`},
        next_attempt_at = NOW(),
        lease_expires_at = NULL,
        lease_token = NULL,
        last_error = CASE
          WHEN last_error IS NOT NULL THEN SUBSTRING('[requeued] ' || last_error FROM 1 FOR 1000)
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${id}::uuid AND status = 'dead_letter';
    `);

    const rowCount = (result as { rowCount?: number })?.rowCount ?? 0;
    return rowCount > 0;
  }

  async recoverExpiredLeases(): Promise<number> {
    const result = await this.db.execute(sql`
      UPDATE telegram_outbox
      SET
        status = 'retry_scheduled',
        lease_expires_at = NULL,
        lease_token = NULL,
        updated_at = NOW()
      WHERE status = 'sending' AND lease_expires_at <= NOW();
    `);

    return (result as { rowCount?: number })?.rowCount ?? 0;
  }

  async findById(id: string): Promise<TelegramOutboxRecord | null> {
    const rows = await this.db
      .select()
      .from(telegramOutbox)
      .where(eq(telegramOutbox.id, id))
      .limit(1);

    if (rows.length === 0 || !rows[0]) {
      return null;
    }
    return parseDbRow(rows[0] as unknown as Record<string, unknown>);
  }

  async findByIdempotencyKey(key: string): Promise<TelegramOutboxRecord | null> {
    const rows = await this.db
      .select()
      .from(telegramOutbox)
      .where(eq(telegramOutbox.idempotencyKey, key))
      .limit(1);

    if (rows.length === 0 || !rows[0]) {
      return null;
    }
    return parseDbRow(rows[0] as unknown as Record<string, unknown>);
  }

  async listAll(options?: {
    status?: TelegramOutboxStatus;
    limit?: number;
  }): Promise<readonly TelegramOutboxRecord[]> {
    let query = this.db.select().from(telegramOutbox);
    if (options?.status) {
      query = query.where(eq(telegramOutbox.status, options.status)) as typeof query;
    }
    const rows = await query
      .orderBy(desc(telegramOutbox.createdAt))
      .limit(options?.limit ?? 100);

    return rows.map((r) => parseDbRow(r as unknown as Record<string, unknown>));
  }
}

export class InMemoryTelegramOutboxStore implements TelegramOutboxStore {
  private readonly records = new Map<string, TelegramOutboxRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> id

  async enqueue(
    input: EnqueueTelegramOutboxInput,
  ): Promise<TelegramOutboxRecord | null> {
    const existingId = this.idempotencyIndex.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.records.get(existingId);
      return existing ? { ...existing } : null;
    }

    const id = `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();
    const record: TelegramOutboxRecord = {
      id,
      idempotencyKey: input.idempotencyKey,
      chatId: input.chatId,
      category: input.category,
      payload: JSON.parse(JSON.stringify(input.payload)) as TelegramOutboxPayload,
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 10,
      nextAttemptAt: input.nextAttemptAt ?? now,
      leaseExpiresAt: null,
      leaseToken: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
    };

    this.records.set(id, record);
    this.idempotencyIndex.set(input.idempotencyKey, id);
    return { ...record };
  }

  async claimBatch(
    limit: number,
    leaseDurationSeconds: number,
    leaseToken: string,
  ): Promise<readonly TelegramOutboxRecord[]> {
    const now = new Date();
    const claimed: TelegramOutboxRecord[] = [];

    // Sort by createdAt ascending
    const candidates = Array.from(this.records.values())
      .filter((r) => {
        if ((r.status === "pending" || r.status === "retry_scheduled") && r.nextAttemptAt <= now) {
          return true;
        }
        if (r.status === "sending" && r.leaseExpiresAt && r.leaseExpiresAt <= now) {
          return true;
        }
        return false;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const record of candidates) {
      if (claimed.length >= limit) break;

      record.status = "sending";
      record.leaseToken = leaseToken;
      record.leaseExpiresAt = new Date(now.getTime() + leaseDurationSeconds * 1000);
      record.attempts += 1;
      record.updatedAt = now;

      claimed.push({ ...record });
    }

    return claimed;
  }

  async markSent(id: string, leaseToken: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.leaseToken !== leaseToken) {
      return false; // lease expired or stolen
    }

    record.status = "sent";
    record.sentAt = new Date();
    record.leaseToken = null;
    record.leaseExpiresAt = null;
    record.updatedAt = new Date();
    return true;
  }

  async scheduleRetry(
    id: string,
    leaseToken: string,
    nextAttemptAt: Date,
    lastError: string,
  ): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.leaseToken !== leaseToken) {
      return false;
    }

    record.status = "retry_scheduled";
    record.nextAttemptAt = nextAttemptAt;
    record.lastError = lastError.slice(0, 1000);
    record.leaseToken = null;
    record.leaseExpiresAt = null;
    record.updatedAt = new Date();
    return true;
  }

  async markDeadLetter(
    id: string,
    leaseToken: string,
    lastError: string,
  ): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.leaseToken !== leaseToken) {
      return false;
    }

    record.status = "dead_letter";
    record.lastError = lastError.slice(0, 1000);
    record.leaseToken = null;
    record.leaseExpiresAt = null;
    record.updatedAt = new Date();
    return true;
  }

  async requeueDeadLetter(
    id: string,
    options?: RequeueDeadLetterOptions,
  ): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.status !== "dead_letter") {
      return false;
    }

    const resetAttempts = options?.resetAttempts ?? true;
    record.status = "pending";
    if (resetAttempts) {
      record.attempts = 0;
    }
    record.nextAttemptAt = new Date();
    record.leaseExpiresAt = null;
    record.leaseToken = null;
    if (record.lastError) {
      record.lastError = `[requeued] ${record.lastError}`.slice(0, 1000);
    }
    record.updatedAt = new Date();
    return true;
  }

  async recoverExpiredLeases(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const record of this.records.values()) {
      if (record.status === "sending" && record.leaseExpiresAt && record.leaseExpiresAt <= now) {
        record.status = "retry_scheduled";
        record.leaseToken = null;
        record.leaseExpiresAt = null;
        record.updatedAt = now;
        count++;
      }
    }
    return count;
  }

  async findById(id: string): Promise<TelegramOutboxRecord | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async findByIdempotencyKey(key: string): Promise<TelegramOutboxRecord | null> {
    const id = this.idempotencyIndex.get(key);
    if (!id) return null;
    return this.findById(id);
  }

  async listAll(options?: {
    status?: TelegramOutboxStatus;
    limit?: number;
  }): Promise<readonly TelegramOutboxRecord[]> {
    let items = Array.from(this.records.values());
    if (options?.status) {
      items = items.filter((r) => r.status === options.status);
    }
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (options?.limit) {
      items = items.slice(0, options.limit);
    }
    return items.map((r) => ({ ...r }));
  }

  // Test helpers
  updateRecordForTest(id: string, partial: Partial<TelegramOutboxRecord>): void {
    const record = this.records.get(id);
    if (record) {
      Object.assign(record, partial);
    }
  }

  clear(): void {
    this.records.clear();
    this.idempotencyIndex.clear();
  }
}
