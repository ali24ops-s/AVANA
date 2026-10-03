import type { FastifyPluginAsync } from "fastify";
import {
  generateRobotsTxt,
  generateSitemapXml,
  type DynamicBlogSitemapData,
} from "@avana/domain";
import type { BlogStore } from "../modules/blog/blog-store.js";

export interface SeoRouteOptions {
  blogStore?: BlogStore;
}

export const seoRoutes: FastifyPluginAsync<SeoRouteOptions> = async (
  app,
  opts,
) => {
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
};
