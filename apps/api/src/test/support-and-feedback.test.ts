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
  let supportAgentCookie: string;
  let contentWorkerCookie: string;
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
    organizationStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(organizationStore);
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

    const supportAgent = await createUserWithRole("support@avana.test", Roles.support_agent);
    supportAgentCookie = `avana_session=${supportAgent.sessionToken}`;

    const contentWorker = await createUserWithRole("worker@avana.test", Roles.content_worker);
    contentWorkerCookie = `avana_session=${contentWorker.sessionToken}`;

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
      expect(userMessages.some((m: { isInternalNote: boolean }) => m.isInternalNote)).toBe(false);
      expect(userMessages.some((m: { body: string }) => m.body.includes("یادداشت داخلی"))).toBe(false);

      // Admin fetches ticket: Internal note IS PRESENT
      const adminDetailRes = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: platformAdminCookie },
      });
      const adminMessages = JSON.parse(adminDetailRes.payload).ticket.messages;
      expect(adminMessages.some((m: { isInternalNote: boolean }) => m.isInternalNote)).toBe(true);

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

      // Admin can view attachment and gets sanitized UTF-8 Content-Disposition
      const adminStream = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        headers: { cookie: platformAdminCookie },
      });
      expect(adminStream.statusCode).toBe(200);
      expect(adminStream.headers["content-disposition"]).toMatch(
        /inline; filename=".*"; filename\*=UTF-8''.*/,
      );

      // Support agent can view attachment
      const agentStream = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        headers: { cookie: supportAgentCookie },
      });
      expect(agentStream.statusCode).toBe(200);

      // Admin with globalRole: platform_admin can view attachment even if effective role is student
      const globalAdmin = await userStore.createUserWithPassword({
        email: "globaladmin@avana.test",
        passwordHash: "password_hash_xyz",
        name: "GlobalAdmin",
      });
      globalAdmin.globalRole = Roles.platform_admin;
      globalAdmin.role = Roles.student;
      userStore.insert({ ...globalAdmin });
      const sessionService = new SessionService(sessionStore, config.session);
      const globalAdminSession = await sessionService.createSession(globalAdmin.id);
      const globalAdminCookie = `avana_session=${globalAdminSession.sessionToken}`;

      const globalAdminStream = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey)}`,
        headers: { cookie: globalAdminCookie },
      });
      expect(globalAdminStream.statusCode).toBe(200);

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

    it("support_agent can access admin support endpoints while content_worker is denied", async () => {
      const app = await buildTestApp();

      // Student creates ticket
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "account",
          title: "تیکت تست دسترسی پشتیبان",
          description: "شرح تیکت تست.",
        },
      });
      const ticketId = JSON.parse(createRes.payload).ticket.id;

      // 1. support_agent accesses admin tickets list -> 200
      const agentListRes = await app.inject({
        method: "GET",
        url: "/v1/admin/support/tickets",
        headers: { cookie: supportAgentCookie },
      });
      expect(agentListRes.statusCode).toBe(200);

      // 2. support_agent views ticket details -> 200
      const agentViewRes = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: supportAgentCookie },
      });
      expect(agentViewRes.statusCode).toBe(200);

      // 3. support_agent sends admin response -> 201
      const agentMsgRes = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: supportAgentCookie },
        payload: {
          body: "پاسخ پشتیبان به تیکت",
          is_internal_note: false,
          new_status: "in_progress",
        },
      });
      expect(agentMsgRes.statusCode).toBe(201);

      // 4. content_worker tries to access admin tickets list -> 403 Forbidden
      const workerListRes = await app.inject({
        method: "GET",
        url: "/v1/admin/support/tickets",
        headers: { cookie: contentWorkerCookie },
      });
      expect(workerListRes.statusCode).toBe(403);

      // 5. content_worker tries to view ticket details -> 403 Forbidden
      const workerViewRes = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: contentWorkerCookie },
      });
      expect(workerViewRes.statusCode).toBe(403);

      // 6. content_worker tries to respond to ticket -> 403 Forbidden
      const workerMsgRes = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: contentWorkerCookie },
        payload: { body: "پاسخ غیرمجاز توسط کارگر محتوا" },
      });
      expect(workerMsgRes.statusCode).toBe(403);
    });

    it("10. support_agent full operational workflow: priority, category, status transition, reopening, and feedback response", async () => {
      const app = await buildTestApp();

      // 1. User creates a ticket
      const ticketRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "courses",
          priority: "low",
          title: "مشکل در اجرای ویدیو دوره",
          description: "ویدیوهای بخش دوم دوره شیمی برای من لود نمی‌شوند و صفحه سفید می‌ماند.",
        },
      });
      expect(ticketRes.statusCode).toBe(201);
      const ticketId = JSON.parse(ticketRes.payload).ticket.id;

      // 2. support_agent updates priority to urgent
      const priorityRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/support/tickets/${ticketId}/priority`,
        headers: { cookie: supportAgentCookie },
        payload: { priority: "urgent" },
      });
      expect(priorityRes.statusCode).toBe(200);
      expect(JSON.parse(priorityRes.payload).ticket.priority).toBe("urgent");

      // 3. support_agent updates category to technical
      const categoryRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/support/tickets/${ticketId}/category`,
        headers: { cookie: supportAgentCookie },
        payload: { category: "technical" },
      });
      expect(categoryRes.statusCode).toBe(200);
      expect(JSON.parse(categoryRes.payload).ticket.category).toBe("technical");

      // 4. support_agent replies and marks in_progress
      const replyRes = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: supportAgentCookie },
        payload: {
          body: "در حال بررسی مشکل سرور پخش محتوا هستیم.",
          new_status: "in_progress",
        },
      });
      expect(replyRes.statusCode).toBe(201);

      // 5. support_agent marks ticket closed
      const closeRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/support/tickets/${ticketId}/status`,
        headers: { cookie: supportAgentCookie },
        payload: { status: "closed" },
      });
      expect(closeRes.statusCode).toBe(200);
      expect(JSON.parse(closeRes.payload).ticket.status).toBe("closed");

      // 6. support_agent reopens the closed ticket to in_progress
      const reopenRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/support/tickets/${ticketId}/status`,
        headers: { cookie: supportAgentCookie },
        payload: { status: "in_progress" },
      });
      expect(reopenRes.statusCode).toBe(200);
      expect(JSON.parse(reopenRes.payload).ticket.status).toBe("in_progress");

      // 7. User creates a feedback
      const fbCreateRes = await app.inject({
        method: "POST",
        url: "/v1/feedback",
        headers: { cookie: studentCookie },
        payload: {
          type: "suggestion",
          category: "courses",
          title: "پیشنهاد افزایش کیفیت تصاویر شیمی",
          description: "تصاویر ساختار شیمیایی در درس اول اگر ابعاد بزرگتری داشته باشند خواناتر خواهند بود.",
        },
      });
      expect(fbCreateRes.statusCode).toBe(201);
      const feedbackId = JSON.parse(fbCreateRes.payload).feedback.id;

      // 8. support_agent responds to feedback and marks answered
      const fbRespRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/feedback/${feedbackId}`,
        headers: { cookie: supportAgentCookie },
        payload: {
          admin_response: "با تشکر، تصاویر با وضوح بالا در آپدیت بعدی جایگزین شدند.",
          status: "answered",
        },
      });
      expect(fbRespRes.statusCode).toBe(200);
      const fbBody = JSON.parse(fbRespRes.payload).feedback;
      expect(fbBody.status).toBe("answered");
      expect(fbBody.adminResponse).toContain("با تشکر");
    });

    it("11. Attachment Key Variations & Security Isolation (support/<uuid>.<ext> vs support%2F<uuid>.<ext>)", async () => {
      const app = await buildTestApp();

      // Setup 2 files in storage
      const uuid1 = randomUUID();
      const uuid2 = randomUUID();
      const storageKey1 = `support/${uuid1}.png`;
      const storageKey2 = `support/${uuid2}.pdf`;

      await storageProvider.save({
        storageKey: storageKey1,
        data: Buffer.from("image content 1"),
        mimeType: "image/png",
      });
      await storageProvider.save({
        storageKey: storageKey2,
        data: Buffer.from("pdf content 2"),
        mimeType: "application/pdf",
      });

      // User 1 creates Ticket 1 with encoded URL in DB
      const t1Res = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "technical",
          title: "تیکت کاربر ۱ با ضمیمه انکودشده",
          description: "توضیحات تیکت کاربر اول جهت تست ضمیمه.",
          attachment_url: `/v1/support/attachments/${encodeURIComponent(storageKey1)}`,
        },
      });
      expect(t1Res.statusCode).toBe(201);

      // User 1 adds message with unencoded URL in DB
      const ticket1Id = JSON.parse(t1Res.payload).ticket.id;
      const msgRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticket1Id}/messages`,
        headers: { cookie: studentCookie },
        payload: {
          body: "پیام با ضمیمه پی‌دی‌اف",
          attachment_url: `/v1/support/attachments/${storageKey2}`,
        },
      });
      expect(msgRes.statusCode).toBe(201);

      // 1. Both encoded and unencoded request URLs work for User 1
      const req1Encoded = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey1)}`,
        headers: { cookie: studentCookie },
      });
      expect(req1Encoded.statusCode).toBe(200);

      const req1Unencoded = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${storageKey1}`,
        headers: { cookie: studentCookie },
      });
      expect(req1Unencoded.statusCode).toBe(200);

      // 2. Both work for the message attachment (storageKey2)
      const req2Encoded = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey2)}`,
        headers: { cookie: studentCookie },
      });
      expect(req2Encoded.statusCode).toBe(200);
      expect(req2Encoded.headers["content-type"]).toBe("application/pdf");

      const req2Unencoded = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${storageKey2}`,
        headers: { cookie: studentCookie },
      });
      expect(req2Unencoded.statusCode).toBe(200);

      // 3. User 2 cannot access either attachment (Cross-ticket isolation)
      const u2Req1 = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey1)}`,
        headers: { cookie: otherStudentCookie },
      });
      expect(u2Req1.statusCode).toBe(403);

      const u2Req2 = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey2)}`,
        headers: { cookie: otherStudentCookie },
      });
      expect(u2Req2.statusCode).toBe(403);

      // 4. Admin can access both attachments
      const adminReq1 = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey1)}`,
        headers: { cookie: platformAdminCookie },
      });
      expect(adminReq1.statusCode).toBe(200);

      const adminReq2 = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(storageKey2)}`,
        headers: { cookie: platformAdminCookie },
      });
      expect(adminReq2.statusCode).toBe(200);

      // 5. Non-existent file handled with 404 for authorized user/admin
      const nonExistentKey = `support/${randomUUID()}.png`;
      // Link to ticket so authorization passes to storage check
      await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticket1Id}/messages`,
        headers: { cookie: studentCookie },
        payload: {
          body: "پیام با فایل گم‌شده",
          attachment_url: `/v1/support/attachments/${encodeURIComponent(nonExistentKey)}`,
        },
      });

      const missingRes = await app.inject({
        method: "GET",
        url: `/v1/support/attachments/${encodeURIComponent(nonExistentKey)}`,
        headers: { cookie: studentCookie },
      });
      expect(missingRes.statusCode).toBe(404);
      expect(JSON.parse(missingRes.payload).error.message).toContain("فایل ضمیمه یافت نشد");
    });
  });

  describe("Read Receipt Flow & Strict Security Isolation", () => {
    it("Admin response has initial readAt = null, strictly omitted from user API, and correctly records first view upon user read receipt", async () => {
      const app = await buildTestApp();

      // 1. Student creates a ticket
      const ticketRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets",
        headers: { cookie: studentCookie },
        payload: {
          category: "technical",
          title: "مشکل در ورود به جلسه آزمون",
          description: "صفحه آزمون برای من باز نمیشود و خطای ارتباط میدهد.",
        },
      });
      expect(ticketRes.statusCode).toBe(201);
      const ticketId = JSON.parse(ticketRes.payload).ticket.id;

      // 2. Admin sends two separate replies (msg1 public, msg2 public, msg3 internal note)
      const adminReply1 = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: platformAdminCookie },
        payload: {
          body: "سلام، لطفاً کش مرورگر خود را پاک کنید.",
        },
      });
      expect(adminReply1.statusCode).toBe(201);
      const msg1Id = JSON.parse(adminReply1.payload).message.id;

      const adminReply2 = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: platformAdminCookie },
        payload: {
          body: "همچنین اطمینان حاصل کنید اتصال فیلترشکن خاموش است.",
        },
      });
      expect(adminReply2.statusCode).toBe(201);
      const msg2Id = JSON.parse(adminReply2.payload).message.id;

      const adminInternalNote = await app.inject({
        method: "POST",
        url: `/v1/admin/support/tickets/${ticketId}/messages`,
        headers: { cookie: platformAdminCookie },
        payload: {
          body: "بررسی شد: آی‌پی کاربر مربوط به خارج از کشور بود.",
          is_internal_note: true,
        },
      });
      expect(adminInternalNote.statusCode).toBe(201);
      const internalMsgId = JSON.parse(adminInternalNote.payload).message.id;

      // 3. Admin checks ticket details: readAt is null initially for public admin messages
      const adminViewInitial = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: platformAdminCookie },
      });
      expect(adminViewInitial.statusCode).toBe(200);
      const adminMsgs = JSON.parse(adminViewInitial.payload).ticket.messages;
      const m1Admin = adminMsgs.find((m: { id: string }) => m.id === msg1Id);
      const m2Admin = adminMsgs.find((m: { id: string }) => m.id === msg2Id);
      expect(m1Admin.readAt).toBeNull();
      expect(m2Admin.readAt).toBeNull();

      // 4. User checks ticket details: STRICT SECURITY REQUIREMENT:
      // readAt MUST NOT be present in user API response keys at all!
      const userViewInitial = await app.inject({
        method: "GET",
        url: `/v1/support/tickets/${ticketId}`,
        headers: { cookie: studentCookie },
      });
      expect(userViewInitial.statusCode).toBe(200);
      const userMsgs = JSON.parse(userViewInitial.payload).ticket.messages;
      expect(userMsgs.some((m: { id: string }) => m.id === internalMsgId)).toBe(false); // Internal note hidden
      for (const m of userMsgs) {
        expect("readAt" in m).toBe(false);
      }

      // 5. User actually views msg1 ONLY (msg2 is NOT viewed yet)
      const readRes1 = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: [msg1Id],
        },
      });
      expect(readRes1.statusCode).toBe(200);
      expect(JSON.parse(readRes1.payload)).toEqual({ success: true, markedCount: 1 });

      // 6. Admin checks again: msg1 now has valid readAt timestamp, msg2 is STILL null («دیده نشده»)
      const adminViewAfterMsg1 = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: platformAdminCookie },
      });
      const adminMsgsAfter1 = JSON.parse(adminViewAfterMsg1.payload).ticket.messages;
      const m1Updated = adminMsgsAfter1.find((m: { id: string }) => m.id === msg1Id);
      const m2StillNull = adminMsgsAfter1.find((m: { id: string }) => m.id === msg2Id);
      expect(typeof m1Updated.readAt).toBe("string");
      expect(m2StillNull.readAt).toBeNull();
      const firstReadAtTime = m1Updated.readAt;

      // 7. Idempotency test: User marks msg1 again (e.g. repeated scroll or refetch)
      const readResRepeat = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: [msg1Id],
        },
      });
      expect(readResRepeat.statusCode).toBe(200);
      expect(JSON.parse(readResRepeat.payload)).toEqual({ success: true, markedCount: 0 });

      // Check timestamp did NOT change
      const adminViewAfterRepeat = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: platformAdminCookie },
      });
      const m1Unchanged = JSON.parse(adminViewAfterRepeat.payload).ticket.messages.find(
        (m: { id: string }) => m.id === msg1Id,
      );
      expect(m1Unchanged.readAt).toBe(firstReadAtTime);

      // 8. User API response STILL never reveals readAt
      const userViewAfter = await app.inject({
        method: "GET",
        url: `/v1/support/tickets/${ticketId}`,
        headers: { cookie: studentCookie },
      });
      const userMsgsAfter = JSON.parse(userViewAfter.payload).ticket.messages;
      for (const m of userMsgsAfter) {
        expect("readAt" in m).toBe(false);
      }

      // 9. IDOR & Ownership Security Tests:
      // Other student tries to mark student's ticket messages as read -> 403 Forbidden
      const idorRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: otherStudentCookie },
        payload: {
          message_ids: [msg2Id],
        },
      });
      expect(idorRes.statusCode).toBe(403);

      // 10. Student tries to mark internal note or fake/foreign message ID
      const fakeMsgId = randomUUID();
      const foreignRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: [internalMsgId, fakeMsgId],
        },
      });
      expect(foreignRes.statusCode).toBe(200);
      expect(JSON.parse(foreignRes.payload)).toEqual({ success: true, markedCount: 0 });

      // 11. Validating messageIds payload limits and validation
      const emptyPayloadRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: [],
        },
      });
      expect(emptyPayloadRes.statusCode).toBe(400);

      // 11b. Invalid UUID for ticket ID
      const invalidTicketRes = await app.inject({
        method: "POST",
        url: "/v1/support/tickets/not-a-uuid/messages/read",
        headers: { cookie: studentCookie },
        payload: {
          message_ids: [msg2Id],
        },
      });
      expect(invalidTicketRes.statusCode).toBe(400);
      expect(JSON.parse(invalidTicketRes.payload).error.code).toBe("bad_request");

      // 11c. Invalid UUID in message_ids
      const invalidMessageUuidRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: ["malicious-string-or-sql"],
        },
      });
      expect(invalidMessageUuidRes.statusCode).toBe(400);
      expect(JSON.parse(invalidMessageUuidRes.payload).error.code).toBe("bad_request");

      // 11d. Array length limit exceeded (> 50)
      const oversizedArray = Array.from({ length: 51 }, () => randomUUID());
      const oversizedRes = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: oversizedArray,
        },
      });
      expect(oversizedRes.statusCode).toBe(400);
      expect(JSON.parse(oversizedRes.payload).error.code).toBe("bad_request");

      // 12. Finally, user views msg2 -> msg2 becomes read
      const readRes2 = await app.inject({
        method: "POST",
        url: `/v1/support/tickets/${ticketId}/messages/read`,
        headers: { cookie: studentCookie },
        payload: {
          message_ids: [msg2Id],
        },
      });
      expect(readRes2.statusCode).toBe(200);
      expect(JSON.parse(readRes2.payload)).toEqual({ success: true, markedCount: 1 });

      const adminViewFinal = await app.inject({
        method: "GET",
        url: `/v1/admin/support/tickets/${ticketId}`,
        headers: { cookie: platformAdminCookie },
      });
      const m2Updated = JSON.parse(adminViewFinal.payload).ticket.messages.find(
        (m: { id: string }) => m.id === msg2Id,
      );
      expect(typeof m2Updated.readAt).toBe("string");
    });
  });
});
