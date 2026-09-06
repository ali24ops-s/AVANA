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
import { asUserId } from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Auth Login & Device Management Regression Test Suite", () => {
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
  // 1. Regular User Scenarios
  // ---------------------------------------------------------------------------
  describe("Regular User Device Management", () => {
    it("allows regular user to login with new device when desktop slot is free", async () => {
      const password = "UserPassword123!";
      const passwordHash = await hashPassword(password);
      await userStore.createUserWithPassword({
        email: "regular@example.com",
        passwordHash,
        name: "Regular Student",
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
        },
        payload: {
          email: "regular@example.com",
          password,
        },
      });

      expect(res.statusCode).toBe(200);
      const deviceId = extractCookie(res, "avana_device_id");
      const sessionToken = extractCookie(res, "avana_session");
      expect(deviceId).toBeDefined();
      expect(sessionToken).toBeDefined();

      const body = res.json();
      expect(body.user.email).toBe("regular@example.com");
      expect(body.user.role).toBe("student");
    });

    it("allows regular user to re-login from the same recognized device", async () => {
      const password = "UserPassword123!";
      const passwordHash = await hashPassword(password);
      const user = await userStore.createUserWithPassword({
        email: "regular2@example.com",
        passwordHash,
        name: "Regular Student 2",
      });

      // First login
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "x-device-type": "desktop",
        },
        payload: { email: "regular2@example.com", password },
      });
      expect(res1.statusCode).toBe(200);
      const initialDeviceId = extractCookie(res1, "avana_device_id")!;

      // Second login with SAME device cookie
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "x-device-type": "desktop",
          cookie: `avana_device_id=${initialDeviceId}`,
        },
        payload: { email: "regular2@example.com", password },
      });

      expect(res2.statusCode).toBe(200);
      const activeDevices = await deviceStore.findActiveByUser(asUserId(user.id));
      expect(activeDevices).toHaveLength(1);
      expect(activeDevices[0].deviceId).toBe(initialDeviceId);
    });

    it("STRICTLY BLOCKS regular user when desktop slot is full (Case C invariant holds)", async () => {
      const password = "UserPassword123!";
      const passwordHash = await hashPassword(password);
      const user = await userStore.createUserWithPassword({
        email: "regular3@example.com",
        passwordHash,
        name: "Regular Student 3",
      });

      // Login 1 on Desktop Device A
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "x-device-type": "desktop",
        },
        payload: { email: "regular3@example.com", password },
      });
      expect(res1.statusCode).toBe(200);
      const session1 = extractCookie(res1, "avana_session")!;
      const deviceId1 = extractCookie(res1, "avana_device_id")!;

      // Login 2 from Desktop Device B (no device cookie or new device)
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
        },
        payload: { email: "regular3@example.com", password },
      });

      // Regular user MUST be blocked
      expect(res2.statusCode).toBe(403);
      expect(res2.json().error.code).toBe("DEVICE_LIMIT_REACHED");

      // Case C Invariant: Session 1 is STILL valid!
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${session1}` },
      });
      expect(meRes.statusCode).toBe(200);

      // Device 1 is STILL active and unmodified!
      const activeDevices = await deviceStore.findActiveByUser(asUserId(user.id));
      expect(activeDevices).toHaveLength(1);
      expect(activeDevices[0].deviceId).toBe(deviceId1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Content Worker Scenarios (Worker MUST NOT bypass device limits)
  // ---------------------------------------------------------------------------
  describe("Content Worker Device Management", () => {
    it("strictly blocks content_worker when slot is full (no bypass granted)", async () => {
      const password = "WorkerPassword123!";
      const passwordHash = await hashPassword(password);
      await userStore.createUserWithPassword({
        email: "worker-001@avana.local",
        passwordHash,
        name: "Content Worker 1",
        globalRole: "content_worker",
      });

      // Slot occupied by Device A
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "x-device-type": "desktop",
        },
        payload: { email: "worker-001@avana.local", password },
      });
      expect(res1.statusCode).toBe(200);

      // Attempt second desktop device without cookie
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
        },
        payload: { email: "worker-001@avana.local", password },
      });

      expect(res2.statusCode).toBe(403);
      expect(res2.json().error.code).toBe("DEVICE_LIMIT_REACHED");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Platform Admin Recovery & Takeover Scenarios
  // ---------------------------------------------------------------------------
  describe("Platform Admin Controlled Device Takeover & Recovery", () => {
    it("allows platform_admin to re-login from the same device", async () => {
      const password = "AdminPassword123!";
      const passwordHash = await hashPassword(password);
      await userStore.createUserWithPassword({
        email: "admin@avana.dev",
        passwordHash,
        name: "Platform Admin",
        globalRole: "platform_admin",
      });

      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
        },
        payload: { email: "admin@avana.dev", password },
      });
      expect(res1.statusCode).toBe(200);
      const deviceId = extractCookie(res1, "avana_device_id")!;

      // Re-login with same device cookie
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
          cookie: `avana_device_id=${deviceId}`,
        },
        payload: { email: "admin@avana.dev", password },
      });
      expect(res2.statusCode).toBe(200);
      expect(extractCookie(res2, "avana_device_id")).toBe(deviceId);
    });

    it("allows platform_admin to recover and login when slot is full (cookie cleared / new browser)", async () => {
      const password = "AdminPassword123!";
      const passwordHash = await hashPassword(password);
      const admin = await userStore.createUserWithPassword({
        email: "ali1383mohammadlo@gmail.com",
        passwordHash,
        name: "Ali Admin",
        globalRole: "platform_admin",
      });

      // 1. Initial login on Safari (registers Desktop Device 1)
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
          "x-device-type": "desktop",
        },
        payload: { email: "ali1383mohammadlo@gmail.com", password },
      });
      expect(res1.statusCode).toBe(200);
      const session1 = extractCookie(res1, "avana_session")!;
      const device1 = extractCookie(res1, "avana_device_id")!;
      expect(device1).toBeDefined();

      // 2. Platform Admin switches browser to Chrome / clears cookie (NO device cookie sent)
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
          "x-device-type": "desktop",
        },
        payload: { email: "ali1383mohammadlo@gmail.com", password },
      });

      // Controlled recovery MUST succeed (no lockout)
      expect(res2.statusCode).toBe(200);
      const body2 = res2.json();
      expect(body2.user.email).toBe("ali1383mohammadlo@gmail.com");
      expect(body2.user.role).toBe("platform_admin");

      const session2 = extractCookie(res2, "avana_session")!;
      const device2 = extractCookie(res2, "avana_device_id")!;
      expect(device2).toBeDefined();
      expect(device2).not.toBe(device1);

      // 3. Old session MUST be revoked with session_takeover
      const meOldRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${session1}` },
      });
      expect(meOldRes.statusCode).toBe(401);
      expect(meOldRes.json().error.code).toBe("SESSION_REVOKED");

      // 4. New session MUST be active and return correct user
      const meNewRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${session2}` },
      });
      expect(meNewRes.statusCode).toBe(200);
      expect(meNewRes.json().user.email).toBe("ali1383mohammadlo@gmail.com");
      expect(meNewRes.json().user.role).toBe("platform_admin");

      // 5. Verify device audit history: Exactly 1 active device, previous device revoked
      const activeDevices = await deviceStore.findActiveByUser(asUserId(admin.id));
      expect(activeDevices).toHaveLength(1);
      expect(activeDevices[0].deviceId).toBe(device2);

      const allDevices = await deviceStore.listAllByUser(asUserId(admin.id));
      expect(allDevices).toHaveLength(2);
      const oldDev = allDevices.find((d) => d.deviceId === device1);
      expect(oldDev?.revokedAt).not.toBeNull();
    });

    it("verifies sign-out completely invalidates session", async () => {
      const password = "AdminPassword123!";
      const passwordHash = await hashPassword(password);
      await userStore.createUserWithPassword({
        email: "ali_signout@avana.dev",
        passwordHash,
        name: "Ali",
        globalRole: "platform_admin",
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
        },
        payload: { email: "ali_signout@avana.dev", password },
      });
      expect(loginRes.statusCode).toBe(200);
      const sessionToken = extractCookie(loginRes, "avana_session")!;

      // Verify active
      const me1 = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${sessionToken}` },
      });
      expect(me1.statusCode).toBe(200);

      // Sign out
      const signOutRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        headers: { cookie: `avana_session=${sessionToken}` },
      });
      expect(signOutRes.statusCode).toBe(204);

      // Verify session is now invalid
      const me2 = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${sessionToken}` },
      });
      expect(me2.statusCode).toBe(401);
      expect(me2.json().error.code).toBe("unauthorized");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Real PostgreSQL Drizzle Integration Test
  // ---------------------------------------------------------------------------
  describe("Real PostgreSQL Database Device Recovery Verification", () => {
    it("verifies platform_admin device recovery using real PostgreSQL Drizzle stores", async (ctx) => {
      const { createDbClient } = await import("@avana/database/client");
      const { sql } = await import("drizzle-orm");
      const { DrizzleDeviceStore, DrizzleSessionStore, DrizzleUserStore } =
        await import("../modules/identity/drizzle-stores.js");

      const postgresUrl =
        process.env.DATABASE_URL ??
        "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

      let dbClient: ReturnType<typeof createDbClient>;
      try {
        dbClient = createDbClient(postgresUrl);
        await dbClient.db.execute(sql`SELECT 1;`);
      } catch {
        ctx.skip();
        return;
      }

      try {
        const pgDeviceStore = new DrizzleDeviceStore(dbClient.db);
        const pgUserStore = new DrizzleUserStore(dbClient.db);
        const pgSessionStore = new DrizzleSessionStore(dbClient.db);

        const appPg = createApp({ config });
        await appPg.register(v1Routes, {
          config,
          sessionStore: pgSessionStore,
          userStore: pgUserStore,
          deviceStore: pgDeviceStore,
          organizationStore,
          adminStore,
        });

        // 1. Create temporary test admin with platform_admin role in real DB
        const testAdminEmail = `test_admin_${Date.now()}@avana.dev`;
        const testPass = "SecureAdminPass123!";
        const passwordHash = await hashPassword(testPass);
        const adminUser = await pgUserStore.createUserWithPassword({
          email: testAdminEmail,
          passwordHash,
          name: "Test PG Admin",
          globalRole: "platform_admin",
        });

        // First login: registers Desktop Device 1
        const res1 = await appPg.inject({
          method: "POST",
          url: "/v1/auth/sign-in",
          headers: {
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
            "x-device-type": "desktop",
          },
          payload: { email: testAdminEmail, password: testPass },
        });
        expect(res1.statusCode).toBe(200);
        const device1 = extractCookie(res1, "avana_device_id")!;
        const session1 = extractCookie(res1, "avana_session")!;
        expect(device1).toBeDefined();

        // Second login: clears cookie / new browser (no device cookie)
        // Even though desktop slot is full, platform_admin recovery must succeed
        const res2 = await appPg.inject({
          method: "POST",
          url: "/v1/auth/sign-in",
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
            "x-device-type": "desktop",
          },
          payload: { email: testAdminEmail, password: testPass },
        });

        expect(res2.statusCode).toBe(200);
        const device2 = extractCookie(res2, "avana_device_id")!;
        const session2 = extractCookie(res2, "avana_session")!;
        expect(device2).toBeDefined();
        expect(device2).not.toBe(device1);

        // Session 1 is revoked with session_takeover
        const meOld = await appPg.inject({
          method: "GET",
          url: "/v1/me",
          headers: { cookie: `avana_session=${session1}` },
        });
        expect(meOld.statusCode).toBe(401);
        expect(meOld.json().error.code).toBe("SESSION_REVOKED");

        // Session 2 is active and valid
        const meNew = await appPg.inject({
          method: "GET",
          url: "/v1/me",
          headers: { cookie: `avana_session=${session2}` },
        });
        expect(meNew.statusCode).toBe(200);
        expect(meNew.json().user.email).toBe(testAdminEmail);
        expect(meNew.json().user.role).toBe("platform_admin");

        // Sign out with Session 2
        const signOutRes = await appPg.inject({
          method: "POST",
          url: "/v1/auth/sign-out",
          headers: { cookie: `avana_session=${session2}` },
        });
        expect(signOutRes.statusCode).toBe(204);

        // Verify Session 2 is now invalid
        const meFinal = await appPg.inject({
          method: "GET",
          url: "/v1/me",
          headers: { cookie: `avana_session=${session2}` },
        });
        expect(meFinal.statusCode).toBe(401);

        // Clean up test admin from real DB
        await dbClient.db.execute(sql`DELETE FROM sessions WHERE user_id = ${adminUser.id}::uuid;`);
        await dbClient.db.execute(sql`DELETE FROM user_devices WHERE user_id = ${adminUser.id}::uuid;`);
        await dbClient.db.execute(sql`DELETE FROM users WHERE id = ${adminUser.id}::uuid;`);

        await appPg.close();
      } finally {
        await dbClient.close();
      }
    });
  });
});
