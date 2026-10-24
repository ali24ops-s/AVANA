import { generateUUID, getApiBaseUrl, type ApiClient } from "./client.js";
import { ApiError } from "./errors.js";
import type { ErrorEnvelope } from "@avana/contracts";
import type {
  FeedbackCategory,
  FeedbackItem,
  FeedbackType,
  SupportMessageItem,
  SupportTicketItem,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@avana/domain";

export interface DownloadAttachmentResult {
  blob: Blob;
  objectUrl: string;
  filename: string;
  mimeType: string;
}

/**
 * Safely resolves an attachment URL to avoid duplicate base URLs
 * or hitting SPA frontend routing when API is on another origin.
 */
export function resolveAttachmentUrl(attachmentUrl: string): string {
  if (!attachmentUrl) return "";
  const trimmed = attachmentUrl.trim();

  // Guard against path traversal
  if (trimmed.includes("..")) {
    throw new Error("مسیر فایل ضمیمه نامعتبر است.");
  }

  // Blob and data URLs are used for local previews
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();

  // If already absolute URL, verify it targets our API or frontend origin
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const allowedOrigins = [
        typeof window !== "undefined" ? window.location.origin : "",
        baseUrl ? new URL(baseUrl, fallbackOrigin).origin : "",
      ].filter(Boolean);

      if (allowedOrigins.length > 0 && !allowedOrigins.includes(parsed.origin)) {
        throw new Error("دامنه فایل ضمیمه نامعتبر است.");
      }
      return trimmed;
    } catch (err: unknown) {
      if ((err as Error)?.message === "دامنه فایل ضمیمه نامعتبر است.") throw err;
      throw new Error("آدرس فایل ضمیمه نامعتبر است.");
    }
  }

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

/**
 * Safely fetches a support/feedback attachment with authentication credentials and x-request-id.
 * Returns the Blob, a newly created object URL, and the parsed filename.
 */
export async function downloadAttachment(
  attachmentUrl: string,
  options?: { fallbackFilename?: string },
): Promise<DownloadAttachmentResult> {
  const url = resolveAttachmentUrl(attachmentUrl);
  const requestId = generateUUID();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "x-request-id": requestId,
      },
    });
  } catch {
    throw new Error("خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.");
  }

  if (!res.ok) {
    let errorMessage = "";
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = await res.json();
        if (errorData?.message) {
          errorMessage = errorData.message;
        } else if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        }
      }
    } catch {
      // ignore json parsing errors
    }

    if (!errorMessage) {
      if (res.status === 401) {
        errorMessage = "نشست کاربری شما منقضی شده است. لطفاً دوباره وارد شوید.";
      } else if (res.status === 403) {
        errorMessage = "شما دسترسی لازم برای مشاهده یا دانلود این فایل ضمیمه را ندارید.";
      } else if (res.status === 404) {
        errorMessage = "فایل ضمیمه مورد نظر در سرور یافت نشد یا حذف شده است.";
      } else {
        errorMessage = "خطا در دریافت فایل ضمیمه.";
      }
    }

    throw new Error(errorMessage);
  }

  // Parse filename from Content-Disposition if present
  let filename = options?.fallbackFilename || "attachment";
  const disposition = res.headers.get("content-disposition");
  if (disposition) {
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        filename = decodeURIComponent(utf8Match[1].trim());
      } catch {
        // fallback
      }
    } else {
      const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
      if (asciiMatch?.[1]) {
        filename = asciiMatch[1].trim();
      }
    }
  } else {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const urlObj = new URL(url, origin);
      const parts = urlObj.pathname.split("/");
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        filename = decodeURIComponent(lastPart);
      }
    } catch {
      // fallback
    }
  }

  const blob = await res.blob();
  const mimeType = res.headers.get("content-type") || blob.type || "application/octet-stream";
  const objectUrl =
    typeof window !== "undefined" && window.URL
      ? window.URL.createObjectURL(blob)
      : "";

  return { blob, objectUrl, filename, mimeType };
}

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

  markMessagesAsRead(
    ticketId: string,
    messageIds: string[],
  ): Promise<{ success: boolean; markedCount: number }>;

  uploadAttachment(file: File): Promise<UploadAttachmentResponse>;

  downloadAttachment(
    attachmentUrl: string,
    options?: { fallbackFilename?: string },
  ): Promise<DownloadAttachmentResult>;

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

    async markMessagesAsRead(ticketId, messageIds) {
      return client.post<{ success: boolean; markedCount: number }>(
        `/v1/support/tickets/${ticketId}/messages/read`,
        { message_ids: messageIds },
      );
    },

    async uploadAttachment(file: File): Promise<UploadAttachmentResponse> {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const url = `${getApiBaseUrl()}/v1/support/attachments`;
      const response = await fetch(url, {
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
            code:
              (errorData?.error?.code as ErrorEnvelope["error"]["code"]) ||
              "internal_error",
            message:
              errorData?.error?.message ||
              "بارگذاری فایل ضمیمه با خطا مواجه شد.",
          },
        });
      }

      return data as UploadAttachmentResponse;
    },

    async downloadAttachment(attachmentUrl, options) {
      return downloadAttachment(attachmentUrl, options);
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
