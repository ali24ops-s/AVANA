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
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryCommerceStore,
  MockPaymentGateway,
} from "../modules/commerce/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  asCourseId,
  asModuleId,
  asLessonId,
  asProductId,
  asUserId,
  asOrganizationId,
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

describe("Commerce & Monetization HTTP Endpoints Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let commerceStore: InMemoryCommerceStore;
  let paymentGateway: MockPaymentGateway;
  let auditService: AuditService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    paymentGateway = new MockPaymentGateway();
    auditService = new AuditService(new InMemoryAuditStore());
  });

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      paymentGateway,
      auditService,
    });
    await app.ready();
    return app;
  }

  async function registerAndLogin(app: any, email: string) {
    const signupRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "Password123!",
        name: "Test Student",
      },
    });
    expect(signupRes.statusCode).toBe(200);
    const sessionToken = extractSessionToken(signupRes);
    const body = JSON.parse(signupRes.body);
    return {
      sessionToken,
      userId: body.user.id,
      cookies: { avana_session: sessionToken },
    };
  }

  it("GET /v1/commerce/products returns 3 subscription plans with Tomans pricing", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/commerce/products",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.length).toBe(3);
    expect(body.items[0].code).toBe("sub_monthly");
    expect(body.items[0].price).toBe(99000);
    expect(body.items[0].currency).toBe("toman");
    expect(body.items[1].code).toBe("sub_quarterly");
    expect(body.items[1].price).toBe(199000);
    expect(body.items[2].code).toBe("sub_yearly");
    expect(body.items[2].price).toBe(599000);
  });

  it("POST /v1/commerce/checkout initializes order and returns redirect URL with authority", async () => {
    const app = await buildTestApp();
    const user = await registerAndLogin(app, "buyer@avana.ir");
    const products = await commerceStore.listActiveProducts();
    const monthly = products.find((p) => p.code === "sub_monthly")!;

    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: user.cookies,
      payload: {
        product_id: monthly.id,
        callback_url: "https://avana.ai/checkout/callback",
      },
    });

    expect(checkoutRes.statusCode).toBe(201);
    const body = JSON.parse(checkoutRes.body);
    expect(body.order_id).toBeDefined();
    expect(body.payment_id).toBeDefined();
    expect(body.authority).toContain("mock_auth_");
    expect(body.payment_url).toContain(body.authority);
  });

  it("GET /v1/commerce/callback verifies payment, creates subscription, and grants runtime entitlement", async () => {
    const app = await buildTestApp();
    const user = await registerAndLogin(app, "verifier@avana.ir");
    const products = await commerceStore.listActiveProducts();
    const monthly = products.find((p) => p.code === "sub_monthly")!;

    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: user.cookies,
      payload: {
        product_id: monthly.id,
        callback_url: "https://avana.ai/checkout/callback",
      },
    });
    const { authority } = JSON.parse(checkoutRes.body);

    const callbackRes = await app.inject({
      method: "GET",
      url: `/v1/commerce/callback?Authority=${authority}&Status=OK`,
    });

    expect(callbackRes.statusCode).toBe(200);
    const callbackBody = JSON.parse(callbackRes.body);
    expect(callbackBody.success).toBe(true);
    expect(callbackBody.transaction_id).toBeDefined();
    expect(callbackBody.entitlement?.resource_type).toBe("subscription");
    expect(callbackBody.entitlement?.resource_id).toBeNull();
    expect(callbackBody.subscription?.id).toBeDefined();

    // Check my subscription endpoint
    const subRes = await app.inject({
      method: "GET",
      url: "/v1/commerce/subscriptions/my",
      cookies: user.cookies,
    });
    expect(subRes.statusCode).toBe(200);
    const subBody = JSON.parse(subRes.body);
    expect(subBody.subscription).toBeDefined();
    expect(subBody.subscription.status).toBe("active");

    // Check my entitlements endpoint
    const entRes = await app.inject({
      method: "GET",
      url: "/v1/commerce/entitlements/my",
      cookies: user.cookies,
    });
    expect(entRes.statusCode).toBe(200);
    const entBody = JSON.parse(entRes.body);
    expect(entBody.items.length).toBe(1);
    expect(entBody.items[0].resource_type).toBe("subscription");
  });

  it("GET /v1/commerce/access/check returns accurate access decisions", async () => {
    const app = await buildTestApp();
    const user = await registerAndLogin(app, "access_check@avana.ir");
    const testCourseId = asCourseId(randomUUID());

    // Initially locked
    const check1 = await app.inject({
      method: "GET",
      url: `/v1/commerce/access/check?resource_type=course&resource_id=${testCourseId}`,
      cookies: user.cookies,
    });
    expect(check1.statusCode).toBe(200);
    const body1 = JSON.parse(check1.body);
    expect(body1.granted).toBe(false);
    expect(body1.reason).toBe("locked");
    expect(body1.availablePurchaseOptions.length).toBeGreaterThanOrEqual(3);

    // After subscribing
    const products = await commerceStore.listActiveProducts();
    const monthly = products.find((p) => p.code === "sub_monthly")!;
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: user.cookies,
      payload: { product_id: monthly.id },
    });
    const { authority } = JSON.parse(checkoutRes.body);
    await app.inject({
      method: "GET",
      url: `/v1/commerce/callback?Authority=${authority}&Status=OK`,
    });

    const check2 = await app.inject({
      method: "GET",
      url: `/v1/commerce/access/check?resource_type=course&resource_id=${testCourseId}`,
      cookies: user.cookies,
    });
    expect(check2.statusCode).toBe(200);
    const body2 = JSON.parse(check2.body);
    expect(body2.granted).toBe(true);
    expect(body2.reason).toBe("subscription");
  });

  it("Preview Security Rule: Course learning endpoint obfuscates markdown for locked lessons", async () => {
    const app = await buildTestApp();
    const user = await registerAndLogin(app, "learner_guard@avana.ir");
    const orgId = asOrganizationId(config.systemOrganizationId);
    const courseId = asCourseId(randomUUID());

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فیزیولوژی اعصاب",
        description: "شرح درس",
        subject: "پزشکی",
        examDate: null,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const moduleId = asModuleId(randomUUID());
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      title: "پودمان ۱: نورون‌ها",
      description: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lesson1Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: lesson1Id,
      moduleId,
      title: "درس ۱: مقدمه (رایگان)",
      contentType: "markdown",
      contentMarkdown: "# متن کامل درس ۱ مقدمه",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lesson1Id}`,
      type: "content",
      title: "درس ۱: مقدمه (رایگان)",
      description: "",
      price: 0,
      currency: "toman",
      targetType: "content",
      targetId: lesson1Id,
      durationDays: null,
      active: true,
      metadata: { adminPriced: true, explicitlyFree: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lesson2Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: lesson2Id,
      moduleId,
      title: "درس ۲: پتانسیل عمل (پرمیوم)",
      contentType: "markdown",
      contentMarkdown: "# متن سری و کامل پتانسیل عمل که نباید لو برود",
      sortOrder: 1,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Unsubscribed user requests course learning
    const learnRes1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: user.cookies,
    });

    expect(learnRes1.statusCode).toBe(200);
    const learnBody1 = JSON.parse(learnRes1.body);
    expect(learnBody1.course.locked).toBe(true);

    const lessons = learnBody1.modules[0].lessons;
    // Lesson 1 is free intro preview
    expect(lessons[0].locked).toBe(false);
    expect(lessons[0].content_markdown).toBe("# متن کامل درس ۱ مقدمه");

    // Lesson 2 is locked and MUST NOT contain original markdown
    expect(lessons[1].locked).toBe(true);
    expect(lessons[1].content_markdown).toContain("🔒 این محتوا مخصوص اعضای ویژه آوانا است");
    expect(lessons[1].content_markdown).not.toContain("متن سری و کامل");

    // After purchasing yearly subscription
    const products = await commerceStore.listActiveProducts();
    const yearly = products.find((p) => p.code === "sub_yearly")!;
    const checkoutRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: user.cookies,
      payload: { product_id: yearly.id },
    });
    const { authority } = JSON.parse(checkoutRes.body);
    await app.inject({
      method: "GET",
      url: `/v1/commerce/callback?Authority=${authority}&Status=OK`,
    });

    // Re-query course learning
    const learnRes2 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: user.cookies,
    });

    const learnBody2 = JSON.parse(learnRes2.body);
    expect(learnBody2.course.locked).toBe(false);
    expect(learnBody2.modules[0].lessons[1].locked).toBe(false);
    expect(learnBody2.modules[0].lessons[1].content_markdown).toBe(
      "# متن سری و کامل پتانسیل عمل که نباید لو برود",
    );
  });

  it("GET /v1/commerce/orders/my retrieves authenticated user orders with complete isolation", async () => {
    const app = await buildTestApp();
    const userA = await registerAndLogin(app, "ord-user-a@test.avana.dev");
    const userB = await registerAndLogin(app, "ord-user-b@test.avana.dev");

    // Unauthenticated request should be rejected with 401
    const unauthRes = await app.inject({
      method: "GET",
      url: "/v1/commerce/orders/my",
    });
    expect(unauthRes.statusCode).toBe(401);

    // User A checks out monthly sub
    const products = await commerceStore.listActiveProducts();
    const monthly = products.find((p) => p.code === "sub_monthly")!;
    const checkoutResA = await app.inject({
      method: "POST",
      url: "/v1/commerce/checkout",
      cookies: userA.cookies,
      payload: { product_id: monthly.id },
    });
    expect(checkoutResA.statusCode).toBe(201);

    // User A gets their orders
    const ordersResA = await app.inject({
      method: "GET",
      url: "/v1/commerce/orders/my",
      cookies: userA.cookies,
    });
    expect(ordersResA.statusCode).toBe(200);
    const bodyA = JSON.parse(ordersResA.body);
    expect(bodyA.items).toHaveLength(1);
    expect(bodyA.items[0].product_id).toBe(monthly.id);
    expect(bodyA.items[0].order_number).toMatch(/^ORD-/);
    expect(bodyA.items[0].status).toBe("pending");

    // User B gets their orders (should be empty, zero leakage)
    const ordersResB = await app.inject({
      method: "GET",
      url: "/v1/commerce/orders/my",
      cookies: userB.cookies,
    });
    expect(ordersResB.statusCode).toBe(200);
    const bodyB = JSON.parse(ordersResB.body);
    expect(bodyB.items).toHaveLength(0);
  });
});

