import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { DomainError, Roles } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import { BlogService } from "./blog-service.js";
import type { BlogStore } from "./blog-store.js";
import type { CreateBlogPostInput, UpdateBlogPostInput } from "./blog-types.js";
import type { StorageProvider } from "../storage/index.js";

export interface AdminBlogRouteOptions extends AuthMiddlewareDeps {
  blogStore: BlogStore;
  storageProvider?: StorageProvider;
}

export const adminBlogRoutes: FastifyPluginAsync<AdminBlogRouteOptions> = async (
  app,
  opts,
) => {
  const { sessionService, userStore, blogStore, storageProvider } = opts;
  const blogService = new BlogService(blogStore);
  const { requireAuth, requireRole } = makeAuthMiddleware({
    sessionService,
    userStore,
  });

  // Protect all admin blog routes with platform_admin role
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(Roles.platform_admin));

  /**
   * POST /v1/admin/blog/images
   * Upload an image for blog post cover/content.
   */
  app.post("/v1/admin/blog/images", async (request, reply) => {
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
      throw new DomainError("bad_request", "هیچ فایلی برای بارگذاری ارسال نشده است.");
    }

    const rawMime = (file.mimetype || "").toLowerCase();
    const ALLOWED_MIME_MAP: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    const ext = ALLOWED_MIME_MAP[rawMime];
    if (!ext) {
      throw new DomainError(
        "bad_request",
        "فرمت فایل نامعتبر است. فقط فرمت‌های تصویری JPG، PNG و WebP مجاز هستند.",
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

    const storageKey = `blog/${randomUUID()}.${ext}`;

    await storageProvider.save({
      storageKey,
      data,
      mimeType: rawMime === "image/jpg" ? "image/jpeg" : rawMime,
    });

    const url = `/v1/blog/images/${encodeURIComponent(storageKey)}`;

    return reply.status(201).send({
      url,
      image_url: url,
      storage_key: storageKey,
    });
  });

  /**
   * GET /v1/admin/blog/stats
   */
  app.get("/v1/admin/blog/stats", async (_request, reply) => {
    const stats = await blogService.getAdminStats();
    return reply.send({ stats });
  });

  /**
   * GET /v1/admin/blog/posts
   */
  app.get("/v1/admin/blog/posts", async (request, reply) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      search?: string;
      status?: "draft" | "published" | "all";
      categoryId?: string;
      sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
      sortOrder?: "asc" | "desc";
    };

    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const pageSize = query.pageSize
      ? Math.min(100, Math.max(1, parseInt(query.pageSize, 10)))
      : 20;

    const statusFilter = query.status && query.status !== "all" ? query.status : undefined;

    const result = await blogService.listAllPostsAdmin({
      page,
      pageSize,
      search: query.search,
      status: statusFilter,
      categoryId: query.categoryId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return reply.send(result);
  });

  /**
   * GET /v1/admin/blog/posts/:id
   */
  app.get("/v1/admin/blog/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await blogService.getPostByIdAdmin(id);
    if (!post) {
      return reply.status(404).send({
        error: { code: "not_found", message: "مقاله یافت نشد." },
      });
    }
    return reply.send({ post });
  });

  /**
   * GET /v1/admin/blog/posts/:id/preview
   */
  app.get("/v1/admin/blog/posts/:id/preview", async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await blogService.getPostByIdAdmin(id);
    if (!post) {
      return reply.status(404).send({
        error: { code: "not_found", message: "مقاله یافت نشد." },
      });
    }
    return reply.send({ post });
  });

  /**
   * POST /v1/admin/blog/posts
   */
  app.post("/v1/admin/blog/posts", async (request, reply) => {
    const reqAuth = request as unknown as { user?: { userId?: string; id?: string } };
    const authorId = reqAuth.user?.userId || reqAuth.user?.id || "platform-admin";
    const body = request.body as CreateBlogPostInput;

    if (!body || !body.title || !body.content) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "عنوان و محتوای مقاله الزامی هستند." },
      });
    }

    try {
      const post = await blogService.createPost(authorId, body);
      return reply.status(201).send({ post });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در ایجاد مقاله" },
      });
    }
  });

  /**
   * PATCH /v1/admin/blog/posts/:id
   */
  app.patch("/v1/admin/blog/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateBlogPostInput;

    try {
      const post = await blogService.updatePost(id, body);
      return reply.send({ post });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در ویرایش مقاله" },
      });
    }
  });

  /**
   * DELETE /v1/admin/blog/posts/:id
   */
  app.delete("/v1/admin/blog/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await blogService.deletePost(id);
    if (!success) {
      return reply.status(404).send({
        error: { code: "not_found", message: "مقاله برای حذف یافت نشد." },
      });
    }
    return reply.send({ success: true });
  });

  /**
   * POST /v1/admin/blog/posts/:id/publish
   */
  app.post("/v1/admin/blog/posts/:id/publish", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const post = await blogService.publishPost(id);
      return reply.send({ post });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در انتشار مقاله" },
      });
    }
  });

  /**
   * POST /v1/admin/blog/posts/:id/unpublish
   */
  app.post("/v1/admin/blog/posts/:id/unpublish", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const post = await blogService.unpublishPost(id);
      return reply.send({ post });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در تغییر وضعیت به پیش‌نویس" },
      });
    }
  });

  /**
   * GET /v1/admin/blog/categories
   */
  app.get("/v1/admin/blog/categories", async (_request, reply) => {
    const categories = await blogService.listCategories();
    return reply.send({ categories });
  });

  /**
   * POST /v1/admin/blog/categories
   */
  app.post("/v1/admin/blog/categories", async (request, reply) => {
    const body = request.body as {
      name: string;
      slug?: string;
      description?: string;
      sortOrder?: number;
    };

    if (!body || !body.name) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "نام دسته‌بندی الزامی است." },
      });
    }

    try {
      const category = await blogService.createCategory(
        body.name,
        body.slug,
        body.description,
        body.sortOrder,
      );
      return reply.status(201).send({ category });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در ایجاد دسته‌بندی" },
      });
    }
  });

  /**
   * PATCH /v1/admin/blog/categories/:id
   */
  app.patch("/v1/admin/blog/categories/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name: string;
      slug?: string;
      description?: string;
      sortOrder?: number;
    };

    if (!body || !body.name) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "نام دسته‌بندی الزامی است." },
      });
    }

    try {
      const category = await blogService.updateCategory(
        id,
        body.name,
        body.slug,
        body.description,
        body.sortOrder,
      );
      return reply.send({ category });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در ویرایش دسته‌بندی" },
      });
    }
  });

  /**
   * DELETE /v1/admin/blog/categories/:id
   */
  app.delete("/v1/admin/blog/categories/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await blogService.deleteCategory(id);
    return reply.send({ success });
  });

  /**
   * GET /v1/admin/blog/tags
   */
  app.get("/v1/admin/blog/tags", async (request, reply) => {
    const query = request.query as { search?: string };
    const tags = await blogService.listTagsAdmin(query.search);
    return reply.send({ tags });
  });

  /**
   * POST /v1/admin/blog/tags
   */
  app.post("/v1/admin/blog/tags", async (request, reply) => {
    const body = request.body as {
      name: string;
      slug?: string;
    };

    if (!body || !body.name) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "نام برچسب الزامی است." },
      });
    }

    try {
      const tag = await blogService.createTag(body.name, body.slug);
      return reply.status(201).send({ tag });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در ایجاد برچسب" },
      });
    }
  });

  /**
   * PATCH /v1/admin/blog/tags/:id
   */
  app.patch("/v1/admin/blog/tags/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name: string;
      slug?: string;
    };

    if (!body || !body.name) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "نام برچسب الزامی است." },
      });
    }

    try {
      const tag = await blogService.updateTag(id, body.name, body.slug);
      return reply.send({ tag });
    } catch (err: any) {
      return reply.status(400).send({
        error: { code: "bad_request", message: err.message || "خطا در ویرایش برچسب" },
      });
    }
  });

  /**
   * DELETE /v1/admin/blog/tags/:id
   */
  app.delete("/v1/admin/blog/tags/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await blogService.deleteTag(id);
    return reply.send({ success });
  });
};
