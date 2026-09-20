import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createSupportApi } from "../lib/api/support.js";

export function getSupportApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createSupportApi(client);
}

// ============================================================================
// User Support Hooks
// ============================================================================

export function useMyTickets(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const api = getSupportApi();
  return useQuery({
    queryKey: ["my-support-tickets", params?.status, params?.page, params?.limit],
    queryFn: () => api.getMyTickets(params),
    staleTime: 10_000,
  });
}

export function useMyTicketDetails(id: string | null) {
  const api = getSupportApi();
  return useQuery({
    queryKey: ["my-support-ticket", id],
    queryFn: () => (id ? api.getTicket(id) : null),
    enabled: Boolean(id),
    staleTime: 5_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: (input: Parameters<typeof api.createTicket>[0]) =>
      api.createTicket(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
  });
}

export function useSendTicketMessage() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: ({
      ticketId,
      body,
      attachmentUrl,
    }: {
      ticketId: string;
      body: string;
      attachmentUrl?: string | null;
    }) => api.sendMessage(ticketId, { body, attachmentUrl }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["my-support-ticket", variables.ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
  });
}

export function useReopenTicket() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: (ticketId: string) => api.reopenTicket(ticketId),
    onSuccess: (_, ticketId) => {
      void queryClient.invalidateQueries({
        queryKey: ["my-support-ticket", ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
  });
}

export function useMyFeedbacks(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const api = getSupportApi();
  return useQuery({
    queryKey: ["my-feedbacks", params?.status, params?.page, params?.limit],
    queryFn: () => api.getMyFeedbacks(params),
    staleTime: 10_000,
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: (input: Parameters<typeof api.createFeedback>[0]) =>
      api.createFeedback(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-feedbacks"] });
    },
  });
}

// ============================================================================
// Admin Support Hooks
// ============================================================================

export function useAdminTickets(params?: {
  category?: string;
  priority?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: "lastActivityAt" | "createdAt";
  sortOrder?: "asc" | "desc";
}) {
  const api = getSupportApi();
  return useQuery({
    queryKey: [
      "admin-support-tickets",
      params?.category,
      params?.priority,
      params?.status,
      params?.search,
      params?.page,
      params?.limit,
      params?.sortBy,
      params?.sortOrder,
    ],
    queryFn: () => api.listAdminTickets(params),
    staleTime: 10_000,
  });
}

export function useAdminTicketDetails(id: string | null) {
  const api = getSupportApi();
  return useQuery({
    queryKey: ["admin-support-ticket", id],
    queryFn: () => (id ? api.getAdminTicket(id) : null),
    enabled: Boolean(id),
    staleTime: 5_000,
  });
}

export function useAdminFeedbacks(params?: {
  type?: string;
  category?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}) {
  const api = getSupportApi();
  return useQuery({
    queryKey: [
      "admin-feedbacks",
      params?.type,
      params?.category,
      params?.status,
      params?.search,
      params?.page,
      params?.limit,
      params?.sortBy,
      params?.sortOrder,
    ],
    queryFn: () => api.listAdminFeedbacks(params),
    staleTime: 10_000,
  });
}

export function useAdminSendTicketMessage() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: ({
      ticketId,
      body,
      attachmentUrl,
      isInternalNote,
      newStatus,
    }: {
      ticketId: string;
      body: string;
      attachmentUrl?: string | null;
      isInternalNote?: boolean;
      newStatus?: string;
    }) =>
      api.sendAdminMessage(ticketId, {
        body,
        attachmentUrl,
        isInternalNote,
        newStatus,
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-support-ticket", variables.ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });
}

export function useAdminUpdateTicketStatus() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: ({
      ticketId,
      status,
    }: {
      ticketId: string;
      status: string;
    }) => api.updateTicketStatus(ticketId, status),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-support-ticket", variables.ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });
}

export function useAdminUpdateTicketPriority() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: ({
      ticketId,
      priority,
    }: {
      ticketId: string;
      priority: string;
    }) => api.updateTicketPriority(ticketId, priority),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-support-ticket", variables.ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });
}

export function useAdminUpdateTicketCategory() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: ({
      ticketId,
      category,
    }: {
      ticketId: string;
      category: string;
    }) => api.updateTicketCategory(ticketId, category),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-support-ticket", variables.ticketId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });
}

export function useAdminRespondFeedback() {
  const queryClient = useQueryClient();
  const api = getSupportApi();

  return useMutation({
    mutationFn: ({
      feedbackId,
      adminResponse,
      status,
    }: {
      feedbackId: string;
      adminResponse?: string | null;
      status?: string;
    }) => api.respondFeedback(feedbackId, { adminResponse, status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-feedbacks"] });
    },
  });
}
