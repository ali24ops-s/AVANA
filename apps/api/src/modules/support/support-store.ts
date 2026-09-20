import type {
  FeedbackCategory,
  FeedbackStatus,
  FeedbackType,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserId,
} from "@avana/domain";

export interface FeedbackRecord {
  id: string;
  userId: UserId;
  userName?: string;
  userEmail?: string;
  type: FeedbackType;
  category: FeedbackCategory;
  title: string;
  description: string;
  attachmentUrl: string | null;
  status: FeedbackStatus;
  adminResponse: string | null;
  respondedAt: string | null;
  respondedBy: UserId | null;
  responderName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketRecord {
  id: string;
  userId: UserId;
  userName?: string;
  userEmail?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  description: string;
  attachmentUrl: string | null;
  lastActivityAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface SupportMessageRecord {
  id: string;
  ticketId: string;
  senderId: UserId;
  senderRole: "user" | "admin";
  senderName?: string;
  senderEmail?: string;
  body: string;
  attachmentUrl: string | null;
  isInternalNote: boolean;
  createdAt: string;
}

export interface CreateFeedbackInput {
  userId: UserId;
  type: FeedbackType;
  category: FeedbackCategory;
  title: string;
  description: string;
  attachmentUrl?: string | null;
}

export interface ListFeedbackFilter {
  userId?: UserId;
  type?: FeedbackType;
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export interface ListFeedbackResult {
  items: FeedbackRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateSupportTicketInput {
  userId: UserId;
  category: TicketCategory;
  priority?: TicketPriority;
  title: string;
  description: string;
  attachmentUrl?: string | null;
}

export interface ListSupportTicketsFilter {
  userId?: UserId;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: "lastActivityAt" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export interface ListSupportTicketsResult {
  items: SupportTicketRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateSupportMessageInput {
  ticketId: string;
  senderId: UserId;
  senderRole: "user" | "admin";
  body: string;
  attachmentUrl?: string | null;
  isInternalNote?: boolean;
}

export interface SupportStore {
  // Feedback methods
  createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord>;
  findFeedbackById(id: string): Promise<FeedbackRecord | null>;
  listFeedbacks(filter: ListFeedbackFilter): Promise<ListFeedbackResult>;
  updateFeedback(
    id: string,
    updates: {
      status?: FeedbackStatus;
      adminResponse?: string | null;
      respondedBy?: UserId | null;
      respondedAt?: Date | null;
    },
  ): Promise<FeedbackRecord | null>;

  // Support Ticket methods
  createTicket(input: CreateSupportTicketInput): Promise<SupportTicketRecord>;
  findTicketById(id: string): Promise<SupportTicketRecord | null>;
  listTickets(filter: ListSupportTicketsFilter): Promise<ListSupportTicketsResult>;
  updateTicket(
    id: string,
    updates: {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      lastActivityAt?: Date;
      closedAt?: Date | null;
    },
  ): Promise<SupportTicketRecord | null>;

  // Message methods
  createMessage(input: CreateSupportMessageInput): Promise<SupportMessageRecord>;
  listMessagesByTicketId(
    ticketId: string,
    includeInternalNotes?: boolean,
  ): Promise<SupportMessageRecord[]>;

  // Ownership lookup for secure attachments
  findAttachmentOwner(
    storageKey: string,
  ): Promise<{ userId: UserId; ticketId?: string; feedbackId?: string } | null>;
}
