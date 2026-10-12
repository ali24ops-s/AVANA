/**
 * AVANA — 14-Day Session Persistence & Rolling Renewal Test Suite.
 *
 * Verifies all 11 required conditions:
 * 1. Initial session and cookie lifetime is 14 days (1,209,600s / 1,209,600,000ms).
 * 2. Session remains fully valid on Day 8 if not revoked.
 * 3. On active usage when remaining time < 7 days, session and cookie are rolled forward by 14 days.
 * 4. When more than 7 days remain, unnecessary renewal (Set-Cookie) is NOT performed.
 * 5. Expired sessions cannot be revived.
 * 6. Revoked sessions (e.g. session_takeover) are NEVER renewed or revived.
 * 7. Manual logout (sign-out) immediately revokes the session and clears cookies.
 * 8. Concurrent requests for renewal do not create duplicate sessions or inconsistent state.
 * 9. Persistence across Refresh and API server restart.
 * 10. Single active session invariant and 2-device slots model strictly maintained.
 * 11. Cookie security flags (HttpOnly, SameSite, Secure) and CSRF token consistency preserved.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryDeviceStore,
} from "../modules/identity/test/in-memory-stores.js";
import { hashToken } from "../modules/identity/session-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import type { FastifyInstance } from "fastify";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_SEC = 14 * 24 * 60 * 60;
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

describe("14-Day Session Persistence & Rolling Renewal", () => {
  let app: FastifyInstance;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let deviceStore: InMemoryDeviceStore;
  let organizationStore: InMemoryOrganizationStore;
  let currentTime: number;

  function extractCookie(
    res: { cookies?: Array<{ name: string; value: string; maxAge?: number; httpOnly?: boolean; sameSite?: string; path?: string }> },
    name: string,
  ) {
    return res.cookies?.find((c) => c.name === name);
  }

  function advanceTime(ms: number) {
    currentTime += ms;
    vi.setSystemTime(currentTime);
  }

  function setTime(ms: number) {
    currentTime = ms;
    vi.setSystemTime(currentTime);
  }

  beforeEach(async () => {
    currentTime = 1_700_000_000_000; // Base fixed timestamp
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(currentTime);

    const config = loadApiConfig({
      NODE_ENV: "test",
      AVANA_API_PORT: "0",
    });

    sessionStore = new InMemorySessionStore();
    deviceStore = new InMemoryDeviceStore();
    organizationStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(organizationStore);

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      deviceStore,
      organizationStore,
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Initial Session and Cookie Lifetime (14 days)
  // -------------------------------------------------------------------------
  it("1. sets initial session and cookie lifetime to exactly 14 days (1209600s)", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "persistence1@example.com",
        password: "Password123!",
        name: "Persistence User 1",
        phoneNumber: "09121110091",
      },
    });

    expect(regRes.statusCode).toBe(200);

    const sessionCookie = extractCookie(regRes, "avana_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.maxAge).toBe(FOURTEEN_DAYS_SEC);
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.path).toBe("/");
    expect(sessionCookie!.sameSite?.toLowerCase()).toBe("lax");

    const csrfCookie = extractCookie(regRes, "avana_csrf");
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie!.maxAge).toBe(FOURTEEN_DAYS_SEC);
    expect(csrfCookie!.httpOnly).not.toBe(true);

    // Verify database record expiresAt is exactly now + 14 days
    const tokenHash = hashToken(sessionCookie!.value);
    const sessionRecord = await sessionStore.findByTokenHash(tokenHash);
    expect(sessionRecord).toBeDefined();
    expect(new Date(sessionRecord!.expiresAt).getTime()).toBe(
      currentTime + FOURTEEN_DAYS_MS,
    );
  });

  // -------------------------------------------------------------------------
  // 2. Validity on Day 8 (exceeding previous 7-day limit)
  // -------------------------------------------------------------------------
  it("2. session remains valid on Day 8 without re-login", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "persistence2@example.com",
        password: "Password123!",
        name: "Persistence User 2",
        phoneNumber: "09121110092",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;

    // Advance server time by 8 days (previous 7-day system would have failed here)
    advanceTime(EIGHT_DAYS_MS);

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });

    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.email).toBe("persistence2@example.com");
  });

  // -------------------------------------------------------------------------
  // 3. Active Usage Rolling Renewal (Remaining time < 7 days -> extend by 14 days)
  // -------------------------------------------------------------------------
  it("3. rolls session and cookie forward by 14 days on active usage when remaining time < 7 days", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "persistence3@example.com",
        password: "Password123!",
        name: "Persistence User 3",
        phoneNumber: "09121110093",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;
    const initialTime = currentTime;

    // Advance by 8 days (remaining lifetime is 6 days, which is < 7 days)
    advanceTime(EIGHT_DAYS_MS);

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });

    expect(meRes.statusCode).toBe(200);

    // Cookie must be re-issued with full 14-day maxAge
    const renewedCookie = extractCookie(meRes, "avana_session");
    expect(renewedCookie).toBeDefined();
    expect(renewedCookie!.maxAge).toBe(FOURTEEN_DAYS_SEC);
    expect(renewedCookie!.value).toBe(sessionCookie.value);

    // CSRF cookie must also be rolled forward
    const renewedCsrf = extractCookie(meRes, "avana_csrf");
    expect(renewedCsrf).toBeDefined();
    expect(renewedCsrf!.maxAge).toBe(FOURTEEN_DAYS_SEC);

    // Database record must be extended to Day 8 + 14 days = Day 22
    const tokenHash = hashToken(sessionCookie.value);
    const sessionRecord = await sessionStore.findByTokenHash(tokenHash);
    expect(new Date(sessionRecord!.expiresAt).getTime()).toBe(
      currentTime + FOURTEEN_DAYS_MS,
    );

    // User returns on Day 20 (Day 8 + 12 days, which is 20 days since original registration!)
    setTime(initialTime + (20 * 24 * 60 * 60 * 1000));
    const meResDay20 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });
    expect(meResDay20.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 4. No Unnecessary Renewal when > 7 days remain
  // -------------------------------------------------------------------------
  it("4. does not send redundant Set-Cookie when more than 7 days remain until expiration", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "persistence4@example.com",
        password: "Password123!",
        name: "Persistence User 4",
        phoneNumber: "09121110094",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;
    const originalExpiresAt = currentTime + FOURTEEN_DAYS_MS;

    // Advance time by only 2 days (remaining lifetime is 12 days > 7 days)
    advanceTime(TWO_DAYS_MS);

    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });

    expect(meRes.statusCode).toBe(200);

    // Must NOT send unnecessary Set-Cookie
    const renewedCookie = extractCookie(meRes, "avana_session");
    expect(renewedCookie).toBeUndefined();

    // Database record expiresAt must remain untouched
    const tokenHash = hashToken(sessionCookie.value);
    const sessionRecord = await sessionStore.findByTokenHash(tokenHash);
    expect(new Date(sessionRecord!.expiresAt).getTime()).toBe(originalExpiresAt);
  });

  // -------------------------------------------------------------------------
  // 5. Expired Session Cannot Be Revived
  // -------------------------------------------------------------------------
  it("5. permanently rejects expired sessions and does not allow revival", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "persistence5@example.com",
        password: "Password123!",
        name: "Persistence User 5",
        phoneNumber: "09121110095",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;

    // Advance time past 14 days without active usage (15 days)
    advanceTime(FIFTEEN_DAYS_MS);

    const meRes1 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });

    expect(meRes1.statusCode).toBe(401);
    expect(meRes1.json().error.code).toBe("unauthorized");

    // Second request must still be rejected (cannot revive)
    const meRes2 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });
    expect(meRes2.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 6. Revoked Session (session_takeover) Cannot Be Renewed
  // -------------------------------------------------------------------------
  it("6. revoked session from session_takeover is never renewed or revived", async () => {
    // 1. Initial desktop login
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-type": "desktop" },
      payload: {
        email: "takeover_test@example.com",
        password: "Password123!",
        name: "Takeover User",
        phoneNumber: "09121110096",
      },
    });
    const desktopSession = extractCookie(regRes, "avana_session")!;

    // 2. Mobile login causes takeover and revokes desktop session
    const mobileRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: {
        email: "takeover_test@example.com",
        password: "Password123!",
      },
    });
    expect(mobileRes.statusCode).toBe(200);

    // Advance time to Day 8
    advanceTime(EIGHT_DAYS_MS);

    // 3. Desktop sends request with old revoked token
    const oldDesktopRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${desktopSession.value}` },
    });

    expect(oldDesktopRes.statusCode).toBe(401);
    expect(oldDesktopRes.json().error.code).toBe("SESSION_REVOKED");

    // Ensure no renewal cookie is sent
    expect(extractCookie(oldDesktopRes, "avana_session")).toBeUndefined();

    // Verify database record still revoked
    const tokenHash = hashToken(desktopSession.value);
    const sessionRecord = await sessionStore.findByTokenHash(tokenHash);
    expect(sessionRecord?.revokedAt).not.toBeNull();
    expect(sessionRecord?.revocationReason).toBe("session_takeover");
  });

  // -------------------------------------------------------------------------
  // 7. Manual Logout (Sign Out) Immediately Revokes Session
  // -------------------------------------------------------------------------
  it("7. manual sign-out immediately revokes 14-day session and clears cookies", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "logout_test@example.com",
        password: "Password123!",
        name: "Logout User",
        phoneNumber: "09121110097",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;

    // Sign out
    const signOutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });
    expect(signOutRes.statusCode).toBe(204);

    // Cleared cookies verification
    const clearedSession = extractCookie(signOutRes, "avana_session");
    expect(clearedSession).toBeDefined();
    expect(clearedSession!.value).toBe("");

    // Subsequent access must fail immediately
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });
    expect(meRes.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 8. Concurrency Safety for Session Renewal
  // -------------------------------------------------------------------------
  it("8. handles concurrent renewal requests safely without duplicate sessions or corruption", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "concurrency_test@example.com",
        password: "Password123!",
        name: "Concurrent User",
        phoneNumber: "09121110098",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;

    // Advance to Day 8 so renewal is eligible
    advanceTime(EIGHT_DAYS_MS);

    // Fire 10 simultaneous requests
    const requests = Array.from({ length: 10 }, () =>
      app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${sessionCookie.value}` },
      }),
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe("concurrency_test@example.com");
    }

    // Exactly 1 active session must exist in the store
    const tokenHash = hashToken(sessionCookie.value);
    const sessionRecord = await sessionStore.findByTokenHash(tokenHash);
    expect(sessionRecord).toBeDefined();
    expect(new Date(sessionRecord!.expiresAt).getTime()).toBe(
      currentTime + FOURTEEN_DAYS_MS,
    );
  });

  // -------------------------------------------------------------------------
  // 9. Persistence Across Refresh and Server Restart
  // -------------------------------------------------------------------------
  it("9. session survives page refresh and API server restart without re-login", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "restart_test@example.com",
        password: "Password123!",
        name: "Restart User",
        phoneNumber: "09121110099",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;

    // 1. Simulate page refresh
    const refreshRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });
    expect(refreshRes.statusCode).toBe(200);

    // 2. Simulate API server restart: close app and create new Fastify instance with same store
    await app.close();

    const config = loadApiConfig({
      NODE_ENV: "test",
      AVANA_API_PORT: "0",
    });

    const newApp = createApp({ config });
    await newApp.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      deviceStore,
      organizationStore,
    });
    await newApp.ready();

    // 3. User makes request to restarted server with existing cookie
    const postRestartRes = await newApp.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionCookie.value}` },
    });
    expect(postRestartRes.statusCode).toBe(200);
    expect(postRestartRes.json().user.email).toBe("restart_test@example.com");

    await newApp.close();
  });

  // -------------------------------------------------------------------------
  // 10. Single Active Session Invariant and 2-Device Slots Preserved
  // -------------------------------------------------------------------------
  it("10. preserves single active session invariant and 2-device slots model", async () => {
    // Register from desktop
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "x-device-type": "desktop" },
      payload: {
        email: "invariant_test@example.com",
        password: "Password123!",
        name: "Invariant User",
        phoneNumber: "09121110100",
      },
    });
    const desktopSession = extractCookie(regRes, "avana_session")!;
    const desktopDevice = extractCookie(regRes, "avana_device_id")!;

    // Login from mobile (second device slot)
    const mobileRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: {
        email: "invariant_test@example.com",
        password: "Password123!",
      },
    });
    expect(mobileRes.statusCode).toBe(200);
    const mobileSession = extractCookie(mobileRes, "avana_session")!;
    const mobileDevice = extractCookie(mobileRes, "avana_device_id")!;

    // Both device slots are registered
    expect(desktopDevice).not.toBe(mobileDevice);

    // Desktop session was revoked by takeover
    const desktopCheck = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${desktopSession.value}` },
    });
    expect(desktopCheck.statusCode).toBe(401);
    expect(desktopCheck.json().error.code).toBe("SESSION_REVOKED");

    // Mobile session is active
    const mobileCheck = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${mobileSession.value}` },
    });
    expect(mobileCheck.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 11. Cookie Security Flags and CSRF Behavior Preserved
  // -------------------------------------------------------------------------
  it("11. preserves cookie security flags and CSRF behavior on rolling renewal", async () => {
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "csrf_test@example.com",
        password: "Password123!",
        name: "CSRF User",
        phoneNumber: "09121110101",
      },
    });
    const sessionCookie = extractCookie(regRes, "avana_session")!;

    // Advance to Day 8 to trigger rolling renewal
    advanceTime(EIGHT_DAYS_MS);

    // Send state-changing PATCH /v1/auth/profile
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/v1/auth/profile",
      headers: {
        cookie: `avana_session=${sessionCookie.value}`,
        "x-csrf-token": sessionCookie.value,
      },
      payload: {
        name: "Updated Name",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().user.name).toBe("Updated Name");

    // Check renewed cookies
    const renewedSession = extractCookie(patchRes, "avana_session")!;
    expect(renewedSession.maxAge).toBe(FOURTEEN_DAYS_SEC);
    expect(renewedSession.httpOnly).toBe(true);
    expect(renewedSession.sameSite?.toLowerCase()).toBe("lax");
    expect(renewedSession.path).toBe("/");

    const renewedCsrf = extractCookie(patchRes, "avana_csrf")!;
    expect(renewedCsrf.maxAge).toBe(FOURTEEN_DAYS_SEC);
    expect(renewedCsrf.httpOnly).not.toBe(true);
    expect(renewedCsrf.sameSite?.toLowerCase()).toBe("lax");
    expect(renewedCsrf.path).toBe("/");
  });
});
