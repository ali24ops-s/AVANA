import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemorySupportStore,
  SupportService,
} from "../modules/support/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  asUserId,
  type OrganizationId,
  type Role,
  type UserId,
  Roles,
} from "@avana/domain";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Support and Feedback System E2E & Integration", () => {
  let config: ReturnType<typeof makeTestConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;
  let supportStore: InMemorySupportStore;
  let supportService: SupportService;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let storageProvider: LocalStorageProvider;
  let tempStorageDir: string;

  let platformAdminCookie: string;
  let studentCookie: string;
  let otherStudentCookie: string;
  let studentUserId: UserId;
  let otherStudentUserId: UserId;
  let adminUserId: UserId;

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
      notificationStore,
      notificationService,
      supportStore,
      supportService,
      auditService,
      storageProvider,
    });
    return app;
  }

  beforeEach(async () => {
    config = makeTestConfig();
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-support-test-"));
    storageProvider = new LocalStorageProvider(tempStorageDir);
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    supportStore = new InMemorySupportStore(userStore);
    supportService = new SupportService(supportStore, notificationService, auditService);

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "password_hash_xyz",
        name: email.split("@")[0],
      });
      if (role === Roles.platform_admin || role === Roles.content_worker) {
        user.globalRole = role;
        user.role = role;
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      organizationStore.addMembership({
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

    const admin = await createUserWithRole("admin@avana.test", Roles.platform_admin);
    platformAdminCookie = `avana_session=${admin.sessionToken}`;
    adminUserId = admin.user.id as UserId;

    const student = await createUserWithRole("student1@avana.test", Roles.student);
    studentCookie = `avana_session=${student.sessionToken}`;
    studentUserId = student.user.id as UserId;

    const otherStudent = await createUserWithRole("student2@avana.test", Roles.student);
    otherStudentCookie = `avana_session=${otherStudent.sessionToken}`;
    otherStudentUserId = otherStudent.user.id as UserId;
  });

  // =========================================================================
  // 1. Feedback Flow Tests
  // =========================================================================
  describe("Feedback Flow", () => {
    it("User creates feedback and only creator & admin can view it", async () => {
      const app = await buildTestApp();

      // 1. Student creates feedback
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/feedback",
        headers: { cookie: studentCookie },
        payload: {
          type: "suggestion",
          category: "courses",
          title: "پیشنهاد افزودن حالت تمرین",
          description: "اگر امکان دارد حالت تمرین بدون محدودیت زمانی به آزمون‌ها اضافه شود.",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const createdFb = JSON.parse(createRes.payload).feedback;
      expect(createdFb.id).toBeDefined();
      expect(createdFb.status).toBe("new");
      expect(createdFb.userId).toBe(studentUserId);

      // 2. Creator views their own feedback
      const myRes = await app.inject({
        method: "GET",
        url: `/v1/feedback/${createdFb.id}`,
        headers: { cookie: studentCookie },
      });
      expect(myRes.statusCode).toBe(200);

      // 3. Other user receives 403 Forbidden
      const otherRes = await app.inject({
        method: "GET",
        url: `/v1/feedback/${createdFb.id}`,
        headers: { cookie: otherStudentCookie },
      });
      expect(otherRes.statusCode).toBe(403);

      // 4. Admin views feedback
      const adminRes = await app.inject({
        method: "GET",
        url: `/v1/admin/feedback/${createdFb.id}`,
        headers: { cookie: platformAdminCookie },
      });
      expect(adminRes.statusCode).toBe(200);
    });

    it("Admin responds to feedback, user receives response and notification", async () => {
      const app = await buildTestApp();

      const createRes = await app.inject({
        method: "POST",
        url: "/v1/feedback",
        headers: { cookie: studentCookie },
        payload: {
          type: "bug_report",
          category: "exams",
          title: "خطای بارگذاری سوال چهارم",
          description: "در آزمون داروشناسی سوال ۴ بارگذاری نشد و صفحه سفید ماند.",
        },
      });
      const fbId = JSON.parse(createRes.payload).feedback.id;

      // Admin responds
      const respondRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/feedback/${fbId}`,
        headers: { cookie: platformAdminCookie },
        payload: {
          admin_response: "سلام، مشکل برطرف شد و سوال ۴ اصلاح گردید. ممنون از گزارش شما.",
          status: "answered",
        },
      });

      expect(respondRes.statusCode).toBe(200);
      const updatedFb = JSON.parse(respondRes.payload).feedback;
      expect(updatedFb.status).toBe("answered");
      expect(updatedFb.adminResponse).toContain("مشکل برطرف شد");

      // User sees updated response
      const userView = await app.inject({
        method: "GET",
        url: `/v1/feedback/${fbId}`,
        headers: { cookie: studentCookie },
      });
      expect(userView.statusCode).toBe(200);
      expect(JSON.parse(userView.payload).feedback.adminResponse).toContain("مشکل برطرف شد");

      // User received notification
      const notifRes = await notificationService.listForUser(studentUserId);
      expect(notifRes.items.some((n) => n.type === "feedback_answered")).toBe(true);
    });
  });

  // =========================================================================
  // 2. Support Ticket & Conversation Threading Tests
  // =========================================================================
  describe("Support Ticket Conversation & Status Transitions", () => {
    it("User creates ticket, exchanges messages with admin, and transitions status properly", async () => {
      const app = await buildTestApp();

      // 1. User creates ticket
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "payment",
          priority: "high",
          title: "عدم فعال‌سازی اشتراک پس از پرداخت",
          description: "مبلغ کسر شده است ولی اشتراک من همچنان غیرفعال است.",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const ticketId = JSON.parse(createRes.payload).ticket.id;

      // Initial details check
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/support/tickets/${ticketId}`,
        headers: { cookie: studentCookie },
      });
      expect(detailRes.statusCode).toBe(200);
      const initialTicket = JSON.parse(detailRes.payload).ticket;
      expect(initialTicket.status).toBe("open");
      expect(initialTicket.messages.length).toBe(1);

      // 2. Admin sends public reply -> transitions to ANSWERED
      const adminReplyRes = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: platformAdminCookie },
        payload: {
          body: "سلام، شماره پیگیری فیش واریزی را ارسال بفرمایید تا بررسی شود.",
          new_status: "waiting_for_user",
        },
      });
      expect(adminReplyRes.statusCode).toBe(201);

      // Ticket status changed to WAITING_FOR_USER and user notified
      const ticketAfterAdmin = await supportStore.findTicketById(ticketId);
      expect(ticketAfterAdmin?.status).toBe("waiting_for_user");

      const notifs = await notificationService.listForUser(studentUserId);
      expect(notifs.items.some((n) => n.type === "support_ticket_replied")).toBe(true);

      // 3. User replies with tracking number -> Auto-transitions back to IN_PROGRESS
      const userReplyRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages`,
        headers: { cookie: studentCookie },
        payload: {
          body: "شماره پیگیری: 849204820 می‌باشد.",
        },
      });
      expect(userReplyRes.statusCode).toBe(201);

      const ticketAfterUser = await supportStore.findTicketById(ticketId);
      expect(ticketAfterUser?.status).toBe("in_progress");

      // 4. Admin adds internal note -> Invisible to user!
      const internalNoteRes = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: platformAdminCookie },
        payload: {
          body: "یادداشت داخلی: در دیتابیس تراکنش بانکی را دستی تأیید کردم.",
          is_internal_note: true,
        },
      });
      expect(internalNoteRes.statusCode).toBe(201);

      // User fetches ticket: Internal note MUST NOT BE PRESENT
      const userDetailRes = await app.inject({
        method: "GET",
        url: `/v1/support/tickets/${ticketId}`,
        headers: { cookie: studentCookie },
      });
      const userMessages = JSON.parse(userDetailRes.payload).ticket.messages;
      expect(userMessages.some((m: any) => m.isInternalNote)).toBe(false);
      expect(userMessages.some((m: any) => m.body.includes("یادداشت داخلی"))).toBe(false);

      // Admin fetches ticket: Internal note IS PRESENT
      const adminDetailRes = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: platformAdminCookie },
      });
      const adminMessages = JSON.parse(adminDetailRes.payload).ticket.messages;
      expect(adminMessages.some((m: any) => m.isInternalNote)).toBe(true);

      // 5. Admin closes ticket
      const closeRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/support/tickets/${ticketId}/status`,
        headers: { cookie: platformAdminCookie },
        payload: { status: "closed" },
      });
      expect(closeRes.statusCode).toBe(200);

      // 6. Closed Ticket message behavior: User cannot send message on closed ticket without reopen
      const closedMsgRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages`,
        headers: { cookie: studentCookie },
        payload: { body: "پیام جدید روی تیکت بسته" },
      });
      expect(closedMsgRes.statusCode).toBe(400);

      // 7. Explicit Reopen flow
      const reopenRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/reopen`,
        headers: { cookie: studentCookie },
      });
      expect(reopenRes.statusCode).toBe(200);
      expect(JSON.parse(reopenRes.payload).ticket.status).toBe("open");
    });
  });

  // =========================================================================
  // 3. Security, IDOR & Authorization Tests
  // =========================================================================
  describe("Security & IDOR Isolation", () => {
    it("User cannot access another user's ticket", async () => {
      const app = await buildTestApp();

      // Student 1 creates ticket
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "courses",
          title: "تیکت خصوصی دانشجو ۱",
          description: "اطلاعات محرمانه حساب کاربری.",
        },
      });
      const ticketId = JSON.parse(createRes.payload).ticket.id;

      // Student 2 tries to access Student 1's ticket -> 403 Forbidden
      const res = await app.inject({
        method: "GET",
        url: `/v1/support/tickets/${ticketId}`,
        headers: { cookie: otherStudentCookie },
      });
      expect(res.statusCode).toBe(403);

      // Student 2 tries to send message on Student 1's ticket -> 403 Forbidden
      const postRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages`,
        headers: { cookie: otherStudentCookie },
        payload: { body: "تلاش غیرمجاز" },
      });
      expect(postRes.statusCode).toBe(403);
    });

    it("Unauthorized student cannot call admin support endpoints", async () => {
      const app = await buildTestApp();

      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/support/tickets",
        headers: { cookie: studentCookie },
      });
      expect(res.statusCode).toBe(403);

      const resFb = await app.inject({
        method: "GET",
        url: "/v1/admin/feedback",
        headers: { cookie: studentCookie },
      });
      expect(resFb.statusCode).toBe(403);
    });

    it("Attachment authorization: User A cannot stream User B's attachment", async () => {
      const app = await buildTestApp();

      // Save a file into storage
      const storageKey = `support/${randomUUID()}.png`;
      await storageProvider.save({
        storageKey,
        data: Buffer.from("fake-image-bytes"),
        mimeType: "image/png",
      });

      // User 1 links this attachment to their ticket
      await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "technical",
          title: "تصویر خطای سیستمی",
          description: "ضمیمه تصویر خطا به پیوست.",
          attachment_url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        },
      });

      // User 1 can view attachment
      const user1Stream = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        headers: { cookie: studentCookie },
      });
      expect(user1Stream.statusCode).toBe(200);

      // Admin can view attachment
      const adminStream = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        headers: { cookie: platformAdminCookie },
      });
      expect(adminStream.statusCode).toBe(200);

      // User 2 CANNOT view attachment (403 Forbidden)
      const user2Stream = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        headers: { cookie: otherStudentCookie },
      });
      expect(user2Stream.statusCode).toBe(403);
    });

    it("User cannot spoof sender_id, sender_role, or create internal notes", async () => {
      const app = await buildTestApp();

      // Student creates ticket
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "technical",
          title: "تست تلاش برای جعل هویت",
          description: "توضیحات تیکت",
          // Attempting to spoof sender info in creation
          sender_id: otherStudentUserId,
          sender_role: "admin",
          is_internal_note: true,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const ticketId = JSON.parse(createRes.payload).ticket.id;

      // Student sends message with spoofed fields
      const msgRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages`,
        headers: { cookie: studentCookie },
        payload: {
          body: "پیام جعلی",
          sender_id: adminUserId,
          sender_role: "admin",
          is_internal_note: true,
        },
      });
      expect(msgRes.statusCode).toBe(201);
      const msg = JSON.parse(msgRes.payload).message;

      // Assert sender is strictly the authenticated student and not an internal note
      expect(msg.senderId).toBe(studentUserId);
      expect(msg.senderRole).toBe("user");
      expect(msg.isInternalNote).toBe(false);
    });

    it("Closed ticket rejects user messages until explicitly reopened", async () => {
      const app = await buildTestApp();

      // Student creates ticket
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "account",
          title: "تیکت جهت بستن و بازگشایی",
          description: "شرح کامل تیکت برای بستن و بازگشایی مجدد.",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const ticketId = JSON.parse(createRes.payload).ticket.id;

      // Admin closes ticket
      const closeRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/support/tickets/${ticketId}/status`,
        headers: { cookie: platformAdminCookie },
        payload: { status: "closed" },
      });
      expect(closeRes.statusCode).toBe(200);

      // Student tries to send message on closed ticket -> 400 Bad Request
      const failMsgRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages`,
        headers: { cookie: studentCookie },
        payload: { body: "ارسال به تیکت بسته" },
      });
      expect(failMsgRes.statusCode).toBe(400);

      // Student explicitly reopens ticket
      const reopenRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/reopen`,
        headers: { cookie: studentCookie },
      });
      expect(reopenRes.statusCode).toBe(200);
      expect(JSON.parse(reopenRes.payload).ticket.status).toBe("open");

      // Now student can send message
      const successMsgRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages`,
        headers: { cookie: studentCookie },
        payload: { body: "پیام پس از بازگشایی" },
      });
      expect(successMsgRes.statusCode).toBe(201);
    });
  });
});
