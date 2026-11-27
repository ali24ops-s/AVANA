/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { DomainError, type Actor } from "@avana/domain";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import {
  users,
  pocketDrugs,
  pocketScientificAssertions,
  pocketAssertionAuditLog,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import { InMemoryReviewerStore } from "../reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import {
  InMemoryAssertionReviewStore,
  type AssertionReviewStore,
} from "../assertion-review-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { AssertionReviewService } from "../assertion-review-service.js";
import { pocketAssertionReviewRoutes } from "../assertion-review-routes.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket Phase 2C-1: Assertion Review Workflow", () => {
  const adminUserId = randomUUID();
  const teacherUserId = randomUUID();
  const studentUserId = randomUUID();

  const adminActor: Actor = {
    userId: adminUserId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const teacherActor: Actor = {
    userId: teacherUserId as Actor["userId"],
    role: "teacher",
    globalRole: null,
    teacherStatus: "approved",
  };

  const studentActor: Actor = {
    userId: studentUserId as Actor["userId"],
    role: "student",
    globalRole: null,
  };

  let store: InMemoryAssertionReviewStore;
  let service: AssertionReviewService;

  beforeEach(() => {
    store = new InMemoryAssertionReviewStore();
    service = new AssertionReviewService({ assertionReviewStore: store });
  });

  // Helper to create a valid draft assertion
  const createValidDraft = async (overrides?: Record<string, unknown>) => {
    return await store.create({
      assertionKey: "dosing.adult.initial",
      assertionType: "dosing_rule",
      statementText: "Initial adult dose of Amoxicillin is 500mg PO q8h.",
      drugId: randomUUID(),
      status: "draft",
      ...overrides,
    });
  };

  // ===========================================================================
  // 1. Service & State Machine Unit Tests
  // ===========================================================================

  describe("Service & State Machine Invariants", () => {
    // -------------------------------------------------------------------------
    // 1. Successful submission of draft assertion for review
    // -------------------------------------------------------------------------
    it("1. successfully submits a draft assertion for review and creates audit entry", async () => {
      const draft = await createValidDraft();

      const result = await service.submitForReview(teacherActor, {
        assertionId: draft.id,
        notes: "Ready for initial peer review",
      });

      expect(result.assertion.id).toBe(draft.id);
      expect(result.assertion.status).toBe("in_review");
      expect(result.assertion.updatedAt.getTime()).toBeGreaterThanOrEqual(draft.updatedAt.getTime());

      expect(result.auditLog).toBeDefined();
      expect(result.auditLog.assertionId).toBe(draft.id);
      expect(result.auditLog.actorUserId).toBe(teacherUserId);
      expect(result.auditLog.action).toBe("submitted_for_review");
      expect(result.auditLog.previousStatus).toBe("draft");
      expect(result.auditLog.newStatus).toBe("in_review");
      expect(result.auditLog.clinicalNotes).toBe("Ready for initial peer review");
    });

    // -------------------------------------------------------------------------
    // 2. Reject invalid assertion submissions
    // -------------------------------------------------------------------------
    it("2a. rejects submission if statement text is empty or whitespace", async () => {
      const invalidDraft = await createValidDraft({ statementText: "   " });

      await expect(
        service.submitForReview(teacherActor, { assertionId: invalidDraft.id }),
      ).rejects.toThrow(DomainError);

      try {
        await service.submitForReview(teacherActor, { assertionId: invalidDraft.id });
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
        expect((err as DomainError).message).toContain("statement text is empty");
      }
    });

    it("2b. rejects submission if assertion key is missing", async () => {
      const invalidDraft = await createValidDraft({ assertionKey: "" });

      await expect(
        service.submitForReview(teacherActor, { assertionId: invalidDraft.id }),
      ).rejects.toThrow(DomainError);

      try {
        await service.submitForReview(teacherActor, { assertionId: invalidDraft.id });
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
        expect((err as DomainError).message).toContain("assertion key is required");
      }
    });

    it("2c. rejects submission if clinical pillar arc is invalid (zero or multiple pillars)", async () => {
      // Zero pillars linked
      const zeroPillar = await createValidDraft({ drugId: null });
      await expect(
        service.submitForReview(teacherActor, { assertionId: zeroPillar.id }),
      ).rejects.toThrow(DomainError);

      // Multiple pillars linked
      const multiPillars = await createValidDraft({
        drugId: randomUUID(),
        diseaseId: randomUUID(),
      });
      await expect(
        service.submitForReview(teacherActor, { assertionId: multiPillars.id }),
      ).rejects.toThrow(DomainError);
    });

    // -------------------------------------------------------------------------
    // 3. Reject unauthorized status transitions
    // -------------------------------------------------------------------------
    it("3a. cannot record a review decision on a draft assertion (must be in_review)", async () => {
      const draft = await createValidDraft();

      await expect(
        service.recordReviewDecision(adminActor, {
          assertionId: draft.id,
          decision: "approve",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await service.recordReviewDecision(adminActor, {
          assertionId: draft.id,
          decision: "approve",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
        expect((err as DomainError).message).toContain("must be 'in_review'");
      }
    });

    it("3b. cannot submit an assertion that is already in_review", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      await expect(
        service.submitForReview(teacherActor, { assertionId: draft.id }),
      ).rejects.toThrow(DomainError);

      try {
        await service.submitForReview(teacherActor, { assertionId: draft.id });
      } catch (err) {
        expect((err as DomainError).code).toBe("conflict");
        expect((err as DomainError).message).toContain("already in review");
      }
    });

    it("3c. rejects invalid decision values", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      await expect(
        service.recordReviewDecision(adminActor, {
          assertionId: draft.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          decision: "invalid_decision" as any,
        }),
      ).rejects.toThrow(DomainError);
    });

    // -------------------------------------------------------------------------
    // 4. Correctly record review results
    // -------------------------------------------------------------------------
    it("4a. records review approval: transitions to 'reviewed'", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      const result = await service.recordReviewDecision(adminActor, {
        assertionId: draft.id,
        decision: "approve",
        notes: "Scientific statement verified against reference literature.",
      });

      expect(result.assertion.status).toBe("reviewed");
      expect(result.auditLog.action).toBe("review_approved");
      expect(result.auditLog.previousStatus).toBe("in_review");
      expect(result.auditLog.newStatus).toBe("reviewed");
      expect(result.auditLog.clinicalNotes).toContain("verified against reference literature");
    });

    it("4b. records review rejection with required notes: transitions back to 'draft'", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      const result = await service.recordReviewDecision(adminActor, {
        assertionId: draft.id,
        decision: "reject",
        notes: "Dosing frequency does not conform to updated 2026 guidelines.",
      });

      expect(result.assertion.status).toBe("draft");
      expect(result.auditLog.action).toBe("review_rejected");
      expect(result.auditLog.previousStatus).toBe("in_review");
      expect(result.auditLog.newStatus).toBe("draft");
      expect(result.auditLog.clinicalNotes).toContain("does not conform");

      // Verify it can now be edited and re-submitted
      const resubmitted = await service.submitForReview(teacherActor, {
        assertionId: draft.id,
        notes: "Corrected dosing frequency per reviewer feedback",
      });
      expect(resubmitted.assertion.status).toBe("in_review");
    });

    it("4c. records review request_changes with required notes: transitions to 'draft'", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      const result = await service.recordReviewDecision(adminActor, {
        assertionId: draft.id,
        decision: "request_changes",
        notes: "Clarify whether pediatric dosing is excluded.",
      });

      expect(result.assertion.status).toBe("draft");
      expect(result.auditLog.action).toBe("review_changes_requested");
      expect(result.auditLog.previousStatus).toBe("in_review");
      expect(result.auditLog.newStatus).toBe("draft");
    });

    it("4d. rejection or change request without notes is rejected with bad_request", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      await expect(
        service.recordReviewDecision(adminActor, {
          assertionId: draft.id,
          decision: "reject",
          notes: "",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await service.recordReviewDecision(adminActor, {
          assertionId: draft.id,
          decision: "reject",
          notes: "   ",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
        expect((err as DomainError).message).toContain("notes explaining the rejection");
      }
    });

    // -------------------------------------------------------------------------
    // 5. Withdraw review
    // -------------------------------------------------------------------------
    it("5. successfully withdraws an in-review assertion back to draft", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      const result = await service.withdrawReview(teacherActor, {
        assertionId: draft.id,
        reason: "Author noticed typographic error in dose magnitude",
      });

      expect(result.assertion.status).toBe("draft");
      expect(result.auditLog.action).toBe("review_withdrawn");
      expect(result.auditLog.previousStatus).toBe("in_review");
      expect(result.auditLog.newStatus).toBe("draft");
      expect(result.auditLog.clinicalNotes).toContain("typographic error");
    });

    // -------------------------------------------------------------------------
    // 6. Complete audit trail verification
    // -------------------------------------------------------------------------
    it("6. preserves complete chronological audit trail across full review lifecycle", async () => {
      const draft = await createValidDraft();

      // Step 1: Submit
      await service.submitForReview(teacherActor, {
        assertionId: draft.id,
        notes: "Initial submission",
      });

      // Step 2: Request changes
      await service.recordReviewDecision(adminActor, {
        assertionId: draft.id,
        decision: "request_changes",
        notes: "Need clarification on route",
      });

      // Step 3: Resubmit
      await service.submitForReview(teacherActor, {
        assertionId: draft.id,
        notes: "Route clarified as oral suspension",
      });

      // Step 4: Approve
      await service.recordReviewDecision(adminActor, {
        assertionId: draft.id,
        decision: "approve",
        notes: "Looks good and verified",
      });

      // Retrieve full history
      const { assertion, history } = await service.getAssertionWithHistory(adminActor, draft.id);

      expect(assertion.status).toBe("reviewed");
      expect(history).toHaveLength(4);

      expect(history[0].action).toBe("submitted_for_review");
      expect(history[0].previousStatus).toBe("draft");
      expect(history[0].newStatus).toBe("in_review");

      expect(history[1].action).toBe("review_changes_requested");
      expect(history[1].previousStatus).toBe("in_review");
      expect(history[1].newStatus).toBe("draft");

      expect(history[2].action).toBe("submitted_for_review");
      expect(history[2].previousStatus).toBe("draft");
      expect(history[2].newStatus).toBe("in_review");

      expect(history[3].action).toBe("review_approved");
      expect(history[3].previousStatus).toBe("in_review");
      expect(history[3].newStatus).toBe("reviewed");
    });

    // -------------------------------------------------------------------------
    // 7. Rollback if audit log insertion fails
    // -------------------------------------------------------------------------
    it("7. rolls back status transition if audit log recording fails", async () => {
      let rollbackOccurred = false;

      // Mock database transaction simulating rollback
      const failingDb = {
        transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
          try {
            await cb({});
          } catch (e) {
            rollbackOccurred = true;
            throw e;
          }
        },
      } as unknown as import("@avana/database/client").DbClient;

      const failingStore = {
        findById: () =>
          Promise.resolve({
            id: "mock-id",
            assertionRootId: "mock-root",
            versionNumber: 1,
            previousVersionId: null,
            drugId: randomUUID(),
            diseaseId: null,
            treatmentId: null,
            emergencyId: null,
            assertionType: "dosing_rule",
            assertionKey: "dosing.adult",
            statementText: "Sample statement",
            jurisdiction: "global",
            targetPopulation: "general_adult",
            clinicalSetting: "all",
            status: "draft" as const,
            releaseId: null,
            validUntilDate: null,
            supersededAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        updateStatus: () => Promise.resolve({} as never),
        insertAuditLog: () => {
          throw new Error("Audit log database failure");
        },
      } as unknown as AssertionReviewStore;

      const testService = new AssertionReviewService({
        assertionReviewStore: failingStore,
        db: failingDb,
      });

      await expect(
        testService.submitForReview(teacherActor, { assertionId: "mock-id" }),
      ).rejects.toThrow("Audit log database failure");

      expect(rollbackOccurred).toBe(true);
    });

    // -------------------------------------------------------------------------
    // 8. Immutability of published & superseded assertions
    // -------------------------------------------------------------------------
    it("8a. strictly prevents submitting or modifying a published assertion", async () => {
      const published = await createValidDraft({ status: "published" });

      await expect(
        service.submitForReview(teacherActor, { assertionId: published.id }),
      ).rejects.toThrow(DomainError);

      try {
        await service.submitForReview(teacherActor, { assertionId: published.id });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("published assertion");
      }
    });

    it("8b. strictly prevents submitting or modifying a superseded assertion", async () => {
      const superseded = await createValidDraft({ status: "superseded" });

      await expect(
        service.submitForReview(teacherActor, { assertionId: superseded.id }),
      ).rejects.toThrow(DomainError);

      try {
        await service.submitForReview(teacherActor, { assertionId: superseded.id });
      } catch (err) {
        expect((err as DomainError).code).toBe("conflict");
        expect((err as DomainError).message).toContain("superseded");
      }
    });

    // -------------------------------------------------------------------------
    // 9. Role-based access control & Student isolation
    // -------------------------------------------------------------------------
    it("9a. student cannot submit assertions for review", async () => {
      const draft = await createValidDraft();

      await expect(
        service.submitForReview(studentActor, { assertionId: draft.id }),
      ).rejects.toThrow(DomainError);

      try {
        await service.submitForReview(studentActor, { assertionId: draft.id });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("students cannot");
      }
    });

    it("9b. student cannot record review decisions", async () => {
      const draft = await createValidDraft();
      await service.submitForReview(teacherActor, { assertionId: draft.id });

      await expect(
        service.recordReviewDecision(studentActor, {
          assertionId: draft.id,
          decision: "approve",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await service.recordReviewDecision(studentActor, {
          assertionId: draft.id,
          decision: "approve",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
      }
    });
  });

  // ===========================================================================
  // 2. HTTP Route Integration Tests (Fastify inject)
  // ===========================================================================

  describe("HTTP Routes Integration (/v1/pocket/assertions)", () => {
    let app: FastifyInstance;
    let routeStore: InMemoryAssertionReviewStore;
    let routeService: AssertionReviewService;

    beforeEach(async () => {
      routeStore = new InMemoryAssertionReviewStore();
      routeService = new AssertionReviewService({ assertionReviewStore: routeStore });

      app = fastify();
      await app.register(errorHandlerPlugin);

      const mockSessionService = {
        validateSession: async (token: string) => {
          if (token === "token-admin") return { userId: adminUserId, role: "platform_admin", globalRole: "platform_admin" };
          if (token === "token-teacher") return { userId: teacherUserId, role: "teacher", globalRole: null };
          return { userId: studentUserId, role: "student", globalRole: null };
        },
        validateSessionDetails: async (token: string) => {
          let role = "student";
          let globalRole: string | null = null;
          let uid = studentUserId;
          if (token === "token-admin") {
            role = "platform_admin";
            globalRole = "platform_admin";
            uid = adminUserId;
          } else if (token === "token-teacher") {
            role = "teacher";
            uid = teacherUserId;
          }
          return {
            valid: true,
            revoked: false,
            user: { userId: uid, role, globalRole },
          };
        },
        getConfig: () => ({}),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

      const mockUserStore = {
        findById: async (id: string) => {
          if (id === adminUserId) return { id, email: "admin@avana.local", role: "platform_admin", globalRole: "platform_admin" };
          if (id === teacherUserId) return { id, email: "teacher@avana.local", role: "teacher", globalRole: null, teacherStatus: "approved" };
          return { id, email: "student@avana.local", role: "student", globalRole: null };
        },
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await app.register(pocketAssertionReviewRoutes, {
        assertionReviewService: routeService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await app.ready();
    });

    afterAll(async () => {
      await app?.close();
    });

    it("POST /v1/pocket/assertions/:id/submit-review succeeds for teacher", async () => {
      const draft = await routeStore.create({
        assertionKey: "dosing.pediatric",
        assertionType: "dosing_rule",
        statementText: "Pediatric dose is 25mg/kg/day divided q12h.",
        drugId: randomUUID(),
        status: "draft",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${draft.id}/submit-review`,
        headers: {
          authorization: "Bearer token-teacher",
        },
        payload: {
          notes: "Ready for clinical review",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.assertion.status).toBe("in_review");
      expect(json.data.auditLog.actorUserId).toBe(teacherUserId);
    });

    it("POST /v1/pocket/assertions/:id/submit-review returns 403 for student", async () => {
      const draft = await routeStore.create({
        assertionKey: "dosing.pediatric",
        assertionType: "dosing_rule",
        statementText: "Pediatric dose is 25mg/kg/day divided q12h.",
        drugId: randomUUID(),
        status: "draft",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${draft.id}/submit-review`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("POST /v1/pocket/assertions/:id/review-decision approves and transitions to reviewed", async () => {
      const draft = await routeStore.create({
        assertionKey: "dosing.adult.renal",
        assertionType: "renal_adjustment",
        statementText: "Reduce dose by 50% for CrCl < 30 mL/min.",
        drugId: randomUUID(),
        status: "in_review",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${draft.id}/review-decision`,
        headers: {
          authorization: "Bearer token-admin",
        },
        payload: {
          decision: "approve",
          notes: "Conforms with KDIGO guidelines.",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.assertion.status).toBe("reviewed");
      expect(json.data.auditLog.action).toBe("review_approved");
    });

    it("GET /v1/pocket/assertions/:id/history returns assertion and audit entries", async () => {
      const draft = await routeStore.create({
        assertionKey: "interactions.warfarin",
        assertionType: "drug_interaction",
        statementText: "Co-administration increases INR.",
        drugId: randomUUID(),
        status: "draft",
      });

      await routeService.submitForReview(teacherActor, {
        assertionId: draft.id,
        notes: "First submission",
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${draft.id}/history`,
        headers: {
          authorization: "Bearer token-teacher",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.assertion.id).toBe(draft.id);
      expect(json.data.history).toHaveLength(1);
      expect(json.data.history[0].action).toBe("submitted_for_review");
    });
  });

  // ===========================================================================
  // 2b. Phase 1 Security Hardening: Fail-Closed Authorization Allowlist & Routes
  // ===========================================================================
  describe("Phase 1 Security Hardening: Fail-Closed Authorization Allowlist & Routes", () => {
    it("enforces strict fail-closed allowlist across service and all 4 HTTP review routes", async () => {
      const reviewerStore = new InMemoryReviewerStore();
      const reviewerService = new ReviewerService({ reviewerStore });
      const secStore = new InMemoryAssertionReviewStore();
      const secService = new AssertionReviewService({
        assertionReviewStore: secStore,
        reviewerService,
      });

      const studentWithUserGlobalId = randomUUID();
      const noRoleUserId = randomUUID();
      const regularUserNoCredId = randomUUID();
      const activeReviewerId = randomUUID();
      const suspendedReviewerId = randomUUID();
      const expiredReviewerId = randomUUID();
      const approvedTeacherId = randomUUID();
      const pendingTeacherId = randomUUID();
      const rejectedTeacherId = randomUUID();
      const secAdminId = randomUUID();

      const secAdminActor: Actor = {
        userId: secAdminId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      // Seed real credentials via ReviewerService / InMemoryReviewerStore
      const futureDate = new Date(Date.now() + 86_400_000 * 30);
      await reviewerService.grantCredential(secAdminActor, {
        userId: activeReviewerId,
        medicalLicenseNumber: "LIC-ACTIVE-1",
        specialty: "Clinical Pharmacy",
        licensingAuthority: "Medical Council",
        licenseExpiresAt: futureDate,
      });

      const suspCred = await reviewerService.grantCredential(secAdminActor, {
        userId: suspendedReviewerId,
        medicalLicenseNumber: "LIC-SUSP-1",
        specialty: "Internal Medicine",
        licensingAuthority: "Medical Council",
        licenseExpiresAt: futureDate,
      });
      await reviewerService.suspendCredential(secAdminActor, {
        credentialId: suspCred.id,
        reason: "Audit hold",
      });

      // Expired credential seeded directly in store (since grantCredential rejects past dates)
      await reviewerStore.create({
        userId: expiredReviewerId,
        medicalLicenseNumber: "LIC-EXP-1",
        specialty: "Cardiology",
        licensingAuthority: "Medical Council",
        licenseExpiresAt: new Date(Date.now() - 86_400_000),
        grantedBy: secAdminId,
      });

      const studentGlobalUserActor: Actor = {
        userId: studentWithUserGlobalId as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };
      const noRoleActor = {
        userId: noRoleUserId as Actor["userId"],
        role: undefined as unknown as Actor["role"],
        globalRole: null,
      } as Actor;
      const regularUserNoCredActor: Actor = {
        userId: regularUserNoCredId as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };
      const activeReviewerActor: Actor = {
        userId: activeReviewerId as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };
      const suspendedReviewerActor: Actor = {
        userId: suspendedReviewerId as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };
      const expiredReviewerActor: Actor = {
        userId: expiredReviewerId as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };
      const approvedTeacherActor: Actor = {
        userId: approvedTeacherId as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "approved",
      };
      const pendingTeacherActor: Actor = {
        userId: pendingTeacherId as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "pending",
      };
      const rejectedTeacherActor: Actor = {
        userId: rejectedTeacherId as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "rejected",
      };
      const undefinedStatusTeacherActor: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
      };
      const nullStatusTeacherActor: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: null,
      };
      const emptyStatusTeacherActor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "",
      } as unknown as Actor;
      const suspendedStatusTeacherActor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "suspended",
      } as unknown as Actor;

      const draft = await secStore.create({
        assertionKey: "sec.test.key",
        assertionType: "dosing_rule",
        statementText: "Security test clinical assertion.",
        drugId: randomUUID(),
        status: "draft",
      });

      // 1. Denied actors at Service layer (must throw DomainError("forbidden"))
      const deniedActors: Array<{ label: string; actor: Actor }> = [
        { label: "student with globalRole: user", actor: studentGlobalUserActor },
        { label: "user with no role", actor: noRoleActor },
        { label: "regular user without credential", actor: regularUserNoCredActor },
        { label: "suspended reviewer", actor: suspendedReviewerActor },
        { label: "expired credential reviewer", actor: expiredReviewerActor },
        { label: "pending teacher", actor: pendingTeacherActor },
        { label: "rejected teacher", actor: rejectedTeacherActor },
        { label: "teacher with undefined teacherStatus", actor: undefinedStatusTeacherActor },
        { label: "teacher with null teacherStatus", actor: nullStatusTeacherActor },
        { label: "teacher with empty teacherStatus", actor: emptyStatusTeacherActor },
        { label: "teacher with suspended teacherStatus", actor: suspendedStatusTeacherActor },
      ];

      for (const { label, actor } of deniedActors) {
        await expect(
          secService.submitForReview(actor, { assertionId: draft.id }),
          `submitForReview should reject ${label}`,
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          secService.recordReviewDecision(actor, { assertionId: draft.id, decision: "approve" }),
          `recordReviewDecision should reject ${label}`,
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          secService.withdrawReview(actor, { assertionId: draft.id }),
          `withdrawReview should reject ${label}`,
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          secService.getAssertionWithHistory(actor, draft.id),
          `getAssertionWithHistory should reject ${label}`,
        ).rejects.toMatchObject({ code: "forbidden" });
      }

      // 2. Allowed actors at Service layer
      // Active Reviewer with valid credential
      const submittedByRev = await secService.submitForReview(activeReviewerActor, {
        assertionId: draft.id,
        notes: "Active reviewer submission",
      });
      expect(submittedByRev.assertion.status).toBe("in_review");

      // Approved Teacher withdraws & re-submits
      const withdrawnByTeacher = await secService.withdrawReview(approvedTeacherActor, {
        assertionId: draft.id,
        reason: "Teacher edit",
      });
      expect(withdrawnByTeacher.assertion.status).toBe("draft");

      await secService.submitForReview(approvedTeacherActor, { assertionId: draft.id });
      const approvedByAdmin = await secService.recordReviewDecision(secAdminActor, {
        assertionId: draft.id,
        decision: "approve",
        notes: "Approved by platform_admin",
      });
      expect(approvedByAdmin.assertion.status).toBe("reviewed");

      // 3. Fastify Route-level enforcement across all 4 routes
      const secApp = fastify({ logger: false });
      await secApp.register(errorHandlerPlugin);

      const tokenUsers: Record<
        string,
        {
          id: string;
          email: string;
          role: string;
          globalRole?: string | null;
          teacherStatus?: "pending" | "approved" | "rejected";
        }
      > = {
        "tok-student-user": {
          id: studentWithUserGlobalId,
          email: "stu@avana.test",
          role: "student",
          globalRole: "user",
        },
        "tok-no-role": {
          id: noRoleUserId,
          email: "norole@avana.test",
          role: "",
          globalRole: null,
        },
        "tok-active-rev": {
          id: activeReviewerId,
          email: "rev@avana.test",
          role: "student",
          globalRole: "user",
        },
        "tok-suspended-rev": {
          id: suspendedReviewerId,
          email: "susprev@avana.test",
          role: "student",
          globalRole: "user",
        },
        "tok-expired-rev": {
          id: expiredReviewerId,
          email: "exprev@avana.test",
          role: "student",
          globalRole: "user",
        },
        "tok-pending-teacher": {
          id: pendingTeacherId,
          email: "penteach@avana.test",
          role: "teacher",
          globalRole: null,
          teacherStatus: "pending",
        },
        "tok-approved-teacher": {
          id: approvedTeacherId,
          email: "appteach@avana.test",
          role: "teacher",
          globalRole: null,
          teacherStatus: "approved",
        },
        "tok-admin": {
          id: secAdminId,
          email: "admin@avana.test",
          role: "platform_admin",
          globalRole: "platform_admin",
        },
      };

      await secApp.register(pocketAssertionReviewRoutes, {
        assertionReviewService: secService,
        sessionService: {
          validateSessionDetails: async (token: string) => {
            const u = tokenUsers[token];
            if (!u) return { valid: false, revoked: false };
            return {
              valid: true,
              revoked: false,
              renewed: false,
              user: { userId: u.id, email: u.email, role: u.role },
            };
          },
          getConfig: () => ({ cookieName: "avana_session", maxAgeMs: 3600000, path: "/", sameSite: "lax", secure: false }),
        } as unknown as Parameters<typeof pocketAssertionReviewRoutes>[1]["sessionService"],
        userStore: {
          findById: async (id: string) =>
            Object.values(tokenUsers).find((u) => u.id === id) ?? null,
        } as unknown as Parameters<typeof pocketAssertionReviewRoutes>[1]["userStore"],
      });

      const routeDraft = await secStore.create({
        assertionKey: "sec.route.key",
        assertionType: "dosing_rule",
        statementText: "Route security test.",
        drugId: randomUUID(),
        status: "draft",
      });

      const deniedTokens = [
        "tok-student-user",
        "tok-no-role",
        "tok-suspended-rev",
        "tok-expired-rev",
        "tok-pending-teacher",
      ];

      for (const tok of deniedTokens) {
        const r1 = await secApp.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${routeDraft.id}/submit-review`,
          headers: { authorization: `Bearer ${tok}` },
        });
        expect(r1.statusCode, `submit-review for ${tok}`).toBe(403);

        const r2 = await secApp.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${routeDraft.id}/review-decision`,
          headers: { authorization: `Bearer ${tok}` },
          payload: { decision: "approve", notes: "ok" },
        });
        expect(r2.statusCode, `review-decision for ${tok}`).toBe(403);

        const r3 = await secApp.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${routeDraft.id}/withdraw-review`,
          headers: { authorization: `Bearer ${tok}` },
        });
        expect(r3.statusCode, `withdraw-review for ${tok}`).toBe(403);

        const r4 = await secApp.inject({
          method: "GET",
          url: `/v1/pocket/assertions/${routeDraft.id}/history`,
          headers: { authorization: `Bearer ${tok}` },
        });
        expect(r4.statusCode, `history for ${tok}`).toBe(403);
      }

      // Allowed route tokens succeed
      const revSubmit = await secApp.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${routeDraft.id}/submit-review`,
        headers: { authorization: "Bearer tok-active-rev" },
      });
      expect(revSubmit.statusCode).toBe(200);

      const teacherWithdraw = await secApp.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${routeDraft.id}/withdraw-review`,
        headers: { authorization: "Bearer tok-approved-teacher" },
      });
      expect(teacherWithdraw.statusCode).toBe(200);

      await secApp.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${routeDraft.id}/submit-review`,
        headers: { authorization: "Bearer tok-approved-teacher" },
      });

      const adminApprove = await secApp.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${routeDraft.id}/review-decision`,
        headers: { authorization: "Bearer tok-admin" },
        payload: { decision: "approve", notes: "Verified" },
      });
      expect(adminApprove.statusCode).toBe(200);

      const revHistory = await secApp.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${routeDraft.id}/history`,
        headers: { authorization: "Bearer tok-active-rev" },
      });
      expect(revHistory.statusCode).toBe(200);

      await secApp.close();
    });

    it("fails closed when reviewerService dependency is omitted across all 5 service methods", async () => {
      const noRevStore = new InMemoryAssertionReviewStore();
      const noRevService = new AssertionReviewService({
        assertionReviewStore: noRevStore,
      });

      const reviewerWithoutServiceActor: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };
      const noRoleActor = {
        userId: randomUUID() as Actor["userId"],
        role: undefined as unknown as Actor["role"],
        globalRole: null,
      } as Actor;
      const unapprovedTeacherActor: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "pending",
      };
      const approvedTeacherActor: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "approved",
      };

      const draft = await noRevService.createDraftAssertion(approvedTeacherActor, {
        assertionKey: "failclosed.key",
        assertionType: "dosing_rule",
        statementText: "Fail-closed test assertion.",
        drugId: randomUUID(),
      });

      for (const denied of [reviewerWithoutServiceActor, noRoleActor, unapprovedTeacherActor]) {
        await expect(
          noRevService.createDraftAssertion(denied, {
            assertionKey: "failclosed.denied",
            assertionType: "dosing_rule",
            statementText: "Should fail.",
            drugId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          noRevService.submitForReview(denied, { assertionId: draft.id }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          noRevService.recordReviewDecision(denied, { assertionId: draft.id, decision: "approve" }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          noRevService.withdrawReview(denied, { assertionId: draft.id }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          noRevService.getAssertionWithHistory(denied, draft.id),
        ).rejects.toMatchObject({ code: "forbidden" });
      }
    });
  });

  describe("Clinical History Confidentiality & Redaction (Phase 1 Security Fix)", () => {
    it("redacts clinicalNotes and actorUserId on clinical vote/conflict logs for approved teacher while preserving general lifecycle history and privileged access", async () => {
      const histStore = new InMemoryAssertionReviewStore();
      const histRevStore = new InMemoryReviewerStore();
      const histRevService = new ReviewerService({ reviewerStore: histRevStore });
      const histService = new AssertionReviewService({
        assertionReviewStore: histStore,
        reviewerService: histRevService,
      });

      const histAdmin: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };
      const histTeacher: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "approved",
      };
      const histReviewerUserId = randomUUID();
      const histReviewer: Actor = {
        userId: histReviewerUserId as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "approved",
      };
      const histStudent: Actor = {
        userId: randomUUID() as Actor["userId"],
        role: "student",
        globalRole: "user" as unknown as Actor["globalRole"],
      };

      await histRevService.grantCredential(histAdmin, {
        userId: histReviewerUserId,
        medicalLicenseNumber: "MD-HIST-101",
        specialty: "Internal Medicine",
        licensingAuthority: "IRIMC",
        licenseExpiresAt: new Date(Date.now() + 86_400_000 * 30).toISOString(),
      });

      const assertion = await histService.createDraftAssertion(histTeacher, {
        assertionKey: "hist.confidential.test",
        assertionType: "dosing_rule",
        statementText: "Dose 500mg daily.",
        drugId: randomUUID(),
      });

      await histService.submitForReview(histTeacher, {
        assertionId: assertion.id,
        notes: "Initial submission by teacher",
      });
      await histService.recordReviewDecision(histTeacher, {
        assertionId: assertion.id,
        decision: "approve",
        notes: "Peer review looks good",
      });

      // Seed confidential clinical verification & conflict audit entries
      await histStore.insertAuditLog({
        assertionId: assertion.id,
        actorUserId: histReviewerUserId,
        action: "clinical_verified",
        previousStatus: "reviewed",
        newStatus: "verified",
        clinicalNotes: "CONFIDENTIAL_CRITIQUE_SHOULD_NOT_LEAK",
      });
      await histStore.insertAuditLog({
        assertionId: assertion.id,
        actorUserId: histReviewerUserId,
        action: "clinical_conflict_recorded",
        previousStatus: "verified",
        newStatus: "verified",
        clinicalNotes: "CONFIDENTIAL_CONFLICT_NOTE",
      });

      // 1 & 2. Approved teacher (without clinical credential): confidential fields redacted, general lifecycle preserved
      const teacherView = await histService.getAssertionWithHistory(histTeacher, assertion.id);
      expect(teacherView.history).toHaveLength(4);

      const submitLog = teacherView.history.find((h) => h.action === "submitted_for_review");
      expect(submitLog?.actorUserId).toBe(histTeacher.userId);
      expect(submitLog?.clinicalNotes).toBe("Initial submission by teacher");

      const peerApproveLog = teacherView.history.find((h) => h.action === "review_approved");
      expect(peerApproveLog?.actorUserId).toBe(histTeacher.userId);
      expect(peerApproveLog?.clinicalNotes).toBe("Peer review looks good");

      const clinicalVerifiedLog = teacherView.history.find((h) => h.action === "clinical_verified");
      expect(clinicalVerifiedLog).toBeDefined();
      expect(clinicalVerifiedLog?.actorUserId).toBeNull();
      expect(clinicalVerifiedLog?.clinicalNotes).toBeNull();

      const conflictLog = teacherView.history.find((h) => h.action === "clinical_conflict_recorded");
      expect(conflictLog).toBeDefined();
      expect(conflictLog?.actorUserId).toBeNull();
      expect(conflictLog?.clinicalNotes).toBeNull();

      // 3. Active clinical reviewer sees full clinical notes and reviewer actorUserId
      const reviewerView = await histService.getAssertionWithHistory(histReviewer, assertion.id);
      const revClinicalLog = reviewerView.history.find((h) => h.action === "clinical_verified");
      expect(revClinicalLog?.actorUserId).toBe(histReviewerUserId);
      expect(revClinicalLog?.clinicalNotes).toBe("CONFIDENTIAL_CRITIQUE_SHOULD_NOT_LEAK");

      // 4. Platform admin sees full clinical notes and reviewer actorUserId
      const adminView = await histService.getAssertionWithHistory(histAdmin, assertion.id);
      const adminClinicalLog = adminView.history.find((h) => h.action === "clinical_verified");
      expect(adminClinicalLog?.actorUserId).toBe(histReviewerUserId);
      expect(adminClinicalLog?.clinicalNotes).toBe("CONFIDENTIAL_CRITIQUE_SHOULD_NOT_LEAK");

      // 5. Unauthorized student is denied 403 forbidden
      await expect(
        histService.getAssertionWithHistory(histStudent, assertion.id),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
  });

  // ===========================================================================
  // 3. PostgreSQL Database-Backed Integration Tests
  // ===========================================================================

  describe("PostgreSQL Real Database Integration", () => {
    let client: ReturnType<typeof createDbClient> | null = null;
    let drizzleStore: DrizzleAssertionReviewStore;
    let isConnected = false;

    const pgAdminUserId = randomUUID();
    const pgTeacherUserId = randomUUID();
    const pgDrugId = randomUUID();

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
      drizzleStore = new DrizzleAssertionReviewStore(client.db);

        // Seed users to satisfy foreign keys
        await client.db.insert(users).values([
          {
            id: pgAdminUserId,
            email: `pg-asrt-admin-${Date.now()}@avana.local`,
            name: "PG Assertion Admin",
            globalRole: "platform_admin",
          },
          {
            id: pgTeacherUserId,
            email: `pg-asrt-teacher-${Date.now()}@avana.local`,
            name: "PG Assertion Teacher",
            role: "teacher",
          },
        ]);

        // Seed a parent drug for the arc constraint
        await client.db.insert(pocketDrugs).values({
          id: pgDrugId,
          slug: `pg-drug-${Date.now()}`,
          genericNameEn: "Amoxicillin",
          genericNameFa: "آموکسی‌سیلین",
          drugClass: "Antibacterial",
          mechanismOfAction: "Inhibits bacterial cell wall synthesis",
        });
    });

    afterAll(async () => {
      if (isConnected && client) {
        try {
          await client.db
            .delete(pocketAssertionAuditLog)
            .where(sql`${pocketAssertionAuditLog.actorUserId} IN (${pgAdminUserId}, ${pgTeacherUserId})`);
          await client.db
            .delete(pocketScientificAssertions)
            .where(sql`${pocketScientificAssertions.drugId} = ${pgDrugId}`);
          await client.db
            .delete(pocketDrugs)
            .where(sql`${pocketDrugs.id} = ${pgDrugId}`);
          await client.db
            .delete(users)
            .where(sql`${users.id} IN (${pgAdminUserId}, ${pgTeacherUserId})`);
          await client.close();
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it("verifies physical table insertion, status transitions, and audit log in real PostgreSQL", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const pgService = new AssertionReviewService({
        assertionReviewStore: drizzleStore,
        db: client.db,
      });

      const pgActor: Actor = {
        userId: pgTeacherUserId as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "approved",
      };

      const pgAdmin: Actor = {
        userId: pgAdminUserId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      // 1. Create draft assertion in real PostgreSQL
      const assertionId = randomUUID();
      const draft = await drizzleStore.create({
        id: assertionId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.adult.standard",
        statementText: "Adult dose 500mg PO TID in real Postgres.",
        drugId: pgDrugId,
        status: "draft",
      });

      expect(draft.id).toBe(assertionId);
      expect(draft.status).toBe("draft");

      // 2. Submit for review in PostgreSQL transaction
      const submitRes = await pgService.submitForReview(pgActor, {
        assertionId,
        notes: "Real PostgreSQL transaction test submission",
      });

      expect(submitRes.assertion.status).toBe("in_review");
      expect(submitRes.auditLog.id).toBeDefined();
      expect(submitRes.auditLog.action).toBe("submitted_for_review");

      // 3. Approve review in PostgreSQL transaction
      const approveRes = await pgService.recordReviewDecision(pgAdmin, {
        assertionId,
        decision: "approve",
        notes: "Approved in real PostgreSQL",
      });

      expect(approveRes.assertion.status).toBe("reviewed");
      expect(approveRes.auditLog.action).toBe("review_approved");

      // 4. Query history directly from real PostgreSQL table
      const logs = await drizzleStore.listAuditLogsByAssertionId(assertionId);
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe("submitted_for_review");
      expect(logs[1].action).toBe("review_approved");
    });

    it("verifies transactional rollback in real PostgreSQL when audit log fails", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const assertionId = randomUUID();
      await drizzleStore.create({
        id: assertionId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.adult.rollback",
        statementText: "Statement to test transactional rollback.",
        drugId: pgDrugId,
        status: "draft",
      });

      // Execute a transaction that updates status but fails at audit log insertion
      await expect(
        client.db.transaction(async (tx) => {
          await drizzleStore.updateStatus(assertionId, "in_review", tx);
          // Force an intentional constraint violation (invalid non-existent foreign key user)
          await drizzleStore.insertAuditLog(
            {
              assertionId,
              actorUserId: "00000000-0000-0000-0000-000000000999", // non-existent user
              action: "submitted_for_review",
              previousStatus: "draft",
              newStatus: "in_review",
            },
            tx,
          );
        }),
      ).rejects.toThrow();

      // Verify that status remains "draft" in PostgreSQL (rollback verified!)
      const refreshed = await drizzleStore.findById(assertionId);
      expect(refreshed?.status).toBe("draft");
    });
  });
});
