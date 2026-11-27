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

describe("PocketAdminService.getAssertionDetail & GET /v1/pocket/admin/assertions/:id (Phase 2.3)", () => {
  it("denies access to non-platform_admin actors", async () => {
    const store = new InMemoryPocketAdminStore();
    const service = new PocketAdminService({ adminStore: store });

    await expect(service.getAssertionDetail(TEACHER_ACTOR, "a-1")).rejects.toThrow(
      /platform_admin/i,
    );
  });

  it("throws not_found when assertion does not exist", async () => {
    const store = new InMemoryPocketAdminStore();
    const service = new PocketAdminService({ adminStore: store });

    await expect(service.getAssertionDetail(PLATFORM_ADMIN, "missing-id")).rejects.toThrow(
      /not found/i,
    );
  });

  it("returns assertion detail, citations, versions, Resolver summary, conflicts, and history without reviewer PII", async () => {
    const futureDate = new Date(Date.now() + 86_400_000 * 30);
    const now = new Date("2026-11-26T10:00:00Z");

    const store = new InMemoryPocketAdminStore({
      assertions: [
        {
          id: "a-v1",
          assertionRootId: "root-1",
          versionNumber: 1,
          previousVersionId: null,
          assertionKey: "amoxicillin-dosing",
          statementText: "نسخه اول دوز آموکسی‌سیلین",
          status: "superseded",
          aggregateType: "drug",
          aggregateId: "drug-1",
          aggregateTitleFa: "آموکسی‌سیلین",
          aggregateTitleEn: "Amoxicillin",
          assertionType: "dosing",
          supersededAt: now,
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
        {
          id: "a-v2",
          assertionRootId: "root-1",
          versionNumber: 2,
          previousVersionId: "a-v1",
          assertionKey: "amoxicillin-dosing",
          statementText: "نسخه دوم دوز آموکسی‌سیلین",
          status: "published",
          aggregateType: "drug",
          aggregateId: "drug-1",
          aggregateTitleFa: "آموکسی‌سیلین",
          aggregateTitleEn: "Amoxicillin",
          assertionType: "dosing",
          targetPopulation: "adults",
          clinicalSetting: "outpatient",
          jurisdiction: "IR",
          createdAt: now,
          updatedAt: now,
        },
      ],
      credentials: [
        { id: "c-1", userId: "secret-rev-1", isActive: true, suspendedAt: null, licenseExpiresAt: futureDate },
        { id: "c-2", userId: "secret-rev-2", isActive: true, suspendedAt: null, licenseExpiresAt: futureDate },
      ],
      verifications: [
        { id: "v-1", assertionId: "a-v2", reviewerUserId: "secret-rev-1", verificationAction: "clinical_verified", verifiedAt: now },
        { id: "v-2", assertionId: "a-v2", reviewerUserId: "secret-rev-2", verificationAction: "clinical_verified", verifiedAt: now },
      ],
      conflicts: [
        {
          id: "conf-1",
          assertionAId: "a-v2",
          assertionBId: "a-other",
          conflictSubject: "تداخل دارویی",
          discrepancyDescription: "اختلاف در دوز کلیوی",
          status: "active_discrepancy",
          createdAt: now,
        },
      ],
      citationsByAssertionId: {
        "a-v2": [
          {
            id: "cit-1",
            sourceId: "src-1",
            sourceCode: "UPTODATE-2026",
            sourceTitle: "UpToDate Clinical Reference",
            publisher: "Wolters Kluwer",
            sourceType: "clinical_guideline",
            editionOrVersion: "2026.1",
            publicationDate: "2026-01-01",
            doi: "10.1000/xyz",
            canonicalUrl: "https://example.com/uptodate",
            sourceAuditStatus: "approved",
            locationReference: "Section 3, Table 2",
            sourceSnapshotUrl: null,
            accessedAt: "2026-11-20",
            evidenceGrade: "A",
            citationStatus: "verified",
          },
        ],
      },
      historyByAssertionId: {
        "a-v2": [
          {
            id: "hist-1",
            assertionId: "a-v2",
            action: "published",
            previousStatus: "verified",
            newStatus: "published",
            clinicalNotes: "تأیید نهایی برای انتشار",
            createdAt: now.toISOString(),
          },
        ],
      },
    });

    const resolverSpy = vi.spyOn(store, "resolveVerificationSummaries");
    const service = new PocketAdminService({ adminStore: store });
    const detail = await service.getAssertionDetail(PLATFORM_ADMIN, "a-v2");

    expect(resolverSpy).toHaveBeenCalledTimes(1);
    expect(detail.assertion.id).toBe("a-v2");
    expect(detail.assertion.targetPopulation).toBe("adults");
    expect(detail.clinicalSummary.quorumSatisfied).toBe(true);
    expect(detail.clinicalSummary.validApprovalCount).toBe(2);
    expect(detail.clinicalSummary.hasActiveConflict).toBe(true);
    expect(detail.citations).toHaveLength(1);
    expect(detail.citations[0].sourceTitle).toBe("UpToDate Clinical Reference");
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions[0].isActivePublished).toBe(true);
    expect(detail.versions[1].status).toBe("superseded");
    expect(detail.conflicts).toHaveLength(1);
    expect(detail.history).toHaveLength(1);

    // Ensure no reviewer PII is exposed
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("secret-rev-1");
    expect(serialized).not.toContain("secret-rev-2");
    expect(serialized).not.toContain("reviewerUserId");
    expect(serialized).not.toContain("actorUserId");
  });

  it("enforces HTTP authorization and 404 on GET /v1/pocket/admin/assertions/:id", async () => {
    const store = new InMemoryPocketAdminStore({
      assertions: [
        {
          id: "a-1",
          assertionKey: "test-key",
          statementText: "Test statement",
          status: "draft",
          aggregateType: "drug",
          aggregateId: "drug-1",
          assertionType: "general_info",
        },
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

    const unauth = await app.inject({ method: "GET", url: "/v1/pocket/admin/assertions/a-1" });
    expect(unauth.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/assertions/a-1",
      headers: { authorization: "Bearer teacher-token" },
    });
    expect(forbidden.statusCode).toBe(403);

    const notFound = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/assertions/missing",
      headers: { authorization: "Bearer admin-token" },
    });
    expect(notFound.statusCode).toBe(404);

    const ok = await app.inject({
      method: "GET",
      url: "/v1/pocket/admin/assertions/a-1",
      headers: { authorization: "Bearer admin-token" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.assertion.id).toBe("a-1");
  });
});
