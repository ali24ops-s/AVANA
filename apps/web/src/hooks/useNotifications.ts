/**
 * React Query hooks for AVANA Notifications.
 *
 * Implements 30-second polling and automatic query cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createNotificationsApi,
  type ListNotificationsParams,
} from "../lib/api/notifications.js";

function getNotificationsApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createNotificationsApi(client);
}

/**
 * Fetch paginated notifications for current user with 30s background polling.
 */
export function useNotifications(
  params: ListNotificationsParams = {},
  options?: { enabled?: boolean },
) {
  const api = getNotificationsApi();
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => api.getNotifications(params),
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: options?.enabled !== false,
  });
}

/**
 * Fetch unread notifications count for badge display with 30s polling.
 */
export function useUnreadNotificationCount(options?: { enabled?: boolean }) {
  const api = getNotificationsApi();
  return useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api.getUnreadCount(),
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: options?.enabled !== false,
  });
}

/**
 * Mark a single notification as read.
 */
export function useMarkNotificationAsRead() {
  const api = getNotificationsApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.markAsRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    },
  });
}

/**
 * Mark all notifications as read.
 */
export function useMarkAllNotificationsAsRead() {
  const api = getNotificationsApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.markAllAsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["notifications-unread-count"],
      });
    },
  });
}
