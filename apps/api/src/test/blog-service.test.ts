import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryBlogStore } from "../modules/blog/blog-store.js";
import { BlogService, calculateReadingTime, generateExcerpt, slugify } from "../modules/blog/blog-service.js";

describe("BlogService Unit & Business Logic Tests", () => {
  let store: InMemoryBlogStore;
  let service: BlogService;

  beforeEach(() => {
    store = new InMemoryBlogStore();
    service = new BlogService(store);
  });

  describe("Utility Functions", () => {
    it("calculates Persian reading time accurately", () => {
      const shortText = "این یک متن کوتاه داروسازی است.";
      expect(calculateReadingTime(shortText)).toBe(1);

      const longText = Array(450).fill("دارو").join(" ");
      expect(calculateReadingTime(longText)).toBe(3);
    });

    it("generates clean excerpts from markdown", () => {
      const markdown = "# عنوان مقاله\n\nاین یک **متن پررنگ** و [پیوند](https://avana.dev) است که باید خلاصه شود.";
      const excerpt = generateExcerpt(markdown, 50);
      expect(excerpt).not.toContain("#");
      expect(excerpt).not.toContain("**");
      expect(excerpt).not.toContain("[پیوند]");
      expect(excerpt).toContain("متن پررنگ");
    });

    it("slugifies Persian and English strings cleanly", () => {
      expect(slugify("چگونه برای امتحان فارماکولوژی درس بخوانیم؟")).toBe(
        "چگونه-برای-امتحان-فارماکولوژی-درس-بخوانیم",
      );
      expect(slugify("Agonist vs Antagonist 101!")).toBe(
        "agonist-vs-antagonist-101",
      );
    });
  });

  describe("Article Lifecycle & Isolation", () => {
    it("creates a draft article and verifies it is NOT visible in public API", async () => {
      const cat = await service.createCategory("فارماکولوژی", "pharmacology");
      const post = await service.createPost("author-1", {
        title: "مقدمه‌ای بر آگونیست‌ها",
        content: "محتوای تخصصی داروشناسی و فارماکودینامیک...",
        status: "draft",
        categoryId: cat.id,
        tagNames: ["فارماکولوژی", "آگونیست"],
      });

      expect(post.id).toBeDefined();
      expect(post.status).toBe("draft");
      expect(post.slug).toBe("مقدمه-ای-بر-آگونیست-ها");

      // Verify Public API isolation: Draft must NOT be returned
      const publicList = await service.listPublishedPosts({});
      expect(publicList.posts).toHaveLength(0);
      expect(publicList.totalCount).toBe(0);

      const publicSingle = await service.getPublishedPostBySlug(post.slug);
      expect(publicSingle).toBeNull();

      // Verify Admin API can retrieve it
      const adminList = await service.listAllPostsAdmin({});
      expect(adminList.posts).toHaveLength(1);
      expect(adminList.posts[0].id).toBe(post.id);

      const adminSingle = await service.getPostByIdAdmin(post.id);
      expect(adminSingle).not.toBeNull();
      expect(adminSingle?.title).toBe("مقدمه‌ای بر آگونیست‌ها");
    });

    it("publishes a draft article and verifies it appears in public API immediately", async () => {
      const post = await service.createPost("author-1", {
        title: "نیمه‌عمر داروها چیست؟",
        content: "تحلیل کامل فارماکوکینتیک نیمه‌عمر داروها و محاسبات بالینی آن...",
        status: "draft",
      });

      // Publish article
      const published = await service.publishPost(post.id);
      expect(published.status).toBe("published");
      expect(published.publishedAt).toBeInstanceOf(Date);

      // Now it must appear in public API
      const publicList = await service.listPublishedPosts({});
      expect(publicList.posts).toHaveLength(1);
      expect(publicList.posts[0].id).toBe(post.id);
      expect(publicList.posts[0].title).toBe("نیمه‌عمر داروها چیست؟");

      const publicSingle = await service.getPublishedPostBySlug(post.slug);
      expect(publicSingle).not.toBeNull();
      expect(publicSingle?.title).toBe("نیمه‌عمر داروها چیست؟");
      // View count must have incremented
      expect(publicSingle?.viewCount).toBe(1);
    });

    it("unpublishes an article and verifies it is removed from public API", async () => {
      const post = await service.createPost("author-1", {
        title: "مطلب تستی",
        content: "محتوای تستی برای بررسی لغو انتشار...",
        status: "published",
      });

      expect((await service.listPublishedPosts({})).posts).toHaveLength(1);

      // Unpublish
      await service.unpublishPost(post.id);

      // Verify immediate removal from public API
      expect((await service.listPublishedPosts({})).posts).toHaveLength(0);
      expect(await service.getPublishedPostBySlug(post.slug)).toBeNull();
    });

    it("does not publicly show articles scheduled for future publication dates", async () => {
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      const post = await service.createPost("author-1", {
        title: "مقاله آینده",
        content: "این مقاله فردا منتشر خواهد شد...",
        status: "published",
        publishedAt: futureDate,
      });

      // Should not be visible in public list
      const publicList = await service.listPublishedPosts({});
      expect(publicList.posts.some((p) => p.id === post.id)).toBe(false);

      // Should not be accessible by slug
      const publicSingle = await service.getPublishedPostBySlug(post.slug);
      expect(publicSingle).toBeNull();
    });

    it("supports search, category filtering, and tag association", async () => {
      const catPharm = await service.createCategory("فارماکولوژی", "pharm");
      const catExam = await service.createCategory("نکات امتحانی", "exam");

      const p1 = await service.createPost("author-1", {
        title: "مهارکننده‌های پمپ پروتون (PPI)",
        content: "امپرازول و پنتوپرازول برای درمان زخم معده...",
        status: "published",
        categoryId: catPharm.id,
        tagNames: ["فارماکولوژی", "معده"],
      });

      const p2 = await service.createPost("author-1", {
        title: "برنامه‌ریزی کنکور داروسازی",
        content: "راهنمای مطالعه دروس آزمون جامع ۱۸۰ واحدی...",
        status: "published",
        categoryId: catExam.id,
        tagNames: ["کنکور", "امتحان"],
      });

      // Category filter
      const pharmPosts = await service.listPublishedPosts({ categorySlug: "pharm" });
      expect(pharmPosts.posts).toHaveLength(1);
      expect(pharmPosts.posts[0].id).toBe(p1.id);

      // Search filter
      const searchResults = await service.listPublishedPosts({ search: "امپرازول" });
      expect(searchResults.posts).toHaveLength(1);
      expect(searchResults.posts[0].id).toBe(p1.id);

      // Categories with post count
      const categoriesWithCount = await service.listCategories();
      const pharmCount = categoriesWithCount.find((c) => c.slug === "pharm")?.postCount;
      expect(pharmCount).toBe(1);
    });

    it("updates article and recalculates reading time and tags", async () => {
      const post = await service.createPost("author-1", {
        title: "عنوان اولیه",
        content: "یک دو سه چهار پنج",
        status: "draft",
        tagNames: ["تگ ۱"],
      });

      const updated = await service.updatePost(post.id, {
        title: "عنوان ویرایش شده",
        content: Array(400).fill("کلمه").join(" "),
        tagNames: ["تگ ۱", "تگ ۲"],
      });

      expect(updated.title).toBe("عنوان ویرایش شده");
      expect(updated.readingTimeMinutes).toBe(2);
      expect(updated.tags).toHaveLength(2);
    });

    it("deletes an article completely", async () => {
      const post = await service.createPost("author-1", {
        title: "مقاله حذفی",
        content: "این مقاله حذف خواهد شد.",
        status: "published",
      });

      const deleted = await service.deletePost(post.id);
      expect(deleted).toBe(true);

      expect((await service.listAllPostsAdmin({})).posts).toHaveLength(0);
      expect((await service.listPublishedPosts({})).posts).toHaveLength(0);
    });
  });
});
