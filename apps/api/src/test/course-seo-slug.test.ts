/* eslint-disable no-secrets/no-secrets */
import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryCourseStore,
  InMemoryCoursePublicationStore,
} from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { hashToken } from "../modules/identity/session-service.js";
import { v1Routes } from "../routes/v1.js";
import {
  asCourseId,
  asOrganizationId,
  asUserId,
  type CourseStatus,
} from "@avana/domain";

describe("SEO-Friendly Course Slugs & URL Migration", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const courseStore = new InMemoryCourseStore();
    const coursePublicationStore = new InMemoryCoursePublicationStore();
    courseStore.setPublicationStore(coursePublicationStore);
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      courseStore,
      coursePublicationStore,
      organizationStore: orgStore,
      moduleStore,
      lessonStore,
      progressStore,
    });

    const user = await userStore.createUserWithPassword({
      email: "student@avana.ir",
      passwordHash: "hash",
      name: "Student User",
    });

    const rawSessionToken = "test-token-123456789";
    const session = await sessionStore.insert({
      userId: user.id,
      tokenHash: hashToken(rawSessionToken),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    return {
      app,
      config,
      courseStore,
      coursePublicationStore,
      orgStore,
      userStore,
      moduleStore,
      lessonStore,
      progressStore,
      user,
      session,
      sessionToken: rawSessionToken,
    };
  }

  test("1. Course can be resolved by both canonical UUID and SEO slug in course store", async () => {
    const { courseStore } = await setupTestApp();
    const courseId = asCourseId("00000000-0000-4000-a000-000000000050");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000051");

    await courseStore.create({
      course: {
        id: courseId,
        slug: "pharmacology-2",
        organizationId: orgId,
        name: "فارماکولوژی ۲",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Resolve by UUID
    const byUuid = await courseStore.findByIdOrSlug(courseId);
    expect(byUuid).toBeDefined();
    expect(byUuid?.course.id).toBe(courseId);
    expect(byUuid?.course.slug).toBe("pharmacology-2");
    expect(byUuid?.isRedirect).toBe(false);

    // Resolve by Slug
    const bySlug = await courseStore.findByIdOrSlug("pharmacology-2");
    expect(bySlug).toBeDefined();
    expect(bySlug?.course.id).toBe(courseId);
    expect(bySlug?.course.slug).toBe("pharmacology-2");
    expect(bySlug?.isRedirect).toBe(false);
  });

  test("2. Learning API (/v1/courses/:courseId/learn) accepts both UUID and SEO slug", async () => {
    const { app, config, courseStore, sessionToken } = await setupTestApp();
    const courseId = asCourseId("00000000-0000-4000-a000-000000000060");
    const orgId = asOrganizationId(config.systemOrganizationId);

    await courseStore.create({
      course: {
        id: courseId,
        slug: "medicinal-chemistry-1",
        organizationId: orgId,
        name: "شیمی دارویی ۱",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Call GET /v1/courses/:courseId/learn with UUID
    const resByUuid = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
    expect(resByUuid.statusCode).toBe(200);
    const bodyUuid = JSON.parse(resByUuid.body);
    expect(bodyUuid.course.id).toBe(courseId);
    expect(bodyUuid.course.slug).toBe("medicinal-chemistry-1");

    // Call GET /v1/courses/:courseId/learn with Slug
    const resBySlug = await app.inject({
      method: "GET",
      url: `/v1/courses/medicinal-chemistry-1/learn`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
    expect(resBySlug.statusCode).toBe(200);
    const bodySlug = JSON.parse(resBySlug.body);
    expect(bodySlug.course.id).toBe(courseId);
    expect(bodySlug.course.slug).toBe("medicinal-chemistry-1");
  });

  test("3. Updating course title does NOT change its slug (immutability)", async () => {
    const { courseStore } = await setupTestApp();
    const courseId = asCourseId("00000000-0000-4000-a000-000000000070");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000071");

    await courseStore.create({
      course: {
        id: courseId,
        slug: "pharmacology-intro",
        organizationId: orgId,
        name: "مقدمات فارماکولوژی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Update course title
    const current = await courseStore.findById(courseId);
    expect(current).toBeDefined();
    current!.name = "فارماکولوژی پیشرفته و بالینی ویرایش جدید";
    await courseStore.update(current!);

    const updated = await courseStore.findById(courseId);
    expect(updated?.name).toBe("فارماکولوژی پیشرفته و بالینی ویرایش جدید");
    // Slug remains unchanged
    expect(updated?.slug).toBe("pharmacology-intro");
  });

  test("4. Updating slug manually registers 301 redirect and prevents loops", async () => {
    const { app, courseStore } = await setupTestApp();
    const courseId = asCourseId("00000000-0000-4000-a000-000000000080");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000081");

    await courseStore.create({
      course: {
        id: courseId,
        slug: "old-pharma-slug",
        organizationId: orgId,
        name: "فارماکولوژی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Update slug to new-pharma-slug
    await courseStore.updateCourseSlug(courseId, "new-pharma-slug");

    // Resolving old slug returns isRedirect: true
    const resOld = await courseStore.findByIdOrSlug("old-pharma-slug");
    expect(resOld).toBeDefined();
    expect(resOld?.course.id).toBe(courseId);
    expect(resOld?.course.slug).toBe("new-pharma-slug");
    expect(resOld?.isRedirect).toBe(true);

    // Resolving new slug returns isRedirect: false
    const resNew = await courseStore.findByIdOrSlug("new-pharma-slug");
    expect(resNew).toBeDefined();
    expect(resNew?.course.id).toBe(courseId);
    expect(resNew?.isRedirect).toBe(false);

    // Requesting old slug via /share/courses/old-pharma-slug returns 301 to new-pharma-slug
    const shareOldRes = await app.inject({
      method: "GET",
      url: `/share/courses/old-pharma-slug`,
    });
    expect(shareOldRes.statusCode).toBe(301);
    expect(shareOldRes.headers.location).toContain("/courses/new-pharma-slug");

    // If admin changes slug back to old-pharma-slug, anti-loop removes it from redirects
    await courseStore.updateCourseSlug(courseId, "old-pharma-slug");
    const resBack = await courseStore.findByIdOrSlug("old-pharma-slug");
    expect(resBack?.isRedirect).toBe(false);
    expect(resBack?.course.slug).toBe("old-pharma-slug");
  });

  test("5. Slug uniqueness collision is rejected", async () => {
    const { courseStore } = await setupTestApp();
    const courseId1 = asCourseId("00000000-0000-4000-a000-000000000091");
    const courseId2 = asCourseId("00000000-0000-4000-a000-000000000092");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000093");

    await courseStore.create({
      course: {
        id: courseId1,
        slug: "unique-biochem",
        organizationId: orgId,
        name: "بیوشیمی ۱",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: courseId2,
        slug: "other-course",
        organizationId: orgId,
        name: "دوره دیگر",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Attempting to assign course 1's slug to course 2 should fail with conflict
    await expect(
      courseStore.updateCourseSlug(courseId2, "unique-biochem"),
    ).rejects.toThrow("قبلاً استفاده شده است");
  });

  test("6. Dynamic /sitemap.xml includes official published courses and excludes drafts/deleted", async () => {
    const { app, courseStore } = await setupTestApp();
    const pubCourseId = asCourseId("00000000-0000-4000-a000-000000000101");
    const draftCourseId = asCourseId("00000000-0000-4000-a000-000000000102");
    const deletedCourseId = asCourseId("00000000-0000-4000-a000-000000000103");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000100");

    // Official published course with slug -> MUST be in sitemap
    await courseStore.create({
      course: {
        id: pubCourseId,
        slug: "public-sitemap-course",
        organizationId: orgId,
        name: "دوره رسمی عمومی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Draft course -> MUST NOT be in sitemap
    await courseStore.create({
      course: {
        id: draftCourseId,
        slug: "secret-draft-course",
        organizationId: orgId,
        name: "دوره پیش‌نویس",
        status: "draft" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Soft-deleted course -> MUST NOT be in sitemap
    await courseStore.create({
      course: {
        id: deletedCourseId,
        slug: "deleted-old-course",
        organizationId: orgId,
        name: "دوره حذف شده",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const sitemapRes = await app.inject({
      method: "GET",
      url: "/sitemap.xml",
    });

    expect(sitemapRes.statusCode).toBe(200);
    expect(sitemapRes.headers["content-type"]).toContain("application/xml");

    const xml = sitemapRes.body;
    expect(xml).toContain("https://aavana.ir/courses/public-sitemap-course");
    expect(xml).not.toContain("secret-draft-course");
    expect(xml).not.toContain("deleted-old-course");
  });

  test("7. Query String preservation in 301 redirects and share pages", async () => {
    const { app, courseStore } = await setupTestApp();
    const courseId = asCourseId("00000000-0000-4000-a000-000000000110");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000111");

    await courseStore.create({
      course: {
        id: courseId,
        slug: "legacy-pharma",
        organizationId: orgId,
        name: "فارماکولوژی کاربردی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.updateCourseSlug(courseId, "active-pharma");

    // Case 1: URL without query string
    const resNoQuery = await app.inject({
      method: "GET",
      url: `/share/courses/legacy-pharma`,
    });
    expect(resNoQuery.statusCode).toBe(301);
    expect(resNoQuery.headers.location).toContain("/courses/active-pharma");
    expect(resNoQuery.headers.location).not.toContain("?");

    // Case 2: URL with multiple UTM parameters
    const resUtm = await app.inject({
      method: "GET",
      url: `/share/courses/legacy-pharma?utm_source=bale&utm_medium=cpc&utm_campaign=winter2026`,
    });
    expect(resUtm.statusCode).toBe(301);
    expect(resUtm.headers.location).toContain(
      "/courses/active-pharma?utm_source=bale&utm_medium=cpc&utm_campaign=winter2026",
    );

    // Case 3: URL with repeated query keys
    const resRepeated = await app.inject({
      method: "GET",
      url: `/share/courses/legacy-pharma?tag=chem&tag=pharma`,
    });
    expect(resRepeated.statusCode).toBe(301);
    expect(resRepeated.headers.location).toContain(
      "/courses/active-pharma?tag=chem&tag=pharma",
    );

    // Case 4: URL with encoded parameters
    const resEncoded = await app.inject({
      method: "GET",
      url: `/share/courses/legacy-pharma?q=%D8%AF%D8%A7%D8%B1%D9%88`,
    });
    expect(resEncoded.statusCode).toBe(301);
    expect(decodeURIComponent(resEncoded.headers.location!)).toContain("/courses/active-pharma?q=دارو");

    // Case 5: Prevention of double '?' syntax
    const countQuestionMarks = (resUtm.headers.location?.match(/\?/g) || []).length;
    expect(countQuestionMarks).toBe(1);
  });

  test("8. Noindex, nofollow and Canonical omission for non-public or draft courses", async () => {
    const { app, courseStore } = await setupTestApp();
    const privateCourseId = asCourseId("00000000-0000-4000-a000-000000000120");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000121");

    await courseStore.create({
      course: {
        id: privateCourseId,
        slug: "confidential-exam-prep",
        organizationId: orgId,
        name: "دوره خصوصی بیمارستان",
        description: "اطلاعات محرمانه پرونده بیماران",
        status: "draft" as CourseStatus,
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
      url: `/share/courses/confidential-exam-prep`,
    });

    expect(res.statusCode).toBe(200);
    const html = res.body;

    // Must contain noindex, nofollow
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');

    // Must NOT contain a canonical link promoting private page to search engines
    expect(html).not.toContain('<link rel="canonical"');

    // Must NOT leak sensitive content
    expect(html).not.toContain("دوره خصوصی بیمارستان");
    expect(html).not.toContain("اطلاعات محرمانه پرونده بیماران");
  });

  describe("Main Course Route (/courses/:courseId) HTTP 301/302 Redirect & Security Matrix", () => {
    test("1. GET دوره رسمی منتشرشده → 301 به Slug", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000201");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000202");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "official-pharmacology-1",
          organizationId: orgId,
          name: "فارماکولوژی ۱ رسمی",
          description: "دوره رسمی مصوب وزارت بهداشت",
          status: "published" as CourseStatus,
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
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toContain("/courses/official-pharmacology-1");
      expect(res.headers["cache-control"]).toContain("public");
    });

    test("2. GET دوره عمومی غیررسمی منتشرشده در کتابخانه → 301 به Slug", async () => {
      const { app, courseStore, coursePublicationStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000203");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000204");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "community-clinical-biochem",
          organizationId: orgId,
          name: "بیوشیمی بالینی جامعه",
          description: "دوره تاییدشده در کتابخانه عمومی آوانا",
          status: "published" as CourseStatus,
          isOfficial: false,
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      await coursePublicationStore.create({
        courseId,
        creatorUserId: asUserId("00000000-0000-4000-a000-000000000205"),
        organizationId: orgId,
        title: "بیوشیمی بالینی جامعه",
        description: "دوره تاییدشده در کتابخانه عمومی آوانا",
        subject: "بیوشیمی",
        version: 1,
        status: "published",
        publishedAt: new Date().toISOString(),
        metadata: {},
        snapshot: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toContain("/courses/community-clinical-biochem");
    });

    test("3. GET دوره خصوصی → 302 به Slug با هدرهای noindex و no-store", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000206");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000207");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "private-clinic-exam",
          organizationId: orgId,
          name: "دوره خصوصی کلینیک",
          description: "دوره داخلی پرسنل",
          status: "published" as CourseStatus,
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
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/courses/private-clinic-exam");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });

    test("4. GET دوره سازمانی غیرعمومی → 302 به Slug", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000208");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000209");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "enterprise-internal-training",
          organizationId: orgId,
          name: "آموزش سازمانی شرکتی",
          description: "محتوای محرمانه سازمانی",
          status: "published" as CourseStatus,
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
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/courses/enterprise-internal-training");
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });

    test("5. GET دوره Draft → 302 به Slug", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000210");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000211");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "draft-anatomy-course",
          organizationId: orgId,
          name: "آناتومی در حال نگارش",
          description: "پیش‌نویس اولیه",
          status: "draft" as CourseStatus,
          isOfficial: true, // Even if official, status draft MUST NOT 301
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      const res = await app.inject({
        method: "GET",
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/courses/draft-anatomy-course");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });

    test("6. GET دوره حذف‌شده → 404 با سیاست noindex", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000212");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000213");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "deleted-toxicology-course",
          organizationId: orgId,
          name: "سم‌شناسی حذف‌شده",
          description: "دوره پاک‌شده",
          status: "published" as CourseStatus,
          isOfficial: true,
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      const res = await app.inject({
        method: "GET",
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(res.body).toContain("دوره مورد نظر در دسترس نیست");
    });

    test("7. GET UUID ناشناخته → 404", async () => {
      const { app } = await setupTestApp();
      const unknownUuid = "00000000-0000-4000-a000-999999999999";

      const res = await app.inject({
        method: "GET",
        url: `/courses/${unknownUuid}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });

    test("8. GET UUID نامعتبر → 404", async () => {
      const { app } = await setupTestApp();
      const invalidUuid = "not-a-valid-uuid-123456789";

      const res = await app.inject({
        method: "GET",
        url: `/courses/${invalidUuid}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });

    test("9. GET بدون Slug معتبر → رفتار مناسب کلاینتی با UUID بدون redirect لوپ", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000214");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000215");

      await courseStore.create({
        course: {
          id: courseId,
          slug: null, // Course without slug
          organizationId: orgId,
          name: "دوره فاقد اسلاگ",
          description: "دوره ویژه",
          status: "published" as CourseStatus,
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
        url: `/courses/${courseId}`,
      });

      // Must not redirect to an empty slug URL; serves preview / 200
      expect(res.statusCode).toBe(200);
      expect(res.headers.location).toBeUndefined();
    });

    test("10. GET همراه UTM → حفظ Query String در ریدایرکت ۳۰۱", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000216");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000217");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "marketing-utm-pharma",
          organizationId: orgId,
          name: "شیمی دارویی بازاریابی",
          description: "دوره تبلیغاتی",
          status: "published" as CourseStatus,
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
        url: `/courses/${courseId}?utm_source=google&utm_medium=cpc&utm_campaign=winter2026`,
      });

      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toContain("/courses/marketing-utm-pharma");
      expect(res.headers.location).toContain("utm_source=google");
      expect(res.headers.location).toContain("utm_medium=cpc");
      expect(res.headers.location).toContain("utm_campaign=winter2026");
    });

    test("11. GET با پارامترهای تکراری → حفظ تمام پارامترها و ترتیب آنها", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000218");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000219");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "tags-repeated-course",
          organizationId: orgId,
          name: "دوره تگ‌های تکراری",
          description: "تست آرایه پارامترها",
          status: "published" as CourseStatus,
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
        url: `/courses/${courseId}?tag=chem&tag=pharma&q=%D8%AF%D8%A7%D8%B1%D9%88`,
      });

      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toContain("tag=chem");
      expect(res.headers.location).toContain("tag=pharma");
      expect(decodeURIComponent(res.headers.location!)).toContain("q=دارو");
    });

    test("12. HEAD → همان Status و Location بدون Body", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000220");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000221");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "head-method-course",
          organizationId: orgId,
          name: "دوره متد هد",
          description: "تست HEAD",
          status: "published" as CourseStatus,
          isOfficial: true,
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      const res = await app.inject({
        method: "HEAD",
        url: `/courses/${courseId}`,
      });

      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toContain("/courses/head-method-course");
      expect(res.body).toBe("");
    });

    test("13. GET اسلاگ → عدم Redirect به خودش (Anti-Loop)", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000222");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000223");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "active-canonical-slug",
          organizationId: orgId,
          name: "دوره اسلاگ فعال",
          description: "تست آنتی لوپ",
          status: "published" as CourseStatus,
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
        url: `/courses/active-canonical-slug`,
      });

      // Must NOT return 301/302 to itself
      expect(res.statusCode).toBe(200);
      expect(res.headers.location).toBeUndefined();
    });

    test("14. Social Crawler → دریافت Preview معتبر برای دوره عمومی", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000224");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000225");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "public-social-course",
          organizationId: orgId,
          name: "دوره عمومی شبکه‌های اجتماعی",
          description: "توضیحات پیش‌نمایش اجتماعی",
          status: "published" as CourseStatus,
          isOfficial: true,
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      // Request using TelegramBot user agent
      const res = await app.inject({
        method: "GET",
        url: `/courses/${courseId}`,
        headers: {
          "user-agent": "TelegramBot (like TwitterBot)",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('property="og:title"');
      expect(res.body).toContain("دوره عمومی شبکه‌های اجتماعی");
      expect(res.body).toContain('property="og:url" content="http://localhost:5173/courses/public-social-course"');
    });

    test("15. Social Crawler برای دوره خصوصی → عدم افشای اطلاعات محرمانه در HTML یا متاتگ‌ها", async () => {
      const { app, courseStore } = await setupTestApp();
      const courseId = asCourseId("00000000-0000-4000-a000-000000000226");
      const orgId = asOrganizationId("00000000-0000-4000-a000-000000000227");

      await courseStore.create({
        course: {
          id: courseId,
          slug: "secret-confidential-hospital",
          organizationId: orgId,
          name: "داده‌های سری بیمارستان میلاد",
          description: "لیست بیماران بستری آی‌سی‌یو",
          status: "published" as CourseStatus,
          isOfficial: false, // Private!
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      const res = await app.inject({
        method: "GET",
        url: `/courses/${courseId}`,
        headers: {
          "user-agent": "WhatsApp/2.21.12.21 i",
        },
      });

      expect(res.statusCode).toBe(200);
      const html = res.body;

      // Must contain noindex
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');

      // Must NOT leak sensitive course title or description
      expect(html).not.toContain("داده‌های سری بیمارستان میلاد");
      expect(html).not.toContain("لیست بیماران بستری آی‌سی‌یو");

      // Must use generic fallback title
      expect(html).toContain("مشاهده دوره در آوانا | AVANA");
    });
  });
});
