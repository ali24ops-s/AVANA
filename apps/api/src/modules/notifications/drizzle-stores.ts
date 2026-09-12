import { eq, and, desc, sql, gte } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import { notifications } from "@avana/database/schema";
import {
  asNotificationId,
  asUserId,
  type NotificationId,
  type NotificationType,
  type UserId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import type {
  CreateNotificationInput,
  ListNotificationsOptions,
  ListNotificationsResult,
  NotificationRecord,
  NotificationStore,
} from "./notification-store.js";

function toRecord(row: typeof notifications.$inferSelect): NotificationRecord {
  return {
    id: asNotificationId(row.id as Parameters<typeof asNotificationId>[0]),
    userId: asUserId(row.userId as Parameters<typeof asUserId>[0]),
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    isRead: row.isRead,
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    actionUrl: row.actionUrl ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export class DrizzleNotificationStore implements NotificationStore {
  constructor(private readonly db: DbClient) {}

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationRecord | null> {
    const id = input.id ?? asNotificationId(randomUUID());
    const now = new Date();

    try {
      const rows = await this.db
        .insert(notifications)
        .values({
          id,
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          isRead: false,
          readAt: null,
          metadata: input.metadata ?? null,
          actionUrl: input.actionUrl ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();

      if (rows.length > 0 && rows[0]) {
        return toRecord(rows[0]);
      }

      if (input.idempotencyKey) {
        return await this.findByIdempotencyKey(input.idempotencyKey);
      }

      return null;
    } catch (err: unknown) {
      // If error is unique constraint violation on idempotency_key
      if (
        input.idempotencyKey &&
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        return await this.findByIdempotencyKey(input.idempotencyKey);
      }
      throw err;
    }
  }

  async findById(
    id: NotificationId,
    userId: UserId,
  ): Promise<NotificationRecord | null> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, userId)),
      )
      .limit(1);

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationRecord | null> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.idempotencyKey, idempotencyKey))
      .limit(1);

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listForUser(
    userId: UserId,
    options: ListNotificationsOptions = {},
  ): Promise<ListNotificationsResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const baseCondition = eq(notifications.userId, userId);
    const whereCondition = options.unreadOnly
      ? and(baseCondition, eq(notifications.isRead, false))
      : baseCondition;

    // Fetch items
    const rows = await this.db
      .select()
      .from(notifications)
      .where(whereCondition)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch total count matching filter
    const totalCountRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(whereCondition);

    const total = totalCountRes[0]?.count ?? 0;

    // Fetch total unread count for the user
    const unreadCount = await this.getUnreadCount(userId);

    return {
      items: rows.map(toRecord),
      total,
      unreadCount,
      page,
      limit,
    };
  }

  async getUnreadCount(userId: UserId): Promise<number> {
    const res = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
        ),
      );

    return res[0]?.count ?? 0;
  }

  async markAsRead(
    id: NotificationId,
    userId: UserId,
  ): Promise<NotificationRecord | null> {
    const now = new Date();
    const rows = await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, userId)),
      )
      .returning();

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async markAllAsRead(userId: UserId): Promise<{ updatedCount: number }> {
    const now = new Date();
    const rows = await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
        ),
      )
      .returning();

    return { updatedCount: rows.length };
  }

  async findRecentByUserIdAndType(
    userId: UserId,
    type: NotificationType,
    since: string,
  ): Promise<NotificationRecord | null> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, type),
          gte(notifications.createdAt, new Date(since)),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    return rows[0] ? toRecord(rows[0]) : null;
  }
}

export class InMemoryNotificationStore implements NotificationStore {
  private records: Map<string, NotificationRecord> = new Map();

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationRecord | null> {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const id = input.id ?? asNotificationId(randomUUID());
    const now = new Date().toISOString();
    const record: NotificationRecord = {
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      isRead: false,
      readAt: null,
      metadata: input.metadata ?? null,
      actionUrl: input.actionUrl ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(id, record);
    return record;
  }

  async findById(
    id: NotificationId,
    userId: UserId,
  ): Promise<NotificationRecord | null> {
    const record = this.records.get(id);
    if (!record || record.userId !== userId) {
      return null;
    }
    return record;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<NotificationRecord | null> {
    for (const record of this.records.values()) {
      if (record.idempotencyKey === idempotencyKey) {
        return record;
      }
    }
    return null;
  }

  async listForUser(
    userId: UserId,
    options: ListNotificationsOptions = {},
  ): Promise<ListNotificationsResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));

    let userItems = Array.from(this.records.values()).filter(
      (r) => r.userId === userId,
    );

    const unreadCount = userItems.filter((r) => !r.isRead).length;

    if (options.unreadOnly) {
      userItems = userItems.filter((r) => !r.isRead);
    }

    userItems.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = userItems.length;
    const offset = (page - 1) * limit;
    const paginated = userItems.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      unreadCount,
      page,
      limit,
    };
  }

  async getUnreadCount(userId: UserId): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.userId === userId && !record.isRead) {
        count++;
      }
    }
    return count;
  }

  async markAsRead(
    id: NotificationId,
    userId: UserId,
  ): Promise<NotificationRecord | null> {
    const record = this.records.get(id);
    if (!record || record.userId !== userId) {
      return null;
    }
    const updated: NotificationRecord = {
      ...record,
      isRead: true,
      readAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async markAllAsRead(userId: UserId): Promise<{ updatedCount: number }> {
    let count = 0;
    const now = new Date().toISOString();
    for (const [id, record] of this.records.entries()) {
      if (record.userId === userId && !record.isRead) {
        this.records.set(id, {
          ...record,
          isRead: true,
          readAt: now,
          updatedAt: now,
        });
        count++;
      }
    }
    return { updatedCount: count };
  }

  async findRecentByUserIdAndType(
    userId: UserId,
    type: NotificationType,
    since: string,
  ): Promise<NotificationRecord | null> {
    const sinceTime = new Date(since).getTime();
    const matching = Array.from(this.records.values())
      .filter(
        (r) =>
          r.userId === userId &&
          r.type === type &&
          new Date(r.createdAt).getTime() >= sinceTime,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return matching[0] ?? null;
  }
}
