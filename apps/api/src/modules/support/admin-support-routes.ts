import type { FastifyPluginAsync } from "fastify";
import { DomainError, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { SupportService } from "./support-service.js";

export interface AdminSupportRouteOptions extends AuthMiddlewareDeps {
  supportService: SupportService;
}

export const adminSupportRoutes: FastifyPluginAsync<AdminSupportRouteOptions> =
  async (app, opts) => {
    const { requireAuth } = makeAuthMiddleware(opts);
    const supportService = opts.supportService;

    function getActor(request: unknown): Actor {
      const reqAny = request as {
        user?: { userId: string; email: string; role: string };
      };
      if (!reqAny.user) {
        throw new DomainError("unauthorized", "Not signed in");
      }
      return {
        userId: reqAny.user.userId as Actor["userId"],
        role: reqAny.user.role as Actor["role"],
      };
    }

    // -----------------------------------------------------------------------
    // Admin Feedback Endpoints
    // -----------------------------------------------------------------------

    app.get(
      "/v1/admin/feedback",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const query = request.query as {
          type?: string;
          category?: string;
          status?: string;
          search?: string;
          page?: string;
          limit?: string;
          sortBy?: "createdAt" | "updatedAt";
          sortOrder?: "asc" | "desc";
        };

        const result = await supportService.listAdminFeedbacks(actor, {
          type: query.type,
          category: query.category,
          status: query.status,
          search: query.search,
          page: query.page ? Number.parseInt(query.page, 10) : undefined,
          limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        });

        return result;
      },
    );

    app.get(
      "/v1/admin/feedback/:id",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const feedback = await supportService.getFeedbackById(actor, id);
        return { feedback };
      },
    );

    app.patch(
      "/v1/admin/feedback/:id",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const body = request.body as {
          admin_response?: string | null;
          adminResponse?: string | null;
          status?: string;
        };

        if (!body || typeof body !== "object") {
          throw new DomainError("bad_request", "اطلاعات ارسالی نامعتبر است.");
        }

        const feedback = await supportService.respondFeedback(actor, id, {
          adminResponse: body.admin_response ?? body.adminResponse,
          status: body.status,
        });

        return { feedback };
      },
    );

    // -----------------------------------------------------------------------
    // Admin Support Ticket Endpoints
    // -----------------------------------------------------------------------

    app.get(
      "/v1/admin/support/tickets",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const query = request.query as {
          category?: string;
          priority?: string;
          status?: string;
          search?: string;
          page?: string;
          limit?: string;
          sortBy?: "lastActivityAt" | "createdAt";
          sortOrder?: "asc" | "desc";
        };

        const result = await supportService.listAdminTickets(actor, {
          category: query.category,
          priority: query.priority,
          status: query.status,
          search: query.search,
          page: query.page ? Number.parseInt(query.page, 10) : undefined,
          limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        });

        return result;
      },
    );

    app.get(
      "/v1/admin/support/tickets/:id",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const ticket = await supportService.getTicketDetails(actor, id);
        return { ticket };
      },
    );

    app.post(
      "/v1/admin/support/tickets/:id/messages",
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const body = request.body as {
          body: string;
          attachment_url?: string | null;
          attachmentUrl?: string | null;
          is_internal_note?: boolean;
          isInternalNote?: boolean;
          new_status?: string;
          newStatus?: string;
        };

        if (!body || typeof body !== "object") {
          throw new DomainError("bad_request", "متن پیام الزامی است.");
        }

        const message = await supportService.sendAdminMessage(actor, id, {
          body: body.body,
          attachmentUrl: body.attachment_url ?? body.attachmentUrl,
          isInternalNote: body.is_internal_note ?? body.isInternalNote,
          newStatus: body.new_status ?? body.newStatus,
        });

        reply.code(201);
        return { message };
      },
    );

    app.patch(
      "/v1/admin/support/tickets/:id/status",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const body = request.body as { status: string };

        if (!body || !body.status) {
          throw new DomainError("bad_request", "وضعیت جدید الزامی است.");
        }

        const ticket = await supportService.updateTicketStatus(
          actor,
          id,
          body.status,
        );

        return { ticket };
      },
    );

    app.patch(
      "/v1/admin/support/tickets/:id/priority",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const body = request.body as { priority: string };

        if (!body || !body.priority) {
          throw new DomainError("bad_request", "اولویت جدید الزامی است.");
        }

        const ticket = await supportService.updateTicketPriority(
          actor,
          id,
          body.priority,
        );

        return { ticket };
      },
    );

    app.patch(
      "/v1/admin/support/tickets/:id/category",
      { preHandler: [requireAuth] },
      async (request) => {
        const actor = getActor(request);
        const { id } = request.params as { id: string };
        const body = request.body as { category: string };

        if (!body || !body.category) {
          throw new DomainError("bad_request", "دسته‌بندی جدید الزامی است.");
        }

        const ticket = await supportService.updateTicketCategory(
          actor,
          id,
          body.category,
        );

        return { ticket };
      },
    );
  };
