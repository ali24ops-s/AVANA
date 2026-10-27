import { describe, test, expect } from "vitest";
import sharp from "sharp";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import {
  asCourseId,
  asOrganizationId,
  type CourseStatus,
} from "@avana/domain";
import {
  defaultCourseCardCache,
  CourseCardCache,
} from "../routes/course-card-renderer.js";

describe("Course Share & Open Graph Endpoints (/share/courses/:id)", () => {
  async function setupTestApp(courseStore?: InMemoryCourseStore) {
    const config = loadApiConfig();
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const store = courseStore ?? new InMemoryCourseStore();

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      courseStore: store,
      organizationStore: orgStore,
    });

    return { app, courseStore: store };
  }

  test("GET /share/courses/:courseId for published official course returns 200 HTML with full Open Graph tags and redirect", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000001");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000002");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی پایه و بالینی",
        description: "مجموعه جامع آموزش داروشناسی بالینی برای دانشجویان داروسازی",
        subject: "فارماکولوژی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");

    const html = response.body;
    expect(html).toContain('<meta property="og:title" content="فارماکولوژی پایه و بالینی | دوره آموزشی در آوانا">');
    expect(html).toContain('<meta property="og:description" content="مجموعه جامع آموزش داروشناسی بالینی برای دانشجویان داروسازی">');
    expect(html).toContain(`courses/${courseId}`);
    expect(html).toContain('property="og:image"');
    expect(html).toContain('meta property="og:locale" content="fa_IR"');
    expect(html).toContain('meta property="og:site_name" content="آوانا (AVANA)"');
    // Ensure browser redirect exists
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain(`window.location.replace`);
  });

  test("GET /share/courses/:courseId for private/personal course does NOT leak title or description in public HTML", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000003");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000004");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "جزوه محرمانه داخلی دکتر احمدی",
        description: "اسناد خصوصی و آزمون‌های طبقه‌بندی شده بیمارستان امام خمینی",
        subject: "خصوصی",
        status: "draft" as CourseStatus,
        isOfficial: false,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    const html = response.body;
    // Private title and private description MUST NEVER appear in HTML
    expect(html).not.toContain("جزوه محرمانه داخلی دکتر احمدی");
    expect(html).not.toContain("اسناد خصوصی و آزمون‌های طبقه‌بندی شده");
    // Should render neutral branding metadata
    expect(html).toContain('<meta property="og:title" content="مشاهده دوره در آوانا | AVANA">');
    expect(html).toContain("وارد حساب کاربری خود در آوانا شوید");
  });

  test("GET /share/courses/:courseId for deleted or non-existent course returns 404 HTML", async () => {
    const { app } = await setupTestApp();

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/99999999-9999-4999-a999-999999999999`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain("دوره مورد نظر در دسترس نیست");
  });

  test("GET /share/courses/:courseId sanitizes and escapes malicious script tags in course title", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000005");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000006");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: 'داروشناسی <script>alert("xss")</script>',
        description: 'شیمی دارویی "><img src=x onerror=alert(1)>',
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    const html = response.body;
    expect(html).not.toContain("<script>alert(");
    expect(html).toContain("&lt;script&gt;alert");
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  test("GET /v1/courses/:courseId/share-preview returns JSON with proper visibility differentiation", async () => {
    const { app, courseStore } = await setupTestApp();

    const officialCourseId = asCourseId("00000000-0000-4000-a000-000000000007");
    const privateCourseId = asCourseId("00000000-0000-4000-a000-000000000008");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000009");

    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: orgId,
        name: "شیمی دارویی ۱",
        description: "مبانی ساختار شیمیایی داروها",
        subject: "شیمی دارویی",
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
        id: privateCourseId,
        organizationId: orgId,
        name: "پیش‌نویس شخصی من",
        description: "یادداشت‌های محرمانه",
        subject: null,
        status: "draft" as CourseStatus,
        isOfficial: false,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Test official course JSON: should point to dedicated card when no cover
    const res1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${officialCourseId}/share-preview`,
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.isPublic).toBe(true);
    expect(body1.title).toBe("شیمی دارویی ۱");
    expect(body1.description).toBe("مبانی ساختار شیمیایی داروها");
    expect(body1.imageUrl).toContain(`/v1/share/courses/${officialCourseId}/card.png`);

    // Test private course JSON: should point to safe generic brand card
    const res2 = await app.inject({
      method: "GET",
      url: `/v1/courses/${privateCourseId}/share-preview`,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.isPublic).toBe(false);
    expect(body2.title).toBe("مشاهده دوره در آوانا");
    expect(body2.description).toBeNull();
    expect(body2.imageUrl).toContain("/brand/avana-share-card.png");
  });

  test("GET /share/courses/:courseId without description uses clean, non-promotional Persian default text", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000010");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000011");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فیزیولوژی اعصاب",
        description: null,
        subject: "پزشکی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    const html = response.body;
    expect(html).toContain('content="آموزش و یادگیری دوره «فیزیولوژی اعصاب» در سامانه هوشمند یادگیری آوانا."');
    expect(html).toContain('property="og:image:secure_url"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  test("GET /share/courses/:courseId with custom cover image renders absolute image url and correct meta tags", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000012");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000013");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "آناتومی سر و گردن",
        description: "دوره جامع کالبدشناسی سر و گردن برای دندانپزشکی",
        subject: "آناتومی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        coverImage: "https://cdn.avana.ir/covers/anatomy-head-neck.jpg",
      } as any,
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    const html = response.body;
    expect(html).toContain('content="https://cdn.avana.ir/covers/anatomy-head-neck.jpg"');
    expect(html).toContain('property="og:image:type" content="image/jpeg"');
    expect(html).toContain('property="og:image:alt" content="تصویر دوره آموزشی آناتومی سر و گردن"');
    expect(html).toContain('name="twitter:image" content="https://cdn.avana.ir/covers/anatomy-head-neck.jpg"');
  });

  test("GET /share/courses/:courseId with long description truncates cleanly without breaking words", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000014");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000015");

    const longDescription =
      "این دوره آموزشی به بررسی تفصیلی پاتولوژی و آسیب‌شناسی عمومی و اختصاصی انواع بیماری‌های التهابی، عفونی، ژنتیکی و نئوپلاستیک با تمرکز ویژه بر درک مکانیسم‌های سلولی، مولکولی و میکروسکوپی ضایعات بافتی برای دانشجویان پزشکی می‌پردازد.";

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "پاتولوژی عمومی",
        description: longDescription,
        subject: "پاتولوژی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    const html = response.body;
    // Must contain ellipsis and not exceed ~185 characters
    expect(html).toContain("…");
    const descMatch = html.match(/property="og:description" content="([^"]+)"/);
    expect(descMatch).toBeTruthy();
    expect(descMatch![1].length).toBeLessThanOrEqual(185);
  });

  test("GET /courses/:courseId crawler alias returns identical rich HTML metadata", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000016");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000017");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "بیوشیمی بالینی",
        description: "متابولیسم کربوهیدرات‌ها و چربی‌ها",
        subject: "بیوشیمی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("بیوشیمی بالینی");
    expect(response.body).toContain("property=\"og:image\"");
  });

  test("GET /brand/avana-share-card.png returns 200 with image/png content type", async () => {
    const { app } = await setupTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/brand/avana-share-card.png",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body.length).toBeGreaterThan(100);
  });

  test("Social crawlers (TelegramBot) receive rich Open Graph tags WITHOUT meta-refresh redirection", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000018");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000019");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "سم‌شناسی پایه",
        description: "مبانی مسمومیت‌ها و پادزهرها",
        subject: "سم‌شناسی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Request from TelegramBot
    const crawlerResponse = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
      headers: {
        "user-agent": "TelegramBot (like TwitterBot)",
      },
    });

    expect(crawlerResponse.statusCode).toBe(200);
    const crawlerHtml = crawlerResponse.body;
    expect(crawlerHtml).toContain('property="og:title"');
    expect(crawlerHtml).toContain('property="og:image"');
    // Crawler must NOT be redirected so it extracts the Open Graph tags reliably
    expect(crawlerHtml).not.toContain('http-equiv="refresh"');
    expect(crawlerHtml).not.toContain("window.location.replace");

    // Request from normal human browser
    const browserResponse = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}`,
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    });

    expect(browserResponse.statusCode).toBe(200);
    const browserHtml = browserResponse.body;
    // Human browser MUST receive redirect to SPA route
    expect(browserHtml).toContain('http-equiv="refresh"');
    expect(browserHtml).toContain("window.location.replace");
  });

  test("coverImage with data URI or localhost falls back safely to brand share card", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId1 = asCourseId("00000000-0000-4000-a000-000000000020");
    const courseId2 = asCourseId("00000000-0000-4000-a000-000000000021");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000022");

    // Course with data URI cover
    await courseStore.create({
      course: {
        id: courseId1,
        organizationId: orgId,
        name: "دوره دیتا یو آر آی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        subject: null,
        coverImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      } as any,
      auditEvents: [],
    });

    // Course with localhost cover
    await courseStore.create({
      course: {
        id: courseId2,
        organizationId: orgId,
        name: "دوره لوکال هاست",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        subject: null,
        coverImage: "http://localhost:9000/bucket/cover.png",
      } as any,
      auditEvents: [],
    });

    const res1 = await app.inject({ method: "GET", url: `/share/courses/${courseId1}` });
    expect(res1.body).toContain(`/v1/share/courses/${courseId1}/card.png`);
    expect(res1.body).not.toContain("data:image/png;base64");

    const res2 = await app.inject({ method: "GET", url: `/share/courses/${courseId2}` });
    expect(res2.body).toContain(`/v1/share/courses/${courseId2}/card.png`);
    expect(res2.body).not.toContain("localhost:9000");
  });

  test("GET /v1/share/courses/:courseId/card.png generates valid 1200x630 PNG with correct headers and subject badge", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000030");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000031");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی پایه و بالینی",
        description: "مبانی و اصول کاربردی داروشناسی برای دانشجویان علوم پزشکی",
        subject: "فارماکولوژی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toContain("public, max-age=86400");
    expect(response.headers["etag"]).toBeDefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");

    const buffer = response.rawPayload;
    expect(buffer.length).toBeGreaterThan(10000);

    // Verify true PNG dimensions and format using Sharp
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  test("GET /v1/share/courses/:courseId/card.png with long Persian title and without subject renders cleanly", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000032");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000033");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره جامع آسیب‌شناسی بالینی و اصول تشخیصی بیماری‌های عفونی و التهابی پیشرفته",
        description: null,
        subject: null, // No subject: subject badge should be omitted
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");

    const metadata = await sharp(response.rawPayload).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  test("GET /v1/share/courses/:courseId/card.png for private or draft course preserves privacy and returns brand fallback", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000034");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000035");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "طرح محرمانه استراتژیک دکتر شریعتی",
        description: "اطلاعات خصوصی داخلی",
        subject: "محرمانه",
        status: "draft" as CourseStatus,
        isOfficial: false, // Private
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toContain("private");
    expect(response.headers["cache-control"]).toContain("no-cache");

    // Must be valid PNG
    const metadata = await sharp(response.rawPayload).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  test("GET /v1/share/courses/:courseId/card.png for deleted or non-existent course returns 404", async () => {
    const { app } = await setupTestApp();

    const nonExistentId = asCourseId("00000000-0000-4000-a000-000000000099");
    const response = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${nonExistentId}/card.png`,
    });

    expect(response.statusCode).toBe(404);
  });

  test("Card caching and ETag: returns 304 Not Modified when If-None-Match matches", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000036");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000037");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "شیمی آلی پیشرفته",
        description: "مباحث واکنش‌های شیمی آلی",
        subject: "شیمی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: "2026-01-01T10:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    // First request: 200 + ETag
    const res1 = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
    });
    expect(res1.statusCode).toBe(200);
    const etag = res1.headers["etag"] as string;
    expect(etag).toBeDefined();

    // Second request with If-None-Match: 304 Not Modified
    const res2 = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
      headers: {
        "if-none-match": etag,
      },
    });
    expect(res2.statusCode).toBe(304);
    expect(res2.body).toBe("");
  });

  test("Cache invalidation: modifies course title/updatedAt triggers re-rendering of card", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000038");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000039");

    const courseRecord = await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "نسخه اولیه دوره ژنتیک",
        description: "مباحث اولیه",
        subject: "ژنتیک",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: "2026-01-01T10:00:00.000Z",
        updatedAt: "2026-01-01T10:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    const res1 = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
    });
    expect(res1.statusCode).toBe(200);
    const etag1 = res1.headers["etag"];

    // Update course name and updatedAt
    await courseStore.update({
      ...courseRecord,
      name: "نسخه جدید و ویرایش‌شده ژنتیک بالینی",
      updatedAt: "2026-06-01T12:00:00.000Z",
    });

    const res2 = await app.inject({
      method: "GET",
      url: `/v1/share/courses/${courseId}/card.png`,
    });
    expect(res2.statusCode).toBe(200);
    const etag2 = res2.headers["etag"];

    // ETag must change to invalidate client/proxy cache
    expect(etag2).not.toBe(etag1);
  });

  test("CourseCardCache LRU capacity limit evicts oldest entry without leaking memory", () => {
    const cache = new CourseCardCache(3, 1); // Max 3 entries

    cache.set("course-1", {
      buffer: Buffer.from("img1"),
      etag: 'W/"1"',
      updatedAt: "v1",
      title: "Title 1",
      subject: null,
      timestamp: Date.now(),
    });
    cache.set("course-2", {
      buffer: Buffer.from("img2"),
      etag: 'W/"2"',
      updatedAt: "v1",
      title: "Title 2",
      subject: null,
      timestamp: Date.now(),
    });
    cache.set("course-3", {
      buffer: Buffer.from("img3"),
      etag: 'W/"3"',
      updatedAt: "v1",
      title: "Title 3",
      subject: null,
      timestamp: Date.now(),
    });

    expect(cache.size).toBe(3);

    // Add 4th item: oldest (course-1) must be evicted
    cache.set("course-4", {
      buffer: Buffer.from("img4"),
      etag: 'W/"4"',
      updatedAt: "v1",
      title: "Title 4",
      subject: null,
      timestamp: Date.now(),
    });

    expect(cache.size).toBe(3);
    expect(cache.get("course-1", "v1", "Title 1", null)).toBeUndefined();
    expect(cache.get("course-2", "v1", "Title 2", null)).toBeDefined();
    expect(cache.get("course-4", "v1", "Title 4", null)).toBeDefined();
  });

  test("Canonical alias /share/courses/:courseId/card.png behaves identically", async () => {
    const { app, courseStore } = await setupTestApp();

    const courseId = asCourseId("00000000-0000-4000-a000-000000000040");
    const orgId = asOrganizationId("00000000-0000-4000-a000-000000000041");

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "آناتومی عمومی",
        description: null,
        subject: "پزشکی",
        status: "published" as CourseStatus,
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const response = await app.inject({
      method: "GET",
      url: `/share/courses/${courseId}/card.png`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    const metadata = await sharp(response.rawPayload).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });
});
