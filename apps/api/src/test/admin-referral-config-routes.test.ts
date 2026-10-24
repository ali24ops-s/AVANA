import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryWalletStore } from "../modules/wallet/index.js";
import { InMemoryReferralStore } from "../modules/referral/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Referral Configuration Routes & Persistence", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const referralStore = new InMemoryReferralStore();
    const walletStore = new InMemoryWalletStore();

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
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

    const student = await createUserWithRole("student@test.com", Roles.student);
    const platformAdmin = await createUserWithRole("admin@test.com", Roles.platform_admin);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      referralStore,
      walletStore,
    });

    return {
      app,
      referralStore,
      student,
      platformAdmin,
    };
  }

  test("1. Unauthenticated requests to /v1/admin/commerce/referrals/config return 401", async () => {
    const { app } = await setupTestApp();

    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/referrals/config",
    });
    expect(getRes.statusCode).toBe(401);

    const putRes = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      payload: { rewardDays: 20 },
    });
    expect(putRes.statusCode).toBe(401);
  });

  test("2. Non-admin roles (e.g. student) receive 403 Forbidden", async () => {
    const { app, student } = await setupTestApp();

    const res = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${student.sessionToken}` },
      payload: { rewardDays: 20 },
    });
    expect(res.statusCode).toBe(403);
  });

  test("3. Platform Admin can fetch initial referral config", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.config).toBeDefined();
    expect(body.config.rewardDays).toBe(15);
    expect(body.config.enabled).toBe(true);
    expect(body.config.maxRewardedReferrals).toBe(4);
  });

  test("4. Platform Admin can successfully update rewardDays and retrieve new value", async () => {
    const { app, platformAdmin, referralStore } = await setupTestApp();

    // Change rewardDays to 25
    const putRes = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: {
        enabled: true,
        rewardDays: 25,
        maxRewardedReferrals: 5,
      },
    });

    expect(putRes.statusCode).toBe(200);
    const putBody = putRes.json();
    expect(putBody.config.rewardDays).toBe(25);
    expect(putBody.config.maxRewardedReferrals).toBe(5);

    // Verify GET returns the exact updated value
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.config.rewardDays).toBe(25);
    expect(getBody.config.maxRewardedReferrals).toBe(5);

    // Verify in-store persistence directly
    const stored = await referralStore.getReferralSystemConfig();
    expect(stored.rewardDays).toBe(25);
    expect(stored.maxRewardedReferrals).toBe(5);
  });

  test("5. Boundary value: rewardDays = 0 is valid, saved and not reverted to default", async () => {
    const { app, platformAdmin, referralStore } = await setupTestApp();

    const putRes = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: {
        rewardDays: 0,
      },
    });

    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().config.rewardDays).toBe(0);

    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
    });
    expect(getRes.json().config.rewardDays).toBe(0);

    const stored = await referralStore.getReferralSystemConfig();
    expect(stored.rewardDays).toBe(0);
  });

  test("6. Invalid values are rejected with 400 bad_request", async () => {
    const { app, platformAdmin } = await setupTestApp();

    // Negative rewardDays
    const resNegative = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: { rewardDays: -5 },
    });
    expect(resNegative.statusCode).toBe(400);

    // Over maximum (365)
    const resOverMax = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: { rewardDays: 500 },
    });
    expect(resOverMax.statusCode).toBe(400);

    // Non-integer float
    const resFloat = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: { rewardDays: 14.5 },
    });
    expect(resFloat.statusCode).toBe(400);

    // Invalid maxRewardedReferrals (0 or > 100)
    const resZeroMax = await app.inject({
      method: "PUT",
      url: "/v1/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: { maxRewardedReferrals: 0 },
    });
    expect(resZeroMax.statusCode).toBe(400);
  });

  test("7. Backward compatibility: /admin/commerce/referrals/config also works", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const putRes = await app.inject({
      method: "PUT",
      url: "/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
      payload: { rewardDays: 18 },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().config.rewardDays).toBe(18);

    const getRes = await app.inject({
      method: "GET",
      url: "/admin/commerce/referrals/config",
      headers: { cookie: `avana_session=${platformAdmin.sessionToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().config.rewardDays).toBe(18);
  });
});
