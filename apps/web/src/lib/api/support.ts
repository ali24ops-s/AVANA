import { generateUUID, type ApiClient } from "./client.js";
import { ApiError } from "./errors.js";
import type {
  FeedbackCategory,
  FeedbackItem,
  FeedbackStatus,
  FeedbackType,
  SupportMessageItem,
  SupportTicketItem,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@avana/domain";

export interface ListFeedbackResponse {
  items: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListTicketsResponse {
  items: SupportTicketItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UploadAttachmentResponse {
  attachment_url: string;
  storage_key: string;
}

export interface SupportApi {
  // User APIs
  createFeedback(input: {
    type: FeedbackType | string;
    category: FeedbackCategory | string;
    title: string;
    description: string;
    attachmentUrl?: string | null;
  }): Promise<{ feedback: FeedbackItem }>;

  getMyFeedbacks(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ListFeedbackResponse>;

  getFeedback(id: string): Promise<{ feedback: FeedbackItem }>;

  createTicket(input: {
    category: TicketCategory | string;
    priority?: TicketPriority | string;
    title: string;
    description: string;
    attachmentUrl?: string | null;
  }): Promise<{ ticket: SupportTicketItem }>;

  getMyTickets(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ListTicketsResponse>;

  getTicket(id: string): Promise<{ ticket: SupportTicketItem }>;

  sendMessage(
    ticketId: string,
    input: {
      body: string;
      attachmentUrl?: string | null;
    },
  ): Promise<{ message: SupportMessageItem }>;

  reopenTicket(ticketId: string): Promise<{ ticket: SupportTicketItem }>;

  uploadAttachment(file: File): Promise<UploadAttachmentResponse>;

  // Admin APIs
  listAdminFeedbacks(params?: {
    type?: string;
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: "createdAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
  }): Promise<ListFeedbackResponse>;

  getAdminFeedback(id: string): Promise<{ feedback: FeedbackItem }>;

  respondFeedback(
    id: string,
    input: {
      adminResponse?: string | null;
      status?: string;
    },
  ): Promise<{ feedback: FeedbackItem }>;

  listAdminTickets(params?: {
    category?: string;
    priority?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: "lastActivityAt" | "createdAt";
    sortOrder?: "asc" | "desc";
  }): Promise<ListTicketsResponse>;

  getAdminTicket(id: string): Promise<{ ticket: SupportTicketItem }>;

  sendAdminMessage(
    ticketId: string,
    input: {
      body: string;
      attachmentUrl?: string | null;
      isInternalNote?: boolean;
      newStatus?: string;
    },
  ): Promise<{ message: SupportMessageItem }>;

  updateTicketStatus(
    ticketId: string,
    status: TicketStatus | string,
  ): Promise<{ ticket: SupportTicketItem }>;

  updateTicketPriority(
    ticketId: string,
    priority: TicketPriority | string,
  ): Promise<{ ticket: SupportTicketItem }>;

  updateTicketCategory(
    ticketId: string,
    category: TicketCategory | string,
  ): Promise<{ ticket: SupportTicketItem }>;
}

export function createSupportApi(client: ApiClient): SupportApi {
  return {
    async createFeedback(input) {
      return client.post<{ feedback: FeedbackItem }>("/v1/feedback", {
        type: input.type,
        category: input.category,
        title: input.title,
        description: input.description,
        attachment_url: input.attachmentUrl,
      });
    },

    async getMyFeedbacks(params) {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.page) query.set("page", params.page.toString());
      if (params?.limit) query.set("limit", params.limit.toString());
      const qs = query.toString();
      return client.get<ListFeedbackResponse>(
        `/v1/feedback/my${qs ? `?${qs}` : ""}`,
      );
    },

    async getFeedback(id) {
      return client.get<{ feedback: FeedbackItem }>(`/v1/feedback/${id}`);
    },

    async createTicket(input) {
      return client.post<{ ticket: SupportTicketItem }>("/v1/support/tickets", {
        category: input.category,
        priority: input.priority,
        title: input.title,
        description: input.description,
        attachment_url: input.attachmentUrl,
      });
    },

    async getMyTickets(params) {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.page) query.set("page", params.page.toString());
      if (params?.limit) query.set("limit", params.limit.toString());
      const qs = query.toString();
      return client.get<ListTicketsResponse>(
        `/v1/support/tickets/my${qs ? `?${qs}` : ""}`,
      );
    },

    async getTicket(id) {
      return client.get<{ ticket: SupportTicketItem }>(
        `/v1/support/tickets/${id}`,
      );
    },

    async sendMessage(ticketId, input) {
      return client.post<{ message: SupportMessageItem }>(
        `/v1/support/tickets/${ticketId}/messages`,
        {
          body: input.body,
          attachment_url: input.attachmentUrl,
        },
      );
    },

    async reopenTicket(ticketId) {
      return client.post<{ ticket: SupportTicketItem }>(
        `/v1/support/tickets/${ticketId}/reopen`,
      );
    },

    async uploadAttachment(file: File): Promise<UploadAttachmentResponse> {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await fetch("/v1/support/attachments", {
        method: "POST",
        headers: {
          "x-request-id": generateUUID(),
        },
        credentials: "include",
        body: formData,
      });

      let data: unknown;
      try {
        if (typeof response.text === "function") {
          const text = await response.text();
          data = text ? JSON.parse(text) : undefined;
        } else if (typeof response.json === "function") {
          data = await response.json();
        }
      } catch {
        data = null;
      }

      if (!response.ok) {
        const errorData = data as { error?: { code?: string; message?: string } };
        throw new ApiError({
          request_id: response.headers.get("x-request-id") || generateUUID(),
          error: {
            code: (errorData?.error?.code as any) || "internal_error",
            message:
              errorData?.error?.message ||
              "بارگذاری فایل ضمیمه با خطا مواجه شد.",
          },
        });
      }

      return data as UploadAttachmentResponse;
    },

    // Admin APIs
    async listAdminFeedbacks(params) {
      const query = new URLSearchParams();
      if (params?.type) query.set("type", params.type);
      if (params?.category) query.set("category", params.category);
      if (params?.status) query.set("status", params.status);
      if (params?.search) query.set("search", params.search);
      if (params?.page) query.set("page", params.page.toString());
      if (params?.limit) query.set("limit", params.limit.toString());
      if (params?.sortBy) query.set("sortBy", params.sortBy);
      if (params?.sortOrder) query.set("sortOrder", params.sortOrder);
      const qs = query.toString();
      return client.get<ListFeedbackResponse>(
        `/v1/admin/feedback${qs ? `?${qs}` : ""}`,
      );
    },

    async getAdminFeedback(id) {
      return client.get<{ feedback: FeedbackItem }>(`/v1/admin/feedback/${id}`);
    },

    async respondFeedback(id, input) {
      return client.patch<{ feedback: FeedbackItem }>(
        `/v1/admin/feedback/${id}`,
        {
          admin_response: input.adminResponse,
          status: input.status,
        },
      );
    },

    async listAdminTickets(params) {
      const query = new URLSearchParams();
      if (params?.category) query.set("category", params.category);
      if (params?.priority) query.set("priority", params.priority);
      if (params?.status) query.set("status", params.status);
      if (params?.search) query.set("search", params.search);
      if (params?.page) query.set("page", params.page.toString());
      if (params?.limit) query.set("limit", params.limit.toString());
      if (params?.sortBy) query.set("sortBy", params.sortBy);
      if (params?.sortOrder) query.set("sortOrder", params.sortOrder);
      const qs = query.toString();
      return client.get<ListTicketsResponse>(
        `/v1/admin/support/tickets${qs ? `?${qs}` : ""}`,
      );
    },

    async getAdminTicket(id) {
      return client.get<{ ticket: SupportTicketItem }>(
        `/v1/admin/support/tickets/${id}`,
      );
    },

    async sendAdminMessage(ticketId, input) {
      return client.post<{ message: SupportMessageItem }>(
        `/v1/admin/support/tickets/${ticketId}/messages`,
        {
          body: input.body,
          attachment_url: input.attachmentUrl,
          is_internal_note: input.isInternalNote,
          new_status: input.newStatus,
        },
      );
    },

    async updateTicketStatus(ticketId, status) {
      return client.patch<{ ticket: SupportTicketItem }>(
        `/v1/admin/support/tickets/${ticketId}/status`,
        { status },
      );
    },

    async updateTicketPriority(ticketId, priority) {
      return client.patch<{ ticket: SupportTicketItem }>(
        `/v1/admin/support/tickets/${ticketId}/priority`,
        { priority },
      );
    },

    async updateTicketCategory(ticketId, category) {
      return client.patch<{ ticket: SupportTicketItem }>(
        `/v1/admin/support/tickets/${ticketId}/category`,
        { category },
      );
    },
  };
}
