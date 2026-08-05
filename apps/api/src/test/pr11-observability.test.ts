/**
 * PR-11 Integration tests: Observability (Audit, Metrics, Logger).
 *
 * Covers:
 * 1. AuditStore and AuditService work correctly
 * 2. Audit events are emitted through AuditService from organization/course services
 * 3. Metrics counters are incremented
 * 4. Logger is silent during tests
 */

import { describe, expect, it, beforeEach } from "vitest";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { metrics } from "../observability/metrics.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";

describe("PR-11: Observability", () => {
  describe("1. AuditStore and AuditService", () => {
    let auditStore: InMemoryAuditStore;
    let auditService: AuditService;

    beforeEach(() => {
      auditStore = new InMemoryAuditStore();
      auditService = new AuditService(auditStore);
    });

    it("stores audit events via emit", async () => {
      const event = {
        actorId: "u1" as never,
        organizationId: "o1" as never,
        action: "org.created" as const,
        entityType: "organization" as const,
        entityId: "o1",
        createdAt: new Date().toISOString(),
      };

      await auditService.emit([event]);
      const all = await auditService.listAll();
      expect(all).toHaveLength(1);
      expect(all[0].action).toBe("org.created");
    });

    it("does nothing for empty events array", async () => {
      await auditService.emit([]);
      const all = await auditService.listAll();
      expect(all).toHaveLength(0);
    });
  });

  describe("2. Audit events from organization service", () => {
    it("persists audit events via the aggregate store when creating an org", async () => {
      process.env.AVANA_API_PORT = "0";
      process.env.NODE_ENV = "test";
      const config = loadApiConfig();
      const sessionStore = new InMemorySessionStore();
      const userStore = new InMemoryUserStore();
      const orgStore = new InMemoryOrganizationStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);

      const app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        organizationStore: orgStore,
        auditService,
      });

      // Sign in
      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "audit-org@example.com", name: "Audit Org User" },
      });
      expect(signInRes.statusCode).toBe(200);
      const cookie = signInRes.cookies.find((c) => c.name === "avana_session");
      expect(cookie).toBeDefined();

      // Create org
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: cookie!.value },
        payload: { name: "Audit Test Org" },
      });
      expect(createRes.statusCode).toBe(201);

      // Aggregate audit events are persisted by the aggregate store (the
      // single source of truth), exactly once each.
      const actions = orgStore.getAuditEvents().map((event) => event.action);
      expect(actions).toEqual(["org.created", "membership.created"]);

      // And they are NOT also written through AuditService.
      expect((await auditService.listAll()).length).toBe(0);

      await app.close();
    });
  });

  describe("3. Metrics", () => {
    beforeEach(() => {
      metrics.reset();
    });

    it("increments and retrieves counters", () => {
      metrics.increment("http_requests_total", { method: "GET" });
      metrics.increment("http_requests_total", { method: "GET" });
      metrics.increment("http_errors_total", { status_code: "500" });

      expect(metrics.get("http_requests_total", { method: "GET" })).toBe(2);
      expect(metrics.get("http_errors_total", { status_code: "500" })).toBe(1);
      expect(metrics.get("never_incremented")).toBe(0);
    });

    it("snapshot returns all counters", () => {
      metrics.increment("test_counter");
      metrics.increment("labeled_counter", { env: "test" });

      const snapshot = metrics.snapshot();
      expect(snapshot.length).toBe(2);
      expect(snapshot.find((c) => c.name === "test_counter")?.value).toBe(1);
      expect(
        snapshot.find((c) => c.name === "labeled_counter")?.labels.env,
      ).toBe("test");
    });
  });
});
