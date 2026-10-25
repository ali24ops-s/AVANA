/* eslint-disable no-secrets/no-secrets */
import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryDeviceStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { hashPassword } from "../modules/identity/password-hasher.js";
import { asUserId, asOrganizationId } from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Platform Admin Multi-Device Session Policy Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let deviceStore: InMemoryDeviceStore;
  let organizationStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    deviceStore = new InMemoryDeviceStore();
    deviceStore.setSessionStore(sessionStore);
    organizationStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(organizationStore);
    adminStore = new InMemoryAdminStore();

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      deviceStore,
      organizationStore,
      adminStore,
    });
  });

  function extractCookie(
    res: { cookies: Array<{ name: string; value: string }> },
    name: string,
  ): string | undefined {
    return res.cookies.find((c) => c.name === name)?.value;
  }

  // ---------------------------------------------------------------------------
  // 1. Platform Admin: Two concurrent sessions from independent devices
  // ---------------------------------------------------------------------------
  it("1. Platform Admin: Device A login -> Device B login -> BOTH sessions remain active and verified via /v1/me", async () => {
    const password = "AdminPassword123!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "admin_multi@avana.dev",
      passwordHash,
      name: "Super Admin",
      globalRole: "platform_admin",
    });

    // Login from Device A (e.g. Mobile phone)
    const resA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "x-device-type": "mobile",
      },
      payload: { email: "admin_multi@avana.dev", password },
    });
    expect(resA.statusCode).toBe(200);
    const sessionA = extractCookie(resA, "avana_session")!;
    const deviceA = extractCookie(resA, "avana_device_id")!;
    expect(sessionA).toBeDefined();
    expect(deviceA).toBeDefined();

    // Login from Device B (e.g. Laptop / Desktop)
    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "x-device-type": "desktop",
      },
      payload: { email: "admin_multi@avana.dev", password },
    });
    expect(resB.statusCode).toBe(200);
    const sessionB = extractCookie(resB, "avana_session")!;
    const deviceB = extractCookie(resB, "avana_device_id")!;
    expect(sessionB).toBeDefined();
    expect(deviceB).toBeDefined();
    expect(sessionB).not.toBe(sessionA);

    // Verify Session A is STILL completely valid via GET /v1/me
    const meA = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(meA.statusCode).toBe(200);
    expect(meA.json().user.email).toBe("admin_multi@avana.dev");
    expect(meA.json().user.role).toBe("platform_admin");

    // Verify Session B is ALSO completely valid via GET /v1/me
    const meB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionB}` },
    });
    expect(meB.statusCode).toBe(200);
    expect(meB.json().user.email).toBe("admin_multi@avana.dev");
    expect(meB.json().user.role).toBe("platform_admin");
  });

  // ---------------------------------------------------------------------------
  // 2. Sign-out Isolation: Sign-out on Device A leaves Device B active
  // ---------------------------------------------------------------------------
  it("2. Platform Admin: Sign-out from Device A invalidates ONLY Device A, leaving Device B active", async () => {
    const password = "AdminPassword123!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "admin_signout@avana.dev",
      passwordHash,
      name: "Admin Signout",
      globalRole: "platform_admin",
    });

    const resA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: { email: "admin_signout@avana.dev", password },
    });
    const sessionA = extractCookie(resA, "avana_session")!;

    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "admin_signout@avana.dev", password },
    });
    const sessionB = extractCookie(resB, "avana_session")!;

    // Admin signs out from Device A
    const signOutA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(signOutA.statusCode).toBe(204);

    // Device A session is now invalid (401)
    const meAAfter = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(meAAfter.statusCode).toBe(401);

    // Device B session MUST STILL BE ACTIVE (200 OK)
    const meBAfter = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionB}` },
    });
    expect(meBAfter.statusCode).toBe(200);
    expect(meBAfter.json().user.email).toBe("admin_signout@avana.dev");
  });

  // ---------------------------------------------------------------------------
  // 3. Re-login from same recognized device: manages only that device's session
  // ---------------------------------------------------------------------------
  it("3. Platform Admin: Re-login from recognized Device A refreshes Device A session and preserves Device B", async () => {
    const password = "AdminPassword123!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "admin_relogin@avana.dev",
      passwordHash,
      name: "Admin Relogin",
      globalRole: "platform_admin",
    });

    // 1. Login on Device A
    const resA1 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "admin_relogin@avana.dev", password },
    });
    const sessionA1 = extractCookie(resA1, "avana_session")!;
    const deviceA = extractCookie(resA1, "avana_device_id")!;

    // 2. Login on Device B (Mobile)
    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: { email: "admin_relogin@avana.dev", password },
    });
    const sessionB = extractCookie(resB, "avana_session")!;

    // 3. Re-login on Device A using recognized cookie
    const resA2 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: {
        "x-device-type": "desktop",
        cookie: `avana_device_id=${deviceA}`,
      },
      payload: { email: "admin_relogin@avana.dev", password },
    });
    expect(resA2.statusCode).toBe(200);
    const sessionA2 = extractCookie(resA2, "avana_session")!;
    expect(sessionA2).not.toBe(sessionA1);

    // Old Session A1 on Device A was rotated / relogged (401)
    const meA1 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA1}` },
    });
    expect(meA1.statusCode).toBe(401);

    // New Session A2 on Device A is active (200)
    const meA2 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA2}` },
    });
    expect(meA2.statusCode).toBe(200);

    // Device B session was UNTOUCHED and remains active (200)
    const meB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionB}` },
    });
    expect(meB.statusCode).toBe(200);
    expect(meB.json().user.email).toBe("admin_relogin@avana.dev");
  });

  // ---------------------------------------------------------------------------
  // 4. Regular User: Single Active Session strictly preserved
  // ---------------------------------------------------------------------------
  it("4. Regular User: Device A login -> Device B login -> Device A session is REVOKED with session_takeover", async () => {
    const password = "StudentPassword123!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "student_single@avana.dev",
      passwordHash,
      name: "Normal Student",
      // Regular user has no platform_admin role
    });

    // 1. Student logs in on Laptop (Device A)
    const resA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "student_single@avana.dev", password },
    });
    expect(resA.statusCode).toBe(200);
    const sessionA = extractCookie(resA, "avana_session")!;

    // Verify Session A is active
    const meA1 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(meA1.statusCode).toBe(200);

    // 2. Student logs in on Phone (Device B)
    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: { email: "student_single@avana.dev", password },
    });
    expect(resB.statusCode).toBe(200);
    const sessionB = extractCookie(resB, "avana_session")!;

    // 3. Laptop session (A) MUST be revoked with SESSION_REVOKED
    const meA2 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(meA2.statusCode).toBe(401);
    expect(meA2.json().error.code).toBe("SESSION_REVOKED");

    // 4. Phone session (B) MUST be active
    const meB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionB}` },
    });
    expect(meB.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 5. Other roles: organization_admin, teacher, content_worker do NOT get multi-device
  // ---------------------------------------------------------------------------
  it("5. Other roles: organization_admin, teacher, content_worker strictly adhere to single active session", async () => {
    const password = "SecretPassword123!";
    const passwordHash = await hashPassword(password);

    // A. organization_admin
    const orgAdmin = await userStore.createUserWithPassword({
      email: "org_admin@avana.dev",
      passwordHash,
      name: "Org Admin",
    });
    organizationStore.addMembership({
      id: "mem-org-admin",
      organizationId: asOrganizationId("00000000-0000-0000-0000-000000000099"),
      userId: asUserId(orgAdmin.id),
      role: "organization_admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const orgResA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "org_admin@avana.dev", password },
    });
    const orgSessA = extractCookie(orgResA, "avana_session")!;

    const orgResB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: { email: "org_admin@avana.dev", password },
    });
    const orgSessB = extractCookie(orgResB, "avana_session")!;

    // Org admin device A MUST be revoked
    const orgMeA = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${orgSessA}` },
    });
    expect(orgMeA.statusCode).toBe(401);
    expect(orgMeA.json().error.code).toBe("SESSION_REVOKED");

    // Org admin device B MUST be active
    const orgMeB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${orgSessB}` },
    });
    expect(orgMeB.statusCode).toBe(200);

    // B. content_worker
    const worker = await userStore.createUserWithPassword({
      email: "worker_test@avana.dev",
      passwordHash,
      name: "Content Worker",
      globalRole: "content_worker",
    });
    const wResA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "worker_test@avana.dev", password },
    });
    const wSessA = extractCookie(wResA, "avana_session")!;

    const wResB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: { email: "worker_test@avana.dev", password },
    });
    const wSessB = extractCookie(wResB, "avana_session")!;

    // Worker device A MUST be revoked
    const wMeA = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${wSessA}` },
    });
    expect(wMeA.statusCode).toBe(401);
    expect(wMeA.json().error.code).toBe("SESSION_REVOKED");

    const wMeB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${wSessB}` },
    });
    expect(wMeB.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 6. Global Session Revocation (revokeAllUserSessions) & Expiry
  // ---------------------------------------------------------------------------
  it("6. Admin Reset: revokeAllUserSessions invalidates ALL active sessions across ALL devices of platform_admin", async () => {
    const password = "AdminPassword123!";
    const passwordHash = await hashPassword(password);
    const admin = await userStore.createUserWithPassword({
      email: "admin_reset@avana.dev",
      passwordHash,
      name: "Admin Reset",
      globalRole: "platform_admin",
    });

    const resA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "admin_reset@avana.dev", password },
    });
    const sessionA = extractCookie(resA, "avana_session")!;

    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "mobile" },
      payload: { email: "admin_reset@avana.dev", password },
    });
    const sessionB = extractCookie(resB, "avana_session")!;

    // Both are initially active
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `avana_session=${sessionA}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `avana_session=${sessionB}` } })).statusCode).toBe(200);

    // Trigger revokeAllUserSessions (e.g. security reset by manager)
    await sessionStore.revokeAllByUser(asUserId(admin.id), new Date().toISOString(), "admin_reset");

    // BOTH Session A and Session B MUST now be rejected
    const meA = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(meA.statusCode).toBe(401);
    expect(meA.json().error.code).toBe("SESSION_REVOKED");

    const meB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionB}` },
    });
    expect(meB.statusCode).toBe(401);
    expect(meB.json().error.code).toBe("SESSION_REVOKED");
  });

  // ---------------------------------------------------------------------------
  // 7. Security: Role spoofing attempts through headers or body fail
  // ---------------------------------------------------------------------------
  it("7. Security Guard: Student attempting to spoof role in request payload or headers DOES NOT receive multi-session", async () => {
    const password = "StudentPassword123!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "spoof_student@avana.dev",
      passwordHash,
      name: "Attacker",
      // True server-side role is regular student
    });

    // Login A with spoofed body payload
    const resA = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: {
        "x-device-type": "desktop",
        "x-role": "platform_admin",
        "x-global-role": "platform_admin",
      },
      payload: {
        email: "spoof_student@avana.dev",
        password,
        role: "platform_admin",
        globalRole: "platform_admin",
      },
    });
    expect(resA.statusCode).toBe(200);
    const sessionA = extractCookie(resA, "avana_session")!;

    // Login B with spoofed body payload
    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: {
        "x-device-type": "mobile",
        "x-role": "platform_admin",
      },
      payload: {
        email: "spoof_student@avana.dev",
        password,
        role: "platform_admin",
      },
    });
    expect(resB.statusCode).toBe(200);
    const sessionB = extractCookie(resB, "avana_session")!;

    // Session A MUST be revoked because server verified DB role is student
    const meA = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionA}` },
    });
    expect(meA.statusCode).toBe(401);
    expect(meA.json().error.code).toBe("SESSION_REVOKED");

    // Session B is the only active session
    const meB = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${sessionB}` },
    });
    expect(meB.statusCode).toBe(200);
    expect(meB.json().user.role).toBe("student");
  });

  // ---------------------------------------------------------------------------
  // 8. Concurrency & Race Condition: Concurrent logins for regular user
  // ---------------------------------------------------------------------------
  it("8. Concurrency: Simultaneous concurrent logins for regular user results in strictly ONE active session", async () => {
    const password = "UserPassword123!";
    const passwordHash = await hashPassword(password);
    const user = await userStore.createUserWithPassword({
      email: "concurrent_user@avana.dev",
      passwordHash,
      name: "Concurrent User",
    });

    // Execute 5 simultaneous login requests concurrently
    const promises = Array.from({ length: 5 }).map((_, i) =>
      app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": i % 2 === 0 ? "desktop" : "mobile" },
        payload: { email: "concurrent_user@avana.dev", password },
      }),
    );

    const responses = await Promise.all(promises);
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
    }

    const sessionTokens = responses.map((r) => extractCookie(r, "avana_session")!);

    // Query /v1/me for all issued tokens
    const meResults = await Promise.all(
      sessionTokens.map((tok) =>
        app.inject({
          method: "GET",
          url: "/v1/me",
          headers: { cookie: `avana_session=${tok}` },
        }),
      ),
    );

    // Exactly ONE token must be valid (200), and all others must be 401
    const validCount = meResults.filter((r) => r.statusCode === 200).length;
    const revokedCount = meResults.filter((r) => r.statusCode === 401).length;

    expect(validCount).toBe(1);
    expect(revokedCount).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // 9. Unreliable / Absent Device ID: Does not revoke other active admin sessions
  // ---------------------------------------------------------------------------
  it("9. Unreliable Device ID: Platform Admin logging in with absent/unrecognized device ID does NOT revoke existing valid sessions", async () => {
    const password = "AdminPassword123!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "admin_unreliable@avana.dev",
      passwordHash,
      name: "Admin Unreliable",
      globalRole: "platform_admin",
    });

    // 1. Initial login on Laptop (valid Session 1)
    const res1 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: { "x-device-type": "desktop" },
      payload: { email: "admin_unreliable@avana.dev", password },
    });
    const session1 = extractCookie(res1, "avana_session")!;

    // 2. Admin logs in from incognito / private browser / Webview (no avana_device_id cookie, arbitrary device type)
    const res2 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      headers: {
        "user-agent": "Unknown-WebView/1.0",
        // No avana_device_id cookie sent
      },
      payload: { email: "admin_unreliable@avana.dev", password },
    });
    expect(res2.statusCode).toBe(200);
    const session2 = extractCookie(res2, "avana_session")!;

    // Session 1 on Laptop MUST NOT be mistakenly revoked
    const me1 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${session1}` },
    });
    expect(me1.statusCode).toBe(200);
    expect(me1.json().user.email).toBe("admin_unreliable@avana.dev");

    // Session 2 is also active
    const me2 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `avana_session=${session2}` },
    });
    expect(me2.statusCode).toBe(200);
    expect(me2.json().user.email).toBe("admin_unreliable@avana.dev");
  });
});
