/**
 * Real Rate Limiting Integration Test Suite.
 *
 * Verifies that sending multiple consecutive failed sign-in requests
 * for a specific email address triggers HTTP 429 Too Many Requests.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { registerIdentityModule } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";

function makeTestConfig() {
  process.env.NODE_ENV = "production";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Rate Limiting Real Integration Verification", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
  });

  it("enforces rate limit of 10 attempts per minute on login for a target email and returns HTTP 429", async () => {
    const app = createApp({ config });
    await app.register(v1Routes);
    await app.register(registerIdentityModule, { config, sessionStore, userStore });

    const targetEmail = "bruteforce_target@example.com";

    // Register target user first
    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: targetEmail, password: "correctpassword123" },
    });

    let lastStatus = 200;
    let tooManyRequestsTriggered = false;

    // Send 15 consecutive login requests with wrong password
    for (let i = 1; i <= 15; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: targetEmail, password: `wrongpassword_${i}` },
      });
      lastStatus = res.statusCode;

      if (res.statusCode === 429) {
        tooManyRequestsTriggered = true;
        const body = JSON.parse(res.body);
        expect(body.error.code).toBe("too_many_requests");
        expect(body.error.message).toContain("تعداد درخواست‌های بیش از حد مجاز");
        break;
      }
    }

    expect(tooManyRequestsTriggered).toBe(true);
    expect(lastStatus).toBe(429);

    await app.close();
  });
});
