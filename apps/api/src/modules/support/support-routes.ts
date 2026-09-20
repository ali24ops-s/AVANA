import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { DomainError, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { SupportService } from "./support-service.js";
import type { StorageProvider } from "../storage/storage-provider.js";

export interface SupportRouteOptions extends AuthMiddlewareDeps {
  supportService: SupportService;
  storageProvider?: StorageProvider;
}

export const supportRoutes: FastifyPluginAsync<SupportRouteOptions> = async (
  app,
  opts,
) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const supportService = opts.supportService;
  const storageProvider = opts.storageProvider;

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


  // -------------------------------------------------------------------------
  // Feedback Endpoints (User)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/feedback",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body as {
        type: string;
        category: string;
        title: string;
        description: string;
        attachment_url?: string | null;
        attachmentUrl?: string | null;
      };

      if (!body || typeof body !== "object") {
        throw new DomainError("bad_request", "اطلاعات ارسالی نامعتبر است.");
      }

      const item = await supportService.createFeedback(actor, {
        type: body.type,
        category: body.category,
        title: body.title,
        description: body.description,
        attachmentUrl: body.attachment_url ?? body.attachmentUrl,
      });

      reply.code(201);
      return { feedback: item };
    },
  );

  app.get(
    "/v1/feedback/my",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const query = request.query as {
        status?: string;
        page?: string;
        limit?: string;
      };

      const result = await supportService.listUserFeedbacks(actor, {
        status: query.status,
        page: query.page ? Number.parseInt(query.page, 10) : undefined,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
      });

      return result;
    },
  );

  app.get(
    "/v1/feedback/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const feedback = await supportService.getFeedbackById(actor, id);
      return { feedback };
    },
  );

  // -------------------------------------------------------------------------
  // Support Ticket Endpoints (User)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/support/tickets",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body as {
        category: string;
        priority?: string;
        title: string;
        description: string;
        attachment_url?: string | null;
        attachmentUrl?: string | null;
      };

      if (!body || typeof body !== "object") {
        throw new DomainError("bad_request", "اطلاعات ارسالی نامعتبر است.");
      }

      const ticket = await supportService.createTicket(actor, {
        category: body.category,
        priority: body.priority,
        title: body.title,
        description: body.description,
        attachmentUrl: body.attachment_url ?? body.attachmentUrl,
      });

      reply.code(201);
      return { ticket };
    },
  );

  app.get(
    "/v1/support/tickets/my",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const query = request.query as {
        status?: string;
        page?: string;
        limit?: string;
      };

      const result = await supportService.listUserTickets(actor, {
        status: query.status,
        page: query.page ? Number.parseInt(query.page, 10) : undefined,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
      });

      return result;
    },
  );

  app.get(
    "/v1/support/tickets/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const ticket = await supportService.getTicketDetails(actor, id);
      return { ticket };
    },
  );

  app.post(
    "/v1/support/tickets/:id/messages",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = request.body as {
        body: string;
        attachment_url?: string | null;
        attachmentUrl?: string | null;
      };

      if (!body || typeof body !== "object") {
        throw new DomainError("bad_request", "متن پیام الزامی است.");
      }

      const message = await supportService.sendUserMessage(actor, id, {
        body: body.body,
        attachmentUrl: body.attachment_url ?? body.attachmentUrl,
      });

      reply.code(201);
      return { message };
    },
  );

  app.post(
    "/v1/support/tickets/:id/reopen",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const ticket = await supportService.reopenUserTicket(actor, id);
      return { ticket };
    },
  );

  // -------------------------------------------------------------------------
  // Support Attachments (Upload & Stream)
  // -------------------------------------------------------------------------

  app.post(
    "/v1/support/attachments",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      getActor(request);

      if (!storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const file = await request.file({
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB limit
          files: 1,
        },
      });

      if (!file) {
        throw new DomainError("bad_request", "هیچ فایلی ارسال نشده است.");
      }

      const rawMime = (file.mimetype || "").toLowerCase();
      const ALLOWED_MIME_MAP: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
      };

      const ext = ALLOWED_MIME_MAP[rawMime];
      if (!ext) {
        throw new DomainError(
          "bad_request",
          "فرمت فایل نامعتبر است. فرمت‌های مجاز: JPG، PNG، WebP و PDF.",
        );
      }

      const data = await file.toBuffer();
      if (data.length > 5 * 1024 * 1024) {
        throw new DomainError(
          "bad_request",
          "حجم فایل بیش از حد مجاز است (حداکثر ۵ مگابایت).",
        );
      }
      if (data.length === 0) {
        throw new DomainError("bad_request", "فایل ارسالی خالی است.");
      }

      const storageKey = `support/${randomUUID()}.${ext}`;

      await storageProvider.save({
        storageKey,
        data,
        mimeType: rawMime === "image/jpg" ? "image/jpeg" : rawMime,
      });

      const attachmentUrl = `/v1/support/attachments/${encodeURIComponent(storageKey)}`;

      reply.code(201);
      return {
        attachment_url: attachmentUrl,
        storage_key: storageKey,
      };
    },
  );

  app.get(
    "/v1/support/attachments/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);

      if (!storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const rawKey = (request.params as { "*": string })["*"];
      if (!rawKey) {
        throw new DomainError("bad_request", "مسیر ضمیمه الزامی است.");
      }

      const storageKey = decodeURIComponent(rawKey);

      // Path traversal check
      if (!storageKey.startsWith("support/") || storageKey.includes("..")) {
        throw new DomainError("bad_request", "مسیر فایل نامعتبر است.");
      }

      // Authorization check (User owns the attachment or is admin)
      await supportService.verifyAttachmentAccess(actor, storageKey);

      const exists = await storageProvider.exists(storageKey);
      if (!exists) {
        throw new DomainError("not_found", "فایل ضمیمه یافت نشد.");
      }

      const ext = storageKey.split(".").pop()?.toLowerCase();
      const mimeType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : ext === "pdf"
          ? "application/pdf"
          : "image/jpeg";

      const data = await storageProvider.read(storageKey);

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", `inline; filename="attachment.${ext}"`)
        .header("Content-Length", data.length)
        .header("Cache-Control", "private, max-age=3600");

      return reply.send(data);
    },
  );
};
