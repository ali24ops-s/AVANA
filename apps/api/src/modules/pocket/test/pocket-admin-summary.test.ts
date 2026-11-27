import { describe, it, expect } from "vitest";
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

const STUDENT_ACTOR: Actor = {
  userId: "student-1" as Actor["userId"],
  role: "student",
  globalRole: null,
  teacherStatus: null,
};

describe("PocketAdminService & GET /v1/pocket/admin/summary (Phase 2.1)", () => {
  it("denies access to non-platform_admin actors at service level", async () => {
    const store = new InMemoryPocketAdminStore();
    const service = new PocketAdminService({ adminStore: store });

    await expect(service.getDashboardSummary(TEACHER_ACTOR)).rejects.toThrow(/platform_admin/i);
    await expect(service.getDashboardSummary(STUDENT_ACTOR)).rejects.toThrow(/platform_admin/i);
  });

  it("returns zeroed counts cleanly on an empty database", async () => {
    const store = new InMemoryPocketAdminStore();
    const service = new PocketAdminService({ adminStore: store });

    const summary = await service.getDashboardSummary(PLATFORM_ADMIN);
    expect(summary.assertions).toEqual({
      total: 0,
      draft: 0,
      inReview: 0,
      reviewed: 0,
      verified: 0,
      published: 0,
      superseded: 0,
      retired: 0,
    });
    expect(summary.clinical).toEqual({
      evaluatedAssertionsCount: 0,
      quorumMetCount: 0,
      quorumNotMetCount: 0,
      activeConflictCount: 0,
      activeSafetyOverrideCount: 0,
      verificationBlockedCount: 0,
    });
    expect(summary.operations).toEqual({
      activeReviewerCredentialsCount: 0,
      activeSafetyOverridesCount: 0,
    });
    expect(typeof summary.generatedAt).toBe("string");
  });

  it("computes assertion counts, Resolver clinical metrics, and operational counts without double counting", async () => {
    const futureDate = new Date(Date.now() + 86_400_000 * 30);
    const pastDate = new Date(Date.now() - 86_400_000);
    const now = new Date();

    const store = new InMemoryPocketAdminStore({
      assertions: [
        { id: "a-draft", status: "draft", aggregateType: "drug", aggregateId: "drug-1", assertionType: "general_info" },
        { id: "a-in-review", status: "in_review", aggregateType: "drug", aggregateId: "drug-1", assertionType: "dosing" },
        // general_info requires 1 approval -> quorum met, clinically verified
        { id: "a-reviewed", status: "reviewed", aggregateType: "drug", aggregateId: "drug-1", assertionType: "general_info" },
        // dosing requires 2 approvals -> only 1 approval -> quorum not met, blocked
        { id: "a-verified", status: "verified", aggregateType: "drug", aggregateId: "drug-1", assertionType: "dosing" },
        // published general_info with 1 approval, BUT has active conflict AND active safety override
        { id: "a-published", status: "published", aggregateType: "drug", aggregateId: "drug-2", assertionType: "general_info" },
        { id: "a-superseded", status: "superseded", aggregateType: "drug", aggregateId: "drug-1", assertionType: "general_info" },
        { id: "a-retired", status: "retired", aggregateType: "drug", aggregateId: "drug-1", assertionType: "general_info" },
      ],
      credentials: [
        // 1 active credential
        { id: "c-1", userId: "rev-1", isActive: true, suspendedAt: null, licenseExpiresAt: futureDate },
        // suspended credential (excluded from active count)
        { id: "c-2", userId: "rev-2", isActive: false, suspendedAt: now, licenseExpiresAt: futureDate },
        // expired credential (excluded from active count)
        { id: "c-3", userId: "rev-3", isActive: true, suspendedAt: null, licenseExpiresAt: pastDate },
      ],
      verifications: [
        { id: "v-1", assertionId: "a-reviewed", reviewerUserId: "rev-1", verificationAction: "clinical_verified", verifiedAt: now },
        { id: "v-2", assertionId: "a-verified", reviewerUserId: "rev-1", verificationAction: "clinical_verified", verifiedAt: now },
        { id: "v-3", assertionId: "a-published", reviewerUserId: "rev-1", verificationAction: "clinical_verified", verifiedAt: now },
      ],
      conflicts: [
        { id: "conf-1", assertionAId: "a-published", assertionBId: "a-reviewed", status: "active_discrepancy" },
      ],
      safetyOverrides: [
        // active override on drug-2 (affects a-published)
        { id: "ovr-1", targetEntityType: "drug", targetEntityId: "drug-2", actionState: "active", isActive: true },
        // cleared override (excluded)
        { id: "ovr-2", targetEntityType: "drug", targetEntityId: "drug-1", actionState: "cleared", isActive: false },
      ],
    });

    const service = new PocketAdminService({ adminStore: store });
    const summary = await service.getDashboardSummary(PLATFORM_ADMIN);

    expect(summary.assertions).toEqual({
      total: 7,
      draft: 1,
      inReview: 1,
      reviewed: 1,
      verified: 1,
      published: 1,
      superseded: 1,
      retired: 1,
    });

    // Evaluated assertions = reviewed + verified + published = 3
    // a-reviewed: quorumMet=true, hasActiveConflict=true (part of conf-1!), override=false -> blocked
    // a-verified: quorumMet=false, conflict=false, override=false -> blocked
    // a-published: quorumMet=true, conflict=true, override=true -> blocked
    expect(summary.clinical).toEqual({
      evaluatedAssertionsCount: 3,
      quorumMetCount: 2,
      quorumNotMetCount: 1,
      activeConflictCount: 2,
      activeSafetyOverrideCount: 1,
      verificationBlockedCount: 3,
    });

    expect(summary.operations).toEqual({
      activeReviewerCredentialsCount: 1,
      activeSafetyOverridesCount: 1,
    });
  });

  it("enforces platform_admin HTTP authorization and no-store cache headers on GET /v1/pocket/admin/summary", async () => {
    const store = new InMemoryPocketAdminStore();
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

    // 1. Unauthenticated -> 401
    const unauthRes = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/summary",
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Non-admin -> 403
    const teacherRes = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/summary",
      headers: { authorization: "Bearer teacher-token" },
    });
    expect(teacherRes.statusCode).toBe(403);

    // 3. platform_admin -> 200 with no-store headers and no reviewer PII
    const adminRes = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/summary",
      headers: { authorization: "Bearer admin-token" },
    });
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.headers["cache-control"]).toContain("no-store");
    const body = adminRes.json();
    expect(body.success).toBe(true);
    expect(body.data.assertions.total).toBe(0);
    expect(JSON.stringify(body)).not.toContain("reviewerUserId");
    expect(JSON.stringify(body)).not.toContain("medicalLicenseNumber");
  });
});
