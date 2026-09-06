import { describe, test, expect } from "vitest";
import {
  EntitlementService,
  InMemoryCommerceStore,
} from "../modules/commerce/index.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  asUserId,
  asCourseId,
  asContentPackId,
  type Actor,
} from "@avana/domain";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Subscription Cancellation End-to-End Suite", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const commerceStore = new InMemoryCommerceStore();

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "x",
      });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as any,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    const student = await createUserWithRole("student@test.com", Roles.student);
    const platformAdmin = await createUserWithRole(
      "admin@test.com",
      Roles.platform_admin,
    );
    const teacher = await createUserWithRole("teacher@test.com", Roles.teacher);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      commerceStore,
    });

    return {
      app,
      adminStore,
      commerceStore,
      userStore,
      student,
      platformAdmin,
      teacher,
    };
  }

  test("1. End-to-End: Active Subscription -> Cancel -> Access Denied -> Re-grant -> Access Restored", async () => {
    const { app, adminStore, student, platformAdmin } = await setupTestApp();

    // 1. Admin grants a 30-day subscription to student
    const grantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "subscription",
        durationDays: 30,
      },
    });
    expect(grantRes.statusCode).toBe(201);

    // 2. Fetch User Commerce Profile to verify active subscription
    const profileResBefore = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(profileResBefore.statusCode).toBe(200);
    const profileBefore = JSON.parse(profileResBefore.body);
    expect(profileBefore.activeSubscription).toBeDefined();
    expect(profileBefore.activeSubscription.status).toBe("active");
    const subId = profileBefore.activeSubscription.id;

    // 3. Admin cancels the subscription
    const cancelRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${subId}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "User refund requested" },
    });
    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.success).toBe(true);
    expect(cancelBody.subscription.status).toBe("cancelled");

    // 4. Fetch User Commerce Profile after cancellation
    const profileResAfter = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(profileResAfter.statusCode).toBe(200);
    const profileAfter = JSON.parse(profileResAfter.body);
    // Active subscription is null now
    expect(profileAfter.activeSubscription).toBeNull();
    // But cancelled subscription remains in history
    expect(profileAfter.subscriptionHistory.length).toBe(1);
    expect(profileAfter.subscriptionHistory[0].status).toBe("cancelled");

    // 5. Admin re-grants subscription to same student -> creates new active subscription without conflict
    const regrantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "subscription",
        durationDays: 60,
      },
    });
    expect(regrantRes.statusCode).toBe(201);

    const profileResRe = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const profileRe = JSON.parse(profileResRe.body);
    expect(profileRe.activeSubscription).toBeDefined();
    expect(profileRe.activeSubscription.status).toBe("active");
    expect(profileRe.subscriptionHistory.length).toBe(2);
  });

  test("2. Precision: Independent Course and Pack access remains valid when subscription is cancelled", async () => {
    const commerceStore = new InMemoryCommerceStore();
    const entitlementService = new EntitlementService({ commerceStore });

    const studentUserId = asUserId("student-precision-test");
    const studentActor: Actor = { userId: studentUserId, role: "student" };
    const courseId = asCourseId("course-special-101");

    // 1. Student has Lifetime Course Purchase
    await commerceStore.grantEntitlement({
      id: "ent_course_lifetime" as any,
      userId: studentUserId,
      resourceType: "course",
      resourceId: courseId,
      sourceType: "purchase",
      orderId: "ord_course_1",
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Student has 30-day Subscription from Order 123
    const subExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
    await commerceStore.grantEntitlement({
      id: "ent_sub_order_123" as any,
      userId: studentUserId,
      resourceType: "subscription",
      resourceId: null,
      sourceType: "purchase",
      orderId: "ord_sub_123",
      startsAt: new Date().toISOString(),
      expiresAt: subExpiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Verify course access and general course access (via subscription)
    const initialCourseAccess = await entitlementService.checkAccess(
      studentActor,
      {
        userId: studentUserId,
        resourceType: "course",
        resourceId: courseId,
        courseId,
      },
    );
    expect(initialCourseAccess.granted).toBe(true);
    expect(initialCourseAccess.reason).toBe("subscription");

    const randomCourseAccess = await entitlementService.checkAccess(
      studentActor,
      {
        userId: studentUserId,
        resourceType: "course",
        resourceId: "random-course" as any,
        courseId: "random-course" as any,
      },
    );
    expect(randomCourseAccess.granted).toBe(true);
    expect(randomCourseAccess.reason).toBe("subscription");

    // 3. Cancel ONLY the subscription entitlement
    const nowIso = new Date().toISOString();
    const entList = (commerceStore as any).entitlements || [];
    const subEnt = entList.find(
      (e: any) =>
        e.userId === studentUserId &&
        e.resourceType === "subscription" &&
        e.orderId === "ord_sub_123",
    );
    if (subEnt) {
      subEnt.expiresAt = nowIso;
    }

    // 4. Verification: Random course access via subscription is now LOCKED
    const postCancelRandom = await entitlementService.checkAccess(
      studentActor,
      {
        userId: studentUserId,
        resourceType: "course",
        resourceId: "random-course" as any,
        courseId: "random-course" as any,
      },
    );
    expect(postCancelRandom.granted).toBe(false);
    expect(postCancelRandom.reason).toBe("locked");

    // 5. BUT the independently purchased course remains GRANTED!
    const postCancelCourse = await entitlementService.checkAccess(
      studentActor,
      {
        userId: studentUserId,
        resourceType: "course",
        resourceId: courseId,
        courseId,
      },
    );
    expect(postCancelCourse.granted).toBe(true);
    expect(postCancelCourse.reason).toBe("course_purchase");
  });

  test("3. Security & Idempotency Edge Cases", async () => {
    const { app, student, teacher, platformAdmin } = await setupTestApp();

    // 1. Security: Unauthenticated request -> 401
    const unauthRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/subscriptions/sub-999/cancel",
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Security: Non-admin role (teacher) -> 403
    const forbiddenRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/subscriptions/sub-999/cancel",
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // 3. 404 on non-existent subscription
    const notFoundRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/subscriptions/non-existent-sub/cancel",
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(notFoundRes.statusCode).toBe(404);

    // 4. Create active subscription
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

    const prof = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const subId = JSON.parse(prof.body).activeSubscription.id;

    // 5. First Cancel -> 200 OK
    const cancel1 = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${subId}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(cancel1.statusCode).toBe(200);

    // 6. Idempotent Second Cancel on already cancelled subscription -> 200 OK (no error, no double mutation)
    const cancel2 = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${subId}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(cancel2.statusCode).toBe(200);
    expect(JSON.parse(cancel2.body).message).toBe("اشتراک قبلاً لغو شده است.");
  });

  test("4. Precision & Isolation: Overlapping Admin Grants -> Cancelling Grant A leaves Grant B completely active with access intact", async () => {
    const { app, student, platformAdmin } = await setupTestApp();

    // 1. Admin creates Grant A (30 days)
    const grantARes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "subscription",
        durationDays: 30,
      },
    });
    expect(grantARes.statusCode).toBe(201);

    // 2. Admin creates Grant B (60 days) for the same user without cancelling A
    const grantBRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "subscription",
        durationDays: 60,
      },
    });
    expect(grantBRes.statusCode).toBe(201);

    // 3. Inspect user commerce profile before cancellation
    const profileBeforeRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const profileBefore = JSON.parse(profileBeforeRes.body);
    expect(profileBefore.subscriptionHistory.length).toBe(2);
    expect(profileBefore.entitlements.filter((e: any) => e.resourceType === "subscription").length).toBe(2);

    const subA = profileBefore.subscriptionHistory[1]; // older grant (Grant A)
    const subB = profileBefore.subscriptionHistory[0]; // newer grant (Grant B)
    expect(subA.status).toBe("active");
    expect(subB.status).toBe("active");

    // 4. Admin cancels ONLY Grant A
    const cancelARes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${subA.id}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "Cancelling only Grant A" },
    });
    expect(cancelARes.statusCode).toBe(200);

    // 5. Inspect user commerce profile after cancelling Grant A
    const profileAfterRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const profileAfter = JSON.parse(profileAfterRes.body);

    // Grant A must be cancelled, but Grant B must remain ACTIVE!
    const subAAfter = profileAfter.subscriptionHistory.find((s: any) => s.id === subA.id);
    const subBAfter = profileAfter.subscriptionHistory.find((s: any) => s.id === subB.id);
    expect(subAAfter.status).toBe("cancelled");
    expect(subBAfter.status).toBe("active");

    // Active subscription must still point to Grant B
    expect(profileAfter.activeSubscription).toBeDefined();
    expect(profileAfter.activeSubscription.id).toBe(subB.id);
    expect(profileAfter.activeSubscription.status).toBe("active");

    // Entitlements: Entitlement A is expired (<= now), but Entitlement B is STILL valid (> now)
    const subEntitlements = profileAfter.entitlements.filter((e: any) => e.resourceType === "subscription");
    const sortedEnts = [...subEntitlements].sort((a: any, b: any) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    const entA = sortedEnts[0]; // Grant A (cancelled/expired)
    const entB = sortedEnts[1]; // Grant B (active, 60 days)
    expect(entA).toBeDefined();
    expect(entB).toBeDefined();
    expect(new Date(entA.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(new Date(entB.expiresAt).getTime()).toBeGreaterThan(Date.now() + 10000);

    // 6. Now Admin cancels Grant B as well
    const cancelBRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${subB.id}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "Cancelling Grant B too" },
    });
    expect(cancelBRes.statusCode).toBe(200);

    const profileFinalRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const profileFinal = JSON.parse(profileFinalRes.body);
    expect(profileFinal.activeSubscription).toBeNull();
    expect(profileFinal.subscriptionHistory.every((s: any) => s.status === "cancelled")).toBe(true);
  });
});
