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
import { v1Routes } from "../routes/v1.js";
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Rejected Generated Content API", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const sessionService = new SessionService(sessionStore, config.session);

    const platformAdminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ir",
      passwordHash: "x",
    });
    platformAdminUser.name = "مدیر ارشد سامانه";
    platformAdminUser.globalRole = "platform_admin";
    platformAdminUser.role = "platform_admin";
    userStore.insert({ ...platformAdminUser });

    const studentUser = await userStore.createUserWithPassword({
      email: "student@avana.ir",
      passwordHash: "x",
    });

    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: platformAdminUser.id as UserId,
      role: Roles.platform_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const adminSession = await sessionService.createSession(platformAdminUser.id);
    const studentSession = await sessionService.createSession(studentUser.id);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
    });

    return {
      app,
      adminStore,
      adminSessionToken: adminSession.sessionToken,
      studentSessionToken: studentSession.sessionToken,
      orgId,
    };
  }

  test("rejects unauthenticated and non-admin requests", async () => {
    const { app, studentSessionToken } = await setupTestApp();

    // 1. Unauthenticated -> 401
    const resUnauth = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents",
    });
    expect(resUnauth.statusCode).toBe(401);

    // 2. Student (non-admin) -> 403
    const resForbidden = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents",
      headers: {
        authorization: `Bearer ${studentSessionToken}`,
      },
    });
    expect(resForbidden.statusCode).toBe(403);
  });

  test("returns empty list when no rejected contents exist", async () => {
    const { app, adminSessionToken } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toEqual([]);
    expect(body.totalCount).toBe(0);
  });

  test("returns rejected contents with resolved metadata and respects pagination & filtering", async () => {
    const { app, adminStore, adminSessionToken, orgId } = await setupTestApp();

    const courseId1 = randomUUID();
    const courseId2 = randomUUID();

    adminStore.rejectedContents = [
      {
        id: "gen-1",
        organizationId: orgId,
        type: "lesson",
        title: "درس فارماکولوژی ۱",
        courseId: courseId1,
        courseTitle: "دوره داروشناسی",
        documentId: "doc-1",
        documentName: "جزوه داروشناسی.pdf",
        reviewedBy: "دکتر رضایی",
        reviewedAt: "2026-09-13T10:00:00.000Z",
        reviewReason: "اصطلاحات بیوشیمی دقیق نیست",
        model: "gemini-1.5-pro",
        createdAt: "2026-09-13T09:00:00.000Z",
      },
      {
        id: "gen-2",
        organizationId: orgId,
        type: "flashcard",
        title: "فلش‌کارت‌های قلب",
        courseId: courseId2,
        courseTitle: "دوره فیزیولوژی",
        documentId: "doc-2",
        documentName: "قلب و عروق.pdf",
        reviewedBy: "استاد محمدی",
        reviewedAt: "2026-09-13T11:00:00.000Z",
        reviewReason: "تعداد کارت‌ها ناکافی است",
        model: "gemini-1.5-flash",
        createdAt: "2026-09-13T09:30:00.000Z",
      },
      {
        id: "gen-3",
        organizationId: orgId,
        type: "quiz",
        title: "آزمون تستی سلول",
        courseId: courseId1,
        courseTitle: "دوره داروشناسی",
        documentId: "doc-1",
        documentName: "جزوه داروشناسی.pdf",
        reviewedBy: "دکتر رضایی",
        reviewedAt: "2026-09-13T12:00:00.000Z",
        reviewReason: "گزینه‌های نادرست نامفهوم است",
        model: "gemini-1.5-pro",
        createdAt: "2026-09-13T09:45:00.000Z",
      },
    ];

    // 1. Fetch all
    const resAll = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });

    expect(resAll.statusCode).toBe(200);
    const bodyAll = JSON.parse(resAll.body);
    expect(bodyAll.totalCount).toBe(3);
    expect(bodyAll.items.length).toBe(3);
    expect(bodyAll.items[0].title).toBe("درس فارماکولوژی ۱");
    expect(bodyAll.items[0].reviewReason).toBe("اصطلاحات بیوشیمی دقیق نیست");
    expect(bodyAll.items[0].reviewedBy).toBe("دکتر رضایی");

    // 2. Filter by type=flashcard
    const resType = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents?type=flashcard",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });
    const bodyType = JSON.parse(resType.body);
    expect(bodyType.totalCount).toBe(1);
    expect(bodyType.items[0].id).toBe("gen-2");

    // 3. Filter by courseId
    const resCourse = await app.inject({
      method: "GET",
      url: `/v1/admin/generation/rejected-contents?courseId=${courseId2}`,
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });
    const bodyCourse = JSON.parse(resCourse.body);
    expect(bodyCourse.totalCount).toBe(1);
    expect(bodyCourse.items[0].courseTitle).toBe("دوره فیزیولوژی");

    // 4. Search filter (e.g. search "سلول" or "اصطلاحات")
    const resSearch = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents?search=اصطلاحات",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });
    const bodySearch = JSON.parse(resSearch.body);
    expect(bodySearch.totalCount).toBe(1);
    expect(bodySearch.items[0].id).toBe("gen-1");

    // 5. Pagination (page=1, pageSize=2)
    const resPage1 = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents?page=1&pageSize=2",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });
    const bodyPage1 = JSON.parse(resPage1.body);
    expect(bodyPage1.totalCount).toBe(3);
    expect(bodyPage1.items.length).toBe(2);

    const resPage2 = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents?page=2&pageSize=2",
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });
    const bodyPage2 = JSON.parse(resPage2.body);
    expect(bodyPage2.items.length).toBe(1);
    expect(bodyPage2.items[0].id).toBe("gen-3");
  });
});
