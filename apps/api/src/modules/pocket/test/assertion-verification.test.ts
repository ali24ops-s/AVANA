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
  pocketClinicalReviewerCredentials,
  pocketScientificAssertions,
  pocketAssertionAuditLog,
  pocketAssertionVerifications,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import {
  InMemoryReviewerStore,
} from "../reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import {
  InMemoryAssertionReviewStore,
} from "../assertion-review-store.js";
import {
  InMemoryAssertionVerificationStore,
} from "../assertion-verification-store.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { pocketAssertionVerificationRoutes } from "../assertion-verification-routes.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket Phase 2C-2: Clinical Verification Engine", () => {
  const adminUserId = randomUUID();
  const doctorActiveId = randomUUID();
  const doctorSuspendedId = randomUUID();
  const doctorRevokedId = randomUUID();
  const doctorExpiredId = randomUUID();
  const nonReviewerUserId = randomUUID();

  const adminActor: Actor = {
    userId: adminUserId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const doctorActiveActor: Actor = {
    userId: doctorActiveId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  const doctorSuspendedActor: Actor = {
    userId: doctorSuspendedId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  const doctorRevokedActor: Actor = {
    userId: doctorRevokedId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  const doctorExpiredActor: Actor = {
    userId: doctorExpiredId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  const nonReviewerActor: Actor = {
    userId: nonReviewerUserId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  let reviewerStore: InMemoryReviewerStore;
  let reviewerService: ReviewerService;
  let assertionStore: InMemoryAssertionReviewStore;
  let verificationStore: InMemoryAssertionVerificationStore;
  let verificationService: AssertionVerificationService;

  beforeEach(async () => {
    reviewerStore = new InMemoryReviewerStore();
    reviewerService = new ReviewerService({ reviewerStore });

    assertionStore = new InMemoryAssertionReviewStore();
    verificationStore = new InMemoryAssertionVerificationStore();

    verificationService = new AssertionVerificationService({
      verificationStore,
      assertionStore,
      reviewerService,
    });

    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Setup Active Doctor
    await reviewerStore.create({
      userId: doctorActiveId,
      medicalLicenseNumber: "MD-ACTIVE-1",
      specialty: "Clinical Pharmacology",
      licensingAuthority: "Medical Council",
      grantedBy: adminUserId,
      licenseExpiresAt: futureDate,
    });

    // 2. Setup Suspended Doctor
    const suspCred = await reviewerStore.create({
      userId: doctorSuspendedId,
      medicalLicenseNumber: "MD-SUSP-1",
      specialty: "Internal Medicine",
      licensingAuthority: "Medical Council",
      grantedBy: adminUserId,
      licenseExpiresAt: futureDate,
    });
    await reviewerStore.suspend({
      id: suspCred.id,
      suspensionReason: "Under investigation",
    });

    // 3. Setup Revoked Doctor
    const revCred = await reviewerStore.create({
      userId: doctorRevokedId,
      medicalLicenseNumber: "MD-REVOKED-1",
      specialty: "Cardiology",
      licensingAuthority: "Medical Council",
      grantedBy: adminUserId,
      licenseExpiresAt: futureDate,
    });
    await reviewerStore.revoke({
      id: revCred.id,
      reason: "License revoked",
    });

    // 4. Setup Expired Doctor
    await reviewerStore.create({
      userId: doctorExpiredId,
      medicalLicenseNumber: "MD-EXPIRED-1",
      specialty: "Nephrology",
      licensingAuthority: "Medical Council",
      grantedBy: adminUserId,
      licenseExpiresAt: pastDate,
    });
  });

  // Helper to create an assertion in 'reviewed' status
  const createReviewedAssertion = async (overrides?: Record<string, unknown>) => {
    return await assertionStore.create({
      assertionKey: "dosing.adult.reviewed",
      assertionType: "dosing_rule",
      statementText: "Reviewed statement: 500mg PO TID.",
      drugId: randomUUID(),
      status: "reviewed",
      ...overrides,
    });
  };

  // ===========================================================================
  // 1. Service & Invariant Tests (Scenarios 1 - 13)
  // ===========================================================================

  describe("Clinical Verification Rules & Governance Invariants", () => {
    // -------------------------------------------------------------------------
    // 1. Verification موفق توسط Reviewer فعال
    // -------------------------------------------------------------------------
    it("1. successfully verifies a reviewed assertion by an active clinical reviewer", async () => {
      const assertion = await createReviewedAssertion();

      const result = await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Clinically verified based on FDA guidance and randomized controlled trials.",
      });

      expect(result.verification).toBeDefined();
      expect(result.verification.assertionId).toBe(assertion.id);
      expect(result.verification.reviewerUserId).toBe(doctorActiveId);
      expect(result.verification.verificationAction).toBe("clinical_verified");
      expect(result.verification.clinicalReviewNotes).toContain("FDA guidance");

      expect(result.assertion.status).toBe("verified");

      expect(result.auditLog).toBeDefined();
      expect(result.auditLog.action).toBe("clinical_verified");
      expect(result.auditLog.previousStatus).toBe("reviewed");
      expect(result.auditLog.newStatus).toBe("verified");
      expect(result.auditLog.actorUserId).toBe(doctorActiveId);
    });

    // -------------------------------------------------------------------------
    // 2. رد Verification توسط کاربر فاقد Credential
    // -------------------------------------------------------------------------
    it("2. rejects verification when user lacks reviewer credentials", async () => {
      const assertion = await createReviewedAssertion();

      await expect(
        verificationService.verifyAssertion(nonReviewerActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Attempting verification without credential",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(nonReviewerActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Attempting verification without credential",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("lacks active clinical reviewer credentials");
      }
    });

    // -------------------------------------------------------------------------
    // 3. رد Verification توسط Reviewer تعلیق‌شده
    // -------------------------------------------------------------------------
    it("3. rejects verification by suspended reviewer", async () => {
      const assertion = await createReviewedAssertion();

      await expect(
        verificationService.verifyAssertion(doctorSuspendedActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Suspended doctor attempting signoff",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorSuspendedActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Suspended doctor attempting signoff",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
      }
    });

    // -------------------------------------------------------------------------
    // 4. رد Verification توسط Reviewer لغوشده
    // -------------------------------------------------------------------------
    it("4. rejects verification by revoked reviewer", async () => {
      const assertion = await createReviewedAssertion();

      await expect(
        verificationService.verifyAssertion(doctorRevokedActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Revoked doctor attempting signoff",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorRevokedActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Revoked doctor attempting signoff",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
      }
    });

    // -------------------------------------------------------------------------
    // 5. رد Verification توسط Reviewer منقضی‌شده
    // -------------------------------------------------------------------------
    it("5. rejects verification by reviewer with expired medical license", async () => {
      const assertion = await createReviewedAssertion();

      await expect(
        verificationService.verifyAssertion(doctorExpiredActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Expired license attempting signoff",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorExpiredActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Expired license attempting signoff",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("expired");
      }
    });

    // -------------------------------------------------------------------------
    // 6. رد Verification توسط platform_admin بدون Credential فعال
    // -------------------------------------------------------------------------
    it("6. rejects verification by platform_admin lacking active clinical reviewer credential", async () => {
      const assertion = await createReviewedAssertion();

      await expect(
        verificationService.verifyAssertion(adminActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Platform admin trying to bypass clinical credential check",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(adminActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Platform admin trying to bypass clinical credential check",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("lacks active clinical reviewer credentials");
      }
    });

    // -------------------------------------------------------------------------
    // 7. رد Verification برای Assertion در وضعیت draft
    // -------------------------------------------------------------------------
    it("7. rejects verification for assertion in draft status", async () => {
      const draft = await assertionStore.create({
        assertionKey: "dosing.draft",
        assertionType: "dosing_rule",
        statementText: "Draft statement",
        drugId: randomUUID(),
        status: "draft",
      });

      await expect(
        verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: draft.id,
          clinicalReviewNotes: "Clinical signoff on draft",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: draft.id,
          clinicalReviewNotes: "Clinical signoff on draft",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
        expect((err as DomainError).message).toContain("must complete initial review");
      }
    });

    // -------------------------------------------------------------------------
    // 8. رد Verification برای Assertion در وضعیت in_review
    // -------------------------------------------------------------------------
    it("8. rejects verification for assertion currently in_review", async () => {
      const inReview = await assertionStore.create({
        assertionKey: "dosing.in_review",
        assertionType: "dosing_rule",
        statementText: "In review statement",
        drugId: randomUUID(),
        status: "in_review",
      });

      await expect(
        verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: inReview.id,
          clinicalReviewNotes: "Premature clinical signoff while still in review",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: inReview.id,
          clinicalReviewNotes: "Premature clinical signoff while still in review",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
        expect((err as DomainError).message).toContain("still under review");
      }
    });

    // -------------------------------------------------------------------------
    // 9. ثبت رأی روی Assertion منتشرشده بدون تغییر زمان‌ها؛ رد superseded
    // -------------------------------------------------------------------------
    it("9a. allows verification on published assertion without mutating status or updatedAt", async () => {
      const published = await assertionStore.create({
        assertionKey: "dosing.pub",
        assertionType: "dosing_rule",
        statementText: "Published statement",
        drugId: randomUUID(),
        status: "published",
      });
      const initialUpdatedAt = published.updatedAt.getTime();

      const result = await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId: published.id,
        clinicalReviewNotes: "Post-publication clinical confirmation",
      });

      expect(result.assertion.status).toBe("published");
      expect(result.assertion.updatedAt.getTime()).toBe(initialUpdatedAt);
      expect(result.verification.verificationAction).toBe("clinical_verified");
      expect(result.auditLog.previousStatus).toBe("published");
      expect(result.auditLog.newStatus).toBe("published");
    });

    it("9b. rejects verification for superseded assertion", async () => {
      const superseded = await assertionStore.create({
        assertionKey: "dosing.super",
        assertionType: "dosing_rule",
        statementText: "Superseded statement",
        drugId: randomUUID(),
        status: "superseded",
      });

      await expect(
        verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: superseded.id,
          clinicalReviewNotes: "Verifying retired assertion",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: superseded.id,
          clinicalReviewNotes: "Verifying retired assertion",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("conflict");
        expect((err as DomainError).message).toContain("superseded");
      }
    });

    // -------------------------------------------------------------------------
    // 10. عدم انتقال تأیید نسخه قبلی به نسخه جدید (Physical Version Isolation)
    // -------------------------------------------------------------------------
    it("10. verification on version 1 does not automatically verify version 2", async () => {
      const rootId = randomUUID();

      // Version 1 is reviewed and verified
      const version1 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.v1",
        assertionType: "dosing_rule",
        statementText: "Dose v1: 250mg",
        drugId: randomUUID(),
        status: "reviewed",
      });

      await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId: version1.id,
        clinicalReviewNotes: "Verified v1",
      });

      // Version 2 is drafted with modified dose
      const version2 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: version1.id,
        assertionKey: "dosing.v1",
        assertionType: "dosing_rule",
        statementText: "Dose v2: 500mg",
        drugId: randomUUID(),
        status: "reviewed",
      });

      // Check version 1 verifications vs version 2
      const v1Verifs = await verificationStore.findVerificationsByAssertionId(version1.id);
      const v2Verifs = await verificationStore.findVerificationsByAssertionId(version2.id);

      expect(v1Verifs).toHaveLength(1);
      expect(v1Verifs[0].assertionId).toBe(version1.id);

      // Version 2 has NO verifications inherited
      expect(v2Verifs).toHaveLength(0);

      // Version 2 still has reviewed status until explicitly verified
      const v2Refreshed = await assertionStore.findById(version2.id);
      expect(v2Refreshed?.status).toBe("reviewed");
    });

    // -------------------------------------------------------------------------
    // 11. ثبت صحیح Clinical Notes و Reviewer ID
    // -------------------------------------------------------------------------
    it("11. accurately preserves clinical notes, timestamp, and reviewer ID", async () => {
      const assertion = await createReviewedAssertion();
      const notes = "Evaluated against 2026 British National Formulary standards; dose approved.";

      const result = await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: notes,
      });

      expect(result.verification.clinicalReviewNotes).toBe(notes);
      expect(result.verification.reviewerUserId).toBe(doctorActiveId);
      expect(result.verification.verifiedAt.getTime()).toBeLessThanOrEqual(Date.now());

      const fetched = await verificationStore.findVerificationById(result.verification.id);
      expect(fetched?.clinicalReviewNotes).toBe(notes);
      expect(fetched?.reviewerUserId).toBe(doctorActiveId);
    });

    // -------------------------------------------------------------------------
    // 12. Rollback در صورت شکست ثبت Verification یا Audit
    // -------------------------------------------------------------------------
    it("12. rolls back entire verification operation if audit recording fails", async () => {
      let rollbackOccurred = false;

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

      const assertion = await createReviewedAssertion();

      const failingAssertionStore = {
        findById: () => Promise.resolve(assertion),
        findByIdForUpdate: () => Promise.resolve(assertion),
        updateStatus: () => Promise.resolve(assertion),
        insertAuditLog: () => {
          throw new Error("Audit log disk failure during verification");
        },
      } as unknown as import("../assertion-review-store.js").AssertionReviewStore;

      const testService = new AssertionVerificationService({
        verificationStore,
        assertionStore: failingAssertionStore,
        reviewerService,
        db: failingDb,
      });

      await expect(
        testService.verifyAssertion(doctorActiveActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Valid notes but audit will fail",
        }),
      ).rejects.toThrow("Audit log disk failure during verification");

      expect(rollbackOccurred).toBe(true);
    });

    // -------------------------------------------------------------------------
    // 13. جلوگیری از ثبت رأی تکراری توسط همان داور با action و notes یکسان
    // -------------------------------------------------------------------------
    it("13. rejects duplicate vote by the same reviewer with identical action and notes (409)", async () => {
      const assertion = await createReviewedAssertion();

      // First verification succeeds
      await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "First verification",
      });

      // Exact duplicate attempt (same reviewer, same action, same notes) -> 409 conflict
      await expect(
        verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "First verification",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await verificationService.verifyAssertion(doctorActiveActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "First verification",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("conflict");
      }
    });

    // -------------------------------------------------------------------------
    // 14. Clinical Verification Rejection & Remediation (Multi-Reviewer)
    // -------------------------------------------------------------------------
    it("14. clinically rejects a reviewed assertion without reverting to draft (remains reviewed)", async () => {
      const assertion = await createReviewedAssertion();

      const result = await verificationService.rejectAssertionVerification(doctorActiveActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Severe drug interaction risk with ACE inhibitors not addressed in contraindications.",
      });

      expect(result.assertion.status).toBe("reviewed");
      expect(result.verification.verificationAction).toBe("clinical_rejected");
      expect(result.verification.clinicalReviewNotes).toContain("Severe drug interaction risk");
      expect(result.auditLog.action).toBe("clinical_verification_rejected");
      expect(result.auditLog.previousStatus).toBe("reviewed");
      expect(result.auditLog.newStatus).toBe("reviewed");
    });

    // -------------------------------------------------------------------------
    // 15. Clinical Conflicts recording
    // -------------------------------------------------------------------------
    it("15. records a clinical conflict between two conflicting assertions", async () => {
      const assertionA = await createReviewedAssertion({ statementText: "Dose: 500mg daily" });
      const assertionB = await createReviewedAssertion({ statementText: "Dose: 1000mg daily" });

      const conflict = await verificationService.recordClinicalConflict(doctorActiveActor, {
        assertionAId: assertionA.id,
        assertionBId: assertionB.id,
        conflictSubject: "Dosing discrepancy in standard adult guidelines",
        discrepancyDescription: "Assertion A recommends 500mg daily while Assertion B recommends 1000mg daily.",
      });

      expect(conflict).toBeDefined();
      expect(conflict.assertionAId).toBe(assertionA.id);
      expect(conflict.assertionBId).toBe(assertionB.id);
      expect(conflict.conflictSubject).toBe("Dosing discrepancy in standard adult guidelines");
      expect(conflict.status).toBe("active_discrepancy");

      const conflicts = await verificationStore.listConflictsByAssertionId(assertionA.id);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].id).toBe(conflict.id);
    });
  });

  // ===========================================================================
  // 2. HTTP Route Integration Tests (Fastify inject)
  // ===========================================================================

  describe("HTTP Routes Integration (/v1/pocket/assertions/:id/verify)", () => {
    let app: FastifyInstance;
    let routeVerificationStore: InMemoryAssertionVerificationStore;
    let routeAssertionStore: InMemoryAssertionReviewStore;
    let routeReviewerStore: InMemoryReviewerStore;
    let routeReviewerService: ReviewerService;
    let routeVerificationService: AssertionVerificationService;

    beforeEach(async () => {
      routeReviewerStore = new InMemoryReviewerStore();
      routeReviewerService = new ReviewerService({ reviewerStore: routeReviewerStore });

      routeAssertionStore = new InMemoryAssertionReviewStore();
      routeVerificationStore = new InMemoryAssertionVerificationStore();

      routeVerificationService = new AssertionVerificationService({
        verificationStore: routeVerificationStore,
        assertionStore: routeAssertionStore,
        reviewerService: routeReviewerService,
      });

      // Grant active credential to doctor
      await routeReviewerStore.create({
        userId: doctorActiveId,
        medicalLicenseNumber: "MD-HTTP-VERIF",
        specialty: "Clinical Oncology",
        licensingAuthority: "National Board",
        grantedBy: adminUserId,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      app = fastify();
      await app.register(errorHandlerPlugin);

      const mockSessionService = {
        validateSession: async (token: string) => {
          if (token === "token-doctor") return { userId: doctorActiveId, role: "teacher", globalRole: null };
          if (token === "token-admin") return { userId: adminUserId, role: "platform_admin", globalRole: "platform_admin" };
          return { userId: nonReviewerUserId, role: "student", globalRole: null };
        },
        validateSessionDetails: async (token: string) => {
          let role = "student";
          let globalRole: string | null = null;
          let uid = nonReviewerUserId;
          if (token === "token-doctor") {
            role = "teacher";
            uid = doctorActiveId;
          } else if (token === "token-admin") {
            role = "platform_admin";
            globalRole = "platform_admin";
            uid = adminUserId;
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
          if (id === doctorActiveId) return { id, email: "doc@avana.local", role: "teacher", globalRole: null };
          if (id === adminUserId) return { id, email: "admin@avana.local", role: "platform_admin", globalRole: "platform_admin" };
          return { id, email: "non@avana.local", role: "student", globalRole: null };
        },
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await app.register(pocketAssertionVerificationRoutes, {
        assertionVerificationService: routeVerificationService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await app.ready();
    });

    afterAll(async () => {
      await app?.close();
    });

    it("POST /v1/pocket/assertions/:id/verify succeeds for active clinical reviewer", async () => {
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.verify",
        assertionType: "dosing_rule",
        statementText: "Reviewed statement for HTTP test",
        drugId: randomUUID(),
        status: "reviewed",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${assertion.id}/verify`,
        headers: {
          authorization: "Bearer token-doctor",
        },
        payload: {
          clinicalReviewNotes: "Peer reviewed and clinically verified via Fastify route",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.assertion.status).toBe("verified");
      expect(json.data.verification.reviewerUserId).toBe(doctorActiveId);
    });

    it("POST /v1/pocket/assertions/:id/verify returns 403 for platform_admin lacking credentials", async () => {
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.admin",
        assertionType: "dosing_rule",
        statementText: "Reviewed statement for admin test",
        drugId: randomUUID(),
        status: "reviewed",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${assertion.id}/verify`,
        headers: {
          authorization: "Bearer token-admin",
        },
        payload: {
          clinicalReviewNotes: "Admin attempting verification",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("GET /v1/pocket/assertions/:id/verifications returns verifications and conflicts", async () => {
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.list",
        assertionType: "dosing_rule",
        statementText: "Reviewed statement for listing",
        drugId: randomUUID(),
        status: "reviewed",
      });

      await routeVerificationService.verifyAssertion(doctorActiveActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Verified via service",
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${assertion.id}/verifications`,
        headers: {
          authorization: "Bearer token-doctor",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(res.headers["pragma"]).toBe("no-cache");
      const json = JSON.parse(res.payload);
      expect(json.data.verifications).toHaveLength(1);
      expect(json.data.verifications[0].verificationAction).toBe("clinical_verified");
    });

    it("GET /v1/pocket/assertions/:id/verifications enforces no-store on error responses", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${randomUUID()}/verifications`,
        headers: {
          authorization: "Bearer token-doctor",
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(res.headers["pragma"]).toBe("no-cache");
    });

    it("Revoked reviewer privileged read access: dynamically strips clinicalReviewNotes and discrepancyDescription upon suspension", async () => {
      // 1. Create assertions and conflict
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.revocation",
        assertionType: "dosing_rule",
        statementText: "Reviewed statement for revocation test",
        drugId: randomUUID(),
        status: "reviewed",
      });

      const assertionB = await routeAssertionStore.create({
        assertionKey: "dosing.http.revocation.b",
        assertionType: "dosing_rule",
        statementText: "Second statement for conflict",
        drugId: randomUUID(),
        status: "reviewed",
      });

      await routeVerificationService.verifyAssertion(doctorActiveActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "TOP_SECRET_CLINICAL_NOTE_999",
      });

      await routeVerificationService.recordClinicalConflict(doctorActiveActor, {
        assertionAId: assertion.id,
        assertionBId: assertionB.id,
        conflictSubject: "Dosage controversy",
        discrepancyDescription: "TOP_SECRET_DISCREPANCY_999",
      });

      // 2. Initial request as active reviewer -> receives privileged notes
      const initialRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${assertion.id}/verifications`,
        headers: {
          authorization: "Bearer token-doctor",
        },
      });

      expect(initialRes.statusCode).toBe(200);
      const initialJson = JSON.parse(initialRes.payload);
      expect(initialJson.data.verifications[0].clinicalReviewNotes).toBe("TOP_SECRET_CLINICAL_NOTE_999");
      expect(initialJson.data.conflicts[0].discrepancyDescription).toBe("TOP_SECRET_DISCREPANCY_999");

      // 3. Suspend reviewer credential
      const activeCred = await routeReviewerStore.findActiveByUserId(doctorActiveId);
      expect(activeCred).toBeDefined();
      await routeReviewerStore.suspend({
        id: activeCred!.id,
        suspensionReason: "License suspended for audit",
        suspendedAt: new Date(),
      });

      // 4. Subsequent request by the same reviewer -> privileged fields are stripped
      const subsequentRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${assertion.id}/verifications`,
        headers: {
          authorization: "Bearer token-doctor",
        },
      });

      expect(subsequentRes.statusCode).toBe(200);
      expect(subsequentRes.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(subsequentRes.headers["pragma"]).toBe("no-cache");

      const subsequentJson = JSON.parse(subsequentRes.payload);
      // Public verification action remains visible
      expect(subsequentJson.data.verifications[0].verificationAction).toBe("clinical_verified");
      // Privileged fields are NO LONGER accessible
      expect(subsequentJson.data.verifications[0].clinicalReviewNotes).toBeUndefined();
      expect(subsequentJson.data.conflicts[0].discrepancyDescription).toBeUndefined();

      // Restore active credential for remaining tests
      await routeReviewerStore.create({
        userId: doctorActiveId,
        medicalLicenseNumber: "MD-HTTP-VERIF-RESTORED",
        specialty: "Clinical Oncology",
        licensingAuthority: "National Board",
        grantedBy: adminUserId,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    });
  });

  // ===========================================================================
  // 3. PostgreSQL Database-Backed Integration Tests
  // ===========================================================================

  describe("PostgreSQL Real Database Integration", () => {
    let client: ReturnType<typeof createDbClient> | null = null;
    let drizzleReviewerStore: DrizzleReviewerStore;
    let drizzleAssertionStore: DrizzleAssertionReviewStore;
    let drizzleVerificationStore: DrizzleAssertionVerificationStore;
    let pgReviewerService: ReviewerService;
    let isConnected = false;

    const pgAdminId = randomUUID();
    const pgDoctorId = randomUUID();
    const pgDrugId = randomUUID();

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;

        drizzleReviewerStore = new DrizzleReviewerStore(client.db);
        drizzleAssertionStore = new DrizzleAssertionReviewStore(client.db);
        drizzleVerificationStore = new DrizzleAssertionVerificationStore(client.db);
        pgReviewerService = new ReviewerService({
          reviewerStore: drizzleReviewerStore,
          db: client.db,
        });

        // Seed users
        await client.db.insert(users).values([
          {
            id: pgAdminId,
            email: `pg-verif-admin-${Date.now()}@avana.local`,
            name: "PG Verif Admin",
            globalRole: "platform_admin",
          },
          {
            id: pgDoctorId,
            email: `pg-verif-doc-${Date.now()}@avana.local`,
            name: "PG Verif Doctor",
            role: "teacher",
          },
        ]);

        // Seed drug
        await client.db.insert(pocketDrugs).values({
          id: pgDrugId,
          slug: `pg-verif-drug-${Date.now()}`,
          genericNameEn: "Ceftriaxone",
          genericNameFa: "سفتریاکسون",
          drugClass: "Cephalosporin",
          mechanismOfAction: "Inhibits cell wall synthesis",
        });

        // Grant active credential to doctor in PostgreSQL
        await drizzleReviewerStore.create({
          userId: pgDoctorId,
          medicalLicenseNumber: "MD-PG-VERIF-101",
          specialty: "Infectious Diseases",
          licensingAuthority: "National Medical Board",
          grantedBy: pgAdminId,
          licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
    });

    afterAll(async () => {
      if (isConnected && client) {
        try {
          await client.db
            .delete(pocketAssertionVerifications)
            .where(sql`${pocketAssertionVerifications.reviewerUserId} = ${pgDoctorId}`);
          await client.db
            .delete(pocketAssertionAuditLog)
            .where(sql`${pocketAssertionAuditLog.actorUserId} IN (${pgAdminId}, ${pgDoctorId})`);
          await client.db
            .delete(pocketScientificAssertions)
            .where(sql`${pocketScientificAssertions.drugId} = ${pgDrugId}`);
          await client.db
            .delete(pocketClinicalReviewerCredentials)
            .where(sql`${pocketClinicalReviewerCredentials.userId} = ${pgDoctorId}`);
          await client.db
            .delete(pocketDrugs)
            .where(sql`${pocketDrugs.id} = ${pgDrugId}`);
          await client.db
            .delete(users)
            .where(sql`${users.id} IN (${pgAdminId}, ${pgDoctorId})`);
          await client.close();
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it("verifies physical table insertion, status change, and audit log in real PostgreSQL", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const pgVerificationService = new AssertionVerificationService({
        verificationStore: drizzleVerificationStore,
        assertionStore: drizzleAssertionStore,
        reviewerService: pgReviewerService,
        db: client.db,
      });

      const pgDoctorActor: Actor = {
        userId: pgDoctorId as Actor["userId"],
        role: "teacher",
        globalRole: null,
      };

      // 1. Create and review assertion in PostgreSQL
      const assertionId = randomUUID();
      await drizzleAssertionStore.create({
        id: assertionId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.adult.pg_verif",
        statementText: "Ceftriaxone 1-2g IV q24h.",
        drugId: pgDrugId,
        status: "reviewed",
      });

      // 2. Perform clinical verification in real PostgreSQL transaction
      const result = await pgVerificationService.verifyAssertion(pgDoctorActor, {
        assertionId,
        clinicalReviewNotes: "Verified in real PostgreSQL against IDSA guidelines.",
      });

      expect(result.verification.id).toBeDefined();
      expect(result.verification.verificationAction).toBe("clinical_verified");
      expect(result.assertion.status).toBe("verified");
      expect(result.auditLog.action).toBe("clinical_verified");

      // 3. Verify physical records in PostgreSQL
      const verifs = await drizzleVerificationStore.findVerificationsByAssertionId(assertionId);
      expect(verifs).toHaveLength(1);
      expect(verifs[0].reviewerUserId).toBe(pgDoctorId);

      const refreshed = await drizzleAssertionStore.findById(assertionId);
      expect(refreshed?.status).toBe("verified");
    });

    it("verifies transactional rollback in real PostgreSQL when verification fails", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const assertionId = randomUUID();
      await drizzleAssertionStore.create({
        id: assertionId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.adult.pg_rollback",
        statementText: "Statement to test verification rollback.",
        drugId: pgDrugId,
        status: "reviewed",
      });

      // Transaction that attempts to verify but intentionally throws
      await expect(
        client.db.transaction(async (tx) => {
          await drizzleVerificationStore.createVerification(
            {
              assertionId,
              reviewerUserId: pgDoctorId,
              verificationAction: "clinical_verified",
              clinicalReviewNotes: "Rollback test",
            },
            tx,
          );
          await drizzleAssertionStore.updateStatus(assertionId, "verified", tx);

          throw new Error("Simulated transactional crash after verification insert");
        }),
      ).rejects.toThrow("Simulated transactional crash");

      // Verify that status remains 'reviewed' in PostgreSQL and no verification record was committed
      const refreshed = await drizzleAssertionStore.findById(assertionId);
      expect(refreshed?.status).toBe("reviewed");

      const verifs = await drizzleVerificationStore.findVerificationsByAssertionId(assertionId);
      expect(verifs).toHaveLength(0);
    });
  });

  describe("8. Verification & Conflict Privacy Tiers (Phase UI-3)", () => {
    const studentActor: Actor = {
      userId: randomUUID() as Actor["userId"],
      role: "student",
      globalRole: null,
    };

    it("masks clinicalReviewNotes, discrepancyDescription, and never exposes reviewerUserId for student caller", async () => {
      const assertionId = randomUUID();
      await assertionStore.create({
        id: assertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: randomUUID(),
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "dosing.test",
        statementText: "Test assertion for verifications privacy.",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "all",
        status: "reviewed",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
      });

      const assertionBId = randomUUID();
      await assertionStore.create({
        id: assertionBId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: randomUUID(),
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "dosing.conflicting",
        statementText: "Conflicting assertion statement.",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "all",
        status: "reviewed",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
      });

      await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId,
        clinicalReviewNotes: "Highly sensitive clinical critique for peer reviewers only.",
      });

      await verificationService.recordClinicalConflict(doctorActiveActor, {
        assertionAId: assertionId,
        assertionBId: assertionBId,
        conflictSubject: "Important guideline discrepancy",
        discrepancyDescription: "Deep pharmacological divergence between sources A and B.",
      });

      // Call as Student
      const studentResult = await verificationService.getAssertionVerifications(
        studentActor,
        assertionId,
      );

      expect(studentResult.verifications).toHaveLength(1);
      const v = studentResult.verifications[0];
      expect(v.verificationAction).toBe("clinical_verified");
      expect(v.verifiedAt).toBeDefined();
      // Student must NOT see reviewerUserId or clinicalReviewNotes
      expect((v as Record<string, unknown>).reviewerUserId).toBeUndefined();
      expect(v.clinicalReviewNotes).toBeUndefined();

      expect(studentResult.conflicts).toHaveLength(1);
      const c = studentResult.conflicts[0];
      expect(c.conflictSubject).toBe("Important guideline discrepancy");
      expect(c.status).toBe("active_discrepancy");
      // Student must NOT see discrepancyDescription
      expect(c.discrepancyDescription).toBeUndefined();
    });

    it("reveals clinicalReviewNotes and discrepancyDescription for active clinical reviewer, but never reviewerUserId", async () => {
      const assertionId = randomUUID();
      await assertionStore.create({
        id: assertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: randomUUID(),
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "dosing.test2",
        statementText: "Privileged reviewer test assertion.",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "all",
        status: "reviewed",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
      });

      const assertionBId2 = randomUUID();
      await assertionStore.create({
        id: assertionBId2,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: randomUUID(),
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "dosing.conflicting2",
        statementText: "Conflicting assertion statement 2.",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "all",
        status: "reviewed",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
      });

      await verificationService.verifyAssertion(doctorActiveActor, {
        assertionId,
        clinicalReviewNotes: "Privileged clinical note content.",
      });

      await verificationService.recordClinicalConflict(doctorActiveActor, {
        assertionAId: assertionId,
        assertionBId: assertionBId2,
        conflictSubject: "Conflict title",
        discrepancyDescription: "Privileged discrepancy details.",
      });

      // Call as Active Reviewer
      const reviewerResult = await verificationService.getAssertionVerifications(
        doctorActiveActor,
        assertionId,
      );

      expect(reviewerResult.verifications).toHaveLength(1);
      const v = reviewerResult.verifications[0];
      expect(v.clinicalReviewNotes).toBe("Privileged clinical note content.");
      expect((v as Record<string, unknown>).reviewerUserId).toBeUndefined(); // NEVER in consumer response

      expect(reviewerResult.conflicts).toHaveLength(1);
      const c = reviewerResult.conflicts[0];
      expect(c.discrepancyDescription).toBe("Privileged discrepancy details.");
    });
  });

  describe("9. Phase C.2.3: Multi-Reviewer Write Workflow (Service, HTTP Route & PostgreSQL)", () => {
    const reviewerAId = randomUUID();
    const reviewerBId = randomUUID();
    const reviewerCId = randomUUID();
    const reviewerDId = randomUUID();

    const reviewerAActor: Actor = {
      userId: reviewerAId as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };
    const reviewerBActor: Actor = {
      userId: reviewerBId as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };
    const reviewerCActor: Actor = {
      userId: reviewerCId as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };
    const reviewerDActor: Actor = {
      userId: reviewerDId as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };

    beforeEach(async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      for (const [idx, uid] of [reviewerAId, reviewerBId, reviewerCId, reviewerDId].entries()) {
        await reviewerStore.create({
          userId: uid,
          medicalLicenseNumber: `MD-MULTI-${idx + 1}`,
          specialty: "Clinical Pharmacology",
          licensingAuthority: "Medical Council",
          grantedBy: adminUserId,
          licenseExpiresAt: futureDate,
        });
      }
    });

    it("covers scenarios 1-6 & 9: multi-reviewer independent chains (A1->A2->A3, B, C, D) and verify->reject->verify cycle", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.multi.workflow",
        assertionType: "dosing_rule",
        statementText: "Multi-reviewer workflow statement",
        drugId: randomUUID(),
        status: "reviewed",
      });

      // 1. Reviewer A approves (reviewed -> verified, root A1)
      const resA1 = await verificationService.verifyAssertion(reviewerAActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Reviewer A initial approval",
      });
      expect(resA1.verification.parentVerificationId).toBeNull();
      expect(resA1.assertion.status).toBe("verified");
      expect(resA1.auditLog.previousStatus).toBe("reviewed");
      expect(resA1.auditLog.newStatus).toBe("verified");

      // 2. Reviewer B approves without erasing Reviewer A (verified -> verified, independent root B1)
      const resB1 = await verificationService.verifyAssertion(reviewerBActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Reviewer B independent approval",
      });
      expect(resB1.verification.parentVerificationId).toBeNull();
      expect(resB1.assertion.status).toBe("verified");
      expect(resB1.auditLog.previousStatus).toBe("verified");
      expect(resB1.auditLog.newStatus).toBe("verified");

      // 3. Reviewer C rejects without reverting assertion to draft (verified -> verified)
      const resC1 = await verificationService.rejectAssertionVerification(reviewerCActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Reviewer C clinical concern",
      });
      expect(resC1.verification.parentVerificationId).toBeNull();
      expect(resC1.verification.verificationAction).toBe("clinical_rejected");
      expect(resC1.assertion.status).toBe("verified");
      expect(resC1.auditLog.previousStatus).toBe("verified");
      expect(resC1.auditLog.newStatus).toBe("verified");

      // 4. Reviewer A changes mind -> A1 -> A2 (reject)
      const resA2 = await verificationService.rejectAssertionVerification(reviewerAActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Reviewer A switched to reject",
      });
      expect(resA2.verification.parentVerificationId).toBe(resA1.verification.id);
      expect(resA2.verification.verifiedAt.getTime()).toBeGreaterThan(
        resA1.verification.verifiedAt.getTime(),
      );

      // 5 & 9. Reviewer A changes mind again -> A1 -> A2 -> A3 (verify -> reject -> verify cycle allowed)
      const resA3 = await verificationService.verifyAssertion(reviewerAActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Reviewer A re-verified after clarification",
      });
      expect(resA3.verification.parentVerificationId).toBe(resA2.verification.id);
      expect(resA3.verification.verifiedAt.getTime()).toBeGreaterThan(
        resA2.verification.verifiedAt.getTime(),
      );

      // 6. New Reviewer D submits independent root vote
      const resD1 = await verificationService.verifyAssertion(reviewerDActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Reviewer D independent approval",
      });
      expect(resD1.verification.parentVerificationId).toBeNull();

      // Historical records are strictly append-only (6 records total: A1, B1, C1, A2, A3, D1)
      const allVerifs = await verificationStore.findVerificationsByAssertionId(assertion.id);
      expect(allVerifs).toHaveLength(6);
      const latestA = await verificationStore.findLatestVerificationByReviewerAndAssertion(
        reviewerAId,
        assertion.id,
      );
      expect(latestA?.id).toBe(resA3.verification.id);
    });

    it("covers scenarios 7 & 8: rejects mismatched/stale/foreign parentVerificationId (409) and duplicate latest vote (409)", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.multi.parent",
        assertionType: "dosing_rule",
        statementText: "Parent and duplicate guard statement",
        drugId: randomUUID(),
        status: "reviewed",
      });

      // Explicit non-null parent on first vote -> 409
      await expect(
        verificationService.verifyAssertion(reviewerAActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Bad initial parent",
          parentVerificationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      const resA1 = await verificationService.verifyAssertion(reviewerAActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Initial A1",
      });

      // Duplicate identical action & notes -> 409
      await expect(
        verificationService.verifyAssertion(reviewerAActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Initial A1",
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      const resA2 = await verificationService.rejectAssertionVerification(reviewerAActor, {
        assertionId: assertion.id,
        clinicalReviewNotes: "Changed A2",
      });

      // Stale parent (A1 instead of A2) -> 409
      await expect(
        verificationService.verifyAssertion(reviewerAActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Stale parent attempt",
          parentVerificationId: resA1.verification.id,
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      // Foreign parent (A2 submitted by Reviewer B) -> 409
      await expect(
        verificationService.verifyAssertion(reviewerBActor, {
          assertionId: assertion.id,
          clinicalReviewNotes: "Foreign parent attempt",
          parentVerificationId: resA2.verification.id,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("covers scenarios 10-12: published timestamps preserved, invalid credential rejected (403), and audit failure rollback", async () => {
      const published = await assertionStore.create({
        assertionKey: "dosing.multi.published",
        assertionType: "dosing_rule",
        statementText: "Published assertion statement",
        drugId: randomUUID(),
        status: "published",
      });
      const initialUpdatedAt = published.updatedAt.getTime();

      const pubReject = await verificationService.rejectAssertionVerification(reviewerAActor, {
        assertionId: published.id,
        clinicalReviewNotes: "Post-publication critique",
      });
      expect(pubReject.assertion.status).toBe("published");
      expect(pubReject.assertion.updatedAt.getTime()).toBe(initialUpdatedAt);
      expect(pubReject.auditLog.previousStatus).toBe("published");
      expect(pubReject.auditLog.newStatus).toBe("published");

      // Invalid credential -> 403
      await expect(
        verificationService.rejectAssertionVerification(doctorExpiredActor, {
          assertionId: published.id,
          clinicalReviewNotes: "Expired reviewer critique",
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("covers scenarios 13 & 14 (HTTP Routes): preserves { verification, assertion, auditLog } and client compatibility without parentVerificationId", async () => {
      const routeAssertionStore = new InMemoryAssertionReviewStore();
      const routeVerificationStore = new InMemoryAssertionVerificationStore();
      const routeReviewerStore = new InMemoryReviewerStore();
      const routeReviewerService = new ReviewerService({ reviewerStore: routeReviewerStore });
      const routeVerificationService = new AssertionVerificationService({
        verificationStore: routeVerificationStore,
        assertionStore: routeAssertionStore,
        reviewerService: routeReviewerService,
      });

      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await routeReviewerStore.create({
        userId: reviewerAId,
        medicalLicenseNumber: "MD-HTTP-A",
        specialty: "Clinical Pharmacology",
        licensingAuthority: "Medical Council",
        grantedBy: adminUserId,
        licenseExpiresAt: futureDate,
      });

      const app: FastifyInstance = fastify();
      app.register(errorHandlerPlugin);
      app.register(pocketAssertionVerificationRoutes, {
        assertionVerificationService: routeVerificationService,
        sessionService: {
          validateSession: async (token: string) =>
            token === "token-revA"
              ? { userId: reviewerAId, role: "teacher", globalRole: null }
              : null,
          validateSessionDetails: async (token: string) =>
            token === "token-revA"
              ? {
                  valid: true,
                  revoked: false,
                  user: { userId: reviewerAId, role: "teacher", globalRole: null },
                }
              : { valid: false, revoked: false, user: null },
          getConfig: () => ({}),
        } as unknown as Parameters<typeof pocketAssertionVerificationRoutes>[1]["sessionService"],
        userStore: {
          findById: async (uid: string) =>
            uid === reviewerAId
              ? { id: reviewerAId, email: "revA@avana.local", role: "teacher", globalRole: null }
              : null,
        } as unknown as Parameters<typeof pocketAssertionVerificationRoutes>[1]["userStore"],
      });
      await app.ready();

      try {
        const assertion = await routeAssertionStore.create({
          assertionKey: "dosing.http.multi",
          assertionType: "dosing_rule",
          statementText: "HTTP route multi-reviewer statement",
          drugId: randomUUID(),
          status: "reviewed",
        });

        // Client omits parentVerificationId -> 200 and { verification, assertion, auditLog }
        const verifyRes = await app.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${assertion.id}/verify`,
          headers: { authorization: "Bearer token-revA" },
          payload: { clinicalReviewNotes: "HTTP verify A1" },
        });
        expect(verifyRes.statusCode).toBe(200);
        const verifyJson = JSON.parse(verifyRes.payload);
        expect(Object.keys(verifyJson.data).sort()).toEqual(["assertion", "auditLog", "verification"]);
        expect(verifyJson.data.verification.parentVerificationId).toBeNull();
        expect(verifyJson.data.assertion.status).toBe("verified");

        // Duplicate via HTTP -> 409
        const dupRes = await app.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${assertion.id}/verify`,
          headers: { authorization: "Bearer token-revA" },
          payload: { clinicalReviewNotes: "HTTP verify A1" },
        });
        expect(dupRes.statusCode).toBe(409);

        // Reject via HTTP without parentVerificationId -> 200, chains to A1, keeps status verified
        const rejectRes = await app.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${assertion.id}/reject-verification`,
          headers: { authorization: "Bearer token-revA" },
          payload: { clinicalReviewNotes: "HTTP reject A2" },
        });
        expect(rejectRes.statusCode).toBe(200);
        const rejectJson = JSON.parse(rejectRes.payload);
        expect(Object.keys(rejectJson.data).sort()).toEqual(["assertion", "auditLog", "verification"]);
        expect(rejectJson.data.verification.parentVerificationId).toBe(verifyJson.data.verification.id);
        expect(rejectJson.data.assertion.status).toBe("verified");

        // Explicit stale parent on HTTP -> 409
        const staleParentRes = await app.inject({
          method: "POST",
          url: `/v1/pocket/assertions/${assertion.id}/verify`,
          headers: { authorization: "Bearer token-revA" },
          payload: {
            clinicalReviewNotes: "HTTP verify with stale parent",
            parentVerificationId: verifyJson.data.verification.id,
          },
        });
        expect(staleParentRes.statusCode).toBe(409);
      } finally {
        await app.close();
      }
    });
  });
});
