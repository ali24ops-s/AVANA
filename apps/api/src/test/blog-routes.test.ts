import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryBlogStore } from "../modules/blog/blog-store.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Blog Routes & Authorization E2E", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const blogStore = new InMemoryBlogStore();

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "password_hash" });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    const student = await createUserWithRole("student@test.com", Roles.student);
    const platformAdmin = await createUserWithRole("admin@test.com", Roles.platform_admin);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      blogStore,
      organizationStore: orgStore,
    });

    return {
      app,
      blogStore,
      student,
      platformAdmin,
    };
  }

  describe("Public Blog Endpoints", () => {
    test("GET /v1/blog/posts returns only published posts", async () => {
      const { app, blogStore } = await setupTestApp();

      // Seed 1 published and 1 draft
      await blogStore.createPost("author-1", {
        title: "مقاله منتشر شده",
        content: "محتوای عمومی...",
        status: "published",
      });
      await blogStore.createPost("author-1", {
        title: "مقاله پیش‌نویس",
        content: "محتوای مخفی...",
        status: "draft",
      });

      const res = await app.inject({
        method: "GET",
        url: "/v1/blog/posts",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.posts).toHaveLength(1);
      expect(data.posts[0].title).toBe("مقاله منتشر شده");
      expect(data.totalCount).toBe(1);
    });

    test("GET /v1/blog/posts/:slug returns published post and 404 for draft", async () => {
      const { app, blogStore } = await setupTestApp();

      const pub = await blogStore.createPost("author-1", {
        title: "مقاله پابلیک",
        slug: "public-article",
        content: "محتوای کامل پابلیک...",
        status: "published",
      });
      const draft = await blogStore.createPost("author-1", {
        title: "مقاله درفت",
        slug: "draft-article",
        content: "محتوای درفت...",
        status: "draft",
      });

      // Public post: 200
      const resPub = await app.inject({
        method: "GET",
        url: `/v1/blog/posts/${pub.slug}`,
      });
      expect(resPub.statusCode).toBe(200);
      expect(resPub.json().post.title).toBe("مقاله پابلیک");

      // Draft post: 404
      const resDraft = await app.inject({
        method: "GET",
        url: `/v1/blog/posts/${draft.slug}`,
      });
      expect(resDraft.statusCode).toBe(404);
    });

    test("GET /v1/blog/categories returns categories with published count", async () => {
      const { app, blogStore } = await setupTestApp();

      const cat = await blogStore.createCategory("فارماکولوژی", "pharmacology");
      await blogStore.createPost("author-1", {
        title: "پست ۱",
        content: "محتوا...",
        status: "published",
        categoryId: cat.id,
      });

      const res = await app.inject({
        method: "GET",
        url: "/v1/blog/categories",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.categories).toHaveLength(1);
      expect(data.categories[0].slug).toBe("pharmacology");
      expect(data.categories[0].postCount).toBe(1);
    });
  });

  describe("Admin Blog CMS Authorization & Endpoints", () => {
    test("Non-admin user gets 403 Forbidden on admin blog endpoints", async () => {
      const { app, student } = await setupTestApp();

      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/blog/posts",
        cookies: { avana_session: student.sessionToken },
      });

      expect(res.statusCode).toBe(403);
    });

    test("Unauthenticated request gets 401 Unauthorized", async () => {
      const { app } = await setupTestApp();

      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/blog/posts",
      });

      expect(res.statusCode).toBe(401);
    });

    test("Platform admin can create, update, preview, publish, unpublish, and delete posts", async () => {
      const { app, platformAdmin } = await setupTestApp();
      const adminCookie = { avana_session: platformAdmin.sessionToken };

      // 1. Create Draft Post
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/admin/blog/posts",
        cookies: adminCookie,
        payload: {
          title: "مقاله جدید ادمین",
          content: "محتوای مقاله جدید برای تست سیستم CMS...",
          status: "draft",
          tagNames: ["داروسازی", "فارماکوکینتیک"],
        },
      });

      expect(createRes.statusCode).toBe(201);
      const createdPost = createRes.json().post;
      expect(createdPost.title).toBe("مقاله جدید ادمین");
      expect(createdPost.status).toBe("draft");
      const postId = createdPost.id;

      // 2. Admin Preview Draft Post (200 OK even though it's draft)
      const previewRes = await app.inject({
        method: "GET",
        url: `/v1/admin/blog/posts/${postId}/preview`,
        cookies: adminCookie,
      });
      expect(previewRes.statusCode).toBe(200);
      expect(previewRes.json().post.id).toBe(postId);

      // 3. Publish Post
      const publishRes = await app.inject({
        method: "POST",
        url: `/v1/admin/blog/posts/${postId}/publish`,
        cookies: adminCookie,
      });
      expect(publishRes.statusCode).toBe(200);
      expect(publishRes.json().post.status).toBe("published");

      // Verify it is now visible publicly
      const pubListRes = await app.inject({
        method: "GET",
        url: "/v1/blog/posts",
      });
      expect(pubListRes.json().posts.some((p: any) => p.id === postId)).toBe(true);

      // 4. Update Post
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/blog/posts/${postId}`,
        cookies: adminCookie,
        payload: {
          title: "عنوان به روز شده توسط ادمین",
        },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().post.title).toBe("عنوان به روز شده توسط ادمین");

      // 5. Unpublish Post
      const unpubRes = await app.inject({
        method: "POST",
        url: `/v1/admin/blog/posts/${postId}/unpublish`,
        cookies: adminCookie,
      });
      expect(unpubRes.statusCode).toBe(200);
      expect(unpubRes.json().post.status).toBe("draft");

      // Verify it is no longer visible publicly
      const pubListAfterUnpub = await app.inject({
        method: "GET",
        url: "/v1/blog/posts",
      });
      expect(pubListAfterUnpub.json().posts.some((p: any) => p.id === postId)).toBe(false);

      // 6. Delete Post
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/v1/admin/blog/posts/${postId}`,
        cookies: adminCookie,
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().success).toBe(true);
    });
  });
});
