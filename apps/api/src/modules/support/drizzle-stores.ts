import { randomUUID } from "node:crypto";
import { eq, desc, and, or, count, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbClient } from "@avana/database/client";
import {
  feedbacks,
  supportTickets,
  supportMessages,
  users,
} from "@avana/database/schema";
import {
  asUserId,
  type FeedbackCategory,
  type FeedbackStatus,
  type FeedbackType,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type UserId,
} from "@avana/domain";
import type {
  CreateFeedbackInput,
  CreateSupportMessageInput,
  CreateSupportTicketInput,
  FeedbackRecord,
  ListFeedbackFilter,
  ListFeedbackResult,
  ListSupportTicketsFilter,
  ListSupportTicketsResult,
  SupportMessageRecord,
  SupportStore,
  SupportTicketRecord,
} from "./support-store.js";

export class DrizzleSupportStore implements SupportStore {
  constructor(public readonly db: DbClient) {}

  async createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(feedbacks).values({
      id,
      userId: input.userId,
      type: input.type,
      category: input.category,
      title: input.title.trim(),
      description: input.description.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.findFeedbackById(id);
    if (!created) {
      throw new Error("Failed to retrieve created feedback");
    }
    return created;
  }

  async findFeedbackById(id: string): Promise<FeedbackRecord | null> {
    const responderUsers = alias(users, "responder_users");

    const rows = await this.db
      .select({
        feedback: feedbacks,
        userName: users.name,
        userEmail: users.email,
        responderName: responderUsers.name,
      })
      .from(feedbacks)
      .leftJoin(users, eq(feedbacks.userId, users.id))
      .leftJoin(responderUsers, eq(feedbacks.respondedBy, responderUsers.id))
      .where(eq(feedbacks.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    return {
      id: row.feedback.id,
      userId: asUserId(row.feedback.userId),
      userName: row.userName ?? undefined,
      userEmail: row.userEmail ?? undefined,
      type: row.feedback.type as FeedbackType,
      category: row.feedback.category as FeedbackCategory,
      title: row.feedback.title,
      description: row.feedback.description,
      attachmentUrl: row.feedback.attachmentUrl,
      status: row.feedback.status as FeedbackStatus,
      adminResponse: row.feedback.adminResponse,
      respondedAt: row.feedback.respondedAt ? row.feedback.respondedAt.toISOString() : null,
      respondedBy: row.feedback.respondedBy ? asUserId(row.feedback.respondedBy) : null,
      responderName: row.responderName ?? null,
      createdAt: row.feedback.createdAt.toISOString(),
      updatedAt: row.feedback.updatedAt.toISOString(),
    };
  }

  async listFeedbacks(filter: ListFeedbackFilter): Promise<ListFeedbackResult> {
    const conditions = [];

    if (filter.userId) {
      conditions.push(eq(feedbacks.userId, filter.userId));
    }
    if (filter.type) {
      conditions.push(eq(feedbacks.type, filter.type));
    }
    if (filter.category) {
      conditions.push(eq(feedbacks.category, filter.category));
    }
    if (filter.status) {
      conditions.push(eq(feedbacks.status, filter.status));
    }
    if (filter.search) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(feedbacks.title, q),
          ilike(feedbacks.description, q),
          ilike(users.name, q),
          ilike(users.email, q),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await this.db
      .select({ total: count() })
      .from(feedbacks)
      .leftJoin(users, eq(feedbacks.userId, users.id))
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;

    const responderUsers = alias(users, "responder_users");

    const rows = await this.db
      .select({
        feedback: feedbacks,
        userName: users.name,
        userEmail: users.email,
        responderName: responderUsers.name,
      })
      .from(feedbacks)
      .leftJoin(users, eq(feedbacks.userId, users.id))
      .leftJoin(responderUsers, eq(feedbacks.respondedBy, responderUsers.id))
      .where(whereClause)
      .orderBy(filter.sortOrder === "asc" ? feedbacks.createdAt : desc(feedbacks.createdAt))
      .limit(limit)
      .offset(offset);

    const items: FeedbackRecord[] = rows.map((r) => ({
      id: r.feedback.id,
      userId: asUserId(r.feedback.userId),
      userName: r.userName ?? undefined,
      userEmail: r.userEmail ?? undefined,
      type: r.feedback.type as FeedbackType,
      category: r.feedback.category as FeedbackCategory,
      title: r.feedback.title,
      description: r.feedback.description,
      attachmentUrl: r.feedback.attachmentUrl,
      status: r.feedback.status as FeedbackStatus,
      adminResponse: r.feedback.adminResponse,
      respondedAt: r.feedback.respondedAt ? r.feedback.respondedAt.toISOString() : null,
      respondedBy: r.feedback.respondedBy ? asUserId(r.feedback.respondedBy) : null,
      responderName: r.responderName ?? null,
      createdAt: r.feedback.createdAt.toISOString(),
      updatedAt: r.feedback.updatedAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async updateFeedback(
    id: string,
    updates: {
      status?: FeedbackStatus;
      adminResponse?: string | null;
      respondedBy?: UserId | null;
      respondedAt?: Date | null;
    },
  ): Promise<FeedbackRecord | null> {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) {
      updateValues.status = updates.status;
    }
    if (updates.adminResponse !== undefined) {
      updateValues.adminResponse = updates.adminResponse;
    }
    if (updates.respondedBy !== undefined) {
      updateValues.respondedBy = updates.respondedBy;
    }
    if (updates.respondedAt !== undefined) {
      updateValues.respondedAt = updates.respondedAt;
    }

    await this.db
      .update(feedbacks)
      .set(updateValues)
      .where(eq(feedbacks.id, id));

    return this.findFeedbackById(id);
  }

  async createTicket(input: CreateSupportTicketInput): Promise<SupportTicketRecord> {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(supportTickets).values({
      id,
      userId: input.userId,
      category: input.category,
      priority: input.priority ?? "medium",
      status: "open",
      title: input.title.trim(),
      description: input.description.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Also create initial root message
    await this.db.insert(supportMessages).values({
      id: randomUUID(),
      ticketId: id,
      senderId: input.userId,
      senderRole: "user",
      body: input.description.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      isInternalNote: false,
      createdAt: now,
    });

    const created = await this.findTicketById(id);
    if (!created) {
      throw new Error("Failed to retrieve created support ticket");
    }
    return created;
  }

  async findTicketById(id: string): Promise<SupportTicketRecord | null> {
    const rows = await this.db
      .select({
        ticket: supportTickets,
        userName: users.name,
        userEmail: users.email,
      })
      .from(supportTickets)
      .leftJoin(users, eq(supportTickets.userId, users.id))
      .where(eq(supportTickets.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    const messageCountRes = await this.db
      .select({ count: count() })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id));

    return {
      id: row.ticket.id,
      userId: asUserId(row.ticket.userId),
      userName: row.userName ?? undefined,
      userEmail: row.userEmail ?? undefined,
      category: row.ticket.category as TicketCategory,
      priority: row.ticket.priority as TicketPriority,
      status: row.ticket.status as TicketStatus,
      title: row.ticket.title,
      description: row.ticket.description,
      attachmentUrl: row.ticket.attachmentUrl,
      lastActivityAt: row.ticket.lastActivityAt.toISOString(),
      closedAt: row.ticket.closedAt ? row.ticket.closedAt.toISOString() : null,
      createdAt: row.ticket.createdAt.toISOString(),
      updatedAt: row.ticket.updatedAt.toISOString(),
      messageCount: Number(messageCountRes[0]?.count ?? 1),
    };
  }

  async listTickets(filter: ListSupportTicketsFilter): Promise<ListSupportTicketsResult> {
    const conditions = [];

    if (filter.userId) {
      conditions.push(eq(supportTickets.userId, filter.userId));
    }
    if (filter.category) {
      conditions.push(eq(supportTickets.category, filter.category));
    }
    if (filter.priority) {
      conditions.push(eq(supportTickets.priority, filter.priority));
    }
    if (filter.status) {
      conditions.push(eq(supportTickets.status, filter.status));
    }
    if (filter.search) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(supportTickets.title, q),
          ilike(supportTickets.description, q),
          ilike(users.name, q),
          ilike(users.email, q),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await this.db
      .select({ total: count() })
      .from(supportTickets)
      .leftJoin(users, eq(supportTickets.userId, users.id))
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;

    const rows = await this.db
      .select({
        ticket: supportTickets,
        userName: users.name,
        userEmail: users.email,
      })
      .from(supportTickets)
      .leftJoin(users, eq(supportTickets.userId, users.id))
      .where(whereClause)
      .orderBy(
        filter.sortOrder === "asc"
          ? supportTickets.lastActivityAt
          : desc(supportTickets.lastActivityAt),
      )
      .limit(limit)
      .offset(offset);

    const items: SupportTicketRecord[] = rows.map((r) => ({
      id: r.ticket.id,
      userId: asUserId(r.ticket.userId),
      userName: r.userName ?? undefined,
      userEmail: r.userEmail ?? undefined,
      category: r.ticket.category as TicketCategory,
      priority: r.ticket.priority as TicketPriority,
      status: r.ticket.status as TicketStatus,
      title: r.ticket.title,
      description: r.ticket.description,
      attachmentUrl: r.ticket.attachmentUrl,
      lastActivityAt: r.ticket.lastActivityAt.toISOString(),
      closedAt: r.ticket.closedAt ? r.ticket.closedAt.toISOString() : null,
      createdAt: r.ticket.createdAt.toISOString(),
      updatedAt: r.ticket.updatedAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async updateTicket(
    id: string,
    updates: {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      lastActivityAt?: Date;
      closedAt?: Date | null;
    },
  ): Promise<SupportTicketRecord | null> {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) {
      updateValues.status = updates.status;
    }
    if (updates.priority !== undefined) {
      updateValues.priority = updates.priority;
    }
    if (updates.category !== undefined) {
      updateValues.category = updates.category;
    }
    if (updates.lastActivityAt !== undefined) {
      updateValues.lastActivityAt = updates.lastActivityAt;
    }
    if (updates.closedAt !== undefined) {
      updateValues.closedAt = updates.closedAt;
    }

    await this.db
      .update(supportTickets)
      .set(updateValues)
      .where(eq(supportTickets.id, id));

    return this.findTicketById(id);
  }

  async createMessage(input: CreateSupportMessageInput): Promise<SupportMessageRecord> {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(supportMessages).values({
      id,
      ticketId: input.ticketId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      body: input.body.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      isInternalNote: input.isInternalNote ?? false,
      createdAt: now,
    });

    // Update ticket activity if not internal note
    if (!input.isInternalNote) {
      await this.db
        .update(supportTickets)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(supportTickets.id, input.ticketId));
    }

    const rows = await this.db
      .select({
        msg: supportMessages,
        senderName: users.name,
        senderEmail: users.email,
      })
      .from(supportMessages)
      .leftJoin(users, eq(supportMessages.senderId, users.id))
      .where(eq(supportMessages.id, id))
      .limit(1);

    const row = rows[0];
    return {
      id: row.msg.id,
      ticketId: row.msg.ticketId,
      senderId: asUserId(row.msg.senderId),
      senderRole: row.msg.senderRole as "user" | "admin",
      senderName: row.senderName ?? undefined,
      senderEmail: row.senderEmail ?? undefined,
      body: row.msg.body,
      attachmentUrl: row.msg.attachmentUrl,
      isInternalNote: row.msg.isInternalNote,
      createdAt: row.msg.createdAt.toISOString(),
    };
  }

  async listMessagesByTicketId(
    ticketId: string,
    includeInternalNotes = false,
  ): Promise<SupportMessageRecord[]> {
    const conditions = [eq(supportMessages.ticketId, ticketId)];
    if (!includeInternalNotes) {
      conditions.push(eq(supportMessages.isInternalNote, false));
    }

    const rows = await this.db
      .select({
        msg: supportMessages,
        senderName: users.name,
        senderEmail: users.email,
      })
      .from(supportMessages)
      .leftJoin(users, eq(supportMessages.senderId, users.id))
      .where(and(...conditions))
      .orderBy(supportMessages.createdAt);

    return rows.map((r) => ({
      id: r.msg.id,
      ticketId: r.msg.ticketId,
      senderId: asUserId(r.msg.senderId),
      senderRole: r.msg.senderRole as "user" | "admin",
      senderName: r.senderName ?? undefined,
      senderEmail: r.senderEmail ?? undefined,
      body: r.msg.body,
      attachmentUrl: r.msg.attachmentUrl,
      isInternalNote: r.msg.isInternalNote,
      createdAt: r.msg.createdAt.toISOString(),
    }));
  }

  async findAttachmentOwner(
    storageKey: string,
  ): Promise<{ userId: UserId; ticketId?: string; feedbackId?: string } | null> {
    const cleanKey = decodeURIComponent(storageKey);
    const rawKey = storageKey;

    // 1. Check feedback
    const fbRows = await this.db
      .select({ id: feedbacks.id, userId: feedbacks.userId })
      .from(feedbacks)
      .where(
        or(
          ilike(feedbacks.attachmentUrl, `%${cleanKey}%`),
          ilike(feedbacks.attachmentUrl, `%${rawKey}%`),
        ),
      )
      .limit(1);

    if (fbRows.length > 0) {
      return { userId: asUserId(fbRows[0].userId), feedbackId: fbRows[0].id };
    }

    // 2. Check support tickets
    const ticketRows = await this.db
      .select({ id: supportTickets.id, userId: supportTickets.userId })
      .from(supportTickets)
      .where(
        or(
          ilike(supportTickets.attachmentUrl, `%${cleanKey}%`),
          ilike(supportTickets.attachmentUrl, `%${rawKey}%`),
        ),
      )
      .limit(1);

    if (ticketRows.length > 0) {
      return { userId: asUserId(ticketRows[0].userId), ticketId: ticketRows[0].id };
    }

    // 3. Check messages
    const msgRows = await this.db
      .select({
        id: supportMessages.id,
        ticketId: supportMessages.ticketId,
        senderId: supportMessages.senderId,
        ticketUserId: supportTickets.userId,
      })
      .from(supportMessages)
      .leftJoin(supportTickets, eq(supportMessages.ticketId, supportTickets.id))
      .where(
        or(
          ilike(supportMessages.attachmentUrl, `%${cleanKey}%`),
          ilike(supportMessages.attachmentUrl, `%${rawKey}%`),
        ),
      )
      .limit(1);

    if (msgRows.length > 0) {
      return {
        userId: asUserId(msgRows[0].ticketUserId ?? msgRows[0].senderId),
        ticketId: msgRows[0].ticketId,
      };
    }

    return null;
  }
}
