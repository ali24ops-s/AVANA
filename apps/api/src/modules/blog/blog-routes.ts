import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "@avana/domain";
import { BlogService } from "./blog-service.js";
import type { BlogStore } from "./blog-store.js";
import type { StorageProvider } from "../storage/index.js";

export interface BlogRouteOptions {
  blogStore: BlogStore;
  storageProvider?: StorageProvider;
}

export const blogRoutes: FastifyPluginAsync<BlogRouteOptions> = async (
  app,
  opts,
) => {
  const blogService = new BlogService(opts.blogStore);

  /**
   * GET /v1/blog/images/*
   * Publicly serves blog images securely within the "blog/" namespace.
   */
  app.get("/v1/blog/images/*", async (request, reply) => {
    if (!opts.storageProvider) {
      throw new DomainError(
        "service_unavailable",
        "سرویس ذخیره‌سازی فایل در دسترس نیست.",
      );
    }

    const rawKey = (request.params as { "*": string })["*"];
    if (!rawKey) {
      throw new DomainError("bad_request", "مسیر تصویر الزامی است.");
    }

    const storageKey = decodeURIComponent(rawKey);

    // Path traversal & namespace security check
    if (!storageKey.startsWith("blog/") || storageKey.includes("..")) {
      throw new DomainError("bad_request", "مسیر فایل نامعتبر است.");
    }

    const exists = await opts.storageProvider.exists(storageKey);
    if (!exists) {
      throw new DomainError("not_found", "تصویر مورد نظر یافت نشد.");
    }

    const ext = storageKey.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : "image/jpeg";

    const data = await opts.storageProvider.read(storageKey);

    reply
      .header("Content-Type", mimeType)
      .header("Content-Disposition", `inline; filename="blog-image.${ext}"`)
      .header("Content-Length", data.length)
      .header("Cache-Control", "public, max-age=86400, immutable");

    return reply.send(data);
  });

  /**
   * GET /v1/blog/posts
   * Lists published blog posts with pagination, category filter, tag filter, and search.
   */
  app.get("/v1/blog/posts", async (request, reply) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      search?: string;
      category?: string;
      categoryId?: string;
      tag?: string;
      sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
      sortOrder?: "asc" | "desc";
    };

    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const pageSize = query.pageSize
      ? Math.min(50, Math.max(1, parseInt(query.pageSize, 10)))
      : 10;

    const result = await blogService.listPublishedPosts({
      page,
      pageSize,
      search: query.search,
      categorySlug: query.category,
      categoryId: query.categoryId,
      tagSlug: query.tag,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return reply.send(result);
  });

  /**
   * GET /v1/blog/posts/:slug
   * Retrieves single published article by its slug.
   * Safely increments view count and includes related articles.
   */
  app.get("/v1/blog/posts/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    if (!slug) {
      return reply.status(400).send({
        error: { code: "bad_request", message: "اسلاگ مقاله الزامی است." },
      });
    }

    const post = await blogService.getPublishedPostBySlug(slug);
    if (!post) {
      return reply.status(404).send({
        error: { code: "not_found", message: "مقاله مورد نظر یافت نشد یا هنوز منتشر نشده است." },
      });
    }

    return reply.send({ post });
  });

  /**
   * GET /v1/blog/categories
   * Lists all blog categories with their published post count.
   */
  app.get("/v1/blog/categories", async (_request, reply) => {
    const categories = await blogService.listCategories();
    return reply.send({ categories });
  });

  /**
   * GET /v1/blog/categories/:slug
   * Gets single category and its published posts.
   */
  app.get("/v1/blog/categories/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const pageSize = query.pageSize ? Math.min(50, Math.max(1, parseInt(query.pageSize, 10))) : 10;

    const category = await blogService.getCategoryBySlug(slug);
    if (!category) {
      return reply.status(404).send({
        error: { code: "not_found", message: "دسته‌بندی مورد نظر یافت نشد." },
      });
    }

    const postsResult = await blogService.listPublishedPosts({
      page,
      pageSize,
      categorySlug: slug,
    });

    return reply.send({
      category,
      ...postsResult,
    });
  });

  /**
   * GET /v1/blog/tags
   * Lists popular tags.
   */
  app.get("/v1/blog/tags", async (_request, reply) => {
    const tags = await blogService.listPopularTags(30);
    return reply.send({ tags });
  });

  /**
   * GET /v1/blog/tags/:slug
   * Gets single tag and its published posts.
   */
  app.get("/v1/blog/tags/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = query.page ? Math.max(1, parseInt(query.page, 10)) : 1;
    const pageSize = query.pageSize ? Math.min(50, Math.max(1, parseInt(query.pageSize, 10))) : 10;

    const tag = await blogService.getTagBySlug(slug);
    if (!tag) {
      return reply.status(404).send({
        error: { code: "not_found", message: "برچسب مورد نظر یافت نشد." },
      });
    }

    const postsResult = await blogService.listPublishedPosts({
      page,
      pageSize,
      tagSlug: tag.slug,
    });

    return reply.send({
      tag,
      ...postsResult,
    });
  });
};
