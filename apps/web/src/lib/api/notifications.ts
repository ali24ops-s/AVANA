/**
 * Typed Notifications API Client for AVANA.
 */

import type { NotificationItem } from "@avana/domain";
import type { ApiClient } from "./client.js";

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  unread_only?: boolean;
}

export interface ListNotificationsResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
  page: number;
  limit: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface MarkAsReadResponse {
  notification: NotificationItem;
}

export interface MarkAllAsReadResponse {
  success: boolean;
  updated_count: number;
}

export function createNotificationsApi(client: ApiClient) {
  return {
    async getNotifications(
      params: ListNotificationsParams = {},
    ): Promise<ListNotificationsResponse> {
      const query = new URLSearchParams();
      if (params.page !== undefined) query.set("page", String(params.page));
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      if (params.unread_only !== undefined)
        query.set("unread_only", String(params.unread_only));

      const qs = query.toString();
      return client.get<ListNotificationsResponse>(
        `/v1/notifications${qs ? `?${qs}` : ""}`,
      );
    },

    async getUnreadCount(): Promise<UnreadCountResponse> {
      return client.get<UnreadCountResponse>("/v1/notifications/unread-count");
    },

    async markAsRead(id: string): Promise<MarkAsReadResponse> {
      return client.patch<MarkAsReadResponse>(
        `/v1/notifications/${encodeURIComponent(id)}/read`,
      );
    },

    async markAllAsRead(): Promise<MarkAllAsReadResponse> {
      return client.post<MarkAllAsReadResponse>("/v1/notifications/read-all");
    },
  };
}
