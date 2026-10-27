import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  generateRobotsTxt,
  generateSitemapXml,
  type DynamicBlogSitemapData,
  cleanEducationalTitle,
  asCourseId,
} from "@avana/domain";
import type { BlogStore } from "../modules/blog/blog-store.js";
import type { CourseStore } from "../modules/courses/course-store.js";
import {
  renderCourseShareCard,
  defaultCourseCardCache,
  loadFallbackShareCard,
} from "./course-card-renderer.js";

export interface SeoRouteOptions {
  blogStore?: BlogStore;
  courseStore?: CourseStore;
  appUrl?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const seoRoutes: FastifyPluginAsync<SeoRouteOptions> = async (
  app,
  opts,
) => {
  const appBaseUrl = (opts.appUrl || "https://aavana.ir").replace(/\/+$/, "");

  /**
   * GET /robots.txt
   * Serves plain text robots.txt matching domain SEO configuration.
   */
  app.get("/robots.txt", async (_request, reply) => {
    const robotsTxt = generateRobotsTxt();
    return reply
      .status(200)
      .header("Content-Type", "text/plain; charset=utf-8")
      .header("Cache-Control", "public, max-age=86400")
      .send(robotsTxt);
  });

  /**
   * GET /sitemap.xml
   * Serves XML sitemap conforming to Sitemap Protocol 0.9.
   * If a BlogStore is wired, dynamically reflects published blog posts, categories, and tags.
   */
  app.get("/sitemap.xml", async (_request, reply) => {
    let blogData: DynamicBlogSitemapData | undefined;

    if (opts?.blogStore) {
      try {
        const [postsResult, categories, tags] = await Promise.all([
          opts.blogStore.listPublishedPosts({ page: 1, pageSize: 1000 }),
          opts.blogStore.listCategoriesWithCounts(),
          opts.blogStore.listTagsWithCounts(),
        ]);

        blogData = {
          posts: postsResult.posts.map((p) => ({
            slug: p.slug,
            updatedAt: p.updatedAt,
            publishedAt: p.publishedAt,
          })),
          categories: categories.map((c) => ({
            slug: c.slug,
            updatedAt: c.updatedAt,
          })),
          tags: tags.map((t) => ({
            slug: t.slug,
            updatedAt: t.updatedAt,
          })),
        };
      } catch {
        // Fall back gracefully to default domain seed data if DB query fails
        blogData = undefined;
      }
    }

    const sitemapXml = generateSitemapXml(blogData);
    return reply
      .status(200)
      .header("Content-Type", "application/xml; charset=utf-8")
      .header("Cache-Control", "public, max-age=3600")
      .send(sitemapXml);
  });

function cleanTruncateDescription(desc: string, maxLength = 180): string {
  const normalized = desc.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  const cut = normalized.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const safeCut = lastSpace > maxLength * 0.7 ? cut.slice(0, lastSpace) : cut;
  return `${safeCut}…`;
}

interface ResolvedShareImage {
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  type: string;
  alt: string;
}

function isSocialCrawler(userAgent?: string): boolean {
  if (!userAgent) return false;
  return /telegrambot|twitterbot|facebookexternalhit|whatsapp|slackbot|vkshare|linkedinbot|embedly|quora link preview|outbrain|pinterest\/|skypeuripreview/i.test(
    userAgent,
  );
}

function resolveCourseShareImage(
  course: any,
  isPubliclyDisclosable: boolean,
  appBaseUrl: string,
): ResolvedShareImage {
  const defaultUrl = `${appBaseUrl}/brand/avana-share-card.png`;
  const defaultSecureUrl = defaultUrl.startsWith("http://")
    ? defaultUrl.replace(/^http:\/\//, "https://")
    : defaultUrl;

  const defaultCard: ResolvedShareImage = {
    url: defaultUrl,
    secureUrl: defaultSecureUrl,
    width: 1200,
    height: 630,
    type: "image/png",
    alt: "آوانا - سامانه هوشمند یادگیری",
  };

  if (!isPubliclyDisclosable) {
    return defaultCard;
  }

  const rawCover = course.coverImage || course.coverUrl;
  if (rawCover && typeof rawCover === "string" && rawCover.trim()) {
    const trimmed = rawCover.trim();

    // Only accept crawlable, non-local, non-data URIs as legitimate custom covers
    if (
      !trimmed.startsWith("data:") &&
      !trimmed.includes("localhost") &&
      !trimmed.includes("127.0.0.1")
    ) {
      let absoluteUrl = trimmed;
      if (trimmed.startsWith("/")) {
        absoluteUrl = `${appBaseUrl}${trimmed}`;
      }

      if (/^https?:\/\//i.test(absoluteUrl)) {
        const secureUrl = absoluteUrl.startsWith("http://")
          ? absoluteUrl.replace(/^http:\/\//, "https://")
          : absoluteUrl;

        const ext = absoluteUrl.split(".").pop()?.toLowerCase().split("?")[0];
        let mimeType = "image/png";
        if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "webp") mimeType = "image/webp";

        return {
          url: absoluteUrl,
          secureUrl,
          width: 1200,
          height: 630,
          type: mimeType,
          alt: `تصویر دوره آموزشی ${cleanEducationalTitle(course.name)}`,
        };
      }
    }
  }

  // When no valid custom cover is present, route to the dedicated dynamic 1200x630 course card
  const cardUrl = `${appBaseUrl}/v1/share/courses/${encodeURIComponent(course.id)}/card.png`;
  const secureCardUrl = cardUrl.startsWith("http://")
    ? cardUrl.replace(/^http:\/\//, "https://")
    : cardUrl;

  return {
    url: cardUrl,
    secureUrl: secureCardUrl,
    width: 1200,
    height: 630,
    type: "image/png",
    alt: `کارت معرفی دوره آموزشی ${cleanEducationalTitle(course.name)}`,
  };
}

  /**
   * Helper: render HTML for course share preview / Open Graph tags.
   */
  async function handleCourseSharePreview(
    rawCourseId: string,
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) {
    if (!opts.courseStore) {
      return reply
        .status(503)
        .header("Content-Type", "text/plain; charset=utf-8")
        .send("Course store not available.");
    }

    const courseId = asCourseId(rawCourseId);
    const course = await opts.courseStore.findById(courseId);

    // If course does not exist or has been soft-deleted
    if (!course || course.deletedAt) {
      const notFoundHtml = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>دوره یافت نشد | آوانا</title>
  <meta name="robots" content="noindex, nofollow">
  <meta property="og:title" content="دوره یافت نشد | آوانا">
  <meta property="og:description" content="دوره مورد نظر یافت نشد، حذف شده یا در دسترس نیست.">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="fa_IR">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 48px 16px; background-color: #F7F9FA; color: #1a2226;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 16px; border: 1px solid #E2E7EA;">
    <h2 style="margin-top: 0; color: #008080;">دوره مورد نظر در دسترس نیست</h2>
    <p style="color: #5B6268; font-size: 14px; line-height: 1.6;">این دوره حذف شده است یا ممکن است پیوند نامعتبر باشد.</p>
    <a href="${escapeHtml(appBaseUrl)}/courses" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #008080; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px;">مشاهده فهرست دوره‌ها</a>
  </div>
</body>
</html>`;
      return reply
        .status(404)
        .header("Content-Type", "text/html; charset=utf-8")
        .send(notFoundHtml);
    }

    // Security invariant:
    // Only published official courses allow public disclosure of title, description, and cover.
    // Personal, private, or draft courses MUST render neutral metadata to avoid leaking sensitive contents.
    const isPubliclyDisclosable =
      course.isOfficial === true && course.status === "published";

    const destinationUrl = `${appBaseUrl}/courses/${encodeURIComponent(course.id)}`;

    const title = isPubliclyDisclosable
      ? `${cleanEducationalTitle(course.name)} | دوره آموزشی در آوانا`
      : "مشاهده دوره در آوانا | AVANA";

    const description = isPubliclyDisclosable
      ? (course.description?.trim()
          ? cleanTruncateDescription(course.description)
          : `آموزش و یادگیری دوره «${cleanEducationalTitle(course.name)}» در سامانه هوشمند یادگیری آوانا.`)
      : "برای مشاهده این دوره و محتوای آموزشی آن، وارد حساب کاربری خود در آوانا شوید.";

    const image = resolveCourseShareImage(course, isPubliclyDisclosable, appBaseUrl);

    const userAgent = (request.headers["user-agent"] as string) || "";
    const isCrawler = isSocialCrawler(userAgent);

    const escapedTitle = escapeHtml(title);
    const escapedDesc = escapeHtml(description);
    const escapedDestUrl = escapeHtml(destinationUrl);
    const escapedImageUrl = escapeHtml(image.url);
    const escapedSecureImageUrl = escapeHtml(image.secureUrl);
    const escapedImageType = escapeHtml(image.type);
    const escapedImageAlt = escapeHtml(image.alt);

    const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDesc}">
  <link rel="canonical" href="${escapedDestUrl}">

  <!-- Open Graph / Telegram / WhatsApp / Social Crawlers -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="آوانا (AVANA)">
  <meta property="og:locale" content="fa_IR">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDesc}">
  <meta property="og:url" content="${escapedDestUrl}">
  <meta property="og:image" content="${escapedImageUrl}">
  <meta property="og:image:secure_url" content="${escapedSecureImageUrl}">
  <meta property="og:image:type" content="${escapedImageType}">
  <meta property="og:image:width" content="${image.width}">
  <meta property="og:image:height" content="${image.height}">
  <meta property="og:image:alt" content="${escapedImageAlt}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@aavana_ir">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDesc}">
  <meta name="twitter:image" content="${escapedImageUrl}">
  <meta name="twitter:image:alt" content="${escapedImageAlt}">

  ${
    !isCrawler
      ? `<!-- Browser Auto-Redirect: sends humans to the SPA route immediately -->
  <meta http-equiv="refresh" content="0;url=${escapedDestUrl}">
  <script>
    if (typeof window !== "undefined") {
      window.location.replace(${JSON.stringify(destinationUrl)});
    }
  </script>`
      : `<!-- Social Crawler Mode: Do not redirect crawlers so they reliably parse Open Graph tags -->`
  }
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 48px 16px; background-color: #F7F9FA; color: #1a2226;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 16px; border: 1px solid #E2E7EA;">
    <h2 style="margin-top: 0; color: #008080;">در حال انتقال به دوره...</h2>
    <p style="color: #5B6268; font-size: 14px; line-height: 1.6;">${escapedTitle}</p>
    <a href="${escapedDestUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #008080; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px;">ورود به دوره</a>
  </div>
</body>
</html>`;

    return reply
      .status(200)
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", isPubliclyDisclosable ? "public, max-age=300" : "private, no-cache")
      .send(html);
  }

  /**
   * GET /brand/avana-share-card.png
   * Serves fallback social share image card for social crawlers (Telegram, Twitter, etc.).
   */
  app.get("/brand/avana-share-card.png", async (_request, reply) => {
    try {
      const candidates = [
        resolve(process.cwd(), "apps/web/public/brand/avana-share-card.png"),
        resolve(process.cwd(), "apps/web/dist/brand/avana-share-card.png"),
      ];
      for (const filePath of candidates) {
        try {
          const buffer = await readFile(filePath);
          return reply
            .status(200)
            .header("Content-Type", "image/png")
            .header("Cache-Control", "public, max-age=86400")
            .send(buffer);
        } catch {
          // try next
        }
      }
      return reply.status(404).send("Share card image not found.");
    } catch {
      return reply.status(404).send("Share card image not found.");
    }
  });

  /**
   * GET /share/courses/:courseId
   * Public server-side HTML preview endpoint for crawlers (Telegram, WhatsApp) and human redirection.
   */
  app.get("/share/courses/:courseId", async (request, reply) => {
    const params = request.params as { courseId: string };
    return handleCourseSharePreview(params.courseId, request, reply);
  });

  /**
   * GET /v1/share/courses/:courseId
   * API namespace alias for course share preview HTML.
   */
  app.get("/v1/share/courses/:courseId", async (request, reply) => {
    const params = request.params as { courseId: string };
    return handleCourseSharePreview(params.courseId, request, reply);
  });

  /**
   * GET /courses/:courseId
   * Crawler alias when social crawlers request the canonical path directly on the API.
   */
  app.get("/courses/:courseId", async (request, reply) => {
    const params = request.params as { courseId: string };
    return handleCourseSharePreview(params.courseId, request, reply);
  });

  /**
   * Helper: Serve or render dedicated 1200x630 Open Graph course share card.
   */
  async function handleCourseCardImage(
    rawCourseId: string,
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) {
    if (!opts.courseStore) {
      const fallback = await loadFallbackShareCard();
      return reply
        .status(200)
        .header("Content-Type", "image/png")
        .header("Cache-Control", "private, no-cache")
        .send(fallback);
    }

    const courseId = asCourseId(rawCourseId);
    let course: import("../modules/courses/course-store.js").CourseRecord | undefined;
    try {
      course = await opts.courseStore.findById(courseId);
    } catch {
      // Database query error -> fallback safely without leaking details
      const fallback = await loadFallbackShareCard();
      return reply
        .status(200)
        .header("Content-Type", "image/png")
        .header("Cache-Control", "private, no-cache")
        .send(fallback);
    }

    // If course does not exist or has been soft-deleted -> 404
    if (!course || course.deletedAt) {
      return reply
        .status(404)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Cache-Control", "private, no-cache")
        .send("Course not found.");
    }

    // Privacy & Access Invariant:
    // Personal, private, or draft courses MUST NOT disclose title or metadata in public image!
    const isPublic = course.isOfficial === true && course.status === "published";
    if (!isPublic) {
      const fallback = await loadFallbackShareCard();
      return reply
        .status(200)
        .header("Content-Type", "image/png")
        .header("Cache-Control", "private, no-cache, no-store, must-revalidate")
        .send(fallback);
    }

    // Check bounded LRU cache with ETag & updatedAt invalidation
    const cached = defaultCourseCardCache.get(
      course.id,
      course.updatedAt,
      course.name,
      course.subject,
    );

    if (cached) {
      const clientEtag = request.headers["if-none-match"];
      if (clientEtag && clientEtag === cached.etag) {
        return reply
          .status(304)
          .header("ETag", cached.etag)
          .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600")
          .send();
      }

      return reply
        .status(200)
        .header("Content-Type", "image/png")
        .header("Content-Length", cached.buffer.length)
        .header("ETag", cached.etag)
        .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600")
        .header("X-Content-Type-Options", "nosniff")
        .send(cached.buffer);
    }

    // Render fresh card
    let buffer: Buffer;
    try {
      buffer = await renderCourseShareCard({
        title: course.name,
        subject: course.subject,
        description: course.description,
        appBaseUrl,
      });
    } catch {
      buffer = await loadFallbackShareCard();
    }

    const etag = `W/"${createHash("sha256").update(buffer).digest("hex").slice(0, 16)}"`;

    defaultCourseCardCache.set(course.id, {
      buffer,
      etag,
      updatedAt: course.updatedAt,
      title: course.name,
      subject: course.subject,
      timestamp: Date.now(),
    });

    const clientEtag = request.headers["if-none-match"];
    if (clientEtag && clientEtag === etag) {
      return reply
        .status(304)
        .header("ETag", etag)
        .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600")
        .send();
    }

    return reply
      .status(200)
      .header("Content-Type", "image/png")
      .header("Content-Length", buffer.length)
      .header("ETag", etag)
      .header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600")
      .header("X-Content-Type-Options", "nosniff")
      .send(buffer);
  }

  /**
   * GET /v1/share/courses/:courseId/card.png
   * Dedicated 1200x630 Open Graph share card image for social previews (Telegram, etc.).
   */
  app.get("/v1/share/courses/:courseId/card.png", async (request, reply) => {
    const params = request.params as { courseId: string };
    return handleCourseCardImage(params.courseId, request, reply);
  });

  /**
   * GET /share/courses/:courseId/card.png
   * Canonical web alias for course share card image.
   */
  app.get("/share/courses/:courseId/card.png", async (request, reply) => {
    const params = request.params as { courseId: string };
    return handleCourseCardImage(params.courseId, request, reply);
  });

  /**
   * GET /v1/courses/:courseId/share-preview
   * JSON metadata endpoint for client-side consumption.
   */
  app.get("/v1/courses/:courseId/share-preview", async (request, reply) => {
    if (!opts.courseStore) {
      return reply.status(503).send({ error: "Course store not available" });
    }

    const params = request.params as { courseId: string };
    const courseId = asCourseId(params.courseId);
    const course = await opts.courseStore.findById(courseId);

    if (!course || course.deletedAt) {
      return reply.status(404).send({ error: "Course not found", code: "not_found" });
    }

    const isPublic = course.isOfficial === true && course.status === "published";
    const shareUrl = `${appBaseUrl}/courses/${encodeURIComponent(course.id)}`;
    const imageInfo = resolveCourseShareImage(course, isPublic, appBaseUrl);

    return {
      courseId: course.id,
      isPublic,
      title: isPublic ? cleanEducationalTitle(course.name) : "مشاهده دوره در آوانا",
      description: isPublic
        ? (course.description?.trim() ? cleanTruncateDescription(course.description) : null)
        : null,
      subject: isPublic ? (course.subject ?? null) : null,
      shareUrl,
      imageUrl: imageInfo.url,
    };
  });
};
