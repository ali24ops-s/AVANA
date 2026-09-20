import { randomUUID } from "node:crypto";
import type {
  FeedbackStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserId,
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
import type { UserStore } from "../identity/user-store.js";

export class InMemorySupportStore implements SupportStore {
  private feedbacks: FeedbackRecord[] = [];
  private tickets: SupportTicketRecord[] = [];
  private messages: SupportMessageRecord[] = [];

  constructor(private readonly userStore?: UserStore) {}

  private async enrichUserName(userId: UserId): Promise<{ name?: string; email?: string }> {
    if (!this.userStore) return {};
    try {
      const user = await this.userStore.findById(userId);
      if (user) {
        return { name: user.name, email: user.email };
      }
    } catch {
      // Ignore in-memory fallback
    }
    return {};
  }

  async createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
    const now = new Date().toISOString();
    const userMeta = await this.enrichUserName(input.userId);

    const record: FeedbackRecord = {
      id: randomUUID(),
      userId: input.userId,
      userName: userMeta.name,
      userEmail: userMeta.email,
      type: input.type,
      category: input.category,
      title: input.title.trim(),
      description: input.description.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      status: "new",
      adminResponse: null,
      respondedAt: null,
      respondedBy: null,
      responderName: null,
      createdAt: now,
      updatedAt: now,
    };

    this.feedbacks.unshift(record);
    return record;
  }

  async findFeedbackById(id: string): Promise<FeedbackRecord | null> {
    const item = this.feedbacks.find((f) => f.id === id);
    return item ? { ...item } : null;
  }

  async listFeedbacks(filter: ListFeedbackFilter): Promise<ListFeedbackResult> {
    let list = [...this.feedbacks];

    if (filter.userId) {
      list = list.filter((f) => f.userId === filter.userId);
    }
    if (filter.type) {
      list = list.filter((f) => f.type === filter.type);
    }
    if (filter.category) {
      list = list.filter((f) => f.category === filter.category);
    }
    if (filter.status) {
      list = list.filter((f) => f.status === filter.status);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          (f.userName && f.userName.toLowerCase().includes(q)) ||
          (f.userEmail && f.userEmail.toLowerCase().includes(q)),
      );
    }

    const sortOrder = filter.sortOrder ?? "desc";
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const total = list.length;
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit);

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
    const idx = this.feedbacks.findIndex((f) => f.id === id);
    if (idx === -1) return null;

    const current = this.feedbacks[idx];
    let responderName = current.responderName;
    if (updates.respondedBy) {
      const meta = await this.enrichUserName(updates.respondedBy);
      responderName = meta.name ?? null;
    }

    const updated: FeedbackRecord = {
      ...current,
      status: updates.status ?? current.status,
      adminResponse:
        updates.adminResponse !== undefined
          ? updates.adminResponse
          : current.adminResponse,
      respondedBy:
        updates.respondedBy !== undefined
          ? updates.respondedBy
          : current.respondedBy,
      respondedAt:
        updates.respondedAt !== undefined
          ? updates.respondedAt?.toISOString() ?? null
          : current.respondedAt,
      responderName,
      updatedAt: new Date().toISOString(),
    };

    this.feedbacks[idx] = updated;
    return updated;
  }

  async createTicket(input: CreateSupportTicketInput): Promise<SupportTicketRecord> {
    const now = new Date().toISOString();
    const userMeta = await this.enrichUserName(input.userId);

    const ticket: SupportTicketRecord = {
      id: randomUUID(),
      userId: input.userId,
      userName: userMeta.name,
      userEmail: userMeta.email,
      category: input.category,
      priority: input.priority ?? "medium",
      status: "open",
      title: input.title.trim(),
      description: input.description.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      lastActivityAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      messageCount: 1,
    };

    this.tickets.unshift(ticket);

    // Also create initial root message
    const rootMessage: SupportMessageRecord = {
      id: randomUUID(),
      ticketId: ticket.id,
      senderId: input.userId,
      senderRole: "user",
      senderName: userMeta.name,
      senderEmail: userMeta.email,
      body: input.description.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      isInternalNote: false,
      createdAt: now,
    };
    this.messages.push(rootMessage);

    return ticket;
  }

  async findTicketById(id: string): Promise<SupportTicketRecord | null> {
    const item = this.tickets.find((t) => t.id === id);
    if (!item) return null;
    const count = this.messages.filter((m) => m.ticketId === id).length;
    return { ...item, messageCount: count };
  }

  async listTickets(filter: ListSupportTicketsFilter): Promise<ListSupportTicketsResult> {
    let list = [...this.tickets];

    if (filter.userId) {
      list = list.filter((t) => t.userId === filter.userId);
    }
    if (filter.category) {
      list = list.filter((t) => t.category === filter.category);
    }
    if (filter.priority) {
      list = list.filter((t) => t.priority === filter.priority);
    }
    if (filter.status) {
      list = list.filter((t) => t.status === filter.status);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.userName && t.userName.toLowerCase().includes(q)) ||
          (t.userEmail && t.userEmail.toLowerCase().includes(q)),
      );
    }

    const sortOrder = filter.sortOrder ?? "desc";
    list.sort((a, b) => {
      const dateA = new Date(a.lastActivityAt).getTime();
      const dateB = new Date(b.lastActivityAt).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const total = list.length;
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const items = list.slice(offset, offset + limit).map((t) => ({
      ...t,
      messageCount: this.messages.filter((m) => m.ticketId === t.id).length,
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
    const idx = this.tickets.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const current = this.tickets[idx];
    const updated: SupportTicketRecord = {
      ...current,
      status: updates.status ?? current.status,
      priority: updates.priority ?? current.priority,
      category: updates.category ?? current.category,
      lastActivityAt: updates.lastActivityAt
        ? updates.lastActivityAt.toISOString()
        : current.lastActivityAt,
      closedAt:
        updates.closedAt !== undefined
          ? updates.closedAt?.toISOString() ?? null
          : current.closedAt,
      updatedAt: new Date().toISOString(),
    };

    this.tickets[idx] = updated;
    return updated;
  }

  async createMessage(input: CreateSupportMessageInput): Promise<SupportMessageRecord> {
    const now = new Date().toISOString();
    const userMeta = await this.enrichUserName(input.senderId);

    const msg: SupportMessageRecord = {
      id: randomUUID(),
      ticketId: input.ticketId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      senderName: userMeta.name,
      senderEmail: userMeta.email,
      body: input.body.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
      isInternalNote: input.isInternalNote ?? false,
      createdAt: now,
    };

    this.messages.push(msg);

    // Update ticket's lastActivityAt if public message
    const ticketIdx = this.tickets.findIndex((t) => t.id === input.ticketId);
    if (ticketIdx !== -1) {
      this.tickets[ticketIdx].lastActivityAt = now;
      this.tickets[ticketIdx].updatedAt = now;
    }

    return msg;
  }

  async listMessagesByTicketId(
    ticketId: string,
    includeInternalNotes = false,
  ): Promise<SupportMessageRecord[]> {
    return this.messages
      .filter(
        (m) =>
          m.ticketId === ticketId &&
          (includeInternalNotes || !m.isInternalNote),
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
  }

  async findAttachmentOwner(
    storageKey: string,
  ): Promise<{ userId: UserId; ticketId?: string; feedbackId?: string } | null> {
    const cleanKey = decodeURIComponent(storageKey);
    const rawKey = storageKey;
    const isMatching = (url: string | null | undefined) => {
      if (!url) return false;
      try {
        return (
          url.includes(cleanKey) ||
          url.includes(rawKey) ||
          decodeURIComponent(url).includes(cleanKey)
        );
      } catch {
        return url.includes(cleanKey) || url.includes(rawKey);
      }
    };

    // Check feedback
    const fb = this.feedbacks.find((f) => isMatching(f.attachmentUrl));
    if (fb) {
      return { userId: fb.userId, feedbackId: fb.id };
    }

    // Check tickets
    const ticket = this.tickets.find((t) => isMatching(t.attachmentUrl));
    if (ticket) {
      return { userId: ticket.userId, ticketId: ticket.id };
    }

    // Check messages
    const msg = this.messages.find((m) => isMatching(m.attachmentUrl));
    if (msg) {
      const parentTicket = this.tickets.find((t) => t.id === msg.ticketId);
      return {
        userId: parentTicket ? parentTicket.userId : msg.senderId,
        ticketId: msg.ticketId,
      };
    }

    return null;
  }
}
