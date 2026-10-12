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
import { InMemoryWalletStore } from "../modules/wallet/index.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Commerce & Monetization Routes", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
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
    const teacher = await createUserWithRole("teacher@test.com", Roles.teacher);
    const editor = await createUserWithRole("editor@test.com", Roles.course_editor);
    const orgAdmin = await createUserWithRole("orgadmin@test.com", Roles.organization_admin);
    const support = await createUserWithRole("support@test.com", Roles.support_agent);
    const platformAdmin = await createUserWithRole("platformadmin@test.com", Roles.platform_admin);

    const walletStore = new InMemoryWalletStore();
    adminStore.setWalletStore(walletStore);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      walletStore,
    });

    return {
      app,
      adminStore,
      walletStore,
      student,
      teacher,
      editor,
      orgAdmin,
      support,
      platformAdmin,
    };
  }

  test("1. Security: Unauthenticated requests return 401 on all commerce endpoints", async () => {
    const { app } = await setupTestApp();

    const endpoints = [
      { method: "GET", url: "/v1/admin/commerce/stats" },
      { method: "GET", url: "/v1/admin/commerce/orders" },
      { method: "GET", url: "/v1/admin/commerce/payments" },
      { method: "GET", url: "/v1/admin/commerce/subscriptions" },
      { method: "GET", url: "/v1/admin/commerce/entitlements" },
      { method: "GET", url: "/v1/admin/commerce/products" },
      { method: "PATCH", url: "/v1/admin/commerce/products/p-1", payload: { active: false } },
      { method: "POST", url: "/v1/admin/commerce/grants", payload: { userId: "u-1", resourceType: "subscription" } },
      { method: "POST", url: "/v1/admin/commerce/subscriptions/sub-1/cancel", payload: { reason: "test" } },
      { method: "GET", url: "/v1/admin/users/u-1/commerce" },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method as any,
        url: ep.url,
        payload: (ep as any).payload,
      });
      expect(res.statusCode).toBe(401);
    }
  });

  test("2. Security & RBAC: Non-admin roles (student, teacher, editor, orgAdmin, support) get 403", async () => {
    const { app, student, teacher, editor, orgAdmin, support } = await setupTestApp();

    const nonAdmins = [student, teacher, editor, orgAdmin, support];

    for (const actor of nonAdmins) {
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/stats",
        cookies: { avana_session: actor.sessionToken },
      });
      expect(res.statusCode).toBe(403);
    }
  });

  test("3. Platform Admin can fetch commerce stats", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/stats",
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("totalRevenue");
    expect(body).toHaveProperty("todayRevenue");
    expect(body).toHaveProperty("currentMonthRevenue");
    expect(body).toHaveProperty("successfulOrders");
    expect(body).toHaveProperty("activeSubscriptions");
    expect(body).toHaveProperty("lifetimePurchases");
    expect(body).toHaveProperty("subscriptionRevenue");
    expect(body).toHaveProperty("courseRevenue");
    expect(body).toHaveProperty("contentPackRevenue");
  });

  test("4. Platform Admin can list orders with pagination and filtering", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/orders?page=1&pageSize=10",
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("orders");
    expect(body).toHaveProperty("totalCount");
    expect(Array.isArray(body.orders)).toBe(true);
  });

  test("5. Platform Admin can list and update products including subscription prices with proper validation", async () => {
    const { app, platformAdmin, student } = await setupTestApp();

    // 1. List products
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/products",
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);

    const subProd = body.products.find((p: any) => p.type === "subscription");
    expect(subProd).toBeDefined();

    // 2. Validation: Negative price is rejected with 400
    const negPriceRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/commerce/products/${subProd.id}`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { price: -5000 },
    });
    expect(negPriceRes.statusCode).toBe(400);
    const negBody = JSON.parse(negPriceRes.body);
    expect(negBody.code).toBe("invalid_input");

    // 3. Validation: Float price is rejected with 400
    const floatPriceRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/commerce/products/${subProd.id}`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { price: 149000.5 },
    });
    expect(floatPriceRes.statusCode).toBe(400);
    const floatBody = JSON.parse(floatPriceRes.body);
    expect(floatBody.code).toBe("invalid_input");

    // 4. Security: Non-admin (student) receives 403 Forbidden
    const forbiddenRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/commerce/products/${subProd.id}`,
      cookies: { avana_session: student.sessionToken },
      payload: { price: 149000 },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // 5. Successful subscription price update by Platform Admin
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/commerce/products/${subProd.id}`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { price: 149000 },
    });

    expect(updateRes.statusCode).toBe(200);
    const updatedBody = JSON.parse(updateRes.body);
    expect(updatedBody.success).toBe(true);
    expect(updatedBody.product.price).toBe(149000);

    // 6. Verify subsequent listing reflects the updated price
    const verifyListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/products",
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const verifyListBody = JSON.parse(verifyListRes.body);
    const updatedSubInList = verifyListBody.products.find((p: any) => p.id === subProd.id);
    expect(updatedSubInList.price).toBe(149000);

    // 7. Allowed update (toggle active status)
    const allowedUpdateRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/commerce/products/${subProd.id}`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { active: false },
    });

    expect(allowedUpdateRes.statusCode).toBe(200);
    const toggleBody = JSON.parse(allowedUpdateRes.body);
    expect(toggleBody.success).toBe(true);
    expect(toggleBody.product.active).toBe(false);
  });

  test("6. Platform Admin can execute Grants and view User Commerce Profile", async () => {
    const { app, platformAdmin, student } = await setupTestApp();

    // 1. Grant Subscription
    const grantSubRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "subscription",
        durationDays: 60,
      },
    });

    expect(grantSubRes.statusCode).toBe(201);
    const grantSubBody = JSON.parse(grantSubRes.body);
    expect(grantSubBody.success).toBe(true);
    expect(grantSubBody.entitlement.resourceType).toBe("subscription");
    expect(grantSubBody.entitlement.sourceType).toBe("admin_grant");
    expect(grantSubBody.entitlement.expiresAt).not.toBeNull();

    // 2. Grant Lifetime Course
    const courseId = "course-math-101";
    const grantCourseRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseId,
      },
    });

    expect(grantCourseRes.statusCode).toBe(201);
    const grantCourseBody = JSON.parse(grantCourseRes.body);
    expect(grantCourseBody.success).toBe(true);
    expect(grantCourseBody.entitlement.resourceType).toBe("course");
    expect(grantCourseBody.entitlement.resourceId).toBe(courseId);
    expect(grantCourseBody.entitlement.lifetime).toBe(true);
    expect(grantCourseBody.entitlement.expiresAt).toBeNull();

    // 3. Get User Commerce Profile
    const profileRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    expect(profileRes.statusCode).toBe(200);
    const profileBody = JSON.parse(profileRes.body);
    expect(profileBody.user.id).toBe(student.user.id);
    expect(profileBody.entitlements.length).toBe(2);
    expect(profileBody.lifetimePurchases.length).toBe(1);
    expect(profileBody.lifetimePurchases[0].resourceId).toBe(courseId);
  });

  test("7. Platform Admin can cancel an active user subscription", async () => {
    const { app, platformAdmin, student } = await setupTestApp();

    // 1. Grant Subscription to student
    await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "subscription",
        durationDays: 30,
      },
    });

    const profRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const subId = JSON.parse(profRes.body).activeSubscription.id;

    // 2. Cancel Subscription
    const cancelRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${subId}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "Admin test revocation" },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.success).toBe(true);
    expect(cancelBody.subscription.status).toBe("cancelled");

    // 3. Verify user commerce profile has no active subscription
    const afterProfRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const afterBody = JSON.parse(afterProfRes.body);
    expect(afterBody.activeSubscription).toBeNull();
    expect(afterBody.subscriptionHistory[0].status).toBe("cancelled");
  });

  test("8. Platform Admin can successfully grant wallet credit with valid amount and metadata", async () => {
    const { app, platformAdmin, student, walletStore } = await setupTestApp();

    const grantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 50000,
        reason: "پاداش فعالیت آموزشی",
      },
    });

    expect(grantRes.statusCode).toBe(201);
    const body = JSON.parse(grantRes.body);
    expect(body.success).toBe(true);
    expect(body.entitlement.resourceType).toBe("wallet");
    expect(body.entitlement.amount).toBe(50000);
    expect(body.entitlement.balance).toBe(50000);
    expect(body.entitlement.currency).toBe("toman");

    // Check wallet store directly
    const wallet = await walletStore.findWalletByUserId(student.user.id);
    expect(wallet?.balance).toBe(50000);

    // Check transaction ledger
    const { transactions } = await walletStore.listTransactionsByUserId(student.user.id);
    expect(transactions.length).toBe(1);
    expect(transactions[0].type).toBe("admin_adjustment");
    expect(transactions[0].source).toBe("admin_adjustment");
    expect(transactions[0].referenceType).toBe("admin_grant");
    expect(transactions[0].amount).toBe(50000);
    expect(transactions[0].balanceBefore).toBe(0);
    expect(transactions[0].balanceAfter).toBe(50000);
    expect(transactions[0].metadata.adminId).toBe(platformAdmin.user.id);
    expect(transactions[0].metadata.reason).toBe("پاداش فعالیت آموزشی");
  });

  test("9. Input validation rejects invalid amounts (0, negative, floats, < 1000, > 100,000,000)", async () => {
    const { app, platformAdmin, student } = await setupTestApp();

    const invalidAmounts = [0, -10000, 500.5, 999, 100000001, "invalid", null, undefined];

    for (const invalidAmount of invalidAmounts) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/commerce/grants",
        cookies: { avana_session: platformAdmin.sessionToken },
        payload: {
          userId: student.user.id,
          resourceType: "wallet",
          amount: invalidAmount,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("invalid_input");
    }
  });

  test("10. RBAC: Non-admin users cannot grant wallet credit (returns 403)", async () => {
    const { app, student, teacher, editor, orgAdmin, support } = await setupTestApp();

    const nonAdmins = [student, teacher, editor, orgAdmin, support];

    for (const actor of nonAdmins) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/admin/commerce/grants",
        cookies: { avana_session: actor.sessionToken },
        payload: {
          userId: student.user.id,
          resourceType: "wallet",
          amount: 25000,
        },
      });

      expect(res.statusCode).toBe(403);
    }
  });

  test("11. Non-existent user returns 404 Not Found", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: "00000000-0000-0000-0000-000000000000",
        resourceType: "wallet",
        amount: 20000,
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("not_found");
  });

  test("12. Idempotency: duplicate request with same key returns original result and does not double credit", async () => {
    const { app, platformAdmin, student, walletStore } = await setupTestApp();
    const idemKey = "idem-test-key-12345";

    // First request
    const firstRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 40000,
        idempotencyKey: idemKey,
      },
    });

    expect(firstRes.statusCode).toBe(201);
    const firstBody = JSON.parse(firstRes.body);
    expect(firstBody.entitlement.balance).toBe(40000);
    expect(firstBody.entitlement.isDuplicate).toBe(false);

    // Duplicate request with identical key
    const secondRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 40000,
        idempotencyKey: idemKey,
      },
    });

    expect(secondRes.statusCode).toBe(201);
    const secondBody = JSON.parse(secondRes.body);
    expect(secondBody.entitlement.balance).toBe(40000);
    expect(secondBody.entitlement.isDuplicate).toBe(true);
    expect(secondBody.entitlement.id).toBe(firstBody.entitlement.id);

    // Verify wallet was NOT credited twice
    const wallet = await walletStore.findWalletByUserId(student.user.id);
    expect(wallet?.balance).toBe(40000);

    const { transactions } = await walletStore.listTransactionsByUserId(student.user.id);
    expect(transactions.length).toBe(1);
  });

  test("13. Idempotency conflict: reusing key with different amount or user returns 409 conflict", async () => {
    const { app, platformAdmin, student, teacher } = await setupTestApp();
    const sharedKey = "shared-idem-key-conflict";

    await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 30000,
        idempotencyKey: sharedKey,
      },
    });

    // Reusing key with different amount
    const conflictRes1 = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 60000,
        idempotencyKey: sharedKey,
      },
    });
    expect(conflictRes1.statusCode).toBe(409);

    // Reusing key with different user
    const conflictRes2 = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: teacher.user.id,
        resourceType: "wallet",
        amount: 30000,
        idempotencyKey: sharedKey,
      },
    });
    expect(conflictRes2.statusCode).toBe(409);
  });

  test("14. Wallet grant does not alter subscriptions, courses or create fake payment records", async () => {
    const { app, platformAdmin, student } = await setupTestApp();

    await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 70000,
      },
    });

    const profRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    const profile = JSON.parse(profRes.body);
    expect(profile.wallet.balance).toBe(70000);
    expect(profile.wallet.currency).toBe("toman");
    expect(profile.activeSubscription).toBeNull();
    expect(profile.subscriptionHistory.length).toBe(0);
    expect(profile.lifetimePurchases.length).toBe(0);
    expect(profile.entitlements.length).toBe(0);
    expect(profile.orders.length).toBe(0);
    expect(profile.payments.length).toBe(0);
  });

  test("15. Admin can query user wallet directly via /v1/admin/users/:id/wallet", async () => {
    const { app, platformAdmin, student } = await setupTestApp();

    // Initial balance
    const initRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/wallet`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(initRes.statusCode).toBe(200);
    expect(JSON.parse(initRes.body).balance).toBe(0);

    // Credit wallet
    await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "wallet",
        amount: 15000,
      },
    });

    // Updated balance
    const afterRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/wallet`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(afterRes.statusCode).toBe(200);
    expect(JSON.parse(afterRes.body).balance).toBe(15000);
  });
});
