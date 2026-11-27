import { describe, it, expect, vi } from "vitest";
import fastify from "fastify";
import type { Actor } from "@avana/domain";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import { InMemoryPocketAdminStore } from "../pocket-admin-store.js";
import { PocketAdminService } from "../pocket-admin-service.js";
import { pocketAdminRoutes } from "../pocket-admin-routes.js";

const PLATFORM_ADMIN: Actor = {
  userId: "admin-1" as Actor["userId"],
  role: "platform_admin",
  globalRole: "platform_admin",
  teacherStatus: null,
};

const TEACHER_ACTOR: Actor = {
  userId: "teacher-1" as Actor["userId"],
  role: "teacher",
  globalRole: null,
  teacherStatus: "approved",
};

describe("PocketAdminService.listAssertions & GET /v1/pocket/admin/assertions (Phase 2.2)", () => {
  it("denies access to non-platform_admin actors", async () => {
    const store = new InMemoryPocketAdminStore();
    const service = new PocketAdminService({ adminStore: store });

    await expect(service.listAssertions(TEACHER_ACTOR)).rejects.toThrow(/platform_admin/i);
  });

  it("returns empty items and zero totalCount on an empty database", async () => {
    const store = new InMemoryPocketAdminStore();
    const service = new PocketAdminService({ adminStore: store });

    const res = await service.listAssertions(PLATFORM_ADMIN);
    expect(res).toEqual({
      items: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
    });
  });

  it("supports status filter, aggregateType filter, search, sorting, pagination, and batch Resolver without N+1", async () => {
    const now = new Date();
    const futureDate = new Date(Date.now() + 86_400_000 * 30);

    const store = new InMemoryPocketAdminStore({
      assertions: [
        {
          id: "a-1",
          assertionKey: "amoxicillin-dosing-adult",
          statementText: "دوز استاندارد آموکسی‌سیلین در بزرگسالان",
          status: "in_review",
          aggregateType: "drug",
          aggregateId: "drug-1",
          aggregateTitleFa: "آموکسی‌سیلین",
          assertionType: "dosing",
          createdAt: new Date("2026-01-01T10:00:00Z"),
          updatedAt: new Date("2026-01-05T10:00:00Z"),
        },
        {
          id: "a-2",
          assertionKey: "asthma-general-info",
          statementText: "تعریف بالینی آسم مزمن",
          status: "published",
          aggregateType: "disease",
          aggregateId: "dis-1",
          aggregateTitleFa: "آسم",
          assertionType: "general_info",
          createdAt: new Date("2026-01-02T10:00:00Z"),
          updatedAt: new Date("2026-01-06T10:00:00Z"),
        },
        {
          id: "a-3",
          assertionKey: "amoxicillin-peds-dosing",
          statementText: "دوز کودکان آموکسی‌سیلین",
          status: "in_review",
          aggregateType: "drug",
          aggregateId: "drug-1",
          aggregateTitleFa: "آموکسی‌سیلین",
          assertionType: "dosing",
          createdAt: new Date("2026-01-03T10:00:00Z"),
          updatedAt: new Date("2026-01-07T10:00:00Z"),
        },
      ],
      credentials: [
        { id: "c-1", userId: "rev-1", isActive: true, suspendedAt: null, licenseExpiresAt: futureDate },
      ],
      verifications: [
        { id: "v-1", assertionId: "a-2", reviewerUserId: "rev-1", verificationAction: "clinical_verified", verifiedAt: now },
      ],
    });

    const resolverSpy = vi.spyOn(store, "resolveVerificationSummaries");
    const service = new PocketAdminService({ adminStore: store });

    // 1. Filter by status + aggregateType + search + pagination
    const page1 = await service.listAssertions(PLATFORM_ADMIN, {
      status: "in_review",
      aggregateType: "drug",
      q: "آموکسی",
      sortBy: "updatedAt",
      sortOrder: "desc",
      limit: 1,
      offset: 0,
    });

    expect(page1.totalCount).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0].id).toBe("a-3");
    expect(page1.items[0].clinicalSummary.quorumSatisfied).toBe(false);
    expect(page1.items[0].clinicalSummary.requiredApprovals).toBe(2);

    // Resolver called exactly ONCE for the page (no N+1)
    expect(resolverSpy).toHaveBeenCalledTimes(1);

    // 2. Page 2
    const page2 = await service.listAssertions(PLATFORM_ADMIN, {
      status: "in_review",
      aggregateType: "drug",
      q: "آموکسی",
      sortBy: "updatedAt",
      sortOrder: "desc",
      limit: 1,
      offset: 1,
    });
    expect(page2.totalCount).toBe(2);
    expect(page2.items[0].id).toBe("a-1");

    // 3. Published item clinical summary from Resolver
    const pubRes = await service.listAssertions(PLATFORM_ADMIN, { status: "published" });
    expect(pubRes.items[0].clinicalSummary.isClinicallyVerified).toBe(true);
    expect(pubRes.items[0].clinicalSummary.quorumSatisfied).toBe(true);
  });

  it("enforces platform_admin HTTP authorization and strips sensitive reviewer PII on GET /v1/pocket/admin/assertions", async () => {
    const futureDate = new Date(Date.now() + 86_400_000 * 30);
    const store = new InMemoryPocketAdminStore({
      assertions: [
        {
          id: "a-1",
          assertionKey: "test-key",
          statementText: "Test statement",
          status: "reviewed",
          aggregateType: "drug",
          aggregateId: "drug-1",
          assertionType: "general_info",
        },
      ],
      credentials: [
        { id: "c-1", userId: "secret-reviewer-id", isActive: true, suspendedAt: null, licenseExpiresAt: futureDate },
      ],
      verifications: [
        { id: "v-1", assertionId: "a-1", reviewerUserId: "secret-reviewer-id", verificationAction: "clinical_verified", verifiedAt: new Date() },
      ],
    });
    const service = new PocketAdminService({ adminStore: store });

    const app = fastify();
    await app.register(errorHandlerPlugin);

    const mockSessionService = {
      validateSessionDetails: async (token: string) => {
        if (token === "admin-token") {
          return { valid: true, revoked: false, renewed: false, user: { userId: "admin-1" } };
        }
        if (token === "teacher-token") {
          return { valid: true, revoked: false, renewed: false, user: { userId: "teacher-1" } };
        }
        return { valid: false, revoked: false, renewed: false, user: null };
      },
      getConfig: () => ({ cookieName: "avana_session" }),
    };

    const mockUserStore = {
      findById: async (id: string) => {
        if (id === "admin-1") {
          return { id: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" };
        }
        if (id === "teacher-1") {
          return { id: "teacher-1", email: "teacher@avana.ir", role: "teacher", globalRole: null };
        }
        return null;
      },
    };

    await app.register(pocketAdminRoutes, {
      pocketAdminService: service,
      sessionService: mockSessionService as never,
      userStore: mockUserStore as never,
    });

    const unauthRes = await app.inject({ method: "GET", url: "/v1/pocket/admin/assertions" });
    expect(unauthRes.statusCode).toBe(401);

    const teacherRes = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/assertions",
      headers: { authorization: "Bearer teacher-token" },
    });
    expect(teacherRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/assertions?status=reviewed",
      headers: { authorization: "Bearer admin-token" },
    });
    expect(adminRes.statusCode).toBe(200);
    const body = adminRes.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("secret-reviewer-id");
    expect(JSON.stringify(body)).not.toContain("reviewerUserId");
  });
});
