import {
  DomainError,
  canTransitionFeedbackStatus,
  canTransitionTicketStatus,
  isFeedbackCategory,
  isFeedbackStatus,
  isFeedbackType,
  isTicketCategory,
  isTicketPriority,
  isTicketStatus,
  type Actor,
  type FeedbackItem,
  type FeedbackStatus,
  type SupportMessageItem,
  type SupportTicketItem,
  type TicketPriority,
  type TicketStatus,
  auditFeedbackResponded,
  auditTicketCategoryChanged,
  auditTicketPriorityChanged,
  auditTicketReplied,
  auditTicketStatusChanged,
} from "@avana/domain";
import type {
  FeedbackRecord,
  ListFeedbackResult,
  ListSupportTicketsResult,
  SupportMessageRecord,
  SupportStore,
  SupportTicketRecord,
} from "./support-store.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { AuditService } from "../../observability/audit-service.js";

export function toFeedbackItem(record: FeedbackRecord): FeedbackItem {
  return {
    id: record.id,
    userId: record.userId,
    userName: record.userName,
    userEmail: record.userEmail,
    type: record.type,
    category: record.category,
    title: record.title,
    description: record.description,
    attachmentUrl: record.attachmentUrl,
    status: record.status,
    adminResponse: record.adminResponse,
    respondedAt: record.respondedAt,
    respondedBy: record.respondedBy,
    responderName: record.responderName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toSupportTicketItem(
  record: SupportTicketRecord,
  messages?: SupportMessageRecord[],
): SupportTicketItem {
  return {
    id: record.id,
    userId: record.userId,
    userName: record.userName,
    userEmail: record.userEmail,
    category: record.category,
    priority: record.priority,
    status: record.status,
    title: record.title,
    description: record.description,
    attachmentUrl: record.attachmentUrl,
    lastActivityAt: record.lastActivityAt,
    closedAt: record.closedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messageCount,
    messages: messages?.map(toSupportMessageItem),
  };
}

export function toSupportMessageItem(
  record: SupportMessageRecord,
): SupportMessageItem {
  return {
    id: record.id,
    ticketId: record.ticketId,
    senderId: record.senderId,
    senderRole: record.senderRole,
    senderName: record.senderName,
    senderEmail: record.senderEmail,
    body: record.body,
    attachmentUrl: record.attachmentUrl,
    isInternalNote: record.isInternalNote,
    createdAt: record.createdAt,
  };
}

export class SupportService {
  constructor(
    private readonly store: SupportStore,
    private readonly notificationService?: NotificationService,
    private readonly auditService?: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Feedback Methods (User & Admin)
  // -------------------------------------------------------------------------

  async createFeedback(
    actor: Actor,
    input: {
      type: string;
      category: string;
      title: string;
      description: string;
      attachmentUrl?: string | null;
    },
  ): Promise<FeedbackItem> {
    if (!isFeedbackType(input.type)) {
      throw new DomainError(
        "bad_request",
        "نوع بازخورد نامعتبر است.",
      );
    }
    if (!isFeedbackCategory(input.category)) {
      throw new DomainError(
        "bad_request",
        "دسته‌بندی بازخورد نامعتبر است.",
      );
    }
    if (!input.title || input.title.trim().length < 3) {
      throw new DomainError(
        "bad_request",
        "عنوان بازخورد باید حداقل ۳ کاراکتر باشد.",
      );
    }
    if (!input.description || input.description.trim().length < 10) {
      throw new DomainError(
        "bad_request",
        "متن توضیحات بازخورد باید حداقل ۱۰ کاراکتر باشد.",
      );
    }

    const record = await this.store.createFeedback({
      userId: actor.userId,
      type: input.type,
      category: input.category,
      title: input.title.trim(),
      description: input.description.trim(),
      attachmentUrl: input.attachmentUrl?.trim() || null,
    });

    return toFeedbackItem(record);
  }

  async listUserFeedbacks(
    actor: Actor,
    options?: { status?: string; page?: number; limit?: number },
  ): Promise<ListFeedbackResult> {
    const status = options?.status && isFeedbackStatus(options.status) ? options.status : undefined;
    return this.store.listFeedbacks({
      userId: actor.userId,
      status,
      page: options?.page,
      limit: options?.limit,
    });
  }

  async listAdminFeedbacks(
    actor: Actor,
    filter: {
      type?: string;
      category?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: "createdAt" | "updatedAt";
      sortOrder?: "asc" | "desc";
    },
  ): Promise<ListFeedbackResult> {
    this.assertAdmin(actor);

    return this.store.listFeedbacks({
      type: filter.type && isFeedbackType(filter.type) ? filter.type : undefined,
      category: filter.category && isFeedbackCategory(filter.category) ? filter.category : undefined,
      status: filter.status && isFeedbackStatus(filter.status) ? filter.status : undefined,
      search: filter.search,
      page: filter.page,
      limit: filter.limit,
      sortBy: filter.sortBy,
      sortOrder: filter.sortOrder,
    });
  }

  async getFeedbackById(actor: Actor, id: string): Promise<FeedbackItem> {
    const record = await this.store.findFeedbackById(id);
    if (!record) {
      throw new DomainError("not_found", "بازخورد مورد نظر یافت نشد.");
    }

    // Ownership or Admin check
    if (record.userId !== actor.userId && actor.role !== "platform_admin" && actor.role !== "content_worker") {
      throw new DomainError("forbidden", "شما اجازه مشاهده این بازخورد را ندارید.");
    }

    return toFeedbackItem(record);
  }

  async respondFeedback(
    actor: Actor,
    id: string,
    input: {
      adminResponse?: string | null;
      status?: string;
    },
  ): Promise<FeedbackItem> {
    this.assertAdmin(actor);

    const existing = await this.store.findFeedbackById(id);
    if (!existing) {
      throw new DomainError("not_found", "بازخورد مورد نظر یافت نشد.");
    }

    const newStatus: FeedbackStatus =
      input.status && isFeedbackStatus(input.status)
        ? input.status
        : input.adminResponse
        ? "answered"
        : existing.status;

    if (!canTransitionFeedbackStatus(existing.status, newStatus)) {
      throw new DomainError(
        "bad_request",
        `امکان تغییر وضعیت بازخورد از ${existing.status} به ${newStatus} وجود ندارد.`,
      );
    }

    const updated = await this.store.updateFeedback(id, {
      status: newStatus,
      adminResponse: input.adminResponse !== undefined ? input.adminResponse : existing.adminResponse,
      respondedBy: actor.userId,
      respondedAt: new Date(),
    });

    if (!updated) {
      throw new DomainError("not_found", "خطا در به‌روزرسانی بازخورد.");
    }

    // Emit Audit Event
    if (this.auditService) {
      await this.auditService.emit([
        auditFeedbackResponded(actor.userId, id, newStatus),
      ]);
    }

    // Notify User
    if (this.notificationService && input.adminResponse && input.adminResponse.trim().length > 0) {
      await this.notificationService.createForUser(existing.userId, {
        type: "feedback_answered",
        title: "پاسخ به بازخورد شما",
        message: `پاسخی برای بازخورد «${existing.title}» ثبت شد.`,
        actionUrl: `/account/support?tab=my_requests&id=${id}`,
        idempotencyKey: `feedback_reply:${id}:${updated.updatedAt}`,
      });
    }

    return toFeedbackItem(updated);
  }

  // -------------------------------------------------------------------------
  // Support Ticket Methods (User & Admin)
  // -------------------------------------------------------------------------

  async createTicket(
    actor: Actor,
    input: {
      category: string;
      priority?: string;
      title: string;
      description: string;
      attachmentUrl?: string | null;
    },
  ): Promise<SupportTicketItem> {
    if (!isTicketCategory(input.category)) {
      throw new DomainError(
        "bad_request",
        "دسته‌بندی تیکت پشتیبانی نامعتبر است.",
      );
    }
    const priority: TicketPriority =
      input.priority && isTicketPriority(input.priority) ? input.priority : "medium";

    if (!input.title || input.title.trim().length < 3) {
      throw new DomainError(
        "bad_request",
        "عنوان تیکت باید حداقل ۳ کاراکتر باشد.",
      );
    }
    if (!input.description || input.description.trim().length < 10) {
      throw new DomainError(
        "bad_request",
        "متن درخواست پشتیبانی باید حداقل ۱۰ کاراکتر باشد.",
      );
    }

    const record = await this.store.createTicket({
      userId: actor.userId,
      category: input.category,
      priority,
      title: input.title.trim(),
      description: input.description.trim(),
      attachmentUrl: input.attachmentUrl?.trim() || null,
    });

    return toSupportTicketItem(record);
  }

  async listUserTickets(
    actor: Actor,
    options?: { status?: string; page?: number; limit?: number },
  ): Promise<ListSupportTicketsResult> {
    const status = options?.status && isTicketStatus(options.status) ? options.status : undefined;
    return this.store.listTickets({
      userId: actor.userId,
      status,
      page: options?.page,
      limit: options?.limit,
    });
  }

  async listAdminTickets(
    actor: Actor,
    filter: {
      category?: string;
      priority?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: "lastActivityAt" | "createdAt";
      sortOrder?: "asc" | "desc";
    },
  ): Promise<ListSupportTicketsResult> {
    this.assertAdmin(actor);

    return this.store.listTickets({
      category: filter.category && isTicketCategory(filter.category) ? filter.category : undefined,
      priority: filter.priority && isTicketPriority(filter.priority) ? filter.priority : undefined,
      status: filter.status && isTicketStatus(filter.status) ? filter.status : undefined,
      search: filter.search,
      page: filter.page,
      limit: filter.limit,
      sortBy: filter.sortBy,
      sortOrder: filter.sortOrder,
    });
  }

  async getTicketDetails(
    actor: Actor,
    id: string,
  ): Promise<SupportTicketItem> {
    const ticket = await this.store.findTicketById(id);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    const isAdmin = actor.role === "platform_admin" || actor.role === "content_worker";

    // Strict IDOR Check
    if (ticket.userId !== actor.userId && !isAdmin) {
      throw new DomainError("forbidden", "شما اجازه مشاهده این تیکت را ندارید.");
    }

    // Fetch messages (Internal notes only if admin)
    const messages = await this.store.listMessagesByTicketId(id, isAdmin);

    return toSupportTicketItem(ticket, messages);
  }

  async sendUserMessage(
    actor: Actor,
    ticketId: string,
    input: {
      body: string;
      attachmentUrl?: string | null;
    },
  ): Promise<SupportMessageItem> {
    const ticket = await this.store.findTicketById(ticketId);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    if (ticket.userId !== actor.userId) {
      throw new DomainError("forbidden", "شما اجازه ارسال پیام در این تیکت را ندارید.");
    }

    if (ticket.status === "closed") {
      throw new DomainError(
        "bad_request",
        "این تیکت بسته شده است. برای ارسال پیام جدید ابتدا تیکت را بازگشایی کنید یا تیکت جدید بسازید.",
      );
    }

    if (!input.body || input.body.trim().length === 0) {
      throw new DomainError("bad_request", "متن پیام نمی‌تواند خالی باشد.");
    }

    const message = await this.store.createMessage({
      ticketId,
      senderId: actor.userId,
      senderRole: "user",
      body: input.body.trim(),
      attachmentUrl: input.attachmentUrl?.trim() || null,
      isInternalNote: false,
    });

    // Auto-transition from WAITING_FOR_USER / ANSWERED back to IN_PROGRESS
    if (ticket.status === "waiting_for_user" || ticket.status === "answered") {
      await this.store.updateTicket(ticketId, {
        status: "in_progress",
        lastActivityAt: new Date(),
      });
    }

    return toSupportMessageItem(message);
  }

  async sendAdminMessage(
    actor: Actor,
    ticketId: string,
    input: {
      body: string;
      attachmentUrl?: string | null;
      isInternalNote?: boolean;
      newStatus?: string;
    },
  ): Promise<SupportMessageItem> {
    this.assertAdmin(actor);

    const ticket = await this.store.findTicketById(ticketId);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    if (!input.body || input.body.trim().length === 0) {
      throw new DomainError("bad_request", "متن پیام نمی‌تواند خالی باشد.");
    }

    const isInternal = Boolean(input.isInternalNote);

    const message = await this.store.createMessage({
      ticketId,
      senderId: actor.userId,
      senderRole: "admin",
      body: input.body.trim(),
      attachmentUrl: input.attachmentUrl?.trim() || null,
      isInternalNote: isInternal,
    });

    // If public response, auto-transition to ANSWERED (or specified newStatus) and notify user
    if (!isInternal) {
      const targetStatus: TicketStatus =
        input.newStatus && isTicketStatus(input.newStatus)
          ? input.newStatus
          : "answered";

      if (ticket.status !== targetStatus) {
        await this.store.updateTicket(ticketId, {
          status: targetStatus,
          lastActivityAt: new Date(),
        });
      }

      // Notify User
      if (this.notificationService) {
        await this.notificationService.createForUser(ticket.userId, {
          type: "support_ticket_replied",
          title: "پاسخ جدید در تیکت پشتیبانی",
          message: `پشتیبانی به تیکت «${ticket.title}» پاسخ داد.`,
          actionUrl: `/account/support?tab=my_requests&ticketId=${ticketId}`,
          idempotencyKey: `ticket_reply:${message.id}`,
        });
      }
    }

    // Audit Event
    if (this.auditService) {
      await this.auditService.emit([
        auditTicketReplied(actor.userId, ticketId, message.id, isInternal),
      ]);
    }

    return toSupportMessageItem(message);
  }

  async updateTicketStatus(
    actor: Actor,
    ticketId: string,
    targetStatus: string,
  ): Promise<SupportTicketItem> {
    this.assertAdmin(actor);

    if (!isTicketStatus(targetStatus)) {
      throw new DomainError("bad_request", "وضعیت تیکت نامعتبر است.");
    }

    const ticket = await this.store.findTicketById(ticketId);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    if (!canTransitionTicketStatus(ticket.status, targetStatus)) {
      throw new DomainError(
        "bad_request",
        `امکان تغییر وضعیت از ${ticket.status} به ${targetStatus} وجود ندارد.`,
      );
    }

    const isClosing = targetStatus === "closed";
    const updated = await this.store.updateTicket(ticketId, {
      status: targetStatus,
      closedAt: isClosing ? new Date() : null,
    });

    if (!updated) {
      throw new DomainError("not_found", "خطا در به‌روزرسانی وضعیت تیکت.");
    }

    // Audit Event
    if (this.auditService) {
      await this.auditService.emit([
        auditTicketStatusChanged(actor.userId, ticketId, ticket.status, targetStatus),
      ]);
    }

    // Notify User on major status changes
    if (this.notificationService && targetStatus !== ticket.status) {
      const statusTitle =
        targetStatus === "closed"
          ? "تیکت بسته شد"
          : targetStatus === "waiting_for_user"
          ? "منتظر پاسخ شما"
          : "تغییر وضعیت تیکت";

      await this.notificationService.createForUser(ticket.userId, {
        type: "support_ticket_status_changed",
        title: statusTitle,
        message: `وضعیت تیکت «${ticket.title}» به ${this.getPersianTicketStatus(targetStatus)} تغییر یافت.`,
        actionUrl: `/account/support?tab=my_requests&ticketId=${ticketId}`,
        idempotencyKey: `ticket_status:${ticketId}:${targetStatus}:${Date.now()}`,
      });
    }

    return toSupportTicketItem(updated);
  }

  async reopenUserTicket(
    actor: Actor,
    ticketId: string,
  ): Promise<SupportTicketItem> {
    const ticket = await this.store.findTicketById(ticketId);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    if (ticket.userId !== actor.userId && actor.role !== "platform_admin") {
      throw new DomainError("forbidden", "شما اجازه بازگشایی این تیکت را ندارید.");
    }

    if (ticket.status !== "closed") {
      throw new DomainError("bad_request", "این تیکت در حال حاضر باز است.");
    }

    const updated = await this.store.updateTicket(ticketId, {
      status: "open",
      closedAt: null,
      lastActivityAt: new Date(),
    });

    if (!updated) {
      throw new DomainError("not_found", "خطا در بازگشایی تیکت.");
    }

    if (this.auditService) {
      await this.auditService.emit([
        auditTicketStatusChanged(actor.userId, ticketId, "closed", "open"),
      ]);
    }

    return toSupportTicketItem(updated);
  }

  async updateTicketPriority(
    actor: Actor,
    ticketId: string,
    newPriority: string,
  ): Promise<SupportTicketItem> {
    this.assertAdmin(actor);

    if (!isTicketPriority(newPriority)) {
      throw new DomainError("bad_request", "اولویت تیکت نامعتبر است.");
    }

    const ticket = await this.store.findTicketById(ticketId);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    const updated = await this.store.updateTicket(ticketId, {
      priority: newPriority,
    });

    if (!updated) {
      throw new DomainError("not_found", "خطا در به‌روزرسانی اولویت.");
    }

    if (this.auditService) {
      await this.auditService.emit([
        auditTicketPriorityChanged(actor.userId, ticketId, ticket.priority, newPriority),
      ]);
    }

    return toSupportTicketItem(updated);
  }

  async updateTicketCategory(
    actor: Actor,
    ticketId: string,
    newCategory: string,
  ): Promise<SupportTicketItem> {
    this.assertAdmin(actor);

    if (!isTicketCategory(newCategory)) {
      throw new DomainError("bad_request", "دسته‌بندی تیکت نامعتبر است.");
    }

    const ticket = await this.store.findTicketById(ticketId);
    if (!ticket) {
      throw new DomainError("not_found", "تیکت پشتیبانی مورد نظر یافت نشد.");
    }

    const updated = await this.store.updateTicket(ticketId, {
      category: newCategory,
    });

    if (!updated) {
      throw new DomainError("not_found", "خطا در به‌روزرسانی دسته‌بندی.");
    }

    if (this.auditService) {
      await this.auditService.emit([
        auditTicketCategoryChanged(actor.userId, ticketId, ticket.category, newCategory),
      ]);
    }

    return toSupportTicketItem(updated);
  }

  // -------------------------------------------------------------------------
  // Attachment Security Validation
  // -------------------------------------------------------------------------

  async verifyAttachmentAccess(
    actor: Actor,
    storageKey: string,
  ): Promise<void> {
    if (actor.role === "platform_admin" || actor.role === "content_worker") {
      return;
    }

    const owner = await this.store.findAttachmentOwner(storageKey);
    if (!owner || owner.userId !== actor.userId) {
      throw new DomainError(
        "forbidden",
        "شما اجازه دسترسی به این فایل ضمیمه را ندارید.",
      );
    }
  }

  private assertAdmin(actor: Actor) {
    if (actor.role !== "platform_admin" && actor.role !== "content_worker") {
      throw new DomainError(
        "forbidden",
        "دسترسی به این بخش تنها برای مدیران سیستم مجاز است.",
      );
    }
  }

  private getPersianTicketStatus(status: TicketStatus): string {
    switch (status) {
      case "open":
        return "در انتظار بررسی";
      case "in_progress":
        return "در حال بررسی";
      case "waiting_for_user":
        return "در انتظار پاسخ کاربر";
      case "answered":
        return "پاسخ داده شده";
      case "closed":
        return "بسته شده";
      default:
        return status;
    }
  }
}
