import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  asUserId,
  type Actor,
  type UserId,
} from "@avana/domain";
import { SupportService } from "../modules/support/support-service.js";
import { InMemorySupportStore } from "../modules/support/in-memory-stores.js";
import {
  InMemorySupportNotificationQueue,
  processSupportNotificationJob,
  reconcilePendingSupportNotifications,
  maskEmailForLogs,
} from "../modules/support/support-notification-queue.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import {
  MockEmailService,
  type SendTicketReplyEmailInput,
} from "../modules/identity/email-service.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";

describe("Support Ticket Notification & Multichannel Flow (E2E & Integration)", () => {
  let userStore: InMemoryUserStore;
  let supportStore: InMemorySupportStore;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;
  let emailService: MockEmailService;
  let notificationQueue: InMemorySupportNotificationQueue;
  let supportService: SupportService;

  const normalUser: Actor = {
    userId: asUserId("11111111-1111-1111-1111-111111111111"),
    roles: ["student"],
  };

  const otherUser: Actor = {
    userId: asUserId("22222222-2222-2222-2222-222222222222"),
    roles: ["student"],
  };

  const adminActor: Actor = {
    userId: asUserId("99999999-9999-9999-9999-999999999999"),
    role: "platform_admin",
    globalRole: "platform_admin",
    roles: ["platform_admin"],
  };

  beforeEach(async () => {
    userStore = new InMemoryUserStore();
    userStore.insert({
      id: normalUser.userId,
      email: "student@aavana.ir",
      phoneNumber: "+989123456789",
      name: "کاربر دانشجو",
      role: "student",
      globalRole: null,
      emailVerified: true,
      phoneVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      phoneVerifiedAt: new Date().toISOString(),
      major: null,
    });

    userStore.insert({
      id: otherUser.userId,
      email: "other@aavana.ir",
      phoneNumber: "+989987654321",
      name: "کاربر دیگر",
      role: "student",
      globalRole: null,
      emailVerified: true,
      phoneVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      phoneVerifiedAt: new Date().toISOString(),
      major: null,
    });

    supportStore = new InMemorySupportStore(userStore);
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);
    emailService = new MockEmailService();

    notificationQueue = new InMemorySupportNotificationQueue(
      {
        emailService,
        notificationStore,
        userStore,
        appUrl: "https://aavana.ir",
      },
      { autoProcess: false }, // Manual control for step-by-step determinism
    );

    supportService = new SupportService(
      supportStore,
      notificationService,
      undefined, // auditService
      notificationQueue,
      userStore,
    );
  });

  it("1. پاسخ پشتیبان باعث ایجاد Notification برای صاحب تیکت شود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "courses",
      title: "سوال درباره ویدیو جلسه ۳",
      description: "ویدیو جلسه سوم در دقیقه ۱۵ صدا ندارد.",
    });

    // Admin sends public reply
    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "سلام، فایل ویدیو بررسی و اصلاح شد.",
      isInternalNote: false,
    });

    expect(reply.id).toBeDefined();

    // Verify in-site notification created for ticket owner
    const userNotifs = await notificationService.listForUser(normalUser.userId);
    expect(userNotifs.total).toBe(1);
    const notif = userNotifs.items[0];

    expect(notif.type).toBe("support_ticket_replied");
    expect(notif.title).toBe("پاسخ جدید از پشتیبانی");
    expect(notif.message).toContain(ticket.title);
    expect(notif.action?.url).toBe(`/account/support?tab=my_requests&ticketId=${ticket.id}`);
    expect(notif.isRead).toBe(false);

    // Initial multichannel statuses in metadata
    const channels = (notif.metadata as any)?.channels;
    expect(channels?.in_site?.status).toBe("sent");
    expect(channels?.email?.status).toBe("pending");
    expect(channels?.sms?.status).toBe("skipped");

    // Notification is NOT created for the admin
    const adminNotifs = await notificationService.listForUser(adminActor.userId);
    expect(adminNotifs.total).toBe(0);
  });

  it("2. پاسخ کاربر باعث ارسال ایمیل پشتیبانی نشود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "payment",
      title: "پیگیری فاکتور خرید",
      description: "فاکتور خرید دوره ارسال نشده است.",
    });

    // User adds message to ticket
    await supportService.sendUserMessage(normalUser, ticket.id, {
      body: "شماره تراکنش را هم ضمیمه کردم.",
    });

    // Ensure no support notifications were enqueued
    expect(notificationQueue.getEnqueuedJobs()).toHaveLength(0);

    // Ensure no notification was created for user
    const userNotifs = await notificationService.listForUser(normalUser.userId);
    expect(userNotifs.total).toBe(0);

    // Ensure no emails were sent
    expect(emailService.sentTicketReplyEmails).toHaveLength(0);
  });

  it("3. پاسخ سیستمی (یادداشت داخلی) باعث ارسال اعلان نشود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "technical",
      title: "خطا در پلیر ویدیو",
      description: "پلیر در مرورگر فایرفاکس لود نمی‌شود.",
    });

    // Admin creates an internal note
    await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "یادداشت فنی: مشکل از کدک h.264 روی فایرفاکس لینوکس است.",
      isInternalNote: true,
    });

    // Should not enqueue notification or create in-app notification
    expect(notificationQueue.getEnqueuedJobs()).toHaveLength(0);
    const userNotifs = await notificationService.listForUser(normalUser.userId);
    expect(userNotifs.total).toBe(0);
    expect(emailService.sentTicketReplyEmails).toHaveLength(0);
  });

  it("4. ارسال موفق Resend ثبت شود و متادیتا به‌روز شود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "courses",
      title: "تیکت تست ایمیل",
      description: "توضیحات تیکت برای بررسی ایمیل.",
    });

    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ رسمی پشتیبانی برای ارسال ایمیل.",
    });

    expect(notificationQueue.getEnqueuedJobs()).toHaveLength(1);

    // Process the queued job
    await notificationQueue.processAll();

    expect(emailService.sentTicketReplyEmails).toHaveLength(1);
    const sentEmail = emailService.sentTicketReplyEmails[0];
    expect(sentEmail.email).toBe("student@aavana.ir");
    expect(sentEmail.ticketId).toBe(ticket.id);
    expect(sentEmail.ticketTitle).toBe(ticket.title);

    // Verify metadata updated to sent
    const notif = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    expect(notif).not.toBeNull();
    const channels = (notif?.metadata as any)?.channels;
    expect(channels?.email?.status).toBe("sent");
    expect(channels?.email?.sentAt).toBeDefined();
    expect(channels?.email?.recipient).toBe("st***t@aavana.ir"); // Safe masked
  });

  it("5. خطای Resend باعث حذف یا شکست پاسخ تیکت نشود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "courses",
      title: "تیکت با خطای ایمیل",
      description: "توضیحات تیکت تست خطا.",
    });

    // Mock emailService throwing an error
    emailService.sendTicketReplyEmail = vi.fn().mockRejectedValue(new Error("Resend API rate limited"));

    // Admin sendAdminMessage should NOT throw even if queue throws or fails
    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ به کاربر در صورت خرابی سرویس ایمیل.",
    });

    // The message is safely saved
    expect(reply.id).toBeDefined();
    const ticketDetails = await supportService.getTicketDetails(normalUser, ticket.id);
    expect(ticketDetails.messages?.some((m) => m.id === reply.id)).toBe(true);

    // Now process the job - should record failure in metadata without crashing
    await notificationQueue.processAll();

    const notif = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const channels = (notif?.metadata as any)?.channels;
    expect(channels?.email?.status).toBe("failed");
    expect(channels?.email?.lastError).toContain("Resend API rate limited");
  });

  it("6. Retry باعث ارسال چندباره ناخواسته نشود (Idempotency)", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "technical",
      title: "تست Idempotency",
      description: "توضیحات تست ارسال مکرر.",
    });

    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ تیکت برای راستی‌آزمایی Idempotency.",
    });

    // First successful processing
    await notificationQueue.processAll();
    expect(emailService.sentTicketReplyEmails).toHaveLength(1);

    // Attempt second execution of the exact same job (simulate duplicate delivery / retry)
    const jobPayload = notificationQueue.getEnqueuedJobs()[0];
    await processSupportNotificationJob(jobPayload, {
      emailService,
      notificationStore,
      userStore,
      appUrl: "https://aavana.ir",
    });

    // Strict invariant: email should NOT be sent a second time
    expect(emailService.sentTicketReplyEmails).toHaveLength(1);

    // In-site notification must remain exactly 1
    const userNotifs = await notificationService.listForUser(normalUser.userId);
    expect(userNotifs.total).toBe(1);
  });

  it("7. عدم وجود ایمیل معتبر باعث خطای کل فرایند نشود", async () => {
    // Create a user without email
    const noEmailUser: Actor = {
      userId: asUserId("33333333-3333-3333-3333-333333333333"),
      roles: ["student"],
    };
    userStore.insert({
      id: noEmailUser.userId,
      email: "" as any,
      phoneNumber: "+989333333333",
      name: "کاربر بدون ایمیل",
      role: "student",
      globalRole: null,
      emailVerified: false,
      phoneVerified: true,
      major: null,
    });

    const ticket = await supportService.createTicket(noEmailUser, {
      category: "other",
      title: "درخواست بدون ایمیل",
      description: "کاربر فقط با شماره تلفن ثبت نام کرده است.",
    });

    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ به کاربر بدون ایمیل.",
    });

    expect(reply.id).toBeDefined();

    // Process job
    await notificationQueue.processAll();

    // Email service was not called
    expect(emailService.sentTicketReplyEmails).toHaveLength(0);

    // Notification metadata records no_valid_email
    const notif = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const channels = (notif?.metadata as any)?.channels;
    expect(channels?.email?.status).toBe("failed");
    expect(channels?.email?.reason).toBe("no_valid_email");

    // In-site notification still exists
    expect(channels?.in_site?.status).toBe("sent");
  });

  it("8. کاربر با کلیک روی اعلان به تیکت صحیح هدایت شود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "account",
      title: "تغییر اطلاعات پروفایل",
      description: "می‌خواهم نام خانوادگی را اصلاح کنم.",
    });

    await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ پشتیبان برای اصلاح اطلاعات.",
    });

    const userNotifs = await notificationService.listForUser(normalUser.userId);
    const notif = userNotifs.items[0];

    // Notification action URL structure check
    expect(notif.action).toBeDefined();
    expect(notif.action?.type).toBe("navigate");
    expect(notif.action?.url).toBe(`/account/support?tab=my_requests&ticketId=${ticket.id}`);

    // Verify mark as read works
    const marked = await notificationService.markAsRead(notif.id, normalUser.userId);
    expect(marked?.isRead).toBe(true);
    expect(marked?.readAt).toBeDefined();
  });

  it("9. کاربران دیگر به اعلان یا لینک خصوصی تیکت دسترسی پیدا نکنند (IDOR Protection)", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "payment",
      title: "اطلاعات حساس بانکی",
      description: "شماره پیگیری واریز من محرمانه است.",
    });

    await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ حاوی اطلاعات حساب.",
    });

    // 1. Notification isolation: otherUser has 0 notifications
    const otherNotifs = await notificationService.listForUser(otherUser.userId);
    expect(otherNotifs.total).toBe(0);

    // 2. Direct IDOR protection: otherUser cannot access the ticket details
    await expect(
      supportService.getTicketDetails(otherUser, ticket.id),
    ).rejects.toThrow("شما اجازه مشاهده این تیکت را ندارید");

    // 3. otherUser cannot send message to user's ticket
    await expect(
      supportService.sendUserMessage(otherUser, ticket.id, {
        body: "حمله یا نفوذ به تیکت دیگران",
      }),
    ).rejects.toThrow("شما اجازه ارسال پیام در این تیکت را ندارید");
  });

  it("10. در صورت غیرفعال بودن پیامک، رفتار آن به درستی گزارش شود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "other",
      title: "بررسی وضعیت کانال پیامک",
      description: "کانال پیامک باید وضعیت skipped داشته باشد.",
    });

    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ بررسی پیامک.",
    });

    const notif = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const channels = (notif?.metadata as any)?.channels;

    expect(channels?.sms?.status).toBe("skipped");
    expect(channels?.sms?.reason).toBe("provider_otp_only");
  });

  it("11. ماسک کردن ایمیل برای لاگ‌های امن بدون افشای PII", () => {
    expect(maskEmailForLogs("support@aavana.ir")).toBe("su***t@aavana.ir");
    expect(maskEmailForLogs("ali@example.com")).toBe("al***i@example.com");
    expect(maskEmailForLogs("ab@domain.com")).toBe("a***@domain.com");
    expect(maskEmailForLogs("invalid")).toBe("***");
  });

  it("12. سناریوی قطعی Redis: ثبت پاسخ تیکت موفق می‌شود، وضعیت pending می‌ماند و پس از بازگشت Redis بازیابی می‌شود", async () => {
    // 1. Simulate Redis being completely down when admin replies
    const failingQueue = {
      enqueue: vi.fn().mockRejectedValue(new Error("ECONNREFUSED: Redis is unavailable")),
    };

    const resilientSupportService = new SupportService(
      supportStore,
      notificationService,
      undefined,
      failingQueue as any,
      userStore,
    );

    const ticket = await supportService.createTicket(normalUser, {
      category: "courses",
      title: "تیکت در زمان قطعی ردیس",
      description: "آیا در قطعی ردیس پاسخ من ذخیره می‌شود؟",
    });

    // 2. Admin sends reply - must succeed without throwing despite Redis failure
    const reply = await resilientSupportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ ثبت شد حتی با وجود قطعی ردیس.",
    });

    expect(reply.body).toBe("پاسخ ثبت شد حتی با وجود قطعی ردیس.");

    // 3. In-site notification is saved in DB with email status 'pending'
    const notif = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    expect(notif).not.toBeNull();
    const channels = (notif?.metadata as any)?.channels;
    expect(channels?.in_site?.status).toBe("sent");
    expect(channels?.email?.status).toBe("pending");

    // 4. Redis comes back online!
    const recoveredQueue = new InMemorySupportNotificationQueue(
      {
        emailService,
        notificationStore,
        userStore,
        appUrl: "https://aavana.ir",
      },
      { autoProcess: false },
    );

    // 5. Reconciliation scanner runs and enqueues the pending notification
    const recoveredCount = await reconcilePendingSupportNotifications(
      notificationStore,
      recoveredQueue,
      supportStore,
    );

    expect(recoveredCount).toBe(1);
    expect(recoveredQueue.getEnqueuedJobs()).toHaveLength(1);
    expect(recoveredQueue.getEnqueuedJobs()[0]?.messageId).toBe(reply.id);

    // 6. Process the recovered job
    await recoveredQueue.processAll();

    // 7. Verify email was sent and DB status updated to 'sent'
    expect(emailService.sentTicketReplyEmails).toHaveLength(1);
    const updatedNotif = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const updatedChannels = (updatedNotif?.metadata as any)?.channels;
    expect(updatedChannels?.email?.status).toBe("sent");

    // 8. Re-running sweep afterwards should find 0 pending notifications
    const secondSweep = await reconcilePendingSupportNotifications(
      notificationStore,
      recoveredQueue,
      supportStore,
    );
    expect(secondSweep).toBe(0);
  });

  it("13. استقلال کانال‌ها: شکست در ارسال ایمیل نباید وضعیت اعلان داخل سایت را تغییر دهد یا ریست کند", async () => {
    const errorEmailService: MockEmailService = {
      ...new MockEmailService(),
      sendTicketReplyEmail: vi.fn().mockRejectedValue(new Error("SMTP 503 Provider Unavailable")),
    } as any;

    const ticket = await supportService.createTicket(normalUser, {
      category: "payment",
      title: "آزمون استقلال کانال‌ها",
      description: "بررسی عدم تاثیر خطای ایمیل روی اعلان سایت",
    });

    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پاسخ برای بررسی اعلان سایت.",
    });

    const notifBefore = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const originalInSiteSentAt = (notifBefore?.metadata as any)?.channels?.in_site?.sentAt;
    expect(originalInSiteSentAt).toBeDefined();

    // Run processor with failing email service
    await expect(
      processSupportNotificationJob(
        {
          ticketId: ticket.id,
          messageId: reply.id,
          userId: normalUser.userId,
          ticketTitle: ticket.title,
          userEmail: "student@aavana.ir",
        },
        {
          emailService: errorEmailService,
          notificationStore,
          userStore,
        },
      ),
    ).rejects.toThrow("SMTP 503 Provider Unavailable");

    // Check notification after email failure
    const notifAfter = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const channelsAfter = (notifAfter?.metadata as any)?.channels;

    // in_site MUST remain 'sent' with its original timestamp preserved
    expect(channelsAfter?.in_site?.status).toBe("sent");
    expect(channelsAfter?.in_site?.sentAt).toBe(originalInSiteSentAt);

    // email is marked failed
    expect(channelsAfter?.email?.status).toBe("failed");
    expect(channelsAfter?.email?.lastError).toContain("SMTP 503");

    // sms remains skipped
    expect(channelsAfter?.sms?.status).toBe("skipped");
  });

  it("14. سناریوی Crash & Recovery: در صورت اجرای مجدد Worker پس از موفقیت قبلی، ایمیل مجدد ارسال نمی‌شود", async () => {
    const ticket = await supportService.createTicket(normalUser, {
      category: "courses",
      title: "تست Idempotency در بازیابی Crash",
      description: "اگر وورکر بعد از ارسال کرش کند...",
    });

    const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
      body: "پیام اولیه.",
    });

    // First execution succeeds
    await notificationQueue.processAll();
    expect(emailService.sentTicketReplyEmails).toHaveLength(1);

    // Second execution (simulating BullMQ stall recovery or worker restart)
    const loggerMock = vi.fn();
    await processSupportNotificationJob(
      {
        ticketId: ticket.id,
        messageId: reply.id,
        userId: normalUser.userId,
        ticketTitle: ticket.title,
        userEmail: "student@aavana.ir",
      },
      {
        emailService,
        notificationStore,
        userStore,
        logger: loggerMock,
      },
    );

    // Email count must remain 1 (no duplicate sent)
    expect(emailService.sentTicketReplyEmails).toHaveLength(1);
    expect(loggerMock).toHaveBeenCalledWith(
      expect.stringContaining("Email already sent for ticket_reply:"),
    );
  });
});
