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
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/index.js";
import { InMemorySearchStore } from "../modules/search/index.js";
import type {
  CourseId,
  LessonId,
  ModuleId,
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
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
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
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    contentPackStore = new InMemoryContentPackStore(
      userStore,
      courseStore,
      moduleStore,
    );
    searchStore = new InMemorySearchStore(
      courseStore,
      organizationStore,
      contentPackStore,
      moduleStore,
      lessonStore,
    );

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
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

  it("11. Query matching ONLY a Course returns Course with correct type and grouped fields", async () => {
    const userA = await createTestUser("courseonly@example.com", "User Course");
    const orgA = await createOrg(userA.token, "Org Courses");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgA.id as OrganizationId,
        name: "پاتولوژی بالینی اختصاصی",
        subject: "پاتولوژی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=پاتولوژی",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.results.length).toBe(1);
    expect(body.results[0].id).toBe(courseId);
    expect(body.results[0].type).toBe("course");
    expect(body.results[0].title).toBe("پاتولوژی بالینی اختصاصی");
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.educational_packs.length).toBe(0);
    expect(body.grouped.shared_content.length).toBe(0);
  });

  it("12. Query matching ONLY an Educational Pack returns Pack with correct type and grouped fields", async () => {
    const userA = await createTestUser("packonly@example.com", "User Pack");

    const packId = randomUUID();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "بسته آموزشی ایمونولوژی سلولی سرفصل سوم",
        description: "مجموعه فلش‌کارت و درسنامه ایمونو",
        subject: "ایمونولوژی",
        status: "published",
        publishedAt: new Date().toISOString(),
        usageCount: 8,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=ایمونولوژی",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.results.length).toBe(1);
    expect(body.results[0].id).toBe(packId);
    expect(body.results[0].type).toBe("educational_pack");
    expect(body.results[0].title).toBe("بسته آموزشی ایمونولوژی سلولی سرفصل سوم");
    expect(body.results[0].target_url).toBe(`/library?packId=${packId}`);
    expect(body.grouped.courses.length).toBe(0);
    expect(body.grouped.educational_packs.length).toBe(1);
    expect(body.grouped.educational_packs[0].id).toBe(packId);
    expect(body.grouped.shared_content.length).toBe(1);
  });

  it("13. Query matching BOTH Course and Educational Pack returns both in unified results", async () => {
    const userA = await createTestUser("both@example.com", "User Both");
    const orgA = await createOrg(userA.token, "Org Neuro");

    // Course
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgA.id as OrganizationId,
        name: "نورولوژی و علوم اعصاب",
        subject: "اعصاب",
        examDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Pack
    const packId = randomUUID();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "نورولوژی", // Exact match -> higher score
        description: "بسته آموزشی آماده سرفصل سیستم عصبی",
        subject: "اعصاب",
        status: "published",
        publishedAt: "2026-01-02T00:00:00.000Z",
        usageCount: 12,
        metadata: {},
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=نورولوژی",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.results.length).toBe(2);

    // Pack has exact title match "نورولوژی" (score 100), Course has prefix match (score 80)
    expect(body.results[0].id).toBe(packId);
    expect(body.results[0].type).toBe("educational_pack");

    expect(body.results[1].id).toBe(courseId);
    expect(body.results[1].type).toBe("course");

    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.educational_packs.length).toBe(1);
  });

  it("14. Visibility Rules: Unapproved, draft, archived, rejected, or deleted packs NEVER appear in search", async () => {
    const userA = await createTestUser("visibility@example.com", "User Vis");

    // 1. Pending Review Pack
    await contentPackStore.create(
      {
        id: randomUUID(),
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "جنین‌شناسی در حال بررسی",
        description: "توضیحات",
        subject: "پزشکی",
        status: "pending_review",
        publishedAt: new Date().toISOString(),
        usageCount: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    // 2. Rejected Pack
    await contentPackStore.create(
      {
        id: randomUUID(),
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "جنین‌شناسی رد شده",
        description: "توضیحات",
        subject: "پزشکی",
        status: "rejected",
        publishedAt: new Date().toISOString(),
        usageCount: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    // 3. Soft-deleted Pack
    await contentPackStore.create(
      {
        id: randomUUID(),
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "جنین‌شناسی حذف شده",
        description: "توضیحات",
        subject: "پزشکی",
        status: "published",
        publishedAt: new Date().toISOString(),
        usageCount: 0,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
      },
      [],
    );

    // 4. Published Active Pack
    const publishedPackId = randomUUID();
    await contentPackStore.create(
      {
        id: publishedPackId,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "جنین‌شناسی عمومی پزشکی",
        description: "توضیحات کامل",
        subject: "پزشکی",
        status: "published",
        publishedAt: new Date().toISOString(),
        usageCount: 5,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=جنین‌شناسی",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.results.length).toBe(1);
    expect(body.results[0].id).toBe(publishedPackId);
    expect(body.grouped.educational_packs.length).toBe(1);
    expect(body.grouped.educational_packs[0].id).toBe(publishedPackId);
  });

  it("15. Persian query and partial matching handles Persian characters properly", async () => {
    const userA = await createTestUser("persian@example.com", "User Persian");
    const orgA = await createOrg(userA.token, "Persian Org");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgA.id as OrganizationId,
        name: "ژنتیک پزشکی و ژنومیک",
        subject: "ژنتیک",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const packId = randomUUID();
    await contentPackStore.create(
      {
        id: packId,
        creatorUserId: null,
        organizationId: null,
        sourceDocumentId: null,
        title: "بسته مرور سریع ژنتیک مولکولی",
        description: "سرفصل ژنوم و کروموزوم",
        subject: "ژنتیک",
        status: "published",
        publishedAt: new Date().toISOString(),
        usageCount: 3,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      [],
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=ژنتیک",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.courses[0].id).toBe(courseId);
    expect(body.grouped.educational_packs.length).toBe(1);
    expect(body.grouped.educational_packs[0].id).toBe(packId);
  });

  it("16. Real-world scenario: Educational Chapter Packages from published course modules are found by search", async () => {
    const userA = await createTestUser("realworld@example.com", "User Real");

    // Create an official/system course
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی ۱",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Create a module (Chapter Package) under this course
    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل: فارماکولوژی جامع و بالینی داروهای ادرارآور (دیورتیک‌ها)",
      description: "مباحث و جلسات آموزشی استخراج‌شده از فصل ۱۵",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Add a published lesson so this chapter package has real published content
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "مکانیسم اثر دیورتیک‌های تیازیدی و لوپ",
      contentType: "markdown",
      contentMarkdown: "# درسنامه دیورتیک‌ها",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // User searches for "دیورتیک"
    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=دیورتیک",
      cookies: { avana_session: userA.token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.results.length).toBe(1);
    expect(body.results[0].id).toBe(moduleId);
    expect(body.results[0].type).toBe("educational_pack");
    expect(body.results[0].title).toBe("فصل: فارماکولوژی جامع و بالینی داروهای ادرارآور (دیورتیک‌ها)");
    expect(body.results[0].target_url).toBe(`/library?packId=${moduleId}`);
    expect(body.grouped.educational_packs.length).toBe(1);
    expect(body.grouped.educational_packs[0].id).toBe(moduleId);
  });

  it("17. Case 1 & Case 3 — Course published but module has only draft (unpublished) content is NOT returned in Search", async () => {
    const user = await createTestUser("visibility-test@example.com", "User Vis");

    // Create an official/system course
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "فیزیولوژی اعصاب",
        subject: "فیزیولوژی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Create a module with only draft (unpublished) lesson
    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل نوروپاتی دیابتی (پیش‌نویس)",
      description: "سرفصل آموزشی در حال تدوین",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lessonId = randomUUID() as LessonId;
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "مکانیسم نوروپاتی (پیش‌نویس)",
      contentType: "markdown",
      contentMarkdown: "# پیش‌نویس",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "draft", // UNPUBLISHED DRAFT
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Search query should NOT return the unpublished module
    const draftRes = await app.inject({
      method: "GET",
      url: "/v1/search?q=نوروپاتی",
      cookies: { avana_session: user.token },
    });
    expect(draftRes.statusCode).toBe(200);
    const draftBody = JSON.parse(draftRes.body);
    expect(draftBody.total).toBe(0);
    expect(draftBody.grouped.educational_packs.length).toBe(0);

    // Now publish the lesson (Case 1)
    await lessonStore.update({
      id: lessonId,
      moduleId,
      title: "مکانیسم نوروپاتی (منتشرشده)",
      contentType: "markdown",
      contentMarkdown: "# درسنامه کامل",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published", // PUBLISHED
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Now search query MUST return the module
    const pubRes = await app.inject({
      method: "GET",
      url: "/v1/search?q=نوروپاتی",
      cookies: { avana_session: user.token },
    });
    expect(pubRes.statusCode).toBe(200);
    const pubBody = JSON.parse(pubRes.body);
    expect(pubBody.total).toBe(1);
    expect(pubBody.grouped.educational_packs.length).toBe(1);
    expect(pubBody.grouped.educational_packs[0].id).toBe(moduleId);
  });

  it("18. Case 2 — Module in an unpublished private course is NOT returned in public search", async () => {
    const userVisitor = await createTestUser("visitor@example.com", "Visitor User");
    const privateOrgId = randomUUID() as OrganizationId;

    // Create a private course (not system, not official, status default/draft)
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: privateOrgId,
        name: "دوره خصوصی ایمونولوژی",
        subject: "ایمونولوژی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل لنفوسیت T خصوصی",
      description: "محتوای محرمانه",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس لنفوسیت T",
      contentType: "markdown",
      contentMarkdown: "# محتوا",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=لنفوسیت",
      cookies: { avana_session: userVisitor.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(0);
    expect(body.grouped.educational_packs.length).toBe(0);
  });

  it("19. Case 4 — Official course with empty module (no published lessons/packs) is NOT returned merely due to is_official", async () => {
    const user = await createTestUser("empty-official@example.com", "User Empty");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "میکروبیولوژی عمومی رسمی",
        subject: "میکروبیولوژی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const emptyModuleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: emptyModuleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل استافیلوکوکوس اورئوس (خالی بدون محتوا)",
      description: "هنوز درسی ساخته نشده است",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=استافیلوکوکوس",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(0);
    expect(body.grouped.educational_packs.length).toBe(0);
  });

  it("20. Course in 'review' or 'draft' status (even if official) is NOT returned in Search", async () => {
    const user = await createTestUser("review-course@example.com", "User Review");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "فیزیولوژی ۲ در حال بازبینی",
        subject: "فیزیولوژی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
    // Set status to review (unpublished)
    (courseStore as any).update?.({ id: courseId, status: "review", isOfficial: true });

    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل هموستاز و انعقاد خون در بازبینی",
      description: "فصل با درس منتشرشده ولی دوره در بازبینی",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس فیزیولوژی هموستاز",
      contentType: "markdown",
      contentMarkdown: "# درسنامه کامل",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=هموستاز",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(0);
    expect(body.grouped.educational_packs.length).toBe(0);
  });

  it("21. Module with both Published and Draft lessons: query matching ONLY Draft lesson title returns NO result", async () => {
    const user = await createTestUser("mixed-lessons@example.com", "User Mixed");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی اختصاصی",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل آنتی‌بیوتیک‌های بتالاکتام",
      description: "داروهای پنی‌سیلین و سفالوسپورین",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 1. Published lesson
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "پنی‌سیلین‌ها و آموکسی‌سیلین",
      contentType: "markdown",
      contentMarkdown: "# محتوای منتشرشده",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Draft lesson (contains keyword "کارباپنم")
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "کارباپنم‌ها و مروپنم (پیش‌نویس محرمانه)",
      contentType: "markdown",
      contentMarkdown: "# پیش‌نویس",
      sortOrder: 2,
      estimatedMinutes: 10,
      publicationStatus: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Search query matching ONLY the draft lesson title
    const draftRes = await app.inject({
      method: "GET",
      url: "/v1/search?q=کارباپنم",
      cookies: { avana_session: user.token },
    });
    expect(draftRes.statusCode).toBe(200);
    const draftBody = JSON.parse(draftRes.body);
    expect(draftBody.total).toBe(0);
    expect(draftBody.grouped.educational_packs.length).toBe(0);

    // Search query matching the published lesson title
    const pubRes = await app.inject({
      method: "GET",
      url: "/v1/search?q=پنی‌سیلین",
      cookies: { avana_session: user.token },
    });
    expect(pubRes.statusCode).toBe(200);
    const pubBody = JSON.parse(pubRes.body);
    expect(pubBody.total).toBe(1);
    expect(pubBody.grouped.educational_packs.length).toBe(1);
    expect(pubBody.grouped.educational_packs[0].id).toBe(moduleId);
  });

  it("22. Deleted module is NOT returned in Search", async () => {
    const user = await createTestUser("deleted-mod@example.com", "User DelMod");

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "فارماکولوژی غدد",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      subCourseGroupId: null,
      title: "فصل حذف‌شده انسولین",
      description: "فصل حذف‌شده",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(), // DELETED
    });

    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس انسولین گلارژین",
      contentType: "markdown",
      contentMarkdown: "# محتوا",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=انسولین",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(0);
    expect(body.grouped.educational_packs.length).toBe(0);
  });

  it("23. published + official course is searchable in Course Search", async () => {
    const user = await createTestUser("pub-off@example.com", "User PubOff");
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: randomUUID() as OrganizationId,
        name: "دوره فیزیولوژی تنفس رسمی",
        subject: "فیزیولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=تنفس",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.courses[0].id).toBe(courseId);
  });

  it("24. review + official course is NOT searchable in Course Search", async () => {
    const user = await createTestUser("rev-off@example.com", "User RevOff");
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: randomUUID() as OrganizationId,
        name: "دوره فیزیولوژی کلیه در بازبینی",
        subject: "فیزیولوژی",
        status: "review",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=کلیه",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(0);
  });

  it("25. draft + official course is NOT searchable in Course Search", async () => {
    const user = await createTestUser("drf-off@example.com", "User DrfOff");
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: randomUUID() as OrganizationId,
        name: "دوره بافت‌شناسی پیش‌نویس",
        subject: "بافت‌شناسی",
        status: "draft",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=بافت‌شناسی",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(0);
  });

  it("26. published + system organization course is searchable", async () => {
    const user = await createTestUser("pub-sys@example.com", "User PubSys");
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره ژنتیک پزشکی سیستم",
        subject: "ژنتیک",
        status: "published",
        isOfficial: false,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=ژنتیک",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(1);
    expect(body.grouped.courses[0].id).toBe(courseId);
  });

  it("27. review + system organization course is NOT searchable", async () => {
    const user = await createTestUser("rev-sys@example.com", "User RevSys");
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره بیوشیمی بالینی در بررسی سیستم",
        subject: "بیوشیمی",
        status: "review",
        isOfficial: false,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=بیوشیمی",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(0);
  });

  it("28. deleted published course is NOT searchable", async () => {
    const user = await createTestUser("del-pub@example.com", "User DelPub");
    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره تغذیه حذف‌شده",
        subject: "تغذیه",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(), // DELETED
      },
      auditEvents: [],
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/search?q=تغذیه",
      cookies: { avana_session: user.token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.grouped.courses.length).toBe(0);
  });
});


