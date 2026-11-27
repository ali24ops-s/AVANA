/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq, inArray } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import {
  users,
  pocketDrugs,
  pocketScientificAssertions,
  pocketAssertionAuditLog,
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
} from "@avana/database/schema";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket Phase C.2.2: Verification Chain Integrity & Locking (PostgreSQL)", () => {
  let client: ReturnType<typeof createDbClient> | null = null;
  let verificationStore: DrizzleAssertionVerificationStore;
  let reviewStore: DrizzleAssertionReviewStore;
  let reviewerStore: DrizzleReviewerStore;

  const reviewer1Id = randomUUID();
  const reviewer2Id = randomUUID();
  const drugId = randomUUID();
  const assertion1Id = randomUUID();
  const assertion2Id = randomUUID();
  const createdVerificationIds: string[] = [];

  beforeAll(async () => {
    const dbUrl = resolveSafePostgresTestUrl();
    client = createDbClient(dbUrl);
    await client.db.execute(sql`SELECT 1;`);

    verificationStore = new DrizzleAssertionVerificationStore(client.db);
    reviewStore = new DrizzleAssertionReviewStore(client.db);
    reviewerStore = new DrizzleReviewerStore(client.db);

    // Seed 2 reviewer users
    await client.db.insert(users).values([
      {
        id: reviewer1Id,
        email: `c22-rev1-${reviewer1Id.slice(0, 8)}@avana.test`,
        name: "C22 Reviewer 1",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "user",
      },
      {
        id: reviewer2Id,
        email: `c22-rev2-${reviewer2Id.slice(0, 8)}@avana.test`,
        name: "C22 Reviewer 2",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "user",
      },
    ]);

    // Seed active credentials for both reviewers
    const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await client.db.insert(pocketClinicalReviewerCredentials).values([
      {
        userId: reviewer1Id,
        medicalLicenseNumber: `LIC-C22-1-${reviewer1Id.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Clinical Pharmacy",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewer1Id,
        licenseExpiresAt: futureExpiry,
      },
      {
        userId: reviewer2Id,
        medicalLicenseNumber: `LIC-C22-2-${reviewer2Id.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Internal Medicine",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewer2Id,
        licenseExpiresAt: futureExpiry,
      },
    ]);

    // Seed drug + 2 assertions
    await client.db.insert(pocketDrugs).values({
      id: drugId,
      slug: `c22-test-drug-${drugId.slice(0, 8)}`,
      genericNameEn: `C22 Test Drug ${drugId.slice(0, 8)}`,
      genericNameFa: "داروی تست",
      drugClass: "Test Class",
      mechanismOfAction: "Test MOA",
      status: "published",
      publishedAt: new Date(),
    });

    await client.db.insert(pocketScientificAssertions).values([
      {
        id: assertion1Id,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId,
        assertionType: "dosing",
        assertionKey: `c22_key_1_${assertion1Id.slice(0, 8)}`,
        statementText: "Assertion 1 for chain integrity tests.",
        status: "pending_review",
      },
      {
        id: assertion2Id,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId,
        assertionType: "contraindication",
        assertionKey: `c22_key_2_${assertion2Id.slice(0, 8)}`,
        statementText: "Assertion 2 for cross-assertion parent rejection tests.",
        status: "pending_review",
      },
    ]);
  });

  afterAll(async () => {
    if (!client) return;
    try {
      // Delete verifications from leaves to roots because fk_verif_parent_same_assertion_reviewer is ON DELETE RESTRICT
      if (createdVerificationIds.length > 0) {
        for (let i = createdVerificationIds.length - 1; i >= 0; i--) {
          await client.db
            .delete(pocketAssertionVerifications)
            .where(eq(pocketAssertionVerifications.id, createdVerificationIds[i]));
        }
      }
      await client.db
        .delete(pocketAssertionVerifications)
        .where(inArray(pocketAssertionVerifications.assertionId, [assertion1Id, assertion2Id]));
      await client.db
        .delete(pocketScientificAssertions)
        .where(inArray(pocketScientificAssertions.id, [assertion1Id, assertion2Id]));
      await client.db
        .delete(pocketDrugs)
        .where(eq(pocketDrugs.id, drugId));
      await client.db
        .delete(pocketClinicalReviewerCredentials)
        .where(inArray(pocketClinicalReviewerCredentials.userId, [reviewer1Id, reviewer2Id]));
      await client.db
        .delete(users)
        .where(inArray(users.id, [reviewer1Id, reviewer2Id]));
    } finally {
      await client.close();
    }
  });

  it("1 & 2. accepts a root verification (parent = null) and a valid child (same assertion + reviewer)", async () => {
    const root = await verificationStore.createVerification({
      assertionId: assertion1Id,
      reviewerUserId: reviewer1Id,
      verificationAction: "approved",
      clinicalReviewNotes: "Initial approval root.",
      parentVerificationId: null,
    });
    createdVerificationIds.push(root.id);

    expect(root.parentVerificationId).toBeNull();
    expect(await verificationStore.hasChildVerification(root.id)).toBe(false);

    const child = await verificationStore.createVerification({
      assertionId: assertion1Id,
      reviewerUserId: reviewer1Id,
      verificationAction: "revoked",
      clinicalReviewNotes: "Follow-up revocation child.",
      parentVerificationId: root.id,
    });
    createdVerificationIds.push(child.id);

    expect(child.parentVerificationId).toBe(root.id);
    expect(await verificationStore.hasChildVerification(root.id)).toBe(true);
    expect(await verificationStore.hasChildVerification(child.id)).toBe(false);
  });

  it("3. rejects parent belonging to a different assertion", async () => {
    const rev1Assertion1Latest =
      await verificationStore.findLatestVerificationByReviewerAndAssertion(
        reviewer1Id,
        assertion1Id,
      );
    expect(rev1Assertion1Latest).not.toBeNull();

    await expect(
      verificationStore.createVerification({
        assertionId: assertion2Id,
        reviewerUserId: reviewer1Id,
        verificationAction: "approved",
        clinicalReviewNotes: "Cross-assertion parent must fail.",
        parentVerificationId: rev1Assertion1Latest!.id,
      }),
    ).rejects.toThrow();
  });

  it("4. rejects parent belonging to a different reviewer", async () => {
    const rev1Assertion1Latest =
      await verificationStore.findLatestVerificationByReviewerAndAssertion(
        reviewer1Id,
        assertion1Id,
      );
    expect(rev1Assertion1Latest).not.toBeNull();

    await expect(
      verificationStore.createVerification({
        assertionId: assertion1Id,
        reviewerUserId: reviewer2Id,
        verificationAction: "approved",
        clinicalReviewNotes: "Cross-reviewer parent must fail.",
        parentVerificationId: rev1Assertion1Latest!.id,
      }),
    ).rejects.toThrow();
  });

  it("5. prevents orphan verification referencing non-existent parentVerificationId", async () => {
    await expect(
      verificationStore.createVerification({
        assertionId: assertion1Id,
        reviewerUserId: reviewer2Id,
        verificationAction: "approved",
        clinicalReviewNotes: "Orphan parent must fail.",
        parentVerificationId: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it("6. prevents fork (two children referencing the same parentVerificationId)", async () => {
    const rev1Assertion1Latest =
      await verificationStore.findLatestVerificationByReviewerAndAssertion(
        reviewer1Id,
        assertion1Id,
      );
    expect(rev1Assertion1Latest).not.toBeNull();

    // rev1's root already has a child from test 1&2; trying to attach another child to root must fail
    const allRev1 = await verificationStore.findVerificationsByAssertionId(assertion1Id);
    const root = allRev1.find(
      (v) => v.reviewerUserId === reviewer1Id && v.parentVerificationId === null,
    );
    expect(root).toBeDefined();

    await expect(
      verificationStore.createVerification({
        assertionId: assertion1Id,
        reviewerUserId: reviewer1Id,
        verificationAction: "approved",
        clinicalReviewNotes: "Fork attempt must fail.",
        parentVerificationId: root!.id,
      }),
    ).rejects.toThrow();
  });

  it("7. prevents multi-root for the same (assertionId, reviewerUserId)", async () => {
    // reviewer1 already has a root on assertion1Id
    await expect(
      verificationStore.createVerification({
        assertionId: assertion1Id,
        reviewerUserId: reviewer1Id,
        verificationAction: "approved",
        clinicalReviewNotes: "Second root for same reviewer+assertion must fail.",
        parentVerificationId: null,
      }),
    ).rejects.toThrow();
  });

  it("8. prevents self-reference (parentVerificationId = id)", async () => {
    const selfId = randomUUID();
    await expect(
      client!.db.insert(pocketAssertionVerifications).values({
        id: selfId,
        assertionId: assertion2Id,
        reviewerUserId: reviewer2Id,
        verificationAction: "approved",
        clinicalReviewNotes: "Self-referencing parent must fail.",
        parentVerificationId: selfId,
      }),
    ).rejects.toThrow();
  });

  it("9. resolves latest vote deterministically by (verifiedAt DESC, id DESC) including timestamp ties", async () => {
    // Use reviewer2 on assertion2Id with explicit identical verifiedAt timestamps and controlled UUIDs
    const fixedTime = new Date("2026-01-15T12:00:00.000Z");
    const lowerUuid = "00000000-0000-4000-8000-000000000001";
    const higherUuid = "00000000-0000-4000-8000-000000000002";

    await client!.db.insert(pocketAssertionVerifications).values({
      id: lowerUuid,
      assertionId: assertion2Id,
      reviewerUserId: reviewer2Id,
      verificationAction: "approved",
      clinicalReviewNotes: "Tie-break root (lower UUID).",
      parentVerificationId: null,
      verifiedAt: fixedTime,
    });
    createdVerificationIds.push(lowerUuid);

    await client!.db.insert(pocketAssertionVerifications).values({
      id: higherUuid,
      assertionId: assertion2Id,
      reviewerUserId: reviewer2Id,
      verificationAction: "rejected",
      clinicalReviewNotes: "Tie-break child (higher UUID, same verifiedAt).",
      parentVerificationId: lowerUuid,
      verifiedAt: fixedTime,
    });
    createdVerificationIds.push(higherUuid);

    const latest = await verificationStore.findLatestVerificationByReviewerAndAssertion(
      reviewer2Id,
      assertion2Id,
    );
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(higherUuid);
    expect(latest!.verificationAction).toBe("rejected");

    const viaAlias = await verificationStore.findVerificationByReviewerAndAssertion(
      reviewer2Id,
      assertion2Id,
    );
    expect(viaAlias?.id).toBe(higherUuid);

    const list = await verificationStore.findVerificationsByAssertionId(assertion2Id);
    expect(list.map((v) => v.id)).toEqual([higherUuid, lowerUuid]);
  });

  it("10. acquires PostgreSQL row locks via findByIdForUpdate and findActiveByUserIdForUpdate inside tx", async () => {
    await client!.db.transaction(async (tx1) => {
      const lockedAssertion = await reviewStore.findByIdForUpdate(assertion1Id, tx1);
      expect(lockedAssertion).not.toBeNull();
      expect(lockedAssertion!.id).toBe(assertion1Id);

      const lockedCred = await reviewerStore.findActiveByUserIdForUpdate(reviewer1Id, tx1);
      expect(lockedCred).not.toBeNull();
      expect(lockedCred!.userId).toBe(reviewer1Id);

      // A separate connection/tx attempting FOR UPDATE NOWAIT on the same rows must fail with lock_not_available (55P03)
      const contender = createDbClient(resolveSafePostgresTestUrl());
      try {
        await expect(
          contender.db.transaction(async (tx2) => {
            await tx2.execute(
              sql`SELECT id FROM pocket_scientific_assertions WHERE id = ${assertion1Id} FOR UPDATE NOWAIT`,
            );
          }),
        ).rejects.toThrow();

        await expect(
          contender.db.transaction(async (tx2) => {
            await tx2.execute(
              sql`SELECT id FROM pocket_clinical_reviewer_credentials WHERE user_id = ${reviewer1Id} AND is_active = true FOR UPDATE NOWAIT`,
            );
          }),
        ).rejects.toThrow();
      } finally {
        await contender.close();
      }
    });
  });

  it("11. executes Multi-Reviewer Write Workflow on PostgreSQL without mutating published_at/updated_at and rolls back on audit failure", async () => {
    const reviewerService = new ReviewerService({
      reviewerStore,
      db: client!.db,
    });
    const service = new AssertionVerificationService({
      verificationStore,
      assertionStore: reviewStore,
      reviewerService,
      db: client!.db,
    });

    const pubAssertionId = randomUUID();
    const fixedUpdatedAt = new Date("2025-05-01T09:00:00.000Z");
    const [drugBefore] = await client!.db
      .select()
      .from(pocketDrugs)
      .where(eq(pocketDrugs.id, drugId));

    await client!.db.insert(pocketScientificAssertions).values({
      id: pubAssertionId,
      assertionRootId: randomUUID(),
      versionNumber: 1,
      drugId,
      assertionType: "dosing",
      assertionKey: `c23_pub_${pubAssertionId.slice(0, 8)}`,
      statementText: "Published assertion for C.2.3 PG test.",
      status: "published",
      updatedAt: fixedUpdatedAt,
    });

    try {
      const r1 = await service.verifyAssertion(
        { userId: reviewer1Id as `${string}`, role: "teacher", globalRole: null },
        { assertionId: pubAssertionId, clinicalReviewNotes: "PG published verify R1" },
      );
      createdVerificationIds.push(r1.verification.id);

      const r2 = await service.rejectAssertionVerification(
        { userId: reviewer1Id as `${string}`, role: "teacher", globalRole: null },
        { assertionId: pubAssertionId, clinicalReviewNotes: "PG published reject R1" },
      );
      createdVerificationIds.push(r2.verification.id);
      expect(r2.verification.parentVerificationId).toBe(r1.verification.id);

      const [row] = await client!.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, pubAssertionId));
      expect(row.status).toBe("published");
      expect(row.updatedAt.getTime()).toBe(fixedUpdatedAt.getTime());

      const [drugAfter] = await client!.db
        .select()
        .from(pocketDrugs)
        .where(eq(pocketDrugs.id, drugId));
      expect(drugAfter.publishedAt?.getTime()).toBe(drugBefore.publishedAt?.getTime());

      // Simulate audit log failure -> full rollback in PostgreSQL
      const failingAssertionStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
      failingAssertionStore.insertAuditLog = async () => {
        throw new Error("Simulated PG audit insert failure");
      };
      const failingService = new AssertionVerificationService({
        verificationStore,
        assertionStore: failingAssertionStore,
        reviewerService,
        db: client!.db,
      });

      await expect(
        failingService.verifyAssertion(
          { userId: reviewer2Id as `${string}`, role: "teacher", globalRole: null },
          { assertionId: pubAssertionId, clinicalReviewNotes: "Should roll back completely" },
        ),
      ).rejects.toThrow("Simulated PG audit insert failure");

      const verifs = await verificationStore.findVerificationsByAssertionId(pubAssertionId);
      expect(verifs.filter((v) => v.reviewerUserId === reviewer2Id)).toHaveLength(0);
    } finally {
      for (const vid of [...createdVerificationIds].reverse()) {
        await client!.db
          .delete(pocketAssertionVerifications)
          .where(eq(pocketAssertionVerifications.id, vid))
          .catch(() => {});
      }
      await client!.db
        .delete(pocketAssertionVerifications)
        .where(eq(pocketAssertionVerifications.assertionId, pubAssertionId))
        .catch(() => {});
      await client!.db
        .delete(pocketAssertionAuditLog)
        .where(eq(pocketAssertionAuditLog.assertionId, pubAssertionId))
        .catch(() => {});
      await client!.db
        .delete(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, pubAssertionId))
        .catch(() => {});
    }
  });
});
