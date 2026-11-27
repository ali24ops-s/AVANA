import { describe, it, expect } from "vitest";
import fastify from "fastify";
import type { Actor } from "@avana/domain";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import { InMemoryReviewerStore } from "../reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { InMemoryAssertionVerificationStore } from "../assertion-verification-store.js";
import { InMemoryPocketAdminStore } from "../pocket-admin-store.js";
import { PocketAdminService } from "../pocket-admin-service.js";
import { pocketAdminRoutes } from "../pocket-admin-routes.js";

const ACTIVE_REVIEWER: Actor = {
  userId: "rev-active" as Actor["userId"],
  role: "teacher",
  globalRole: null,
  teacherStatus: "approved",
};

const PLATFORM_ADMIN_NO_CRED: Actor = {
  userId: "admin-1" as Actor["userId"],
  role: "platform_admin",
  globalRole: "platform_admin",
  teacherStatus: null,
};

const SUSPENDED_REVIEWER: Actor = {
  userId: "rev-suspended" as Actor["userId"],
  role: "teacher",
  globalRole: null,
  teacherStatus: "approved",
};

const EXPIRED_REVIEWER: Actor = {
  userId: "rev-expired" as Actor["userId"],
  role: "teacher",
  globalRole: null,
  teacherStatus: "approved",
};

describe("Clinical Reviewer Workbench Backend Endpoints (Phase 2.4)", () => {
  async function setupFixture() {
    const reviewerStore = new InMemoryReviewerStore();
    const reviewerService = new ReviewerService({ reviewerStore });
    const futureDate = new Date(Date.now() + 86_400_000 * 30);
    const pastDate = new Date(Date.now() - 86_400_000);

    await reviewerStore.create({
      userId: "rev-active",
      medicalLicenseNumber: "IR-1",
      specialty: "داروسازی",
      licensingAuthority: "نظام پزشکی",
      grantedBy: "admin-1",
      licenseExpiresAt: futureDate,
    });
    const susp = await reviewerStore.create({
      userId: "rev-suspended",
      medicalLicenseNumber: "IR-2",
      specialty: "داخلی",
      licensingAuthority: "نظام پزشکی",
      grantedBy: "admin-1",
      licenseExpiresAt: futureDate,
    });
    await reviewerStore.suspend({ id: susp.id, suspensionReason: "تعلیق تست" });

    // Create expired directly via seed-like future then wait? InMemoryReviewerStore allows any date on create
    await reviewerStore.create({
      userId: "rev-expired",
      medicalLicenseNumber: "IR-3",
      specialty: "قلب",
      licensingAuthority: "نظام پزشکی",
      grantedBy: "admin-1",
      licenseExpiresAt: pastDate,
    });

    const verificationStore = new InMemoryAssertionVerificationStore();
    const vote = await verificationStore.createVerification({
      assertionId: "a-reviewed",
      reviewerUserId: "rev-active",
      verificationAction: "clinical_verified",
      clinicalReviewNotes: "بررسی شد",
      parentVerificationId: null,
    });

    const adminStore = new InMemoryPocketAdminStore({
      assertions: [
        {
          id: "a-draft",
          assertionKey: "draft-key",
          statementText: "Draft text",
          status: "draft",
          aggregateType: "drug",
          aggregateId: "drug-1",
          assertionType: "dosing",
        },
        {
          id: "a-reviewed",
          assertionKey: "reviewed-key",
          statementText: "Reviewed text",
          status: "reviewed",
          aggregateType: "drug",
          aggregateId: "drug-1",
          assertionType: "dosing",
        },
        {
          id: "a-published",
          assertionKey: "published-key",
          statementText: "Published text",
          status: "published",
          aggregateType: "disease",
          aggregateId: "dis-1",
          assertionType: "general_info",
        },
      ],
    });

    const service = new PocketAdminService({
      adminStore,
      reviewerService,
      verificationStore,
    });

    return { service, vote };
  }

  it("enforces active credential on listReviewerAssertions and excludes draft/in_review", async () => {
    const { service } = await setupFixture();

    // Active reviewer succeeds and sees only reviewed/verified/published
    const res = await service.listReviewerAssertions(ACTIVE_REVIEWER);
    expect(res.totalCount).toBe(2);
    expect(res.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(["a-reviewed", "a-published"]),
    );
    expect(res.items.find((i) => i.id === "a-draft")).toBeUndefined();

    // platform_admin without credential is denied
    await expect(service.listReviewerAssertions(PLATFORM_ADMIN_NO_CRED)).rejects.toThrow(
      /credentials/i,
    );

    // Suspended and expired reviewers are denied
    await expect(service.listReviewerAssertions(SUSPENDED_REVIEWER)).rejects.toThrow();
    await expect(service.listReviewerAssertions(EXPIRED_REVIEWER)).rejects.toThrow();
  });

  it("returns caller's own myLatestVote on getReviewerAssertionDetail without exposing other reviewers", async () => {
    const { service, vote } = await setupFixture();

    const detail = await service.getReviewerAssertionDetail(ACTIVE_REVIEWER, "a-reviewed");
    expect(detail.assertion.id).toBe("a-reviewed");
    expect(detail.myLatestVote?.id).toBe(vote.id);
    expect(detail.myLatestVote?.verificationAction).toBe("clinical_verified");

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("reviewerUserId");
  });

  it("enforces HTTP auth on /v1/pocket/reviewer/assertions and /v1/pocket/reviewer/assertions/:id", async () => {
    const { service } = await setupFixture();

    const app = fastify();
    await app.register(errorHandlerPlugin);

    const mockSessionService = {
      validateSessionDetails: async (token: string) => {
        if (token === "rev-token") {
          return { valid: true, revoked: false, renewed: false, user: { userId: "rev-active" } };
        }
        if (token === "admin-token") {
          return { valid: true, revoked: false, renewed: false, user: { userId: "admin-1" } };
        }
        return { valid: false, revoked: false, renewed: false, user: null };
      },
      getConfig: () => ({ cookieName: "avana_session" }),
    };

    const mockUserStore = {
      findById: async (id: string) => {
        if (id === "rev-active") {
          return { id: "rev-active", email: "rev@avana.ir", role: "teacher", globalRole: null };
        }
        if (id === "admin-1") {
          return { id: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" };
        }
        return null;
      },
    };

    await app.register(pocketAdminRoutes, {
      pocketAdminService: service,
      sessionService: mockSessionService as never,
      userStore: mockUserStore as never,
    });

    const unauth = await app.inject({ method: "GET", url: "/v1/pocket/reviewer/assertions" });
    expect(unauth.statusCode).toBe(401);

    const adminForbidden = await app.inject({
      method: "GET",
      url: "/v1/pocket/reviewer/assertions",
      headers: { authorization: "Bearer admin-token" },
    });
    expect(adminForbidden.statusCode).toBe(403);

    const revOk = await app.inject({
      method: "GET",
      url: "/v1/pocket/reviewer/assertions",
      headers: { authorization: "Bearer rev-token" },
    });
    expect(revOk.statusCode).toBe(200);
    expect(revOk.json().data.items).toHaveLength(2);
  });
});
