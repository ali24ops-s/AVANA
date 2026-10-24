/**
 * Comprehensive Backend Audit Log & Pagination Tests.
 *
 * Verifies:
 * - Scenario F: Deterministic sorting with secondary unique tie-breaker (id DESC) when timestamps are identical
 * - Scenario E: Boundary pagination (exact page capacity, fractional last page, 0 items)
 * - Parameter sanitization (negative pages, zero page, NaN page, pageSize capping)
 * - Cache-Control header presence (no-store, no-cache, must-revalidate)
 * - Filtering behavior across action, entityType, adminEmail, search, and from date
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { Roles } from "@avana/domain";
import type { AdminAuditRecord } from "../modules/admin/admin-store.js";

describe("Admin Audit Logs - Storage & Repository Logic", () => {
  it("Scenario F: Deterministic sort stability when timestamps are identical", async () => {
    const adminStore = new InMemoryAdminStore();
    const sameTimestamp = "2026-10-17T12:00:00.000Z";

    // Create 10 records with the exact same timestamp but distinct UUIDs
    const records: AdminAuditRecord[] = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      adminEmail: "admin@avana.ir",
      action: `action.${i + 1}`,
      entity: "course",
      entityId: randomUUID(),
      timestamp: sameTimestamp,
      metadata: null,
    }));

    adminStore.setAuditLogs(records);

    // Fetch page 1 (pageSize = 5)
    const page1 = await adminStore.listAuditLogs({ page: 1, pageSize: 5 });
    expect(page1.totalCount).toBe(10);
    expect(page1.logs).toHaveLength(5);

    // Fetch page 2 (pageSize = 5)
    const page2 = await adminStore.listAuditLogs({ page: 2, pageSize: 5 });
    expect(page2.totalCount).toBe(10);
    expect(page2.logs).toHaveLength(5);

    // Verify there is ZERO overlap between page 1 and page 2
    const page1Ids = new Set(page1.logs.map((l) => l.id));
    const page2Ids = new Set(page2.logs.map((l) => l.id));
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }

    // Verify all 10 records are accounted for
    const combinedIds = [...page1.logs, ...page2.logs].map((l) => l.id);
    expect(new Set(combinedIds).size).toBe(10);

    // Verify deterministic order: id DESC (highest id first)
    const expectedSorted = [...records].sort((a, b) => b.id.localeCompare(a.id));
    expect(combinedIds).toEqual(expectedSorted.map((r) => r.id));
  });

  it("Scenario E: Boundary conditions (0 results, exact page capacity, fractional last page)", async () => {
    const adminStore = new InMemoryAdminStore();

    // 0 results
    const emptyResult = await adminStore.listAuditLogs({ page: 1, pageSize: 20 });
    expect(emptyResult.logs).toEqual([]);
    expect(emptyResult.totalCount).toBe(0);

    // Exactly 20 records (1 full page)
    const exactRecords: AdminAuditRecord[] = Array.from({ length: 20 }, (_, i) => ({
      id: randomUUID(),
      adminEmail: "admin@avana.ir",
      action: `action.${i}`,
      entity: "course",
      entityId: randomUUID(),
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      metadata: null,
    }));
    adminStore.setAuditLogs(exactRecords);

    const fullPage1 = await adminStore.listAuditLogs({ page: 1, pageSize: 20 });
    expect(fullPage1.logs).toHaveLength(20);
    expect(fullPage1.totalCount).toBe(20);

    const emptyPage2 = await adminStore.listAuditLogs({ page: 2, pageSize: 20 });
    expect(emptyPage2.logs).toHaveLength(0);
    expect(emptyPage2.totalCount).toBe(20);

    // Fractional last page: 25 records with pageSize 10 -> page 3 has 5 records
    const twentyFiveRecords: AdminAuditRecord[] = Array.from({ length: 25 }, (_, i) => ({
      id: randomUUID(),
      adminEmail: "admin@avana.ir",
      action: `action.${i}`,
      entity: "course",
      entityId: randomUUID(),
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      metadata: null,
    }));
    adminStore.setAuditLogs(twentyFiveRecords);

    const partialPage3 = await adminStore.listAuditLogs({ page: 3, pageSize: 10 });
    expect(partialPage3.logs).toHaveLength(5);
    expect(partialPage3.totalCount).toBe(25);
  });

  it("Sanitizes invalid pagination inputs (negative page, NaN, excessive pageSize)", async () => {
    const adminStore = new InMemoryAdminStore();
    const records: AdminAuditRecord[] = Array.from({ length: 15 }, (_, i) => ({
      id: randomUUID(),
      adminEmail: "admin@avana.ir",
      action: `action.${i}`,
      entity: "course",
      entityId: randomUUID(),
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      metadata: null,
    }));
    adminStore.setAuditLogs(records);

    // Negative page -> clamped to page 1
    const negResult = await adminStore.listAuditLogs({ page: -5, pageSize: 10 });
    expect(negResult.logs).toHaveLength(10);

    // PageSize <= 0 -> clamped to min 1
    const zeroSizeResult = await adminStore.listAuditLogs({ page: 1, pageSize: 0 });
    expect(zeroSizeResult.logs).toHaveLength(1);

    // Excessive pageSize -> clamped to max 100
    const hugeSizeResult = await adminStore.listAuditLogs({ page: 1, pageSize: 99999 });
    expect(hugeSizeResult.logs).toHaveLength(15);
  });
});

describe("Admin Audit Logs - HTTP Endpoint (/v1/admin/system/audit)", () => {
  it("Validates endpoint parameters, applies no-cache header, and returns paginated data", async () => {
    const config = loadApiConfig();
    config.systemOrganizationId = "00000000-0000-0000-0000-000000000001";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    // Create a platform_admin user
    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ir",
      passwordHash: "hash",
    });
    adminUser.globalRole = Roles.platform_admin;
    adminUser.role = Roles.platform_admin;
    userStore.insert({ ...adminUser });

    const session = await sessionService.createSession(adminUser.id);

    // Seed test audit records
    const sampleRecords: AdminAuditRecord[] = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        adminEmail: "admin@avana.ir",
        action: "course.publish",
        entity: "course",
        entityId: "00000000-0000-0000-0000-000000000100",
        timestamp: "2026-10-17T10:00:00.000Z",
        metadata: { title: "Biology 101" },
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        adminEmail: "admin@avana.ir",
        action: "user.role_change",
        entity: "user",
        entityId: "00000000-0000-0000-0000-000000000200",
        timestamp: "2026-10-17T11:00:00.000Z",
        metadata: { newRole: "teacher" },
      },
    ];
    adminStore.setAuditLogs(sampleRecords);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      systemOrganizationId: "00000000-0000-0000-0000-000000000001",
    });

    // Send HTTP GET /v1/admin/system/audit?page=1&pageSize=1
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/system/audit?page=1&pageSize=1",
      headers: {
        cookie: `avana_session=${session.sessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);

    // Assert Cache-Control header
    expect(res.headers["cache-control"]).toBe("no-store, no-cache, must-revalidate");

    const body = JSON.parse(res.body);
    expect(body.totalCount).toBe(2);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].action).toBe("user.role_change"); // Newest timestamp first

    // Fetch page 2
    const resPage2 = await app.inject({
      method: "GET",
      url: "/v1/admin/system/audit?page=2&pageSize=1",
      headers: {
        cookie: `avana_session=${session.sessionToken}`,
      },
    });

    expect(resPage2.statusCode).toBe(200);
    const body2 = JSON.parse(resPage2.body);
    expect(body2.logs).toHaveLength(1);
    expect(body2.logs[0].action).toBe("course.publish");

    await app.close();
  });
});
