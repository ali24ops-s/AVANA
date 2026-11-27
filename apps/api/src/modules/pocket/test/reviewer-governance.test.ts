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
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import {
  InMemoryReviewerStore,
  type ReviewerStore,
} from "../reviewer-store.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { pocketReviewerRoutes } from "../reviewer-routes.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { DrizzleAssertionConsumptionStore } from "../drizzle-assertion-consumption-store.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { AssertionPublishingService } from "../assertion-publishing-service.js";
import { resolveAssertionVerificationSummariesFromDb } from "../assertion-verification-resolver.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket Phase 2A: Clinical Reviewer Governance", () => {
  const adminUserId = randomUUID();
  const teacherUserId = randomUUID();
  const studentUserId = randomUUID();
  const doctorUserId = randomUUID();
  const doctorUser2Id = randomUUID();

  const adminActor: Actor = {
    userId: adminUserId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const teacherActor: Actor = {
    userId: teacherUserId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  const studentActor: Actor = {
    userId: studentUserId as Actor["userId"],
    role: "student",
    globalRole: null,
  };

  let store: InMemoryReviewerStore;
  let service: ReviewerService;

  beforeEach(() => {
    store = new InMemoryReviewerStore();
    service = new ReviewerService({ reviewerStore: store });
  });

  // ===========================================================================
  // Core Service Governance Rules (Tests 1 - 12)
  // ===========================================================================

  describe("Service & Authorization Invariants", () => {
    // -------------------------------------------------------------------------
    // 1. platform_admin can grant a credential
    // -------------------------------------------------------------------------
    it("1. platform_admin can grant a credential", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const cred = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-12345",
        specialty: "Clinical Pharmacology",
        licensingAuthority: "Medical Council",
        licenseExpiresAt: futureDate,
      });

      expect(cred).toBeDefined();
      expect(cred.userId).toBe(doctorUserId);
      expect(cred.medicalLicenseNumber).toBe("MED-12345");
      expect(cred.specialty).toBe("Clinical Pharmacology");
      expect(cred.licensingAuthority).toBe("Medical Council");
      expect(cred.isActive).toBe(true);
      expect(cred.suspendedAt).toBeNull();
      expect(cred.suspensionReason).toBeNull();
      expect(cred.grantedBy).toBe(adminUserId);
      expect(cred.licenseExpiresAt.getTime()).toBe(futureDate.getTime());
    });

    // -------------------------------------------------------------------------
    // 2. teacher cannot grant a credential
    // -------------------------------------------------------------------------
    it("2. teacher cannot grant a credential", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await expect(
        service.grantCredential(teacherActor, {
          userId: doctorUserId,
          medicalLicenseNumber: "MED-FAIL",
          specialty: "Pharmacology",
          licensingAuthority: "Council",
          licenseExpiresAt: futureDate,
        }),
      ).rejects.toThrow(DomainError);

      try {
        await service.grantCredential(teacherActor, {
          userId: doctorUserId,
          medicalLicenseNumber: "MED-FAIL",
          specialty: "Pharmacology",
          licensingAuthority: "Council",
          licenseExpiresAt: futureDate,
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("Only platform_admin");
      }
    });

    // -------------------------------------------------------------------------
    // 3. student cannot suspend a credential
    // -------------------------------------------------------------------------
    it("3. student cannot suspend a credential", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const cred = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-12345",
        specialty: "Pharmacology",
        licensingAuthority: "Council",
        licenseExpiresAt: futureDate,
      });

      await expect(
        service.suspendCredential(studentActor, {
          credentialId: cred.id,
          reason: "Malicious suspension attempt",
        }),
      ).rejects.toThrow(DomainError);

      try {
        await service.suspendCredential(studentActor, {
          credentialId: cred.id,
          reason: "Malicious suspension attempt",
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("Only platform_admin");
      }

      // Verify the credential remains active
      const refreshed = await store.findById(cred.id);
      expect(refreshed?.isActive).toBe(true);
      expect(refreshed?.suspendedAt).toBeNull();
    });

    // -------------------------------------------------------------------------
    // 4. duplicate active credentials are rejected
    // -------------------------------------------------------------------------
    it("4. duplicate active credentials are rejected", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-PRIMARY",
        specialty: "Cardiology",
        licensingAuthority: "Board",
        licenseExpiresAt: futureDate,
      });

      await expect(
        service.grantCredential(adminActor, {
          userId: doctorUserId,
          medicalLicenseNumber: "MED-DUPLICATE",
          specialty: "Cardiology",
          licensingAuthority: "Board",
          licenseExpiresAt: futureDate,
        }),
      ).rejects.toThrow(DomainError);

      try {
        await service.grantCredential(adminActor, {
          userId: doctorUserId,
          medicalLicenseNumber: "MED-DUPLICATE",
          specialty: "Cardiology",
          licensingAuthority: "Board",
          licenseExpiresAt: futureDate,
        });
      } catch (err) {
        expect((err as DomainError).code).toBe("conflict");
        expect((err as DomainError).message).toContain("already has an active clinical reviewer credential");
      }
    });

    // -------------------------------------------------------------------------
    // 5. inactive credentials fail reviewer validation
    // -------------------------------------------------------------------------
    it("5. inactive credentials fail reviewer validation", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const cred = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-INACT",
        specialty: "Neurology",
        licensingAuthority: "Council",
        licenseExpiresAt: futureDate,
      });

      // Revoke the credential to make it inactive
      await service.revokeCredential(adminActor, {
        credentialId: cred.id,
        reason: "Voluntary departure",
      });

      await expect(service.assertActiveReviewer(doctorUserId)).rejects.toThrow(DomainError);

      try {
        await service.assertActiveReviewer(doctorUserId);
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("User lacks active clinical reviewer credentials");
      }
    });

    // -------------------------------------------------------------------------
    // 6. suspended credentials fail reviewer validation
    // -------------------------------------------------------------------------
    it("6. suspended credentials fail reviewer validation", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const cred = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-SUSP",
        specialty: "Pediatrics",
        licensingAuthority: "Board",
        licenseExpiresAt: futureDate,
      });

      // Suspend
      await service.suspendCredential(adminActor, {
        credentialId: cred.id,
        reason: "License under administrative investigation",
      });

      await expect(service.assertActiveReviewer(doctorUserId)).rejects.toThrow(DomainError);

      try {
        await service.assertActiveReviewer(doctorUserId);
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
      }
    });

    // -------------------------------------------------------------------------
    // 7. expired credentials fail reviewer validation
    // -------------------------------------------------------------------------
    it("7. expired credentials fail reviewer validation", async () => {
      // Create a credential with past expiration date directly in store to test temporal expiration
      await store.create({
        userId: doctorUserId,
        medicalLicenseNumber: "MED-EXP",
        specialty: "Emergency Medicine",
        licensingAuthority: "State Board",
        grantedBy: adminUserId,
        licenseExpiresAt: new Date(Date.now() - 10000), // 10s in the past
      });

      await expect(service.assertActiveReviewer(doctorUserId)).rejects.toThrow(DomainError);

      try {
        await service.assertActiveReviewer(doctorUserId);
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
        expect((err as DomainError).message).toContain("expired");
      }
    });

    // -------------------------------------------------------------------------
    // 8. valid credentials pass reviewer validation
    // -------------------------------------------------------------------------
    it("8. valid credentials pass reviewer validation", async () => {
      const futureDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
      await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-VALID-99",
        specialty: "Infectious Diseases",
        licensingAuthority: "National Board",
        licenseExpiresAt: futureDate,
      });

      const activeCred = await service.assertActiveReviewer(doctorUserId);
      expect(activeCred).toBeDefined();
      expect(activeCred.userId).toBe(doctorUserId);
      expect(activeCred.isActive).toBe(true);
      expect(activeCred.suspendedAt).toBeNull();
      expect(activeCred.licenseExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    // -------------------------------------------------------------------------
    // 9. credential history remains available after deactivation
    // -------------------------------------------------------------------------
    it("9. credential history remains available after deactivation", async () => {
      const future1 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const future2 = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      // Credential 1: granted and suspended
      const cred1 = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-V1",
        specialty: "Oncology",
        licensingAuthority: "Board A",
        licenseExpiresAt: future1,
      });

      await service.suspendCredential(adminActor, {
        credentialId: cred1.id,
        reason: "Periodic recertification gap",
      });

      // Credential 2: granted after resolution
      const cred2 = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-V2",
        specialty: "Oncology",
        licensingAuthority: "Board A",
        licenseExpiresAt: future2,
      });

      // List all credentials for this user
      const history = await service.listCredentials(adminActor, { userId: doctorUserId });
      expect(history).toHaveLength(2);

      const foundCred1 = history.find((c) => c.id === cred1.id);
      const foundCred2 = history.find((c) => c.id === cred2.id);

      expect(foundCred1).toBeDefined();
      expect(foundCred1?.isActive).toBe(false);
      expect(foundCred1?.suspendedAt).not.toBeNull();
      expect(foundCred1?.suspensionReason).toBe("Periodic recertification gap");

      expect(foundCred2).toBeDefined();
      expect(foundCred2?.isActive).toBe(true);
      expect(foundCred2?.suspendedAt).toBeNull();
    });

    // -------------------------------------------------------------------------
    // 10. actor_user_id is taken from authenticated context, not request payload
    // -------------------------------------------------------------------------
    it("10. actor_user_id is taken from authenticated context, not request payload", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const spoofedActorId = "attacker-spoofed-id";

      // The service input only accepts domain fields, grantedBy is strictly derived from actor.userId
      const cred = await service.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-SPOOF-CHECK",
        specialty: "Radiology",
        licensingAuthority: "Board",
        licenseExpiresAt: futureDate,
        // Even if an untyped object attempted to supply grantedBy, service ignores it:
        ...({ grantedBy: spoofedActorId }),
      });

      expect(cred.grantedBy).toBe(adminUserId);
      expect(cred.grantedBy).not.toBe(spoofedActorId);
    });

    // -------------------------------------------------------------------------
    // 11. concurrent credential grants cannot create multiple active credentials
    // -------------------------------------------------------------------------
    it("11. concurrent credential grants cannot create multiple active credentials", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      // Attempt 2 concurrent grants for the same user
      const results = await Promise.allSettled([
        service.grantCredential(adminActor, {
          userId: doctorUser2Id,
          medicalLicenseNumber: "MED-CONCUR-1",
          specialty: "Surgery",
          licensingAuthority: "Council",
          licenseExpiresAt: futureDate,
        }),
        service.grantCredential(adminActor, {
          userId: doctorUser2Id,
          medicalLicenseNumber: "MED-CONCUR-2",
          specialty: "Surgery",
          licensingAuthority: "Council",
          licenseExpiresAt: futureDate,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly one should succeed and one should fail with conflict
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (rejected[0].status === "rejected") {
        expect((rejected[0].reason as DomainError).code).toBe("conflict");
      }

      // Check store has only 1 active credential
      const allForUser = await store.listByUserId(doctorUser2Id);
      const activeList = allForUser.filter((c) => c.isActive);
      expect(activeList).toHaveLength(1);
    });

    // -------------------------------------------------------------------------
    // 12. failed transactional operations do not leave partial records
    // -------------------------------------------------------------------------
    it("12. failed transactional operations do not leave partial records", async () => {
      // Simulate transactional failure via mock db with throwing transaction callback
      let rollbackOccurred = false;
      const failingDb = {
        transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
          try {
            await cb({});
            // Simulate crash after operation
            throw new Error("Simulated database failure during post-commit hook");
          } catch (e) {
            rollbackOccurred = true;
            throw e;
          }
        },
      } as unknown as import("@avana/database/client").DbClient;

      const failingStore = {
        findActiveByUserId: () => Promise.resolve(null),
        create: () => {
          throw new DomainError("bad_request", "Invalid payload invariant");
        },
      } as unknown as ReviewerStore;

      const failingService = new ReviewerService({
        reviewerStore: failingStore,
        db: failingDb,
      });

      await expect(
        failingService.grantCredential(adminActor, {
          userId: randomUUID(),
          medicalLicenseNumber: "MED-TX-FAIL",
          specialty: "Dermatology",
          licensingAuthority: "Board",
          licenseExpiresAt: new Date(Date.now() + 100000),
        }),
      ).rejects.toThrow(DomainError);

      expect(rollbackOccurred).toBe(true);
    });
  });

  // ===========================================================================
  // HTTP Route Integration Tests (Fastify inject)
  // ===========================================================================

  describe("HTTP Routes Integration (/v1/pocket/reviewers)", () => {
    let app: FastifyInstance;
    let routeStore: InMemoryReviewerStore;
    let routeService: ReviewerService;

    beforeEach(async () => {
      routeStore = new InMemoryReviewerStore();
      routeService = new ReviewerService({ reviewerStore: routeStore });

      app = fastify();
      await app.register(errorHandlerPlugin);

      const mockSessionService = {
        validateSession: async (token: string) => {
          if (token === "token-admin") return { userId: adminUserId, role: "platform_admin", globalRole: "platform_admin" };
          if (token === "token-teacher") return { userId: teacherUserId, role: "teacher", globalRole: null };
          if (token === "token-doctor") return { userId: doctorUserId, role: "student", globalRole: null };
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
          } else if (token === "token-doctor") {
            role = "student";
            uid = doctorUserId;
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
          if (id === teacherUserId) return { id, email: "teacher@avana.local", role: "teacher", globalRole: null };
          if (id === doctorUserId) return { id, email: "doctor@avana.local", role: "student", globalRole: null };
          return { id, email: "student@avana.local", role: "student", globalRole: null };
        },
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await app.register(pocketReviewerRoutes, {
        reviewerService: routeService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await app.ready();
    });

    afterAll(async () => {
      await app?.close();
    });

    it("POST /v1/pocket/reviewers/credentials succeeds for platform_admin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/pocket/reviewers/credentials",
        headers: {
          authorization: "Bearer token-admin",
        },
        payload: {
          userId: doctorUserId,
          medicalLicenseNumber: "MED-HTTP-101",
          specialty: "Psychiatry",
          licensingAuthority: "National Board",
          licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.userId).toBe(doctorUserId);
      expect(json.data.isActive).toBe(true);
      expect(json.data.grantedBy).toBe(adminUserId);
    });

    it("POST /v1/pocket/reviewers/credentials returns 403 for teacher", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/pocket/reviewers/credentials",
        headers: {
          authorization: "Bearer token-teacher",
        },
        payload: {
          userId: doctorUserId,
          medicalLicenseNumber: "MED-HTTP-FAIL",
          specialty: "General Medicine",
          licensingAuthority: "Board",
          licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("GET /v1/pocket/reviewers/me returns active credential status", async () => {
      // First grant doctor a credential
      await routeService.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-ME-CHECK",
        specialty: "Anesthesiology",
        licensingAuthority: "Board",
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      // Doctor calls /me
      const resDoctor = await app.inject({
        method: "GET",
        url: "/v1/pocket/reviewers/me",
        headers: {
          authorization: "Bearer token-doctor",
        },
      });

      expect(resDoctor.statusCode).toBe(200);
      expect(resDoctor.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(resDoctor.headers["pragma"]).toBe("no-cache");
      const jsonDoctor = JSON.parse(resDoctor.payload);
      expect(jsonDoctor.data.isReviewer).toBe(true);
      expect(jsonDoctor.data.credential.medicalLicenseNumber).toBe("MED-ME-CHECK");

      // Non-doctor student calls /me
      const resStudent = await app.inject({
        method: "GET",
        url: "/v1/pocket/reviewers/me",
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(resStudent.statusCode).toBe(200);
      expect(resStudent.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(resStudent.headers["pragma"]).toBe("no-cache");
      const jsonStudent = JSON.parse(resStudent.payload);
      expect(jsonStudent.data.isReviewer).toBe(false);
      expect(jsonStudent.data.credential).toBeNull();
    });

    it("GET /v1/pocket/reviewers/credentials/:id restricts unauthorized non-admin access", async () => {
      const cred = await routeService.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-CONFIDENTIAL",
        specialty: "Pathology",
        licensingAuthority: "Board",
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      // Student attempts to inspect doctor's credential
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/reviewers/credentials/${cred.id}`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(403);

      // Doctor inspects own credential -> 200
      const resDoctor = await app.inject({
        method: "GET",
        url: `/v1/pocket/reviewers/credentials/${cred.id}`,
        headers: {
          authorization: "Bearer token-doctor",
        },
      });

      expect(resDoctor.statusCode).toBe(200);
      expect(JSON.parse(resDoctor.payload).data.id).toBe(cred.id);
    });

    it("POST /v1/pocket/reviewers/credentials/:id/reactivate & GET /events enforce platform_admin RBAC and 409 on revoked", async () => {
      const cred = await routeService.grantCredential(adminActor, {
        userId: doctorUserId,
        medicalLicenseNumber: "MED-ROUTE-LC",
        specialty: "Cardiology",
        licensingAuthority: "Board",
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
      await routeService.suspendCredential(adminActor, {
        credentialId: cred.id,
        reason: "Temporary suspension",
      });

      // Non-admin (teacher, doctor, student) cannot reactivate or view events -> 403
      for (const tok of ["token-teacher", "token-doctor", "token-student"]) {
        const reactivateDenied = await app.inject({
          method: "POST",
          url: `/v1/pocket/reviewers/credentials/${cred.id}/reactivate`,
          headers: { authorization: `Bearer ${tok}` },
          payload: { reason: "Unauthorized attempt" },
        });
        expect(reactivateDenied.statusCode).toBe(403);

        const eventsDenied = await app.inject({
          method: "GET",
          url: `/v1/pocket/reviewers/credentials/${cred.id}/events`,
          headers: { authorization: `Bearer ${tok}` },
        });
        expect(eventsDenied.statusCode).toBe(403);
      }

      // platform_admin reactivates -> 200
      const reactivateOk = await app.inject({
        method: "POST",
        url: `/v1/pocket/reviewers/credentials/${cred.id}/reactivate`,
        headers: { authorization: "Bearer token-admin" },
        payload: { reason: "Cleared by admin" },
      });
      expect(reactivateOk.statusCode).toBe(200);
      expect(JSON.parse(reactivateOk.payload).data.lifecycleStatus).toBe("active");

      // platform_admin revokes -> 200, then reactivate -> 409
      const revokeOk = await app.inject({
        method: "POST",
        url: `/v1/pocket/reviewers/credentials/${cred.id}/revoke`,
        headers: { authorization: "Bearer token-admin" },
        payload: { reason: "Permanent revocation" },
      });
      expect(revokeOk.statusCode).toBe(200);

      const reactivateAfterRevoke = await app.inject({
        method: "POST",
        url: `/v1/pocket/reviewers/credentials/${cred.id}/reactivate`,
        headers: { authorization: "Bearer token-admin" },
        payload: {},
      });
      expect(reactivateAfterRevoke.statusCode).toBe(409);

      // platform_admin inspects full event history -> 200
      const eventsOk = await app.inject({
        method: "GET",
        url: `/v1/pocket/reviewers/credentials/${cred.id}/events`,
        headers: { authorization: "Bearer token-admin" },
      });
      expect(eventsOk.statusCode).toBe(200);
      const eventsJson = JSON.parse(eventsOk.payload);
      expect(eventsJson.data.map((e: { eventType: string }) => e.eventType)).toEqual([
        "granted",
        "suspended",
        "reactivated",
        "revoked",
      ]);
    });
  });

  // ===========================================================================
  // Drizzle / PostgreSQL Database-Backed Integration
  // ===========================================================================

  describe("Drizzle Reviewer Store PostgreSQL Integration", () => {
    let client: ReturnType<typeof createDbClient> | null = null;
    let drizzleStore: DrizzleReviewerStore;
    let isConnected = false;

    const pgAdminUserId = randomUUID();
    const pgDoctorUserId = randomUUID();
    const pgRollbackUserId = randomUUID();

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
      drizzleStore = new DrizzleReviewerStore(client.db);

        // Seed admin and doctor in users table to satisfy foreign key constraints
        await client.db.insert(users).values([
          {
            id: pgAdminUserId,
            email: `pg-admin-${Date.now()}@avana.local`,
            name: "PG Admin",
            globalRole: "platform_admin",
          },
          {
            id: pgDoctorUserId,
            email: `pg-doc-${Date.now()}@avana.local`,
            name: "PG Doctor",
          },
          {
            id: pgRollbackUserId,
            email: `pg-rollback-${Date.now()}@avana.local`,
            name: "PG Rollback Doctor",
          },
        ]);
    });

    afterAll(async () => {
      if (isConnected && client) {
        try {
          await client.db
            .delete(pocketClinicalReviewerCredentials)
            .where(
              sql`${pocketClinicalReviewerCredentials.userId} IN (${pgDoctorUserId}, ${pgRollbackUserId})`,
            );
          await client.db
            .delete(users)
            .where(sql`${users.id} IN (${pgAdminUserId}, ${pgDoctorUserId}, ${pgRollbackUserId})`);
          await client.close();
        } catch {
          // ignore cleanup errors
        }
      }
    });

    it("verifies physical table insertion and partial unique constraint in real PostgreSQL", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      // 1. Insert first active credential
      const cred1 = await drizzleStore.create({
        userId: pgDoctorUserId,
        medicalLicenseNumber: "MED-PG-001",
        specialty: "Nephrology",
        licensingAuthority: "National Medical Council",
        grantedBy: pgAdminUserId,
        licenseExpiresAt: futureDate,
      });

      expect(cred1.id).toBeDefined();
      expect(cred1.isActive).toBe(true);

      // 2. Insert duplicate active credential -> must be rejected by PostgreSQL partial unique index and mapped to DomainError("conflict")
      let caughtConflictError: unknown;
      try {
        await drizzleStore.create({
          userId: pgDoctorUserId,
          medicalLicenseNumber: "MED-PG-DUP",
          specialty: "Nephrology",
          licensingAuthority: "Council",
          grantedBy: pgAdminUserId,
          licenseExpiresAt: futureDate,
        });
      } catch (err) {
        caughtConflictError = err;
      }
      expect(caughtConflictError).toBeInstanceOf(DomainError);
      expect((caughtConflictError as DomainError).code).toBe("conflict");
      expect((caughtConflictError as DomainError).message).toContain("already has an active clinical reviewer credential");

      // 2b. Attempt an unrelated unique violation (duplicate primary key on a different user) -> must NOT be converted to DomainError
      let caughtPkError: unknown;
      try {
        await drizzleStore.create({
          id: cred1.id, // primary key collision
          userId: pgRollbackUserId, // different user, so uq_pocket_active_reviewer is NOT violated
          medicalLicenseNumber: "MED-PG-PK-DUP",
          specialty: "Cardiology",
          licensingAuthority: "Council",
          grantedBy: pgAdminUserId,
          licenseExpiresAt: futureDate,
        });
      } catch (err) {
        caughtPkError = err;
      }
      expect(caughtPkError).toBeDefined();
      expect(caughtPkError).not.toBeInstanceOf(DomainError);

      // 3. Suspend first credential
      await drizzleStore.suspend({
        id: cred1.id,
        suspensionReason: "Testing suspension transition in PG",
      });

      // 4. Now a new active credential can be inserted for the same user (partial unique index allows multiple inactive)
      const cred2 = await drizzleStore.create({
        userId: pgDoctorUserId,
        medicalLicenseNumber: "MED-PG-002",
        specialty: "Nephrology",
        licensingAuthority: "National Medical Council",
        grantedBy: pgAdminUserId,
        licenseExpiresAt: futureDate,
      });

      expect(cred2.id).toBeDefined();
      expect(cred2.isActive).toBe(true);

      // 5. Query active credential returns cred2
      const active = await drizzleStore.findActiveByUserId(pgDoctorUserId);
      expect(active?.id).toBe(cred2.id);

      // 6. List all shows 2 historical records
      const all = await drizzleStore.listByUserId(pgDoctorUserId);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it("verifies transactional rollback in real PostgreSQL leaves no partial records", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const testRevokeId = randomUUID();

      // Attempt transaction that creates a credential and then throws
      await expect(
        client.db.transaction(async (tx) => {
          await drizzleStore.create(
            {
              id: testRevokeId,
              userId: pgRollbackUserId,
              medicalLicenseNumber: "MED-PG-TX-ROLLBACK",
              specialty: "Cardiology",
              licensingAuthority: "Medical Council",
              grantedBy: pgAdminUserId,
              licenseExpiresAt: futureDate,
            },
            tx,
          );

          // Force rollback
          throw new Error("Simulated transactional failure");
        }),
      ).rejects.toThrow("Simulated transactional failure");

      // Verify the rolled-back record does NOT exist in real PostgreSQL
      const record = await drizzleStore.findById(testRevokeId);
      expect(record).toBeNull();
    });

    it("verifies reviewer authorization and expiration evaluation against real PostgreSQL", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const pgService = new ReviewerService({
        reviewerStore: drizzleStore,
        db: client.db,
      });

      // 1. Current active doctor credential passes assertActiveReviewer
      const activeCred = await pgService.assertActiveReviewer(pgDoctorUserId);
      expect(activeCred.isActive).toBe(true);
      expect(activeCred.userId).toBe(pgDoctorUserId);

      // 2. Suspend credential via service in a real PostgreSQL transaction
      await pgService.suspendCredential(
        { userId: pgAdminUserId, globalRole: "platform_admin", role: "platform_admin" } as Actor,
        {
          credentialId: activeCred.id,
          reason: "Suspended for audit verification",
        },
      );

      // 3. Authorization immediately fails with forbidden error
      await expect(pgService.assertActiveReviewer(pgDoctorUserId)).rejects.toThrow(DomainError);

      // 4. Inactive doctor returns null from getActiveCredentialForUser
      const queryResult = await pgService.getActiveCredentialForUser(
        { userId: pgDoctorUserId, globalRole: "student", role: "student" } as Actor,
      );
      expect(queryResult).toBeNull();
    });

    it("covers full PostgreSQL credential lifecycle (grant, suspend, reactivate, revoke), append-only trigger, rollback, and invalidation across Verification, Publishing, and Consumption", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const pgAdmin: Actor = {
        userId: pgAdminUserId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };
      const lifecycleUserId = randomUUID();
      const expiredUserId = randomUUID();
      const nonAdminActor: Actor = {
        userId: lifecycleUserId as Actor["userId"],
        role: "teacher",
        globalRole: null,
        teacherStatus: "approved",
      };

      await client.db.insert(users).values([
        {
          id: lifecycleUserId,
          email: `pg-lifecycle-${Date.now()}@avana.local`,
          name: "PG Lifecycle Reviewer",
          role: "teacher",
        },
        {
          id: expiredUserId,
          email: `pg-expired-${Date.now()}@avana.local`,
          name: "PG Expired Reviewer",
          role: "teacher",
        },
      ]);

      const pgService = new ReviewerService({
        reviewerStore: drizzleStore,
        db: client.db,
      });

      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      // 1. Grant + granted event
      const granted = await pgService.grantCredential(pgAdmin, {
        userId: lifecycleUserId,
        medicalLicenseNumber: "MD-LC-001",
        specialty: "Emergency Medicine",
        licensingAuthority: "IRIMC",
        licenseExpiresAt: futureDate,
        reason: "Initial board approval",
      });
      expect(granted.lifecycleStatus).toBe("active");
      expect(granted.validityStatus).toBe("valid");
      expect(granted.revokedAt).toBeNull();

      // 7. Duplicate active credential prevented (409)
      await expect(
        pgService.grantCredential(pgAdmin, {
          userId: lifecycleUserId,
          medicalLicenseNumber: "MD-LC-DUP",
          specialty: "Emergency Medicine",
          licensingAuthority: "IRIMC",
          licenseExpiresAt: futureDate,
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      // Reactivate on already active -> 409
      await expect(
        pgService.reactivateCredential(pgAdmin, { credentialId: granted.id }),
      ).rejects.toMatchObject({ code: "conflict" });

      // 2. Suspend requires non-empty reason (400), then succeeds + suspended event
      await expect(
        pgService.suspendCredential(pgAdmin, { credentialId: granted.id, reason: "   " }),
      ).rejects.toMatchObject({ code: "bad_request" });

      const suspended = await pgService.suspendCredential(pgAdmin, {
        credentialId: granted.id,
        reason: "Temporary leave",
      });
      expect(suspended.lifecycleStatus).toBe("suspended");
      expect(suspended.isActive).toBe(false);
      expect(suspended.suspendedAt).not.toBeNull();
      expect(suspended.revokedAt).toBeNull();
      expect(suspended.isLegacyStatusAmbiguous).toBe(false);

      // Duplicate suspend -> 409
      await expect(
        pgService.suspendCredential(pgAdmin, {
          credentialId: granted.id,
          reason: "Duplicate suspend",
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      // 3. Reactivate succeeds + reactivated event
      const reactivated = await pgService.reactivateCredential(pgAdmin, {
        credentialId: granted.id,
        reason: "Returned from leave",
      });
      expect(reactivated.lifecycleStatus).toBe("active");
      expect(reactivated.isActive).toBe(true);
      expect(reactivated.suspendedAt).toBeNull();
      expect(reactivated.revokedAt).toBeNull();

      // 9. Second Suspend + Reactivate cycle preserves chronological event history
      await pgService.suspendCredential(pgAdmin, {
        credentialId: granted.id,
        reason: "Second audit pause",
      });
      await pgService.reactivateCredential(pgAdmin, {
        credentialId: granted.id,
      });

      // 8. Clinical impact: verify assertion, publish, then suspend & verify invalidation across Verification/Publishing/Consumption
      const drugId = randomUUID();
      await client.db.insert(pocketDrugs).values({
        id: drugId,
        slug: `pg-lc-drug-${Date.now()}`,
        genericNameEn: "Epinephrine",
        genericNameFa: "اپی‌نفرین",
        drugClass: "Sympathomimetic",
        mechanismOfAction: "Alpha and beta adrenergic agonist",
      });

      const reviewStore = new DrizzleAssertionReviewStore(client.db);
      const verifStore = new DrizzleAssertionVerificationStore(client.db);
      const pubStore = new DrizzleAssertionPublishingStore(client.db);
      const consumptionStore = new DrizzleAssertionConsumptionStore(client.db);

      const verifService = new AssertionVerificationService({
        verificationStore: verifStore,
        assertionStore: reviewStore,
        reviewerService: pgService,
        db: client.db,
      });
      const pubService = new AssertionPublishingService({
        publishingStore: pubStore,
        assertionStore: reviewStore,
        verificationStore: verifStore,
        db: client.db,
      });

      const rootId = randomUUID();
      const dosingAssertion = await reviewStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.lc.quorum",
        assertionType: "general_info",
        statementText: "Initial general dosing note for lifecycle verification.",
        drugId,
        status: "reviewed",
      });

      await verifService.verifyAssertion(
        { userId: lifecycleUserId as Actor["userId"], role: "teacher", globalRole: null },
        { assertionId: dosingAssertion.id, clinicalReviewNotes: "Approved by active reviewer" },
      );

      // Publish v1 while active
      const published = await pubService.publishAssertion(pgAdmin, {
        assertionId: dosingAssertion.id,
      });
      expect(published.publishedAssertion.status).toBe("published");

      // Create v2 verified while active, then suspend reviewer -> v2 publishing fails 409 due to lost quorum!
      const v2 = await reviewStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: dosingAssertion.id,
        assertionKey: "dosing.lc.quorum",
        assertionType: "general_info",
        statementText: "Updated dosing note v2.",
        drugId,
        status: "reviewed",
      });
      await verifService.verifyAssertion(
        { userId: lifecycleUserId as Actor["userId"], role: "teacher", globalRole: null },
        { assertionId: v2.id, clinicalReviewNotes: "Approved v2 before suspension" },
      );

      // Suspend reviewer -> Verification (403), Publishing v2 (409 lost quorum), Consumption (filtered out), votes preserved!
      await pgService.suspendCredential(pgAdmin, {
        credentialId: granted.id,
        reason: "Suspended during clinical check",
      });

      await expect(
        verifService.verifyAssertion(
          { userId: lifecycleUserId as Actor["userId"], role: "teacher", globalRole: null },
          { assertionId: v2.id, clinicalReviewNotes: "Should fail 403" },
        ),
      ).rejects.toMatchObject({ code: "forbidden" });

      await expect(
        pubService.publishAssertion(pgAdmin, { assertionId: v2.id }),
      ).rejects.toMatchObject({ code: "conflict" });

      // Resolver & Consumption immediately treat suspended reviewer's published assertion as unverified
      const summariesAfterSuspend = await resolveAssertionVerificationSummariesFromDb(
        [
          {
            assertionId: dosingAssertion.id,
            aggregateType: "drug",
            aggregateId: drugId,
            assertionType: "general_info",
          },
        ],
        client.db,
      );
      expect(summariesAfterSuspend.get(dosingAssertion.id)?.isClinicallyVerified).toBe(false);
      expect(
        summariesAfterSuspend.get(dosingAssertion.id)?.reviewerCredentialValidity[lifecycleUserId]?.reason,
      ).toBe("suspended_or_revoked");

      const consumedAfterSuspend = await consumptionStore.findPublishedByAggregate("drug", drugId);
      expect(consumedAfterSuspend?.assertions ?? []).toHaveLength(0);

      // Verification votes & assertion rows remain intact (not deleted)
      const preservedVotes = await client.db
        .select()
        .from(pocketAssertionVerifications)
        .where(sql`${pocketAssertionVerifications.assertionId} = ${dosingAssertion.id}`);
      expect(preservedVotes).toHaveLength(1);

      // 4. Revoke requires non-empty reason (400), works from suspended state, and emits revoked event
      await expect(
        pgService.revokeCredential(pgAdmin, { credentialId: granted.id, reason: "" }),
      ).rejects.toMatchObject({ code: "bad_request" });

      const revoked = await pgService.revokeCredential(pgAdmin, {
        credentialId: granted.id,
        reason: "Permanent license revocation",
      });
      expect(revoked.lifecycleStatus).toBe("revoked");
      expect(revoked.isActive).toBe(false);
      expect(revoked.revokedAt).not.toBeNull();
      expect(revoked.revokedBy).toBe(pgAdminUserId);
      expect(revoked.revocationReason).toBe("Permanent license revocation");

      // Resolver distinguishes 'revoked' independently
      const summariesAfterRevoke = await resolveAssertionVerificationSummariesFromDb(
        [
          {
            assertionId: dosingAssertion.id,
            aggregateType: "drug",
            aggregateId: drugId,
            assertionType: "general_info",
          },
        ],
        client.db,
      );
      expect(
        summariesAfterRevoke.get(dosingAssertion.id)?.reviewerCredentialValidity[lifecycleUserId]?.reason,
      ).toBe("revoked");

      // 5. Prevent Reactivate, Suspend, and duplicate Revoke on revoked credential (all 409)
      await expect(
        pgService.reactivateCredential(pgAdmin, { credentialId: granted.id }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        pgService.suspendCredential(pgAdmin, { credentialId: granted.id, reason: "Cannot suspend" }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        pgService.revokeCredential(pgAdmin, { credentialId: granted.id, reason: "Duplicate revoke" }),
      ).rejects.toMatchObject({ code: "conflict" });

      // Verify full event timeline + platform_admin-only GET /events endpoint
      const events = await pgService.listCredentialEvents(pgAdmin, granted.id);
      expect(events.map((e) => e.eventType)).toEqual([
        "granted",
        "suspended",
        "reactivated",
        "suspended",
        "reactivated",
        "suspended",
        "revoked",
      ]);
      await expect(
        pgService.listCredentialEvents(nonAdminActor, granted.id),
      ).rejects.toMatchObject({ code: "forbidden" });

      // Direct PostgreSQL trigger test: UPDATE and DELETE on pocket_reviewer_credential_events must fail!
      const firstEventId = events[0].id;
      await expect(
        client.db.execute(
          sql`UPDATE pocket_reviewer_credential_events SET reason = 'tampered' WHERE id = ${firstEventId}::uuid`,
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(/append-only/),
        }),
      });
      await expect(
        client.db.execute(
          sql`DELETE FROM pocket_reviewer_credential_events WHERE id = ${firstEventId}::uuid`,
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(/append-only/),
        }),
      });

      // 6. Prevent Reactivate of an expired suspended credential (409)
      const [expiredCredRow] = await client.db
        .insert(pocketClinicalReviewerCredentials)
        .values({
          userId: expiredUserId,
          medicalLicenseNumber: "MD-EXP-001",
          specialty: "Cardiology",
          licensingAuthority: "IRIMC",
          isActive: false,
          suspendedAt: new Date(Date.now() - 86_400_000 * 5),
          suspensionReason: "Old suspension",
          grantedBy: pgAdminUserId,
          licenseExpiresAt: new Date(Date.now() - 86_400_000),
        })
        .returning();

      await expect(
        pgService.reactivateCredential(pgAdmin, { credentialId: expiredCredRow.id }),
      ).rejects.toMatchObject({ code: "conflict" });

      // 10. Full rollback if insertEvent fails inside transaction
      const rollbackCredUserId = randomUUID();
      await client.db.insert(users).values({
        id: rollbackCredUserId,
        email: `pg-rb-event-${Date.now()}@avana.local`,
        name: "PG Rollback Event User",
      });
      const failingEventStore = Object.create(drizzleStore) as DrizzleReviewerStore;
      failingEventStore.insertEvent = async () => {
        throw new Error("Simulated event insert failure");
      };
      const failingPgService = new ReviewerService({
        reviewerStore: failingEventStore,
        db: client.db,
      });

      await expect(
        failingPgService.grantCredential(pgAdmin, {
          userId: rollbackCredUserId,
          medicalLicenseNumber: "MD-RB-EVT",
          specialty: "Neurology",
          licensingAuthority: "IRIMC",
          licenseExpiresAt: futureDate,
        }),
      ).rejects.toThrow("Simulated event insert failure");

      const rolledBackCred = await drizzleStore.findActiveByUserId(rollbackCredUserId);
      expect(rolledBackCred).toBeNull();
    });

    it("serializes concurrent reactivate calls on two different suspended credentials for the same user so at most one succeeds (409 for loser, single event)", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const pgAdmin: Actor = {
        userId: pgAdminUserId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };
      const raceUserId = randomUUID();
      await client.db.insert(users).values({
        id: raceUserId,
        email: `pg-reactivate-race-${Date.now()}@avana.local`,
        name: "PG Reactivate Race User",
        role: "teacher",
      });

      const pgService = new ReviewerService({
        reviewerStore: drizzleStore,
        db: client.db,
      });
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const credA = await pgService.grantCredential(pgAdmin, {
        userId: raceUserId,
        medicalLicenseNumber: "MD-RACE-A",
        specialty: "Cardiology",
        licensingAuthority: "IRIMC",
        licenseExpiresAt: futureDate,
      });
      await pgService.suspendCredential(pgAdmin, {
        credentialId: credA.id,
        reason: "Suspend A before race",
      });

      const credB = await pgService.grantCredential(pgAdmin, {
        userId: raceUserId,
        medicalLicenseNumber: "MD-RACE-B",
        specialty: "Cardiology",
        licensingAuthority: "IRIMC",
        licenseExpiresAt: futureDate,
      });
      await pgService.suspendCredential(pgAdmin, {
        credentialId: credB.id,
        reason: "Suspend B before race",
      });

      const results = await Promise.allSettled([
        pgService.reactivateCredential(pgAdmin, {
          credentialId: credA.id,
          reason: "Race winner A",
        }),
        pgService.reactivateCredential(pgAdmin, {
          credentialId: credB.id,
          reason: "Race winner B",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: "conflict",
      });

      // Exactly 1 active credential exists for raceUserId
      const allForUser = await drizzleStore.listByUserId(raceUserId);
      const activeForUser = allForUser.filter((c) => c.isActive);
      expect(activeForUser).toHaveLength(1);

      // Exactly 1 'reactivated' event recorded across both credentials (loser rolled back)
      const eventsA = await drizzleStore.listEventsByCredentialId(credA.id);
      const eventsB = await drizzleStore.listEventsByCredentialId(credB.id);
      const reactivatedEvents = [...eventsA, ...eventsB].filter(
        (e) => e.eventType === "reactivated",
      );
      expect(reactivatedEvents).toHaveLength(1);
    });
  });
});
