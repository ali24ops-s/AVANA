import type {
  NotificationId,
  NotificationType,
  UserId,
} from "@avana/domain";

export interface NotificationRecord {
  id: NotificationId;
  userId: UserId;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  actionUrl: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationInput {
  id?: NotificationId;
  userId: UserId;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  actionUrl?: string | null;
  idempotencyKey?: string | null;
}

export interface ListNotificationsOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface ListNotificationsResult {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface NotificationStore {
  create(input: CreateNotificationInput): Promise<NotificationRecord | null>;
  findById(id: NotificationId, userId: UserId): Promise<NotificationRecord | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<NotificationRecord | null>;
  listForUser(
    userId: UserId,
    options?: ListNotificationsOptions,
  ): Promise<ListNotificationsResult>;
  getUnreadCount(userId: UserId): Promise<number>;
  markAsRead(id: NotificationId, userId: UserId): Promise<NotificationRecord | null>;
  markAllAsRead(userId: UserId): Promise<{ updatedCount: number }>;
  findRecentByUserIdAndType(
    userId: UserId,
    type: NotificationType,
    since: string,
  ): Promise<NotificationRecord | null>;
}
