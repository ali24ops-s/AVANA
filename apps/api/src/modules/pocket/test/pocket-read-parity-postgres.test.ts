/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq, inArray } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import {
  users,
  pocketDrugs,
  pocketScientificAssertions,
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
  pocketClinicalConflicts,
  pocketSafetyOverrides,
} from "@avana/database/schema";
import { DrizzleAssertionConsumptionStore } from "../drizzle-assertion-consumption-store.js";
import { DrizzlePocketSearchStore } from "../drizzle-pocket-search-store.js";
import { evaluateAssertionVerificationSummary } from "../assertion-verification-resolver.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket Phase B: Search & Consumption PostgreSQL Read Parity", () => {
  let client: ReturnType<typeof createDbClient> | null = null;
  let consumptionStore: DrizzleAssertionConsumptionStore;
  let searchStore: DrizzlePocketSearchStore;
  const isNetworkUnavailable = false;

  const reviewerValid1Id = randomUUID();
  const reviewerValid2Id = randomUUID();
  const reviewerValid3Id = randomUUID();
  const reviewerExpiredId = randomUUID();
  const reviewerSuspendedId = randomUUID();
  const drugId = randomUUID();

  const createdAssertionIds: string[] = [];
  const createdVerificationIds: string[] = [];
  const createdConflictIds: string[] = [];
  const createdOverrideIds: string[] = [];

  beforeAll(async () => {
    const dbUrl = resolveSafePostgresTestUrl();
    client = createDbClient(dbUrl);
    await client.db.execute(sql`SELECT 1;`);
    consumptionStore = new DrizzleAssertionConsumptionStore(client.db);
    searchStore = new DrizzlePocketSearchStore(client.db);

    const futureDate = new Date("2030-01-01T00:00:00Z");
    const pastDate = new Date("2020-01-01T00:00:00Z");
    const ts = Date.now();

    await client.db.insert(users).values([
      { id: reviewerValid1Id, email: `parity-r1-${ts}@avana.local`, name: "Parity Reviewer 1" },
      { id: reviewerValid2Id, email: `parity-r2-${ts}@avana.local`, name: "Parity Reviewer 2" },
      { id: reviewerValid3Id, email: `parity-r3-${ts}@avana.local`, name: "Parity Reviewer 3" },
      { id: reviewerExpiredId, email: `parity-exp-${ts}@avana.local`, name: "Parity Reviewer Expired" },
      { id: reviewerSuspendedId, email: `parity-susp-${ts}@avana.local`, name: "Parity Reviewer Suspended" },
    ]);

    await client.db.insert(pocketClinicalReviewerCredentials).values([
      {
        userId: reviewerValid1Id,
        medicalLicenseNumber: `PAR-1-${ts}`,
        specialty: "Pharmacology",
        licensingAuthority: "Council",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewerValid1Id,
        licenseExpiresAt: futureDate,
      },
      {
        userId: reviewerValid2Id,
        medicalLicenseNumber: `PAR-2-${ts}`,
        specialty: "Internal Medicine",
        licensingAuthority: "Council",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewerValid1Id,
        licenseExpiresAt: futureDate,
      },
      {
        userId: reviewerValid3Id,
        medicalLicenseNumber: `PAR-3-${ts}`,
        specialty: "Cardiology",
        licensingAuthority: "Council",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewerValid1Id,
        licenseExpiresAt: futureDate,
      },
      {
        userId: reviewerExpiredId,
        medicalLicenseNumber: `PAR-EXP-${ts}`,
        specialty: "Pediatrics",
        licensingAuthority: "Council",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewerValid1Id,
        licenseExpiresAt: pastDate,
      },
      {
        userId: reviewerSuspendedId,
        medicalLicenseNumber: `PAR-SUSP-${ts}`,
        specialty: "Neurology",
        licensingAuthority: "Council",
        isActive: false,
        suspendedAt: new Date("2026-01-01T00:00:00Z"),
        grantedBy: reviewerValid1Id,
        licenseExpiresAt: futureDate,
      },
    ]);

    await client.db.insert(pocketDrugs).values({
      id: drugId,
      slug: `parity-drug-${ts}`,
      genericNameEn: "Parity Drug",
      genericNameFa: "داروی همسانی",
      drugClass: "Parity Class",
      mechanismOfAction: "Parity MOA",
      status: "published",
      publishedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (!client || isNetworkUnavailable) return;
    try {
      if (createdOverrideIds.length > 0) {
        await client.db.delete(pocketSafetyOverrides).where(inArray(pocketSafetyOverrides.id, createdOverrideIds));
      }
      if (createdConflictIds.length > 0) {
        await client.db.delete(pocketClinicalConflicts).where(inArray(pocketClinicalConflicts.id, createdConflictIds));
      }
      if (createdVerificationIds.length > 0) {
        await client.db.delete(pocketAssertionVerifications).where(inArray(pocketAssertionVerifications.id, createdVerificationIds));
      }
      if (createdAssertionIds.length > 0) {
        await client.db.delete(pocketScientificAssertions).where(inArray(pocketScientificAssertions.id, createdAssertionIds));
      }
      await client.db.delete(pocketDrugs).where(eq(pocketDrugs.id, drugId));
      await client.db.delete(pocketClinicalReviewerCredentials).where(
        inArray(pocketClinicalReviewerCredentials.userId, [
          reviewerValid1Id,
          reviewerValid2Id,
          reviewerValid3Id,
          reviewerExpiredId,
          reviewerSuspendedId,
        ]),
      );
      await client.db.delete(users).where(
        inArray(users.id, [
          reviewerValid1Id,
          reviewerValid2Id,
          reviewerValid3Id,
          reviewerExpiredId,
          reviewerSuspendedId,
        ]),
      );
      await client.close();
    } catch {
      // Best-effort cleanup
    }
  });

  async function assertParityWithDatabase() {
    const consumptionRes = await consumptionStore.findPublishedByAggregate("drug", drugId);
    const searchMap = await searchStore.getVerificationStatusBatch([{ type: "drug", id: drugId }]);
    const searchStatus = searchMap.get(`drug:${drugId}`);

    expect(consumptionRes).not.toBeNull();
    expect(searchStatus).toBeDefined();

    const verifiedConsumptionAssertions = consumptionRes!.assertions.filter(
      (a) => a.isClinicallyVerified,
    );
    const expectedVerifiedCount = verifiedConsumptionAssertions.length;
    const expectedIsVerified = expectedVerifiedCount > 0;
    const expectedLastVerifiedAt =
      expectedVerifiedCount > 0
        ? new Date(
            Math.max(
              ...verifiedConsumptionAssertions
                .map((a) => a.verifiedAt?.getTime() ?? 0)
                .filter((t) => t > 0),
            ),
          ).toISOString()
        : null;

    // Phase D.4: Consumption returns only currently clinically verified assertions
    expect(consumptionRes!.assertions.length).toBe(expectedVerifiedCount);
    expect(searchStatus!.totalAssertionsCount).toBeGreaterThanOrEqual(consumptionRes!.assertions.length);
    expect(searchStatus!.verifiedAssertionsCount).toBe(expectedVerifiedCount);
    expect(searchStatus!.isClinicallyVerified).toBe(expectedIsVerified);
    expect(searchStatus!.lastVerifiedAt).toBe(expectedLastVerifiedAt);

    return { consumptionRes: consumptionRes!, searchStatus: searchStatus! };
  }

  it("enforces exact parity across quorum, disagreement, invalid credentials, conflicts, and safety overrides", async (ctx) => {
    if (isNetworkUnavailable || !client) {
      ctx.skip();
      return;
    }

    // 1. Insert 1 dosing_rule assertion with only 1 approval -> quorum not met (0/1 verified)
    const aDosingId = randomUUID();
    createdAssertionIds.push(aDosingId);
    await client.db.insert(pocketScientificAssertions).values({
      id: aDosingId,
      assertionRootId: randomUUID(),
      versionNumber: 1,
      drugId,
      assertionType: "dosing_rule",
      assertionKey: "parity.dosing",
      statementText: "Dosing rule statement",
      status: "published",
    });

    const v1 = randomUUID();
    createdVerificationIds.push(v1);
    const t1 = new Date("2026-11-01T10:00:00Z");
    await client.db.insert(pocketAssertionVerifications).values({
      id: v1,
      assertionId: aDosingId,
      reviewerUserId: reviewerValid1Id,
      verificationAction: "clinical_verified",
      clinicalReviewNotes: "R1 verified",
      verifiedAt: t1,
    });

    const state1 = await assertParityWithDatabase();
    expect(state1.searchStatus.isClinicallyVerified).toBe(false);
    expect(state1.searchStatus.verifiedAssertionsCount).toBe(0);
    expect(state1.searchStatus.lastVerifiedAt).toBeNull();

    // 2. Add 2nd valid approval -> quorum met (1/1 verified)
    const v2 = randomUUID();
    createdVerificationIds.push(v2);
    const t2 = new Date("2026-11-02T10:00:00Z");
    await client.db.insert(pocketAssertionVerifications).values({
      id: v2,
      assertionId: aDosingId,
      reviewerUserId: reviewerValid2Id,
      verificationAction: "clinical_verified",
      clinicalReviewNotes: "R2 verified",
      verifiedAt: t2,
    });

    const state2 = await assertParityWithDatabase();
    expect(state2.searchStatus.isClinicallyVerified).toBe(true);
    expect(state2.searchStatus.verifiedAssertionsCount).toBe(1);
    expect(state2.searchStatus.lastVerifiedAt).toBe(t2.toISOString());

    // 3. Add a valid rejection from R3 -> active disagreement (2 approvals + 1 rejection -> false!)
    const v3 = randomUUID();
    createdVerificationIds.push(v3);
    await client.db.insert(pocketAssertionVerifications).values({
      id: v3,
      assertionId: aDosingId,
      reviewerUserId: reviewerValid3Id,
      verificationAction: "clinical_rejected",
      clinicalReviewNotes: "R3 rejected",
      verifiedAt: new Date("2026-11-03T10:00:00Z"),
    });

    const state3 = await assertParityWithDatabase();
    expect(state3.searchStatus.isClinicallyVerified).toBe(false);
    expect(state3.searchStatus.verifiedAssertionsCount).toBe(0);
    expect(state3.searchStatus.lastVerifiedAt).toBeNull();

    // 4. R3 supersedes their rejection with approval -> verified again
    const v4 = randomUUID();
    createdVerificationIds.push(v4);
    const t4 = new Date("2026-11-04T10:00:00Z");
    await client.db.insert(pocketAssertionVerifications).values({
      id: v4,
      assertionId: aDosingId,
      reviewerUserId: reviewerValid3Id,
      verificationAction: "clinical_verified",
      clinicalReviewNotes: "R3 re-verified",
      parentVerificationId: v3,
      verifiedAt: t4,
    });

    const state4 = await assertParityWithDatabase();
    expect(state4.searchStatus.isClinicallyVerified).toBe(true);
    expect(state4.searchStatus.lastVerifiedAt).toBe(t4.toISOString());

    // 5. Add a general_information assertion verified by 1 expired + 1 suspended + 1 valid -> only valid counts
    const aInfoId = randomUUID();
    createdAssertionIds.push(aInfoId);
    await client.db.insert(pocketScientificAssertions).values({
      id: aInfoId,
      assertionRootId: randomUUID(),
      versionNumber: 1,
      drugId,
      assertionType: "general_information",
      assertionKey: "parity.info",
      statementText: "General info statement",
      status: "published",
    });

    const vExp = randomUUID();
    const vSusp = randomUUID();
    const vValidInfo = randomUUID();
    createdVerificationIds.push(vExp, vSusp, vValidInfo);
    const tValidInfo = new Date("2026-11-05T10:00:00Z");
    await client.db.insert(pocketAssertionVerifications).values([
      {
        id: vExp,
        assertionId: aInfoId,
        reviewerUserId: reviewerExpiredId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Expired reviewer",
        verifiedAt: new Date("2026-11-10T10:00:00Z"), // newer, but expired -> must NOT become lastVerifiedAt!
      },
      {
        id: vSusp,
        assertionId: aInfoId,
        reviewerUserId: reviewerSuspendedId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Suspended reviewer",
        verifiedAt: new Date("2026-11-11T10:00:00Z"),
      },
      {
        id: vValidInfo,
        assertionId: aInfoId,
        reviewerUserId: reviewerValid1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Valid reviewer",
        verifiedAt: tValidInfo,
      },
    ]);

    const state5 = await assertParityWithDatabase();
    expect(state5.searchStatus.verifiedAssertionsCount).toBe(2);
    expect(state5.searchStatus.lastVerifiedAt).toBe(tValidInfo.toISOString());

    // 6. Active conflict blocks aInfoId
    const confId = randomUUID();
    createdConflictIds.push(confId);
    await client.db.insert(pocketClinicalConflicts).values({
      id: confId,
      conflictSubject: "Parity conflict",
      assertionAId: aInfoId,
      assertionBId: aDosingId,
      discrepancyDescription: "Active discrepancy",
      status: "active_discrepancy",
    });

    const state6 = await assertParityWithDatabase();
    expect(state6.searchStatus.verifiedAssertionsCount).toBe(0);
    expect(state6.searchStatus.isClinicallyVerified).toBe(false);

    // Resolve conflict -> both back to verified
    await client.db
      .update(pocketClinicalConflicts)
      .set({ status: "resolved" })
      .where(eq(pocketClinicalConflicts.id, confId));

    const state6Resolved = await assertParityWithDatabase();
    expect(state6Resolved.searchStatus.verifiedAssertionsCount).toBe(2);

    // 7. Safety override on aInfoId blocks aInfoId only (aDosingId remains verified!)
    const ovAssertionId = randomUUID();
    createdOverrideIds.push(ovAssertionId);
    await client.db.insert(pocketSafetyOverrides).values({
      id: ovAssertionId,
      targetEntityType: "assertion",
      targetEntityId: aInfoId,
      actionState: "quarantined",
      isActive: true,
    });

    const state7 = await assertParityWithDatabase();
    expect(state7.searchStatus.verifiedAssertionsCount).toBe(1);
    expect(state7.searchStatus.lastVerifiedAt).toBe(t4.toISOString());

    // 8. Safety override on parent aggregate blocks everything
    const ovDrugId = randomUUID();
    createdOverrideIds.push(ovDrugId);
    await client.db.insert(pocketSafetyOverrides).values({
      id: ovDrugId,
      targetEntityType: "drug",
      targetEntityId: drugId,
      actionState: "quarantined",
      isActive: true,
    });

    const state8 = await assertParityWithDatabase();
    expect(state8.searchStatus.verifiedAssertionsCount).toBe(0);
    expect(state8.searchStatus.isClinicallyVerified).toBe(false);
    expect(state8.searchStatus.lastVerifiedAt).toBeNull();
  });

  async function assertIsolatedDrugParity(targetDrugId: string) {
    const consumptionRes = await consumptionStore.findPublishedByAggregate("drug", targetDrugId);
    const searchMap = await searchStore.getVerificationStatusBatch([
      { type: "drug", id: targetDrugId },
    ]);
    const searchStatus = searchMap.get(`drug:${targetDrugId}`);

    expect(consumptionRes).not.toBeNull();
    expect(searchStatus).toBeDefined();

    const verifiedConsumptionAssertions = consumptionRes!.assertions.filter(
      (a) => a.isClinicallyVerified,
    );
    const expectedVerifiedCount = verifiedConsumptionAssertions.length;
    const expectedLastVerifiedAt =
      expectedVerifiedCount > 0
        ? new Date(
            Math.max(
              ...verifiedConsumptionAssertions
                .map((a) => a.verifiedAt?.getTime() ?? 0)
                .filter((t) => t > 0),
            ),
          ).toISOString()
        : null;

    // Phase D.4: Consumption returns only currently clinically verified assertions
    expect(consumptionRes!.assertions.length).toBe(expectedVerifiedCount);
    expect(searchStatus!.totalAssertionsCount).toBeGreaterThanOrEqual(consumptionRes!.assertions.length);
    expect(searchStatus!.verifiedAssertionsCount).toBe(expectedVerifiedCount);
    expect(searchStatus!.isClinicallyVerified).toBe(expectedVerifiedCount > 0);
    expect(searchStatus!.lastVerifiedAt).toBe(expectedLastVerifiedAt);

    return {
      consumptionAssertions: consumptionRes!.assertions,
      searchStatus: searchStatus!,
    };
  }

  it("Scenario A: general_information with 1 valid approval and 1 valid rejection fails closed across Search and Consumption", async (ctx) => {
    if (isNetworkUnavailable || !client) {
      ctx.skip();
      return;
    }

    const isolatedDrugId = randomUUID();
    const isolatedAssertionId = randomUUID();
    const vApproveId = randomUUID();
    const vRejectId = randomUUID();

    try {
      await client.db.insert(pocketDrugs).values({
        id: isolatedDrugId,
        slug: `parity-gen-disagree-${Date.now()}`,
        genericNameEn: "Isolated Drug A",
        genericNameFa: "داروی ایزوله الف",
        drugClass: "Test",
        mechanismOfAction: "Test",
        status: "published",
        publishedAt: new Date(),
      });

      await client.db.insert(pocketScientificAssertions).values({
        id: isolatedAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: isolatedDrugId,
        assertionType: "general_information",
        assertionKey: "parity.gen.disagree",
        statementText: "General info with active disagreement",
        status: "published",
      });

      await client.db.insert(pocketAssertionVerifications).values([
        {
          id: vApproveId,
          assertionId: isolatedAssertionId,
          reviewerUserId: reviewerValid1Id,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Approved by R1",
          verifiedAt: new Date("2026-11-01T10:00:00Z"),
        },
        {
          id: vRejectId,
          assertionId: isolatedAssertionId,
          reviewerUserId: reviewerValid2Id,
          verificationAction: "clinical_rejected",
          clinicalReviewNotes: "Rejected by R2",
          verifiedAt: new Date("2026-11-02T10:00:00Z"),
        },
      ]);

      const { consumptionAssertions, searchStatus } = await assertIsolatedDrugParity(isolatedDrugId);
      expect(consumptionAssertions).toHaveLength(0);
      expect(searchStatus.isClinicallyVerified).toBe(false);
      expect(searchStatus.verifiedAssertionsCount).toBe(0);
      expect(searchStatus.lastVerifiedAt).toBeNull();
    } finally {
      await client.db
        .delete(pocketAssertionVerifications)
        .where(inArray(pocketAssertionVerifications.id, [vApproveId, vRejectId]))
        .catch(() => {});
      await client.db
        .delete(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, isolatedAssertionId))
        .catch(() => {});
      await client.db
        .delete(pocketDrugs)
        .where(eq(pocketDrugs.id, isolatedDrugId))
        .catch(() => {});
    }
  });

  it("Scenario B: inactive credential (isActive = false, suspendedAt = null) invalidates verification across Search and Consumption", async (ctx) => {
    if (isNetworkUnavailable || !client) {
      ctx.skip();
      return;
    }

    const inactiveUserId = randomUUID();
    const isolatedDrugId = randomUUID();
    const isolatedAssertionId = randomUUID();
    const vId = randomUUID();
    const ts = Date.now();

    try {
      await client.db.insert(users).values({
        id: inactiveUserId,
        email: `parity-inactive-${ts}@avana.local`,
        name: "Inactive Credential Reviewer",
      });

      await client.db.insert(pocketClinicalReviewerCredentials).values({
        userId: inactiveUserId,
        medicalLicenseNumber: `PAR-INACT-${ts}`,
        specialty: "Internal Medicine",
        licensingAuthority: "Council",
        isActive: false,
        suspendedAt: null,
        grantedBy: reviewerValid1Id,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });

      await client.db.insert(pocketDrugs).values({
        id: isolatedDrugId,
        slug: `parity-inactive-drug-${ts}`,
        genericNameEn: "Isolated Drug B",
        genericNameFa: "داروی ایزوله ب",
        drugClass: "Test",
        mechanismOfAction: "Test",
        status: "published",
        publishedAt: new Date(),
      });

      await client.db.insert(pocketScientificAssertions).values({
        id: isolatedAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: isolatedDrugId,
        assertionType: "general_information",
        assertionKey: "parity.inactive.cred",
        statementText: "General info verified by inactive reviewer",
        status: "published",
      });

      await client.db.insert(pocketAssertionVerifications).values({
        id: vId,
        assertionId: isolatedAssertionId,
        reviewerUserId: inactiveUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved while inactive",
        verifiedAt: new Date("2026-11-01T10:00:00Z"),
      });

      const { consumptionAssertions, searchStatus } = await assertIsolatedDrugParity(isolatedDrugId);
      expect(consumptionAssertions).toHaveLength(0);
      expect(searchStatus.isClinicallyVerified).toBe(false);
      expect(searchStatus.verifiedAssertionsCount).toBe(0);
      expect(searchStatus.lastVerifiedAt).toBeNull();
    } finally {
      await client.db
        .delete(pocketAssertionVerifications)
        .where(eq(pocketAssertionVerifications.id, vId))
        .catch(() => {});
      await client.db
        .delete(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, isolatedAssertionId))
        .catch(() => {});
      await client.db
        .delete(pocketDrugs)
        .where(eq(pocketDrugs.id, isolatedDrugId))
        .catch(() => {});
      await client.db
        .delete(pocketClinicalReviewerCredentials)
        .where(eq(pocketClinicalReviewerCredentials.userId, inactiveUserId))
        .catch(() => {});
      await client.db
        .delete(users)
        .where(eq(users.id, inactiveUserId))
        .catch(() => {});
    }
  });

  it("Scenario C: multiple historical credentials for one reviewer select authoritative credential matching Pure TS Resolver", async (ctx) => {
    if (isNetworkUnavailable || !client) {
      ctx.skip();
      return;
    }

    const histUserId = randomUUID();
    const isolatedDrugId = randomUUID();
    const isolatedAssertionId = randomUUID();
    const vId = randomUUID();
    const credOldRevokedId = randomUUID();
    const credNewActiveId = randomUUID();
    const ts = Date.now();
    const verifiedTime = new Date("2026-11-06T12:00:00Z");

    try {
      await client.db.insert(users).values({
        id: histUserId,
        email: `parity-hist-${ts}@avana.local`,
        name: "Historical Multi-Cred Reviewer",
      });

      const oldCredRow = {
        id: credOldRevokedId,
        userId: histUserId,
        medicalLicenseNumber: `PAR-HIST-OLD-${ts}`,
        specialty: "Pharmacology",
        licensingAuthority: "Council",
        isActive: false,
        suspendedAt: new Date("2025-01-01T00:00:00Z"),
        grantedBy: reviewerValid1Id,
        grantedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      };
      const newCredRow = {
        id: credNewActiveId,
        userId: histUserId,
        medicalLicenseNumber: `PAR-HIST-NEW-${ts}`,
        specialty: "Pharmacology",
        licensingAuthority: "Council",
        isActive: true,
        suspendedAt: null,
        grantedBy: reviewerValid1Id,
        grantedAt: new Date("2026-01-01T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      };

      await client.db.insert(pocketClinicalReviewerCredentials).values([oldCredRow, newCredRow]);

      await client.db.insert(pocketDrugs).values({
        id: isolatedDrugId,
        slug: `parity-hist-drug-${ts}`,
        genericNameEn: "Isolated Drug C",
        genericNameFa: "داروی ایزوله ج",
        drugClass: "Test",
        mechanismOfAction: "Test",
        status: "published",
        publishedAt: new Date(),
      });

      await client.db.insert(pocketScientificAssertions).values({
        id: isolatedAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: isolatedDrugId,
        assertionType: "general_information",
        assertionKey: "parity.historical.creds",
        statementText: "General info with multiple historical credentials",
        status: "published",
      });

      await client.db.insert(pocketAssertionVerifications).values({
        id: vId,
        assertionId: isolatedAssertionId,
        reviewerUserId: histUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved with restored active credential",
        verifiedAt: verifiedTime,
      });

      const pureExpected = evaluateAssertionVerificationSummary({
        context: {
          assertionId: isolatedAssertionId,
          aggregateType: "drug",
          aggregateId: isolatedDrugId,
          assertionType: "general_information",
        },
        verifications: [
          {
            id: vId,
            assertionId: isolatedAssertionId,
            reviewerUserId: histUserId,
            verificationAction: "clinical_verified",
            verifiedAt: verifiedTime,
          },
        ],
        credentials: [oldCredRow, newCredRow],
        conflicts: [],
        safetyOverrides: [],
      });

      const { consumptionAssertions, searchStatus } = await assertIsolatedDrugParity(isolatedDrugId);
      expect(pureExpected.isClinicallyVerified).toBe(true);
      expect(consumptionAssertions[0].isClinicallyVerified).toBe(pureExpected.isClinicallyVerified);
      expect(consumptionAssertions[0].verifiedAt).toEqual(pureExpected.lastValidApprovalTimestamp);
      expect(searchStatus.isClinicallyVerified).toBe(true);
      expect(searchStatus.verifiedAssertionsCount).toBe(1);
      expect(searchStatus.lastVerifiedAt).toBe(verifiedTime.toISOString());
    } finally {
      await client.db
        .delete(pocketAssertionVerifications)
        .where(eq(pocketAssertionVerifications.id, vId))
        .catch(() => {});
      await client.db
        .delete(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, isolatedAssertionId))
        .catch(() => {});
      await client.db
        .delete(pocketDrugs)
        .where(eq(pocketDrugs.id, isolatedDrugId))
        .catch(() => {});
      await client.db
        .delete(pocketClinicalReviewerCredentials)
        .where(eq(pocketClinicalReviewerCredentials.userId, histUserId))
        .catch(() => {});
      await client.db
        .delete(users)
        .where(eq(users.id, histUserId))
        .catch(() => {});
    }
  });

  it("Scenario D: unknown assertionType uses fail-closed quorum fallback (2 approvals required)", async (ctx) => {
    if (isNetworkUnavailable || !client) {
      ctx.skip();
      return;
    }

    const isolatedDrugId = randomUUID();
    const isolatedAssertionId = randomUUID();
    const v1Id = randomUUID();
    const v2Id = randomUUID();
    const t1 = new Date("2026-11-01T08:00:00Z");
    const t2 = new Date("2026-11-02T09:00:00Z");

    try {
      await client.db.insert(pocketDrugs).values({
        id: isolatedDrugId,
        slug: `parity-unknown-type-${Date.now()}`,
        genericNameEn: "Isolated Drug D",
        genericNameFa: "داروی ایزوله د",
        drugClass: "Test",
        mechanismOfAction: "Test",
        status: "published",
        publishedAt: new Date(),
      });

      await client.db.insert(pocketScientificAssertions).values({
        id: isolatedAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: isolatedDrugId,
        assertionType: "unmapped_experimental_type",
        assertionKey: "parity.unknown.type",
        statementText: "Assertion with unknown type must fail closed to quorum 2",
        status: "published",
      });

      // 1 approval is NOT enough for unknown assertionType
      await client.db.insert(pocketAssertionVerifications).values({
        id: v1Id,
        assertionId: isolatedAssertionId,
        reviewerUserId: reviewerValid1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Single approval on unknown type",
        verifiedAt: t1,
      });

      const insufficient = await assertIsolatedDrugParity(isolatedDrugId);
      expect(insufficient.consumptionAssertions).toHaveLength(0);
      expect(insufficient.searchStatus.isClinicallyVerified).toBe(false);
      expect(insufficient.searchStatus.verifiedAssertionsCount).toBe(0);
      expect(insufficient.searchStatus.lastVerifiedAt).toBeNull();

      // 2nd valid approval satisfies fail-closed fallback quorum
      await client.db.insert(pocketAssertionVerifications).values({
        id: v2Id,
        assertionId: isolatedAssertionId,
        reviewerUserId: reviewerValid2Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Second approval on unknown type",
        verifiedAt: t2,
      });

      const sufficient = await assertIsolatedDrugParity(isolatedDrugId);
      expect(sufficient.consumptionAssertions[0].isClinicallyVerified).toBe(true);
      expect(sufficient.consumptionAssertions[0].verifiedAt).toEqual(t2);
      expect(sufficient.searchStatus.isClinicallyVerified).toBe(true);
      expect(sufficient.searchStatus.verifiedAssertionsCount).toBe(1);
      expect(sufficient.searchStatus.lastVerifiedAt).toBe(t2.toISOString());
    } finally {
      await client.db
        .delete(pocketAssertionVerifications)
        .where(inArray(pocketAssertionVerifications.id, [v1Id, v2Id]))
        .catch(() => {});
      await client.db
        .delete(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, isolatedAssertionId))
        .catch(() => {});
      await client.db
        .delete(pocketDrugs)
        .where(eq(pocketDrugs.id, isolatedDrugId))
        .catch(() => {});
    }
  });
});
