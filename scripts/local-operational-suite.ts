import fs from "node:fs";
import { execSync } from "node:child_process";
import { createDbClient } from "/Users/ops/Desktop/avana-landing-and-onboarding/database/client.js";
import {
  DrizzleUserStore,
  ResendEmailService,
} from "/Users/ops/Desktop/avana-landing-and-onboarding/apps/api/src/modules/identity/index.js";
import {
  DrizzleSupportStore,
  SupportService,
  BullMqSupportNotificationQueue,
  createSupportNotificationWorker,
  reconcilePendingSupportNotifications,
  processSupportNotificationJob,
} from "/Users/ops/Desktop/avana-landing-and-onboarding/apps/api/src/modules/support/index.js";
import {
  DrizzleNotificationStore,
  NotificationService,
} from "/Users/ops/Desktop/avana-landing-and-onboarding/apps/api/src/modules/notifications/index.js";
import { asUserId, type Actor, type UserId } from "@avana/domain";

// Parse .env
const dotenv = fs.readFileSync("/Users/ops/Desktop/avana-landing-and-onboarding/.env", "utf8");
function getEnv(key: string): string | undefined {
  const match = dotenv.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^"|"$/g, "") : undefined;
}

const dbUrl = getEnv("DATABASE_URL")!;
const redisUrl = getEnv("REDIS_URL") || "redis://127.0.0.1:6379";
const resendApiKey = getEnv("RESEND_API_KEY")!;
const emailFrom = getEnv("EMAIL_FROM") || "AVANA <support@aavana.ir>";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLocalOperationalSuite() {
  console.log("=================================================================");
  console.log("🚀 STARTING LOCAL OPERATIONAL TEST SUITE FOR AVANA SUPPORT FLOW");
  console.log("=================================================================\n");

  // 1. Environment & Connectivity Audit
  console.log("--- 1. AUDIT LOCAL ENVIRONMENT ---");
  console.log("• PostgreSQL DB URL configured:", !!dbUrl);
  console.log("• Redis URL configured:", redisUrl);
  console.log("• Resend API Key configured:", !!resendApiKey);
  console.log("• EMAIL_FROM configured:", emailFrom);

  const { db, close: closeDb } = createDbClient(dbUrl);
  const userStore = new DrizzleUserStore(db);
  const supportStore = new DrizzleSupportStore(db);
  const notificationStore = new DrizzleNotificationStore(db);
  const notificationService = new NotificationService(notificationStore);

  // Setup real Resend email service with live support@aavana.ir sender
  const emailService = new ResendEmailService(
    resendApiKey,
    emailFrom,
    globalThis.fetch,
    "https://aavana.ir",
  );

  // Setup test actors
  // Use delivered@resend.dev as email to safely verify live delivery without spamming real people
  const testStudentEmail = "delivered@resend.dev";
  let studentUser = await userStore.findByEmail(testStudentEmail);
  if (!studentUser) {
    console.log("Creating test student user in PostgreSQL...");
    studentUser = await userStore.createUserWithPassword({
      email: testStudentEmail,
      passwordHash: "test_hash_123",
      name: "کاربر آزمایشی عملیاتی",
    });
  }
  console.log(`• Test Student User ID: ${studentUser.id} (${studentUser.email})`);

  const studentActor: Actor = {
    userId: studentUser.id as UserId,
    roles: ["student"],
  };

  const adminActor: Actor = {
    userId: asUserId("56e291c8-3e5f-4bec-a13c-d38026da7eb8"),
    role: "platform_admin",
    globalRole: "platform_admin",
    roles: ["platform_admin"],
  };

  // 2. Start BullMQ Queue and Worker connected to local Redis
  console.log("\n--- 2. INITIALIZING BULLMQ QUEUE & WORKER WITH REAL REDIS ---");
  const queueName = `test_support_notifications_${Date.now()}`;
  const supportQueue = new BullMqSupportNotificationQueue({
    connection: { url: redisUrl },
    queueName,
  });

  const workerLogs: string[] = [];
  const worker = createSupportNotificationWorker(
    { url: redisUrl },
    queueName,
    {
      emailService,
      notificationStore,
      userStore,
      appUrl: "https://aavana.ir",
      logger: (msg) => {
        workerLogs.push(msg);
      },
    },
  );
  worker.on("ready", () => console.log("  [Worker]: Worker ready"));
  worker.on("active", (job) => console.log(`  [Worker]: Job active: ${job.id}`));
  worker.on("completed", (job) => console.log(`  [Worker]: Job completed: ${job.id}`));
  worker.on("failed", (job, err) => console.log(`  [Worker]: Job failed: ${job?.id} - ${err?.message}`));
  worker.on("error", (err) => console.log(`  [Worker]: Worker error: ${err?.message}`));

  await worker.waitUntilReady();

  const supportService = new SupportService(
    supportStore,
    notificationService,
    undefined,
    supportQueue,
    userStore,
  );
  console.log("• BullMQ Queue & Worker initialized and ready.");

  // 3. Test End-to-End: Ticket Creation -> Admin Reply -> Real In-Site & Email Notification
  console.log("\n--- 3. END-TO-END FLOW: TICKET CREATION & ADMIN REPLY ---");
  const ticket = await supportService.createTicket(studentActor, {
    category: "courses",
    title: `تست زنده عملیاتی محلی - ${new Date().toLocaleTimeString("fa-IR")}`,
    description: "این تیکت برای راستی‌آزمایی ارسال زنده نوتیفیکیشن و ایمیل ایجاد شده است.",
  });
  console.log(`• Ticket created: ID=${ticket.id}, Title="${ticket.title}"`);

  console.log("• Admin sending reply...");
  const reply = await supportService.sendAdminMessage(adminActor, ticket.id, {
    body: "سلام، پاسخ تست زنده از تیم پشتیبانی آوانا جهت تست عملیاتی تحویل شد.",
  });
  console.log(`• Admin reply sent: ID=${reply.id}`);

  // Check In-Site Notification immediately
  const notifBefore = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
  if (!notifBefore) {
    throw new Error("FAIL: In-site notification was not created in PostgreSQL!");
  }
  console.log("• In-site notification found in PostgreSQL!");
  console.log(`  - Title: "${notifBefore.title}"`);
  console.log(`  - Action URL: "${notifBefore.actionUrl}"`);
  console.log(`  - Channels Status:`, JSON.stringify((notifBefore.metadata as any)?.channels));

  // Wait for Worker to process job from Redis BullMQ
  console.log("• Waiting for BullMQ worker to process job via real Redis & Resend...");
  let emailSent = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const notifAfter = await notificationStore.findByIdempotencyKey(`ticket_reply:${reply.id}`);
    const channels = (notifAfter?.metadata as any)?.channels;
    if (channels?.email?.status === "sent") {
      emailSent = true;
      console.log(`• SUCCESS: Email status updated to 'sent' in PostgreSQL! (after ${(i + 1) * 500}ms)`);
      console.log(`  - Sent At: ${channels.email.sentAt}`);
      console.log(`  - Recipient: ${channels.email.recipient}`);
      break;
    }
    if (channels?.email?.status === "failed") {
      throw new Error(`FAIL: Email failed with error: ${channels.email.lastError}`);
    }
  }

  if (!emailSent) {
    throw new Error("FAIL: Timeout waiting for BullMQ worker to process email job!");
  }

  // 4. Modal Deep-Link & IDOR Check
  console.log("\n--- 4. MODAL DEEP-LINK & IDOR ACCESS CONTROL CHECK ---");
  const ticketIdFromUrl = new URL(notifBefore.actionUrl!, "https://aavana.ir").searchParams.get("ticketId");
  console.log(`• Extracted ticketId from notification actionUrl: ${ticketIdFromUrl}`);
  if (ticketIdFromUrl !== ticket.id) {
    throw new Error(`FAIL: actionUrl ticketId (${ticketIdFromUrl}) does not match ticket.id (${ticket.id})`);
  }

  // Student can view own ticket
  const studentView = await supportService.getTicketDetails(studentActor, ticket.id);
  console.log(`• Student successfully fetched ticket details. Messages count: ${studentView.messages.length}`);

  // Unauthorized actor gets 403 Forbidden
  const otherActor: Actor = {
    userId: asUserId("00000000-0000-0000-0000-000000000000"),
    roles: ["student"],
  };
  let idorBlocked = false;
  try {
    await supportService.getTicketDetails(otherActor, ticket.id);
  } catch (err: any) {
    idorBlocked = true;
    console.log(`• IDOR Protection verified: Non-owner access blocked (${err.message})`);
  }
  if (!idorBlocked) {
    throw new Error("FAIL: Non-owner was able to access ticket!");
  }

  // 5. Test Deduplication / Idempotency
  console.log("\n--- 5. DEDUPLICATION & IDEMPOTENCY CHECK ---");
  console.log("• Reprocessing the exact same job payload to test duplicate suppression...");
  const skipLogCountBefore = workerLogs.filter((l) => l.includes("skipping duplicate")).length;
  await processSupportNotificationJob(
    {
      ticketId: ticket.id,
      messageId: reply.id,
      userId: studentUser.id,
      ticketTitle: ticket.title,
      userEmail: studentUser.email,
    },
    {
      emailService,
      notificationStore,
      userStore,
      logger: (msg) => {
        workerLogs.push(msg);
        console.log(`  [Worker Log]: ${msg}`);
      },
    },
  );
  const skipLogCountAfter = workerLogs.filter((l) => l.includes("skipping duplicate")).length;
  if (skipLogCountAfter <= skipLogCountBefore) {
    throw new Error("FAIL: Worker did not skip already-sent email job!");
  }
  console.log("• SUCCESS: Worker identified existing 'sent' status and skipped duplicate dispatch.");

  // 6. Test Redis Outage and Recovery
  console.log("\n--- 6. LIVE REDIS OUTAGE & RECONCILIATION RECOVERY TEST ---");
  console.log("• Creating a second ticket for the outage test...");
  const outageTicket = await supportService.createTicket(studentActor, {
    category: "payment",
    title: `تست قطعی ردیس - ${new Date().toLocaleTimeString("fa-IR")}`,
    description: "تیکت جهت تست رفتار سیستم در زمان عدم دسترسی به ردیس.",
  });

  // Temporarily stop Redis via brew
  console.log("• Stopping Redis service locally (brew services stop redis)...");
  execSync("brew services stop redis", { stdio: "inherit" });
  await sleep(1500);

  let outageReply: any;
  try {
    console.log("• Admin sending reply while Redis is DOWN (testing bounded timeout)...");
    const startTime = Date.now();
    outageReply = await supportService.sendAdminMessage(adminActor, outageTicket.id, {
      body: "این پاسخ در زمان قطعی ردیس ثبت شد.",
    });
    const elapsedMs = Date.now() - startTime;
    console.log(`• Reply recorded successfully during outage in ${elapsedMs}ms: ID=${outageReply.id}`);
    if (elapsedMs > 5000) {
      throw new Error(`FAIL: sendAdminMessage took too long during outage (${elapsedMs}ms)! Bounded timeout failed.`);
    }

    // Verify in PostgreSQL immediately
    const outageNotif = await notificationStore.findByIdempotencyKey(`ticket_reply:${outageReply.id}`);
    if (!outageNotif) {
      throw new Error("FAIL: Notification was not saved in PostgreSQL during Redis outage!");
    }
    const outageChannels = (outageNotif.metadata as any)?.channels;
    console.log("• PostgreSQL notification status during outage:", JSON.stringify(outageChannels));
    if (outageChannels?.email?.status !== "pending") {
      throw new Error(`FAIL: Expected email status 'pending', got '${outageChannels?.email?.status}'`);
    }
  } finally {
    // ALWAYS restart Redis immediately after the outage test
    console.log("• Ensuring Redis service is started locally (brew services start redis)...");
    try {
      execSync("brew services start redis", { stdio: "inherit" });
    } catch (e: any) {
      console.warn("Notice starting redis:", e?.message);
    }
  }

  await sleep(2500);

  // Verify Redis is responding
  console.log("• Checking Redis availability after restart...");
  let redisReady = false;
  for (let r = 0; r < 10; r++) {
    try {
      const net = await import("net");
      const pong = await new Promise((res, rej) => {
        const s = net.createConnection({ port: 6379, host: "127.0.0.1" }, () => s.write("*1\r\n$4\r\nPING\r\n"));
        s.on("data", (d) => { res(d.toString()); s.end(); });
        s.on("error", rej);
      });
      if (typeof pong === "string" && pong.includes("PONG")) {
        redisReady = true;
        break;
      }
    } catch {
      await sleep(500);
    }
  }
  if (!redisReady) {
    throw new Error("FAIL: Redis did not recover after start!");
  }
  console.log("• Redis is back ONLINE (+PONG)!");

  // Create recovery queue on the recovered Redis
  const recoveryQueue = new BullMqSupportNotificationQueue({
    connection: { url: redisUrl },
    queueName,
  });

  console.log("• Executing reconcilePendingSupportNotifications()...");
  const reconciledCount = await reconcilePendingSupportNotifications(
    notificationStore,
    recoveryQueue,
    supportStore,
    (msg) => console.log(`  [Reconcile Log]: ${msg}`),
  );
  console.log(`• Reconciled count: ${reconciledCount}`);
  if (reconciledCount < 1) {
    throw new Error("FAIL: Reconcile scanner did not find the pending notification from Postgres!");
  }

  // Wait for worker to process the reconciled job
  console.log("• Waiting for worker to process reconciled job...");
  let outageEmailSent = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const updatedOutageNotif = await notificationStore.findByIdempotencyKey(`ticket_reply:${outageReply.id}`);
    const ch = (updatedOutageNotif?.metadata as any)?.channels;
    if (ch?.email?.status === "sent") {
      outageEmailSent = true;
      console.log(`• SUCCESS: Reconciled email processed and updated to 'sent' in PostgreSQL! (after ${(i + 1) * 500}ms)`);
      break;
    }
  }

  if (!outageEmailSent) {
    throw new Error("FAIL: Timeout waiting for reconciled email to be marked 'sent'!");
  }

  // Teardown
  console.log("\n--- 7. CLEANUP & TEARDOWN ---");
  await worker.close();
  await supportQueue.close();
  await recoveryQueue.close();
  await closeDb();

  console.log("\n=================================================================");
  console.log("✅ ALL LOCAL OPERATIONAL TESTS PASSED WITH 100% SUCCESS!");
  console.log("=================================================================\n");
}

runLocalOperationalSuite().catch((err) => {
  console.error("\n❌ SUITE EXECUTION FAILED:", err);
  // Ensure Redis is never left stopped on unhandled error
  try {
    execSync("brew services start redis", { stdio: "ignore" });
  } catch {}
  process.exit(1);
});
