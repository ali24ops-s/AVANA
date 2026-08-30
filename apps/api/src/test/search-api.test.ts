// @ts-nocheck
import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/index.js";
import { InMemorySearchStore } from "../modules/search/index.js";
import type {
  CourseId,
  OrganizationId,
  UserId,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Global Search Backend Integration & Access Control Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let contentPackStore: InMemoryContentPackStore;
  let searchStore: InMemorySearchStore;
  let app: ReturnType<typeof createApp>;

  const systemOrgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;

  beforeEach(async () => {
    config = makeTestConfig();
    config.systemOrganizationId = systemOrgId;

    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    contentPackStore = new InMemoryContentPackStore(userStore);
    searchStore = new InMemorySearchStore(
      courseStore,
      organizationStore,
      contentPackStore,
    );

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      contentPackStore,
      searchStore,
    });
  });

  async function createTestUser(email: string, name: string) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    return {
      userId: body.user.id as UserId,
      token: extractSessionToken(res)!,
      email: body.user.email,
      name,
    };
  }

  async function createOrg(token: string, name: string) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      organization: { id: string; name: string };
    };
    return body.organization;
  }

  it("1. Denies access to unauthenticated requests (401)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=فارما",
    });
    expect(res.statusCode).toBe(401);
  });

  it("2. Validates empty and whitespace query parameter (400)", async () => {
    const user = await createTestUser("user1@example.com", "User One");

    const resEmpty = await app.inject({
      method: "GET",
      url: "/v1/search?q=",
      cookies: { avana_session: user.token },
    });
    expect(resEmpty.statusCode).toBe(400);

    const resSpaces = await app.inject({
      method: "GET",
      url: "/v1/search?q=   ",
      cookies: { avana_session: user.token },
    });
    expect(resSpaces.statusCode).toBe(400);
  });

  it("3. Searches user-accessible courses with substring and case-insensitivity", async () => {
    const userA = await createTestUser("usera@example.com", "User A");
    const orgA = await createOrg(userA.token, "Medical School A");

    // Add Course to Org A
    const courseId1 = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId1,
        organizationId: orgA.id as OrganizationId,
        name: "فارماکولوژی ۱",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Add another Course to Org A
    const courseId2 = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId2,
        organizationId: orgA.id as OrganizationId,
        name: "شیمی دارویی ۲",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Search with trimmed query "فارما"
    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=%20فارما%20",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.query).toBe("فارما");
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.courses[0].id).toBe(courseId1);
    expect(body.grouped.courses[0].title).toBe("فارماکولوژی ۱");
    expect(body.grouped.courses[0].type).toBe("course");
    expect(body.grouped.courses[0].target_url).toBe(`/courses/${courseId1}`);
  });

  it("4. Access Control / Security: User A CANNOT see User B's private course in another organization", async () => {
    const userA = await createTestUser("usera@example.com", "User A");
    const userB = await createTestUser("userb@example.com", "User B");

    await createOrg(userA.token, "Org A");
    const orgB = await createOrg(userB.token, "Org B");

    // Course in User B's private Org B
    const privateCourseB = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: privateCourseB,
        organizationId: orgB.id as OrganizationId,
        name: "رازهای دارویی محرمانه",
        subject: "محرمانه",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // User A searches for User B's course title
    const resA = await app.inject({
      method: "GET",
      url: "/v1/search?q=رازهای",
      cookies: { avana_session: userA.token },
    });

    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body);
    expect(bodyA.grouped.courses.length).toBe(0);
    expect(bodyA.results.length).toBe(0);

    // User B searches and CAN find their own course
    const resB = await app.inject({
      method: "GET",
      url: "/v1/search?q=رازهای",
      cookies: { avana_session: userB.token },
    });

    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.body);
    expect(bodyB.grouped.courses.length).toBe(1);
    expect(bodyB.grouped.courses[0].id).toBe(privateCourseB);
  });

  it("5. Searches Shared System Courses and Public Content Packs", async () => {
    const userA = await createTestUser("usera@example.com", "User A");

    // Shared system course (systemOrganizationId)
    const sysCourseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: sysCourseId,
        organizationId: systemOrgId,
        name: "فارماسیوتیکس عمومی سیستم",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Published Public Content Pack in Avana Library
    const packId = randomUUID();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "خلاصه فارماسیوتیکس و دارورسانی",
        description: "مجموعه ۴ تایی شامل درسنامه و فلش‌کارت",
        subject: "داروسازی",
        status: "published",
        publishedAt: new Date().toISOString(),
        usageCount: 15,
        metadata: { sessionCount: 4 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    // Unpublished / Archived Content Pack (should NOT appear)
    const draftPackId = randomUUID();
    await contentPackStore.create(
      {
        id: draftPackId,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "فارماسیوتیکس پیش‌نویس خصوصی",
        description: "هنوز منتشر نشده",
        subject: "داروسازی",
        status: "archived",
        publishedAt: new Date().toISOString(),
        usageCount: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=فارماسیوتیکس",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Verified: Both system course and published content pack returned
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.courses[0].id).toBe(sysCourseId);
    expect(body.grouped.courses[0].title).toBe("فارماسیوتیکس عمومی سیستم");

    expect(body.grouped.shared_content.length).toBe(1);
    expect(body.grouped.shared_content[0].id).toBe(packId);
    expect(body.grouped.shared_content[0].title).toBe("خلاصه فارماسیوتیکس و دارورسانی");
    expect(body.grouped.shared_content[0].target_url).toBe(`/library?packId=${packId}`);

    // Total count & results combined
    expect(body.total).toBe(2);
    expect(body.results.length).toBe(2);
  });

  it("6. Ranks exact match and prefix match higher than distant substring", async () => {
    const userA = await createTestUser("usera@example.com", "User A");
    const orgA = await createOrg(userA.token, "Med Org");

    // 1. Partial substring in middle
    await courseStore.create({
      course: {
        id: randomUUID() as CourseId,
        organizationId: orgA.id as OrganizationId,
        name: "مقدمات و مبانی فارماکولوژی",
        subject: "پزشکی",
        examDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Starts with query
    const prefixCourseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: prefixCourseId,
        organizationId: orgA.id as OrganizationId,
        name: "فارماکولوژی پیشرفته",
        subject: "پزشکی",
        examDate: null,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 3. Exact title match
    const exactCourseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: exactCourseId,
        organizationId: orgA.id as OrganizationId,
        name: "فارماکولوژی",
        subject: "پزشکی",
        examDate: null,
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=فارماکولوژی",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const courses = body.grouped.courses;

    expect(courses.length).toBe(3);
    // Exact match is rank 1
    expect(courses[0].id).toBe(exactCourseId);
    expect(courses[0].title).toBe("فارماکولوژی");
    // Prefix match is rank 2
    expect(courses[1].id).toBe(prefixCourseId);
    expect(courses[1].title).toBe("فارماکولوژی پیشرفته");
    // Substring is rank 3
    expect(courses[2].title).toBe("مقدمات و مبانی فارماکولوژی");
  });

  it("7. Limit parameter restricts result size properly", async () => {
    const userA = await createTestUser("usera@example.com", "User A");
    const orgA = await createOrg(userA.token, "Med Org 2");

    for (let i = 1; i <= 8; i++) {
      await courseStore.create({
        course: {
          id: randomUUID() as CourseId,
          organizationId: orgA.id as OrganizationId,
          name: `زیست‌شناسی پایه ${i}`,
          subject: "زیست",
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=زیست&limit=3",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(3);
  });

  it("8. Returns 200 with empty results array when no content matches", async () => {
    const userA = await createTestUser("usera@example.com", "User A");
    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=عبارت_ناموجود_کاملا_نامعتبر",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(0);
    expect(body.results).toEqual([]);
    expect(body.grouped.courses).toEqual([]);
    expect(body.grouped.shared_content).toEqual([]);
  });

  it("9. Case-insensitive Latin search matching", async () => {
    const userA = await createTestUser("usera@example.com", "User A");
    const orgA = await createOrg(userA.token, "International Med");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgA.id as OrganizationId,
        name: "Cardiology & Vascular Systems",
        subject: "Cardiology",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=cardio",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.courses[0].id).toBe(courseId);
  });

  it("10. Ranking for Shared Content Packs (Exact match ranked above description match)", async () => {
    const userA = await createTestUser("usera@example.com", "User A");

    // Pack 1: Contains in description
    const pack1Id = randomUUID();
    await contentPackStore.create(
      {
        id: pack1Id,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "مرور نکات دارویی قلب",
        description: "شامل مباحث مربوط به فارماکوکینتیک و دوز دارو",
        subject: "داروسازی",
        status: "published",
        publishedAt: "2026-01-01T00:00:00.000Z",
        usageCount: 10,
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
      [],
    );

    // Pack 2: Exact title match
    const pack2Id = randomUUID();
    await contentPackStore.create(
      {
        id: pack2Id,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "فارماکوکینتیک",
        description: "توضیحات کلی",
        subject: "داروسازی",
        status: "published",
        publishedAt: "2026-01-02T00:00:00.000Z",
        usageCount: 20,
        metadata: {},
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=فارماکوکینتیک",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const packs = body.grouped.shared_content;

    expect(packs.length).toBe(2);
    // Exact match is rank 1
    expect(packs[0].id).toBe(pack2Id);
    expect(packs[0].title).toBe("فارماکوکینتیک");
    // Description match is rank 2
    expect(packs[1].id).toBe(pack1Id);
  });
});

