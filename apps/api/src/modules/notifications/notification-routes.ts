import type { FastifyPluginAsync } from "fastify";
import {
  asUserId,
  DomainError,
  parseNotificationId,
  type UserId,
} from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { UserStore } from "../identity/user-store.js";
import type { NotificationService } from "./notification-service.js";

export interface NotificationRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: UserStore;
  notificationService: NotificationService;
}

function getRequestUserId(request: unknown): UserId {
  const req = request as {
    user?: { userId: string };
    actor?: { userId: string };
  };
  const rawId = req.user?.userId ?? req.actor?.userId;
  if (!rawId) {
    throw new DomainError("unauthorized", "Not signed in");
  }
  return asUserId(rawId as Parameters<typeof asUserId>[0]);
}

export const notificationRoutes: FastifyPluginAsync<
  NotificationRouteOptions
> = async (app, opts) => {
  const { sessionService, userStore, notificationService } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  /**
   * GET /v1/notifications
   * List user notifications with pagination and unread counts.
   */
  app.get("/v1/notifications", { preHandler: [requireAuth] }, async (request) => {
    const userId = getRequestUserId(request);
    const query = (request.query ?? {}) as {
      page?: string;
      limit?: string;
      unread_only?: string | boolean;
      status?: string;
    };

    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const unreadOnly =
      query.unread_only === true ||
      query.unread_only === "true" ||
      query.status === "unread";

    const result = await notificationService.listForUser(userId, {
      page: Number.isNaN(page) ? 1 : page,
      limit: Number.isNaN(limit) ? 20 : limit,
      unreadOnly,
    });

    return {
      items: result.items,
      total: result.total,
      unread_count: result.unreadCount,
      page: result.page,
      limit: result.limit,
    };
  });

  /**
   * GET /v1/notifications/unread-count
   * Fast unread count lookup for badge rendering.
   */
  app.get(
    "/v1/notifications/unread-count",
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = getRequestUserId(request);
      const unreadCount = await notificationService.getUnreadCount(userId);
      return { unread_count: unreadCount };
    },
  );

  /**
   * PATCH /v1/notifications/:id/read
   * Mark a single notification as read.
   */
  app.patch(
    "/v1/notifications/:id/read",
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = getRequestUserId(request);
      const params = request.params as { id: string };

      let notificationId;
      try {
        notificationId = parseNotificationId(params.id, "notificationId");
      } catch {
        throw new DomainError("bad_request", "شناسه اعلان نامعتبر است.");
      }

      const updated = await notificationService.markAsRead(
        notificationId,
        userId,
      );

      if (!updated) {
        throw new DomainError("not_found", "اعلان مورد نظر یافت نشد.");
      }

      return { notification: updated };
    },
  );

  /**
   * POST /v1/notifications/read-all
   * Mark all notifications of authenticated user as read.
   */
  app.post(
    "/v1/notifications/read-all",
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = getRequestUserId(request);
      const result = await notificationService.markAllAsRead(userId);
      return { success: true, updated_count: result.updatedCount };
    },
  );
};
