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
import {
  InMemoryOnboardingTourStore,
  OnboardingTourService,
} from "../modules/identity/index.js";

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

describe("Onboarding Tour API — Comprehensive Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;
  let smsProvider: MockSmsProvider;
  let onboardingTourStore: InMemoryOnboardingTourStore;
  let onboardingTourService: OnboardingTourService;
  let app: Awaited<ReturnType<typeof createApp>>;

  const activationCutoff = "2026-10-25T00:00:00.000Z";

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
    smsProvider = new MockSmsProvider();
    onboardingTourStore = new InMemoryOnboardingTourStore();

    onboardingTourService = new OnboardingTourService({
      store: onboardingTourStore,
      userStore,
      featureActivationTimestamp: activationCutoff,
    });

    app = createApp({ config });
    const identityOpts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService,
      smsProvider,
      onboardingTourStore,
      onboardingTourService,
    };
    await app.register(registerIdentityModule, identityOpts);
    await app.ready();
  });

  async function registerAndLogin(email: string, createdAt?: string) {
    const registerRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "دانش‌آموز",
        lastName: "تست",
        email,
        phoneNumber: "0912" + Math.floor(1000000 + Math.random() * 9000000),
        password: "SecurePassword123!",
      },
    });

    expect(registerRes.statusCode).toBe(200);
    const sessionToken = extractSessionToken(registerRes);
    expect(sessionToken).toBeDefined();

    if (createdAt) {
      const user = await userStore.findByEmail(email);
      if (user) {
        const rawUser = (userStore as unknown as { users: Map<string, { createdAt?: string }> }).users.get(user.id);
        if (rawUser) {
          rawUser.createdAt = createdAt;
        }
      }
    }

    return { sessionToken: sessionToken! };
  }

  it("returns 401 unauthorized when request has no session token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/onboarding/tour",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns eligible: true and status: 'unseen' for new users registered after activation cutoff", async () => {
    const { sessionToken } = await registerAndLogin(
      "new-user@example.com",
      "2026-10-25T10:00:00.000Z",
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/onboarding/tour",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eligible).toBe(true);
    expect(body.status).toBe("unseen");
    expect(body.step).toBe(1);
  });

  it("returns eligible: false and status: 'completed' for legacy users registered before activation cutoff", async () => {
    const { sessionToken } = await registerAndLogin(
      "legacy-user@example.com",
      "2026-10-20T00:00:00.000Z", // Before cutoff
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/onboarding/tour",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eligible).toBe(false);
    expect(body.status).toBe("completed");
  });

  it("updates status to 'skipped' when user dismisses the tour", async () => {
    const { sessionToken } = await registerAndLogin(
      "skip-user@example.com",
      "2026-10-25T10:00:00.000Z",
    );

    const skipRes = await app.inject({
      method: "POST",
      url: "/v1/onboarding/tour",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
      payload: { action: "skip", step: 1 },
    });

    expect(skipRes.statusCode).toBe(200);
    const skipBody = skipRes.json();
    expect(skipBody.success).toBe(true);
    expect(skipBody.status).toBe("skipped");

    // Subsequent GET should reflect skipped status and ineligible
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/onboarding/tour",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.eligible).toBe(false);
    expect(getBody.status).toBe("skipped");
  });

  it("updates status to 'completed' when user finishes the tour", async () => {
    const { sessionToken } = await registerAndLogin(
      "complete-user@example.com",
      "2026-10-25T10:00:00.000Z",
    );

    const completeRes = await app.inject({
      method: "POST",
      url: "/v1/onboarding/tour",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
      payload: { action: "complete", step: 3 },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeBody = completeRes.json();
    expect(completeBody.success).toBe(true);
    expect(completeBody.status).toBe("completed");

    // Subsequent GET should reflect completed status and ineligible
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/onboarding/tour",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.eligible).toBe(false);
    expect(getBody.status).toBe("completed");
  });
});
