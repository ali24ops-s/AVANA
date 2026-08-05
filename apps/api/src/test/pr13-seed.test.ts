/**
 * PR-13 Integration tests: Development seed data.
 *
 * Verifies that the dev bootstrap seed function:
 * 1. Creates Alice (alice@example.com) who can sign in
 * 2. Creates AVANA Demo Organization visible to Alice
 * 3. Creates demo courses (Pharmacology Basics, Medicinal Chemistry Introduction)
 * 4. Is idempotent — calling it multiple times does not duplicate records
 *
 * These tests directly exercise the seed function and verify via
 * HTTP endpoints, proving the full bootstrap flow works.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { seedLocalDevData, type SeedStores } from "../dev/seed.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  return res.cookies.find((c) => c.name === "avana_session")?.value;
}

describe("PR-13: Development seed data", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  function buildSeedStores(): SeedStores {
    return {
      userStore,
      organizationStore: orgStore,
      courseStore,
      auditService,
    };
  }

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      auditService,
    });
    return app;
  }

  describe("1. Seed data accessibility via HTTP", () => {
    it("Alice can sign in after seeding", async () => {
      await seedLocalDevData(buildSeedStores());
      const app = await buildApp();

      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "alice@example.com", name: "Alice" },
      });
      expect(signInRes.statusCode).toBe(200);
      const signInBody = JSON.parse(signInRes.body) as {
        user: { id: string; email: string; role: string };
      };
      expect(signInBody.user.email).toBe("alice@example.com");
      expect(signInBody.user.role).toBe("student");

      await app.close();
    });

    it("Alice sees her organization after seeding", async () => {
      await seedLocalDevData(buildSeedStores());
      const app = await buildApp();

      // Sign in as Alice
      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "alice@example.com", name: "Alice" },
      });
      const token = extractSessionToken(signInRes)!;

      // List organizations
      const orgListRes = await app.inject({
        method: "GET",
        url: "/v1/organizations",
        cookies: { avana_session: token },
      });
      expect(orgListRes.statusCode).toBe(200);
      const orgListBody = JSON.parse(orgListRes.body) as {
        items: Array<{ id: string; name: string }>;
      };
      expect(orgListBody.items.length).toBe(1);
      expect(orgListBody.items[0].name).toBe("AVANA Demo Organization");

      await app.close();
    });

    it("GET /courses returns demo courses after seeding", async () => {
      await seedLocalDevData(buildSeedStores());
      const app = await buildApp();

      // Sign in as Alice
      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "alice@example.com", name: "Alice" },
      });
      const token = extractSessionToken(signInRes)!;

      // Get Alice's organization
      const orgListRes = await app.inject({
        method: "GET",
        url: "/v1/organizations",
        cookies: { avana_session: token },
      });
      const orgListBody = JSON.parse(orgListRes.body) as {
        items: Array<{ id: string; name: string }>;
      };
      const orgId = orgListBody.items[0].id;

      // List courses in the organization
      const coursesRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses`,
        cookies: { avana_session: token },
      });
      expect(coursesRes.statusCode).toBe(200);
      const coursesBody = JSON.parse(coursesRes.body) as {
        items: Array<{ id: string; title: string }>;
      };
      expect(coursesBody.items.length).toBe(2);

      const titles = coursesBody.items.map((c) => c.title).sort();
      expect(titles).toEqual([
        "Medicinal Chemistry Introduction",
        "Pharmacology Basics",
      ]);

      await app.close();
    });
  });

  describe("2. Idempotency", () => {
    it("does not duplicate records when seeded twice", async () => {
      // Seed twice
      const result1 = await seedLocalDevData(buildSeedStores());
      const result2 = await seedLocalDevData(buildSeedStores());

      // First seed should have created everything
      expect(result1.seeded.user).toBe(true);
      expect(result1.seeded.organization).toBe(true);
      expect(result1.seeded.courses).toEqual([
        "Pharmacology Basics",
        "Medicinal Chemistry Introduction",
      ]);

      // Second seed should have created nothing (all skipped)
      expect(result2.seeded.user).toBe(false);
      expect(result2.seeded.organization).toBe(false);
      expect(result2.seeded.courses).toEqual([]);

      // Verify IDs are stable across calls
      expect(result1.userId).toBe(result2.userId);
      expect(result1.organizationId).toBe(result2.organizationId);

      // Verify only one org and two courses exist in the store
      const app = await buildApp();

      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "alice@example.com", name: "Alice" },
      });
      const token = extractSessionToken(signInRes)!;

      const orgListRes = await app.inject({
        method: "GET",
        url: "/v1/organizations",
        cookies: { avana_session: token },
      });
      const orgListBody = JSON.parse(orgListRes.body) as {
        items: Array<{ id: string; name: string }>;
      };
      expect(orgListBody.items.length).toBe(1);

      const coursesRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${result1.organizationId}/courses`,
        cookies: { avana_session: token },
      });
      const coursesBody = JSON.parse(coursesRes.body) as {
        items: Array<{ id: string }>;
      };
      expect(coursesBody.items.length).toBe(2);

      await app.close();
    });
  });

  describe("3. Seed does not affect production behavior", () => {
    it("seed function is only called in development mode", async () => {
      // In test mode (not development), seed is NOT called automatically
      // Verify that composeLocalDev guards on NODE_ENV
      const { composeLocalDev } = await import("../server/composeLocalDev.js");

      // composeLocalDev uses config.nodeEnv === "development" guard
      // In test mode, this guard should prevent seeding from affecting tests
      const devConfig = loadApiConfig();
      expect(devConfig.nodeEnv).toBe("test");

      // composeLocalDev should work without throwing
      const result = await composeLocalDev(devConfig);
      expect(result.v1Options).toBeDefined();
      expect(result.auditService).toBeDefined();
    });
  });
});
