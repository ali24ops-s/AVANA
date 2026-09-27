import { describe, test, expect } from "vitest";
import {
  EntitlementService,
  InMemoryCommerceStore,
} from "../modules/commerce/index.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  asUserId,
  asCourseId,
  type Actor,
  Roles,
  type Role,
  type OrganizationId,
  asUserEntitlementId,
} from "@avana/domain";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
} from "../modules/study/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import { randomUUID } from "node:crypto";

describe("Admin Course Entitlement Revocation & Payment Rejection Suite", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const commerceStore = new InMemoryCommerceStore();
    const adminStore = new InMemoryAdminStore(userStore, orgStore, commerceStore);
    const courseStore = new InMemoryCourseStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();
    const quizStore = new InMemoryQuizStore();
    const quizQuestionStore = new InMemoryQuizQuestionStore();
    const quizAttemptStore = new InMemoryQuizAttemptStore();
    const flashcardStore = new InMemoryFlashcardStore();
    const flashcardReviewStore = new InMemoryFlashcardReviewStore();
    const userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();

    const sessionService = new SessionService(sessionStore, config.session);
    const entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
    });

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
      return { user, sessionToken: session.sessionToken, orgId };
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
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
    });

    return {
      app,
      adminStore,
      commerceStore,
      userStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      quizAttemptStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      entitlementService,
      student,
      platformAdmin,
      teacher,
    };
  }

  test("Test 1 — Admin revokes course entitlement and access is immediately locked", async () => {
    const { app, student, platformAdmin, entitlementService } = await setupTestApp();
    const courseId = asCourseId("course-physics-101");
    const studentActor: Actor = { userId: asUserId(student.user.id), role: "student" };

    // 1. Admin grants course access to student
    const grantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseId,
      },
    });
    expect(grantRes.statusCode).toBe(201);
    const grantBody = JSON.parse(grantRes.body);
    const entitlementId = grantBody.entitlement.id;

    // 2. Verify backend entitlement engine allows access
    const initialAccess = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(initialAccess.granted).toBe(true);
    expect(initialAccess.reason).toBe("course_purchase");

    // 3. Admin revokes the course entitlement
    const revokeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/entitlements/${entitlementId}/revoke`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "User requested refund for this course" },
    });
    expect(revokeRes.statusCode).toBe(200);
    const revokeBody = JSON.parse(revokeRes.body);
    expect(revokeBody.success).toBe(true);
    expect(revokeBody.entitlement.active).toBe(false);

    // 4. Verify backend entitlement engine now locks access
    const postRevokeAccess = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(postRevokeAccess.granted).toBe(false);
    expect(postRevokeAccess.reason).toBe("locked");
  });

  test("Test 2 — Existing user learning progress, quiz attempts and reviews are preserved after revoke", async () => {
    const {
      app,
      student,
      platformAdmin,
      progressStore,
      quizAttemptStore,
      flashcardReviewStore,
    } = await setupTestApp();
    const courseId = asCourseId("course-chem-101");
    const lessonId = "lesson-chem-1" as any;

    // 1. Admin grants course access
    const grantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseId,
      },
    });
    const entitlementId = JSON.parse(grantRes.body).entitlement.id;

    // 2. Student accumulates learning progress and study records
    await progressStore.upsert({
      id: randomUUID() as any,
      userId: asUserId(student.user.id),
      lessonId,
      completed: true,
      completedAt: new Date().toISOString(),
    });

    await quizAttemptStore.create({
      id: randomUUID() as any,
      quizId: null,
      userId: asUserId(student.user.id),
      topic: "Chemistry Exam",
      questionCount: 10,
      score: 9,
      scorePercentage: 90,
      durationSeconds: 300,
      passed: true,
      status: "completed",
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await flashcardReviewStore.create({
      id: randomUUID() as any,
      flashcardId: "card-1" as any,
      userId: asUserId(student.user.id),
      rating: "good",
      reviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 3. Admin revokes the course access
    const revokeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/entitlements/${entitlementId}/revoke`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "Audit check" },
    });
    expect(revokeRes.statusCode).toBe(200);

    // 4. Verify all learning and study data is preserved in DB
    const progress = await progressStore.findByUserAndLesson(
      asUserId(student.user.id),
      lessonId,
    );
    expect(progress?.completed).toBe(true);

    const attempts = await quizAttemptStore.listByUser(asUserId(student.user.id));
    expect(attempts.length).toBe(1);
    expect(attempts[0].scorePercentage).toBe(90);

    const reviews = await flashcardReviewStore.listByUser(asUserId(student.user.id));
    expect(reviews.length).toBe(1);
  });

  test("Test 3 — Independence between Subscription and Course Entitlements", async () => {
    const { app, student, platformAdmin, entitlementService } = await setupTestApp();
    const courseA = asCourseId("course-a-purchased");
    const courseB = asCourseId("course-b-via-sub");
    const studentActor: Actor = { userId: asUserId(student.user.id), role: "student" };

    // 1. Grant 30-day global subscription
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

    // 2. Grant lifetime Course A
    const courseGrantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseA,
      },
    });
    const courseEntId = JSON.parse(courseGrantRes.body).entitlement.id;

    // 3. Revoke Course A -> subscription is still active, so Course A is still accessible via subscription
    const revokeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/entitlements/${courseEntId}/revoke`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(revokeRes.statusCode).toBe(200);

    const accessViaSub = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseA,
      courseId: courseA,
    });
    expect(accessViaSub.granted).toBe(true);
    expect(accessViaSub.reason).toBe("subscription");

    // 4. Fetch profile and cancel the subscription
    const profileRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users/${student.user.id}/commerce`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    const activeSubId = JSON.parse(profileRes.body).activeSubscription.id;
    await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/subscriptions/${activeSubId}/cancel`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    // 5. Now both Course A (revoked) and Course B (unpurchased) are locked
    const accessAfterSubCancelA = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseA,
      courseId: courseA,
    });
    expect(accessAfterSubCancelA.granted).toBe(false);

    const accessAfterSubCancelB = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseB,
      courseId: courseB,
    });
    expect(accessAfterSubCancelB.granted).toBe(false);
  });

  test("Test 4 — Payment Rejection bug fix: Rejecting payment revokes linked Course Entitlement", async () => {
    const { app, student, platformAdmin, commerceStore, adminStore, entitlementService } =
      await setupTestApp();
    const courseId = asCourseId("course-bio-101");
    const studentActor: Actor = { userId: asUserId(student.user.id), role: "student" };

    const orderId = "order-course-c2c-123";
    const paymentId = "pay-c2c-456";

    // 1. Setup mock order and payment for course
    await commerceStore.createOrder({
      id: orderId as any,
      userId: asUserId(student.user.id),
      productId: "prod-course-bio" as any,
      orderNumber: "C2C-BIO-123",
      amount: 150000,
      currency: "toman",
      status: "pending",
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await commerceStore.createPayment({
      id: paymentId as any,
      orderId: orderId as any,
      userId: asUserId(student.user.id),
      amount: 150000,
      currency: "toman",
      gateway: "card_to_card",
      status: "pending_admin_review",
      authority: null,
      transactionId: "TX-12345",
      idempotencyKey: "idem-12345",
      rawCallbackMetadata: null,
      paidAt: null,
      trackingNumber: "123456",
      sourceCardLast4: "5678",
      payerName: "Student Payer",
      receiptUrl: null,
      initialValidationResult: null,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Grant course entitlement linked to order
    await commerceStore.grantEntitlement({
      id: asUserEntitlementId(randomUUID()),
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      sourceType: "purchase",
      orderId,
      startsAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Verify initial course access is granted
    const accessBeforeReject = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(accessBeforeReject.granted).toBe(true);

    // 3. Admin rejects the card-to-card payment
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/payments/${paymentId}/reject`,
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { reason: "Fake receipt detected" },
    });
    expect(rejectRes.statusCode).toBe(200);

    // 4. Verify the course entitlement was expired and access is now locked!
    const accessAfterReject = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(accessAfterReject.granted).toBe(false);
    expect(accessAfterReject.reason).toBe("locked");
  });

  test("Test 5 — Non-admin cannot revoke entitlements (403 Forbidden)", async () => {
    const { app, student, teacher } = await setupTestApp();

    const teacherRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/entitlements/ent-123/revoke",
      cookies: { avana_session: teacher.sessionToken },
      payload: { reason: "Attempt by teacher" },
    });
    expect(teacherRes.statusCode).toBe(403);

    const studentRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/entitlements/ent-123/revoke",
      cookies: { avana_session: student.sessionToken },
    });
    expect(studentRes.statusCode).toBe(403);
  });

  test("Test 6 — Idempotency: Revoking already expired/revoked entitlement returns success safely", async () => {
    const { app, student, platformAdmin } = await setupTestApp();
    const courseId = asCourseId("course-math-101");

    // 1. Grant course access
    const grantRes = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseId,
      },
    });
    const entId = JSON.parse(grantRes.body).entitlement.id;

    // 2. First revoke
    const revoke1 = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/entitlements/${entId}/revoke`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(revoke1.statusCode).toBe(200);

    // 3. Second revoke (idempotent)
    const revoke2 = await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/entitlements/${entId}/revoke`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(revoke2.statusCode).toBe(200);
    const body2 = JSON.parse(revoke2.body);
    expect(body2.success).toBe(true);
    expect(body2.message).toContain("قبلاً لغو یا منقضی شده است");
  });

  test("Test 7 — Non-existent entitlement returns 404 Not Found", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/entitlements/00000000-0000-0000-0000-000000000000/revoke",
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(res.statusCode).toBe(404);
  });

  test("Test 8 — Re-granting course after revocation restores access cleanly", async () => {
    const { app, student, platformAdmin, entitlementService } = await setupTestApp();
    const courseId = asCourseId("course-regrant-test");
    const studentActor: Actor = { userId: asUserId(student.user.id), role: "student" };

    // 1. Initial Grant
    const grant1 = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseId,
      },
    });
    const entId1 = JSON.parse(grant1.body).entitlement.id;

    // 2. Revoke
    await app.inject({
      method: "POST",
      url: `/v1/admin/commerce/entitlements/${entId1}/revoke`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    const accessAfterRevoke = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(accessAfterRevoke.granted).toBe(false);

    // 3. Re-grant same course
    const grant2 = await app.inject({
      method: "POST",
      url: "/v1/admin/commerce/grants",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: {
        userId: student.user.id,
        resourceType: "course",
        resourceId: courseId,
      },
    });
    expect(grant2.statusCode).toBe(201);

    // 4. Access restored
    const accessAfterRegrant = await entitlementService.checkAccess(studentActor, {
      userId: asUserId(student.user.id),
      resourceType: "course",
      resourceId: courseId,
      courseId,
    });
    expect(accessAfterRegrant.granted).toBe(true);
    expect(accessAfterRegrant.reason).toBe("course_purchase");
  });
});
