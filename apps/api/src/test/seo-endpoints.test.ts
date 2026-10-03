import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryBlogStore } from "../modules/blog/blog-store.js";
import { v1Routes } from "../routes/v1.js";

describe("SEO Endpoints (/robots.txt and /sitemap.xml)", () => {
  async function setupTestApp(blogStore?: InMemoryBlogStore) {
    const config = loadApiConfig();
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      blogStore,
      organizationStore: orgStore,
    });

    return app;
  }

  test("GET /robots.txt should return 200 with text/plain content type and canonical rules", async () => {
    const app = await setupTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/robots.txt",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");

    const body = response.body;
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Disallow: /v1/");
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Disallow: /courses");
    expect(body).toContain("Disallow: /home");
    expect(body).toContain("Disallow: /sign-in");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Allow: /teachers");
    expect(body).toContain("Allow: /blog");
    expect(body).toContain("Sitemap: https://aavana.ir/sitemap.xml");
  });

  test("GET /sitemap.xml should return 200 with application/xml content type and valid protocol XML", async () => {
    const app = await setupTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/sitemap.xml",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/xml");

    const body = response.body;
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain("<loc>https://aavana.ir/</loc>");
    expect(body).toContain("<loc>https://aavana.ir/teachers</loc>");
    expect(body).toContain("<loc>https://aavana.ir/terms</loc>");
    expect(body).toContain("<loc>https://aavana.ir/blog</loc>");

    // Should NOT contain private or invalid paths
    expect(body).not.toContain("localhost");
    expect(body).not.toContain("https://aavana.ir/admin");
    expect(body).not.toContain("https://aavana.ir/courses");
    expect(body).not.toContain("https://aavana.ir/home");
    expect(body).not.toContain("https://aavana.ir/sign-in");
  });

  test("GET /sitemap.xml dynamically reflects published articles from blog store", async () => {
    const blogStore = new InMemoryBlogStore();
    const now = new Date("2026-03-15T10:00:00.000Z");

    const cat = await blogStore.createCategory(
      "داروسازی بالینی",
      "clinical-pharmacy-custom",
      "توضیحات",
      1,
    );

    const tag = await blogStore.createTag(
      "آنتی‌بیوتیک",
      "antibiotics-custom",
    );

    const post = await blogStore.createPost("test-author-id", {
      title: "مقاله جدید آنتی‌بیوتیک‌ها",
      slug: "new-antibiotics-article",
      content: "محتوای مقاله تست",
      status: "published",
      publishedAt: now,
      categoryId: cat.id,
      tagIds: [tag.id],
    });
    // Explicitly align updatedAt to published date for deterministic testing
    const record = blogStore.posts.get(post.id)!;
    record.updatedAt = now;
    blogStore.posts.set(post.id, record);

    const app = await setupTestApp(blogStore);

    const response = await app.inject({
      method: "GET",
      url: "/sitemap.xml",
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain("<loc>https://aavana.ir/blog/new-antibiotics-article</loc>");
    expect(body).toContain("<lastmod>2026-03-15</lastmod>");
    expect(body).toContain("<loc>https://aavana.ir/blog/category/clinical-pharmacy-custom</loc>");
    expect(body).toContain("<loc>https://aavana.ir/blog/tag/antibiotics-custom</loc>");
  });
});
