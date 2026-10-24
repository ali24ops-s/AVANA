import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
  MockEmailService,
  MockSmsProvider,
} from "../modules/identity/index.js";
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
import { hashPassword } from "../modules/identity/password-hasher.js";
import { asUserId } from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  const cfg = loadApiConfig();
  cfg.logging.level = "silent";
  return cfg;
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Auth Sign-In Notifications Behavior", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;
  let smsProvider: MockSmsProvider;
  let orgStore: InMemoryOrganizationStore;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
    smsProvider = new MockSmsProvider();
    orgStore = new InMemoryOrganizationStore();
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);
  });

  async function createTestApp() {
    const app = createApp({ config });
    const opts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService,
      smsProvider,
      organizationStore: orgStore,
      notificationService,
    };
    await app.register(registerIdentityModule, opts);
    return app;
  }

  it("does NOT dispatch login notification on successful email/password sign-in", async () => {
    const app = await createTestApp();

    const password = "Password123!";
    const passwordHash = await hashPassword(password);
    const user = await userStore.createUserWithPassword({
      email: "test.student@example.com",
      passwordHash,
      name: "کاربر تستی",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "test.student@example.com",
        password,
      },
    });

    expect(res.statusCode).toBe(200);
    const sessionToken = extractSessionToken(res);
    expect(sessionToken).toBeDefined();

    // Verify notifications for user — no login_success notification created
    const userNotifs = await notificationService.listForUser(asUserId(user.id));
    expect(userNotifs.total).toBe(0);
    expect(userNotifs.items.some((n) => n.type === "login_success")).toBe(false);

    await app.close();
  });

  it("does NOT dispatch login notification on successful phone OTP sign-in", async () => {
    const app = await createTestApp();

    // Register user with verified phone
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "علی",
        lastName: "محمدی",
        email: "test_phone_user@example.com",
        phoneNumber: "09121110099",
        password: "Password123!",
      },
    });
    expect(regRes.statusCode).toBe(200);
    const sessionToken = extractSessionToken(regRes)!;
    const user = JSON.parse(regRes.body).user;

    // Verify phone channel
    await app.inject({
      method: "POST",
      url: "/v1/auth/verification/send",
      cookies: { avana_session: sessionToken },
      payload: { channel: "phone" },
    });
    const phoneCode = smsProvider.getLastCodeFor("+989121110099")!;
    await app.inject({
      method: "POST",
      url: "/v1/auth/verification/verify",
      cookies: { avana_session: sessionToken },
      payload: { channel: "phone", code: phoneCode },
    });

    // Request phone login OTP
    const sendOtpRes = await app.inject({
      method: "POST",
      url: "/v1/auth/phone/send-otp",
      payload: { phoneNumber: "09121110099" },
    });
    expect(sendOtpRes.statusCode).toBe(200);
    const loginOtp = smsProvider.getLastCodeFor("+989121110099")!;

    // Verify phone login OTP
    const loginVerifyRes = await app.inject({
      method: "POST",
      url: "/v1/auth/phone/verify-otp",
      payload: { phoneNumber: "09121110099", code: loginOtp },
    });
    expect(loginVerifyRes.statusCode).toBe(200);
    expect(extractSessionToken(loginVerifyRes)).toBeDefined();

    // Check notifications — must not have login_success
    const userNotifs = await notificationService.listForUser(asUserId(user.id));
    expect(userNotifs.items.some((n) => n.type === "login_success")).toBe(false);

    await app.close();
  });

  it("still returns 401 error message on wrong password and dispatches no notification", async () => {
    const app = await createTestApp();

    const passwordHash = await hashPassword("CorrectPassword123!");
    const user = await userStore.createUserWithPassword({
      email: "test.wrong@example.com",
      passwordHash,
      name: "کاربر آزمون خطا",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "test.wrong@example.com",
        password: "WrongPassword!",
      },
    });

    expect(res.statusCode).toBe(401);
    const json = res.json();
    expect(json.error.message).toBe("ایمیل یا رمز عبور نادرست است.");

    const userNotifs = await notificationService.listForUser(asUserId(user.id));
    expect(userNotifs.total).toBe(0);

    await app.close();
  });

  it("still dispatches registration notification on sign-up", async () => {
    const app = await createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "سارا",
        lastName: "احمدی",
        phoneNumber: "09123334455",
        email: "newuser@example.com",
        password: "NewUserPassword123!",
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    const userId = json.user.id;

    // Registration notification should still exist
    const userNotifs = await notificationService.listForUser(asUserId(userId));
    expect(userNotifs.total).toBe(1);
    expect(userNotifs.items[0]!.type).toBe("registration_success");
    expect(userNotifs.items[0]!.title).toBe("به آوانا خوش آمدید");

    await app.close();
  });
});
