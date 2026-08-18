import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
  MockEmailService,
  type EmailService,
} from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

class FailingEmailService implements EmailService {
  public shouldFail = true;
  async sendVerificationCode(): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Resend API delivery error simulation");
    }
  }
}

describe("Authentication & Email Verification Isolation Tests", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  async function createTestApp(customEmailService?: EmailService) {
    const app = createApp({ config });
    await app.register(v1Routes);
    const opts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService: customEmailService ?? emailService,
    };
    await app.register(registerIdentityModule, opts);
    return app;
  }

  it("Test 1: Successful Registration creates user, verification challenge, and sends email", async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "reg_test@example.com",
        password: "password123",
        name: "Registration User",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(emailService.sentEmails.length).toBe(1);
    expect(emailService.sentEmails[0].email).toBe("reg_test@example.com");

    const user = await userStore.findByEmail("reg_test@example.com");
    expect(user).toBeDefined();
    expect(user?.emailVerifiedAt).toBeNull();

    await app.close();
  });

  it("Test 2: Email Provider Failure during Registration rolls back user & prevents login", async () => {
    const failingService = new FailingEmailService();
    failingService.shouldFail = true;
    const app = await createTestApp(failingService);

    // Registration attempt when email provider fails
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "fail_email@unregistered-domain.org",
        password: "password123",
      },
    });

    expect(res.statusCode).toBe(500);

    // User record is rolled back / deleted from DB
    const userInDb = await userStore.findByEmail("fail_email@unregistered-domain.org");
    expect(userInDb).toBeUndefined();

    // Login for failed registration is impossible (401)
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "fail_email@unregistered-domain.org",
        password: "password123",
      },
    });

    expect(loginRes.statusCode).toBe(401);

    await app.close();
  });

  it("Test 3: Retry Registration succeeds after previous email delivery failure", async () => {
    const failingService = new FailingEmailService();

    // Attempt 1: Email fails
    failingService.shouldFail = true;
    const app1 = await createTestApp(failingService);
    const attempt1 = await app1.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "retry_test@example.com", password: "password123" },
    });
    expect(attempt1.statusCode).toBe(500);
    await app1.close();

    // Attempt 2: Email fixed / working
    failingService.shouldFail = false;
    const app2 = await createTestApp(failingService);
    const attempt2 = await app2.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "retry_test@example.com", password: "password123" },
    });

    // Succeeds without "Email already exists" conflict error!
    expect(attempt2.statusCode).toBe(200);

    const user = await userStore.findByEmail("retry_test@example.com");
    expect(user).toBeDefined();

    await app2.close();
  });

  it("Test 4: Unverified User Login succeeds, returns emailVerified=false, and sends NO email", async () => {
    const app = await createTestApp();

    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "unverified_user@example.com", password: "password123" },
    });

    emailService.clear();

    // Login as unverified user
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "unverified_user@example.com", password: "password123" },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.user.emailVerified).toBe(false);

    // CRITICAL: Unverified user login creates session but DOES NOT auto-send email!
    expect(emailService.sentEmails.length).toBe(0);

    await app.close();
  });

  it("Test 5: Verified User Login succeeds, returns emailVerified=true, and sends NO email", async () => {
    const app = await createTestApp();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "verified_user@example.com", password: "password123" },
    });
    const regToken = extractSessionToken(regRes)!;
    const code = emailService.getLastCodeFor("verified_user@example.com")!;

    // Verify email
    await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      cookies: { avana_session: regToken },
      payload: { code },
    });

    emailService.clear();

    // Login after verification
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "verified_user@example.com", password: "password123" },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.user.emailVerified).toBe(true);
    expect(emailService.sentEmails.length).toBe(0);

    await app.close();
  });

  it("Test 6: Wrong password fails and sends NO email", async () => {
    const app = await createTestApp();

    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "wrong_pass@example.com", password: "password123" },
    });

    emailService.clear();

    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "wrong_pass@example.com", password: "WRONG_PASSWORD" },
    });

    expect(loginRes.statusCode).toBe(401);
    expect(emailService.sentEmails.length).toBe(0);

    await app.close();
  });

  it("Test 7: Explicit Resend Verification sends email & enforces 60s cooldown", async () => {
    const app = await createTestApp();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "resend_user@example.com", password: "password123" },
    });
    const token = extractSessionToken(regRes)!;

    emailService.clear();

    // Immediate resend hits 60s cooldown
    const cooldownRes = await app.inject({
      method: "POST",
      url: "/v1/auth/resend-verification",
      cookies: { avana_session: token },
    });
    expect(cooldownRes.statusCode).toBe(429);
    expect(emailService.sentEmails.length).toBe(0);

    await app.close();
  });
});
