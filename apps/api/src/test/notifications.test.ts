import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import {
  asNotificationId,
  asUserId,
  asCourseId,
  type UserId,
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

describe("AVANA Notifications System Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let orgStore: InMemoryOrganizationStore;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    orgStore = new InMemoryOrganizationStore();
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);
  });

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      organizationStore: orgStore,
      notificationStore,
      notificationService,
    });
    return app;
  }

  async function registerAndLogin(
    app: ReturnType<typeof createApp>,
    email: string,
    name = "علی محمدی",
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "علی",
        lastName: "محمدی",
        phoneNumber: `0912${Math.floor(1000000 + Math.random() * 9000000)}`,
        email,
        password: "ValidPassword123!",
        name,
      },
    });
    expect(res.statusCode).toBe(200);
    const token = extractSessionToken(res);
    expect(token).toBeDefined();
    const data = res.json();
    return {
      userId: asUserId(data.user.id),
      token: token!,
      cookieHeader: `avana_session=${token}`,
    };
  }

  // =========================================================================
  // 1. Notification Creation & Contract
  // =========================================================================
  it("creates notifications with correct properties and action contract", async () => {
    const userId = asUserId(randomUUID());

    const item = await notificationService.createForUser(userId, {
      type: "purchase_completed",
      title: "خرید با موفقیت انجام شد",
      message: "دوره فارماکولوژی با موفقیت به کتابخانه شما اضافه شد.",
      actionUrl: "/courses/123",
      metadata: { courseId: "123" },
    });

    expect(item).not.toBeNull();
    expect(item?.userId).toBe(userId);
    expect(item?.type).toBe("purchase_completed");
    expect(item?.title).toBe("خرید با موفقیت انجام شد");
    expect(item?.isRead).toBe(false);
    expect(item?.readAt).toBeNull();
    expect(item?.action).toEqual({
      type: "navigate",
      url: "/courses/123",
    });
    expect(item?.metadata).toEqual({ courseId: "123" });
  });

  it("handles notifications without action url gracefully", async () => {
    const userId = asUserId(randomUUID());

    const item = await notificationService.createForUser(userId, {
      type: "login_success",
      title: "ورود موفق",
      message: "ورود شما به آوانا با موفقیت انجام شد.",
    });

    expect(item).not.toBeNull();
    expect(item?.action).toBeNull();
  });

  // =========================================================================
  // 2. User Isolation & Security
  // =========================================================================
  it("strictly isolates notifications between users (User A cannot view or modify User B's notifications)", async () => {
    const app = await createTestApp();

    const userA = await registerAndLogin(app, "user.a@example.com", "User A");
    const userB = await registerAndLogin(app, "user.b@example.com", "User B");

    // Create notification for User A
    const notifA = await notificationService.createForUser(userA.userId, {
      type: "login_success",
      title: "اعلان اختصاصی کاربر الف",
      message: "پیام محرمانه برای کاربر الف",
    });
    expect(notifA).not.toBeNull();

    // Create notification for User B
    const notifB = await notificationService.createForUser(userB.userId, {
      type: "login_success",
      title: "اعلان اختصاصی کاربر ب",
      message: "پیام محرمانه برای کاربر ب",
    });
    expect(notifB).not.toBeNull();

    // User A lists notifications -> should ONLY see notifA
    const resListA = await app.inject({
      method: "GET",
      url: "/v1/notifications",
      headers: { cookie: userA.cookieHeader },
    });
    expect(resListA.statusCode).toBe(200);
    const bodyA = resListA.json();
    const idsA = bodyA.items.map((i: { id: string }) => i.id);
    expect(idsA).toContain(notifA?.id);
    expect(idsA).not.toContain(notifB?.id);

    // User A attempts to mark User B's notification as read -> MUST FAIL (404)
    const resReadForbidden = await app.inject({
      method: "PATCH",
      url: `/v1/notifications/${notifB?.id}/read`,
      headers: { cookie: userA.cookieHeader },
    });
    expect(resReadForbidden.statusCode).toBe(404);

    // Verify notifB is still unread for User B
    const checkNotifB = await notificationService.findById(
      notifB!.id,
      userB.userId,
    );
    expect(checkNotifB?.isRead).toBe(false);
  });

  // =========================================================================
  // 3. Unread Count, Pagination, and Read Operations
  // =========================================================================
  it("tracks unread count accurately through read and read-all operations", async () => {
    const app = await createTestApp();
    const user = await registerAndLogin(app, "reader@example.com", "Reader");

    // Initially 1 notification from registration
    let countRes = await app.inject({
      method: "GET",
      url: "/v1/notifications/unread-count",
      headers: { cookie: user.cookieHeader },
    });
    expect(countRes.json().unread_count).toBe(1);

    // Add 2 more notifications
    const n1 = await notificationService.createForUser(user.userId, {
      type: "email_verified",
      title: "تأیید ایمیل",
      message: "ایمیل تأیید شد",
    });
    const n2 = await notificationService.createForUser(user.userId, {
      type: "purchase_completed",
      title: "خرید موفق",
      message: "خرید انجام شد",
    });

    // Unread count should now be 3
    countRes = await app.inject({
      method: "GET",
      url: "/v1/notifications/unread-count",
      headers: { cookie: user.cookieHeader },
    });
    expect(countRes.json().unread_count).toBe(3);

    // Mark 1 as read
    const markOneRes = await app.inject({
      method: "PATCH",
      url: `/v1/notifications/${n1?.id}/read`,
      headers: { cookie: user.cookieHeader },
    });
    expect(markOneRes.statusCode).toBe(200);
    expect(markOneRes.json().notification.isRead).toBe(true);

    // Unread count should now be 2
    countRes = await app.inject({
      method: "GET",
      url: "/v1/notifications/unread-count",
      headers: { cookie: user.cookieHeader },
    });
    expect(countRes.json().unread_count).toBe(2);

    // Filter unread_only should only return the 2 unread items
    const unreadListRes = await app.inject({
      method: "GET",
      url: "/v1/notifications?unread_only=true",
      headers: { cookie: user.cookieHeader },
    });
    expect(unreadListRes.statusCode).toBe(200);
    const unreadItems = unreadListRes.json().items;
    expect(unreadItems.length).toBe(2);
    expect(unreadItems.every((i: { isRead: boolean }) => !i.isRead)).toBe(
      true,
    );

    // Read all
    const readAllRes = await app.inject({
      method: "POST",
      url: "/v1/notifications/read-all",
      headers: { cookie: user.cookieHeader },
    });
    expect(readAllRes.statusCode).toBe(200);
    expect(readAllRes.json().success).toBe(true);
    expect(readAllRes.json().updated_count).toBe(2);

    // Final unread count should be 0
    countRes = await app.inject({
      method: "GET",
      url: "/v1/notifications/unread-count",
      headers: { cookie: user.cookieHeader },
    });
    expect(countRes.json().unread_count).toBe(0);
  });

  // =========================================================================
  // 4. Payment Idempotency (Success & Failure)
  // =========================================================================
  it("enforces strict idempotency on purchase success (duplicate events do not create duplicates)", async () => {
    const userId = asUserId(randomUUID());
    const paymentId = randomUUID();
    const orderId = randomUUID();

    // First call
    const firstNotif = await notificationService.notifyPurchaseCompleted(
      userId,
      {
        paymentId,
        orderId,
        productTitle: "دوره جامع فارماکولوژی",
        productType: "course",
        targetId: "course-123",
      },
    );
    expect(firstNotif).not.toBeNull();

    // Duplicate webhook / retry call with same paymentId
    const secondNotif = await notificationService.notifyPurchaseCompleted(
      userId,
      {
        paymentId,
        orderId,
        productTitle: "دوره جامع فارماکولوژی",
        productType: "course",
        targetId: "course-123",
      },
    );

    // Should return existing notification, without duplicating
    expect(secondNotif?.id).toBe(firstNotif?.id);

    const list = await notificationService.listForUser(userId);
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe("خرید دوره «دوره جامع فارماکولوژی»");
    expect(list.items[0]?.action?.url).toBe("/courses/course-123");
  });

  it("enforces strict idempotency on payment failure", async () => {
    const userId = asUserId(randomUUID());
    const paymentId = randomUUID();
    const orderId = randomUUID();

    // First failure notification
    const firstNotif = await notificationService.notifyPaymentFailed(userId, {
      paymentId,
      orderId,
      reason: "موجودی حساب کافی نیست",
    });
    expect(firstNotif).not.toBeNull();
    expect(firstNotif?.type).toBe("payment_failed");

    // Duplicate failure callback / retry
    const secondNotif = await notificationService.notifyPaymentFailed(userId, {
      paymentId,
      orderId,
      reason: "موجودی حساب کافی نیست",
    });

    expect(secondNotif?.id).toBe(firstNotif?.id);

    const list = await notificationService.listForUser(userId);
    expect(list.total).toBe(1);
  });

  // =========================================================================
  // 5. Content Generation Idempotency & Failure Handling
  // =========================================================================
  it("enforces idempotency on generation completion and handles failure cleanly", async () => {
    const userId = asUserId(randomUUID());
    const jobId = randomUUID();
    const documentId = randomUUID();
    const courseId = randomUUID();

    // Successful generation notification
    const completedNotif1 =
      await notificationService.notifyGenerationCompleted(userId, {
        jobId,
        documentId,
        courseId,
        types: ["lesson", "flashcard", "quiz"],
      });

    expect(completedNotif1).not.toBeNull();
    expect(completedNotif1?.type).toBe("generation_completed");
    expect(completedNotif1?.action?.url).toBe(`/courses/${courseId}/manage`);

    // Duplicate generation callback / retry
    const completedNotif2 =
      await notificationService.notifyGenerationCompleted(userId, {
        jobId,
        documentId,
        courseId,
        types: ["lesson", "flashcard", "quiz"],
      });

    expect(completedNotif2?.id).toBe(completedNotif1?.id);

    // Generation failure notification
    const failedJobId = randomUUID();
    const failedNotif = await notificationService.notifyGenerationFailed(
      userId,
      {
        jobId: failedJobId,
        documentId,
        courseId,
        errorCode: "ai_provider_timeout",
      },
    );

    expect(failedNotif).not.toBeNull();
    expect(failedNotif?.type).toBe("generation_failed");
    expect(failedNotif?.title).toBe("تولید محتوا ناموفق بود");

    // Total user notifications should be 2 (1 completed + 1 failed)
    const list = await notificationService.listForUser(userId);
    expect(list.total).toBe(2);
  });

  // =========================================================================
  // 6. Login Anti-Spam Strategy (1-hour window deduplication)
  // =========================================================================
  it("applies anti-spam deduplication to sequential logins within 1 hour", async () => {
    const userId = asUserId(randomUUID());

    // First login
    const login1 = await notificationService.notifyLogin(userId, {
      ip: "127.0.0.1",
      sessionId: "session-1",
    });
    expect(login1).not.toBeNull();
    expect(login1?.type).toBe("login_success");

    // Immediate second login (e.g. user refreshed or logged in on another tab)
    const login2 = await notificationService.notifyLogin(userId, {
      ip: "127.0.0.1",
      sessionId: "session-2",
    });

    // Should return existing notification without creating a new record
    expect(login2?.id).toBe(login1?.id);

    const list = await notificationService.listForUser(userId);
    expect(list.total).toBe(1);
  });
});
