/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import fastify from "fastify";
import { sql, eq } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import {
  users,
  pocketDrugs,
  pocketScientificAssertions,
  pocketAssertionVerifications,
  pocketClinicalConflicts,
  pocketAssertionAuditLog,
} from "@avana/database/schema";
import { type Actor } from "@avana/domain";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { AssertionReviewService } from "../assertion-review-service.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { AssertionPublishingService } from "../assertion-publishing-service.js";
import { DrizzleAssertionConsumptionStore } from "../drizzle-assertion-consumption-store.js";
import { DrizzlePocketSearchStore } from "../drizzle-pocket-search-store.js";
import { resolveAssertionVerificationSummariesFromDb } from "../assertion-verification-resolver.js";
import { pocketAssertionVerificationRoutes } from "../assertion-verification-routes.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket: Conflict Resolution Workflow (Real PostgreSQL Integration)", () => {
  let client: ReturnType<typeof createDbClient> | null = null;
  let isConnected = false;

  const adminId = randomUUID();
  const rev1Id = randomUUID();
  const rev2Id = randomUUID();
  const teacherId = randomUUID();
  const studentId = randomUUID();

  const adminActor: Actor = {
    userId: adminId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };
  const rev1Actor: Actor = {
    userId: rev1Id as Actor["userId"],
    role: "teacher",
    globalRole: null,
    teacherStatus: "approved",
  };
  const rev2Actor: Actor = {
    userId: rev2Id as Actor["userId"],
    role: "teacher",
    globalRole: null,
    teacherStatus: "approved",
  };
  const teacherActor: Actor = {
    userId: teacherId as Actor["userId"],
    role: "teacher",
    globalRole: null,
    teacherStatus: "approved",
  };
  const studentActor: Actor = {
    userId: studentId as Actor["userId"],
    role: "student",
    globalRole: "user" as unknown as Actor["globalRole"],
  };

  let reviewerService: ReviewerService;
  let reviewStore: DrizzleAssertionReviewStore;
  let reviewService: AssertionReviewService;
  let verificationStore: DrizzleAssertionVerificationStore;
  let verificationService: AssertionVerificationService;
  let publishingStore: DrizzleAssertionPublishingStore;
  let publishingService: AssertionPublishingService;
  let consumptionStore: DrizzleAssertionConsumptionStore;
  let searchStore: DrizzlePocketSearchStore;

  beforeAll(async () => {
    const dbUrl = resolveSafePostgresTestUrl();
    client = createDbClient(dbUrl);
    await client.db.execute(sql`SELECT 1;`);
    isConnected = true;

    const reviewerStore = new DrizzleReviewerStore(client.db);
    reviewerService = new ReviewerService({ reviewerStore, db: client.db });
    reviewStore = new DrizzleAssertionReviewStore(client.db);
    reviewService = new AssertionReviewService({
      assertionReviewStore: reviewStore,
      reviewerService,
      db: client.db,
    });
    verificationStore = new DrizzleAssertionVerificationStore(client.db);
    verificationService = new AssertionVerificationService({
      verificationStore,
      assertionStore: reviewStore,
      reviewerService,
      db: client.db,
    });
    publishingStore = new DrizzleAssertionPublishingStore(client.db);
    publishingService = new AssertionPublishingService({
      publishingStore,
      assertionStore: reviewStore,
      verificationStore,
      db: client.db,
    });
    consumptionStore = new DrizzleAssertionConsumptionStore(client.db);
    searchStore = new DrizzlePocketSearchStore(client.db);

    const ts = Date.now();
    await client.db.insert(users).values([
      { id: adminId, email: `cr-adm-${ts}@avana.local`, name: "CR Admin", globalRole: "platform_admin" },
      { id: rev1Id, email: `cr-rev1-${ts}@avana.local`, name: "CR Rev1", role: "teacher" },
      { id: rev2Id, email: `cr-rev2-${ts}@avana.local`, name: "CR Rev2", role: "teacher" },
      { id: teacherId, email: `cr-tch-${ts}@avana.local`, name: "CR Teacher", role: "teacher" },
      { id: studentId, email: `cr-stu-${ts}@avana.local`, name: "CR Student", role: "student" },
    ]);

    const futureDate = new Date(Date.now() + 365 * 86_400_000);
    await reviewerService.grantCredential(adminActor, {
      userId: rev1Id,
      medicalLicenseNumber: `MD-CR1-${ts}`,
      specialty: "Pharmacology",
      licensingAuthority: "IRIMC",
      licenseExpiresAt: futureDate,
    });
    await reviewerService.grantCredential(adminActor, {
      userId: rev2Id,
      medicalLicenseNumber: `MD-CR2-${ts}`,
      specialty: "Internal Medicine",
      licensingAuthority: "IRIMC",
      licenseExpiresAt: futureDate,
    });
  });

  afterAll(async () => {
    if (isConnected && client) {
      await client.close().catch(() => {});
    }
  });

  async function createTestDrug(label: string): Promise<{ id: string; name: string }> {
    const id = randomUUID();
    const name = `CRDrug-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await client!.db.insert(pocketDrugs).values({
      id,
      slug: `cr-drug-${id.slice(0, 8)}`,
      genericNameEn: name,
      genericNameFa: `داروی-${label}`,
      drugClass: "Test Class",
      mechanismOfAction: "Test Mechanism",
      status: "published",
      publishedAt: new Date(),
    });
    return { id, name };
  }

  it("1-4. records conflict + audit atomically, rolls back on audit failure, blocks reversed A/B duplicate (409), and rejects self-conflict (400)", async (ctx) => {
    if (!isConnected || !client) {
      ctx.skip();
      return;
    }

    const drug = await createTestDrug("rec");
    const a1 = await reviewStore.create({
      assertionRootId: randomUUID(),
      versionNumber: 1,
      assertionKey: "cr.rec.a",
      assertionType: "general_info",
      statementText: "Assertion A",
      drugId: drug.id,
      status: "reviewed",
    });
    const b1 = await reviewStore.create({
      assertionRootId: randomUUID(),
      versionNumber: 1,
      assertionKey: "cr.rec.b",
      assertionType: "general_info",
      statementText: "Assertion B",
      drugId: drug.id,
      status: "reviewed",
    });

    // Self-conflict -> 400
    await expect(
      verificationService.recordClinicalConflict(rev1Actor, {
        assertionAId: a1.id,
        assertionBId: a1.id,
        conflictSubject: "Self",
        discrepancyDescription: "Invalid self conflict",
      }),
    ).rejects.toMatchObject({ code: "bad_request" });

    // Audit failure -> full rollback of conflict
    const failingReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
    failingReviewStore.insertAuditLog = async () => {
      throw new Error("Simulated conflict audit failure");
    };
    const failingVerifService = new AssertionVerificationService({
      verificationStore,
      assertionStore: failingReviewStore,
      reviewerService,
      db: client.db,
    });

    await expect(
      failingVerifService.recordClinicalConflict(rev1Actor, {
        assertionAId: a1.id,
        assertionBId: b1.id,
        conflictSubject: "Rollback Test",
        discrepancyDescription: "Should roll back",
      }),
    ).rejects.toThrow("Simulated conflict audit failure");
    expect(await verificationStore.listConflictsByAssertionId(a1.id)).toHaveLength(0);

    // Valid conflict record -> recordedByUserId + audit logs on both A and B
    const conflict = await verificationService.recordClinicalConflict(rev1Actor, {
      assertionAId: a1.id,
      assertionBId: b1.id,
      conflictSubject: "Dose discrepancy",
      discrepancyDescription: "A says 500mg, B says 250mg",
    });
    expect(conflict.recordedByUserId).toBe(rev1Id);
    expect(conflict.status).toBe("active_discrepancy");

    const logsA = await reviewStore.listAuditLogsByAssertionId(a1.id);
    const logsB = await reviewStore.listAuditLogsByAssertionId(b1.id);
    expect(logsA.some((l) => l.action === "clinical_conflict_recorded")).toBe(true);
    expect(logsB.some((l) => l.action === "clinical_conflict_recorded")).toBe(true);

    // Duplicate active conflict with reversed (B, A) order -> 409 Conflict
    await expect(
      verificationService.recordClinicalConflict(rev2Actor, {
        assertionAId: b1.id,
        assertionBId: a1.id,
        conflictSubject: "Duplicate reversed",
        discrepancyDescription: "Should fail 409",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("5-10 & 16-17. supports Dismiss (restores prior votes), Resolve (requires full new Quorum + identical re-vote allowed + MAX cutoff + active & resolved coexistence + re-conflict + automatic Consumption/Search restoration without re-publish)", async (ctx) => {
    if (!isConnected || !client) {
      ctx.skip();
      return;
    }

    const drug = await createTestDrug("quorum");
    // dosing_rule requires Quorum = 2 approvals!
    const a1 = await reviewStore.create({
      assertionRootId: randomUUID(),
      versionNumber: 1,
      assertionKey: "cr.dosing.a",
      assertionType: "dosing_rule",
      statementText: "Adult dose 500mg BID",
      drugId: drug.id,
      status: "reviewed",
    });
    const b1 = await reviewStore.create({
      assertionRootId: randomUUID(),
      versionNumber: 1,
      assertionKey: "cr.dosing.b",
      assertionType: "dosing_rule",
      statementText: "Conflicting reference dose",
      drugId: drug.id,
      status: "reviewed",
    });

    // Dual verification (Quorum 2/2) + official publish of a1
    await verificationService.verifyAssertion(rev1Actor, {
      assertionId: a1.id,
      clinicalReviewNotes: "Verified dose 500mg BID",
    });
    await verificationService.verifyAssertion(rev2Actor, {
      assertionId: a1.id,
      clinicalReviewNotes: "Confirmed dose 500mg BID",
    });
    const pub = await publishingService.publishAssertion(adminActor, { assertionId: a1.id });
    expect(pub.publishedAssertion.status).toBe("published");

    // 1. Record conflict -> blocks Consumption & Search immediately, published DB status preserved!
    const c1 = await verificationService.recordClinicalConflict(rev1Actor, {
      assertionAId: a1.id,
      assertionBId: b1.id,
      conflictSubject: "False alarm check",
      discrepancyDescription: "Checking potential discrepancy",
    });
    expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);
    const srchBlocked = await searchStore.searchPublished({
      query: drug.name,
      type: "drug",
      offset: 0,
      limit: 10,
    });
    expect(srchBlocked.items.find((i) => i.id === drug.id)?.verification.isClinicallyVerified ?? false).toBe(false);

    // 2. Dismiss c1 -> prior votes immediately restore Consumption & Search without re-voting or re-publishing!
    const c1Dismissed = await verificationService.resolveConflict(adminActor, {
      conflictId: c1.id,
      outcome: "dismissed",
      resolutionNotes: "Verified source typo; no actual conflict",
    });
    expect(c1Dismissed.status).toBe("dismissed");
    expect(c1Dismissed.resolutionSeq).toBeNull();

    const consumedAfterDismiss = await consumptionStore.findPublishedByAggregate("drug", drug.id);
    expect(consumedAfterDismiss?.assertions).toHaveLength(1);
    const srchAfterDismiss = await searchStore.searchPublished({
      query: drug.name,
      type: "drug",
      offset: 0,
      limit: 10,
    });
    expect(srchAfterDismiss.items.find((i) => i.id === drug.id)?.verification.isClinicallyVerified).toBe(true);

    // 3. Re-create conflict after previous one was dismissed -> blocks again
    const c2 = await verificationService.recordClinicalConflict(rev2Actor, {
      assertionAId: a1.id,
      assertionBId: b1.id,
      conflictSubject: "Real dosing conflict",
      discrepancyDescription: "Actual renal adjustment mismatch",
    });
    expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);

    // 4. Resolve c2 ('resolved') -> requires FULL new Quorum (2/2) after resolvedAt!
    const c2Resolved = await verificationService.resolveConflict(adminActor, {
      conflictId: c2.id,
      outcome: "resolved",
      resolutionNotes: "Updated clinical guideline consensus",
    });
    expect(c2Resolved.status).toBe("resolved");
    expect(c2Resolved.resolutionSeq).not.toBeNull();

    // Before new votes: still NOT clinically verified (Consumption blocked)
    expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);

    // 1st re-vote by rev1 with IDENTICAL action & notes -> allowed! Still 1/2 Quorum -> still blocked!
    await verificationService.verifyAssertion(rev1Actor, {
      assertionId: a1.id,
      clinicalReviewNotes: "Verified dose 500mg BID",
    });
    expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);

    // Record c3 and resolve c3 -> MAX cutoff advances past rev1's 1st re-vote!
    const c3 = await verificationService.recordClinicalConflict(rev1Actor, {
      assertionAId: b1.id,
      assertionBId: a1.id,
      conflictSubject: "Second resolved conflict",
      discrepancyDescription: "Follow-up unit check",
    });
    await verificationService.resolveConflict(adminActor, {
      conflictId: c3.id,
      outcome: "resolved",
      resolutionNotes: "Units confirmed",
    });

    // rev2 votes once (1/2 after c3) -> rev1's vote before c3 is stale -> still 1/2 -> blocked!
    await verificationService.verifyAssertion(rev2Actor, {
      assertionId: a1.id,
      clinicalReviewNotes: "Confirmed dose 500mg BID",
    });
    expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);

    // Create c4 (active) while c3 is resolved -> active conflict still blocks even if rev1 re-votes!
    const c4 = await verificationService.recordClinicalConflict(rev1Actor, {
      assertionAId: a1.id,
      assertionBId: b1.id,
      conflictSubject: "Active alongside resolved",
      discrepancyDescription: "Active blocker",
    });
    await verificationService.verifyAssertion(rev1Actor, {
      assertionId: a1.id,
      clinicalReviewNotes: "Verified dose 500mg BID",
    });
    // Quorum 2/2 after c3 is met, BUT c4 is active_discrepancy -> STILL blocked!
    expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);

    // Dismiss c4 -> active blocker removed AND post-c3 Quorum (2/2) is met -> immediately consumable without re-publish!
    await verificationService.resolveConflict(adminActor, {
      conflictId: c4.id,
      outcome: "dismissed",
      resolutionNotes: "Duplicate check cleared",
    });
    const consumedRestored = await consumptionStore.findPublishedByAggregate("drug", drug.id);
    expect(consumedRestored?.assertions).toHaveLength(1);
    const srchRestored = await searchStore.searchPublished({
      query: drug.name,
      type: "drug",
      offset: 0,
      limit: 10,
    });
    expect(srchRestored.items.find((i) => i.id === drug.id)?.verification.isClinicallyVerified).toBe(true);

    // Verify all historical verification rows (2 initial + 3 re-votes = 5) & assertion row preserved!
    const allVotes = await client.db
      .select()
      .from(pocketAssertionVerifications)
      .where(eq(pocketAssertionVerifications.assertionId, a1.id));
    expect(allVotes).toHaveLength(5);
    const [dbAssertion] = await client.db
      .select()
      .from(pocketScientificAssertions)
      .where(eq(pocketScientificAssertions.id, a1.id));
    expect(dbAssertion.status).toBe("published");
  });

  it("11-14. handles concurrent Vote+Resolve, Publish+Conflict, Deadlock avoidance (v_old < v_new), and concurrent double-Resolve (only 1 succeeds, 1 gets 409)", async (ctx) => {
    if (!isConnected || !client) {
      ctx.skip();
      return;
    }

    const drug = await createTestDrug("concurrency");
    const rootId = randomUUID();
    // Force deterministic UUID ordering: vOld < vNew
    const vOldId = "00000000-0000-4000-8000-000000000001";
    const vNewId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    // Clean up if leftover from a prior test run
    await client.db.delete(pocketAssertionAuditLog).where(sql`${pocketAssertionAuditLog.assertionId} IN (${vOldId}::uuid, ${vNewId}::uuid)`).catch(() => {});
    await client.db.delete(pocketClinicalConflicts).where(sql`${pocketClinicalConflicts.assertionAId} IN (${vOldId}::uuid, ${vNewId}::uuid) OR ${pocketClinicalConflicts.assertionBId} IN (${vOldId}::uuid, ${vNewId}::uuid)`).catch(() => {});
    await client.db.delete(pocketAssertionVerifications).where(sql`${pocketAssertionVerifications.assertionId} IN (${vOldId}::uuid, ${vNewId}::uuid)`).catch(() => {});
    await client.db.delete(pocketScientificAssertions).where(sql`${pocketScientificAssertions.id} IN (${vOldId}::uuid, ${vNewId}::uuid)`).catch(() => {});

    const vOld = await reviewStore.create({
      id: vOldId,
      assertionRootId: rootId,
      versionNumber: 1,
      assertionKey: "cr.deadlock.key",
      assertionType: "general_info",
      statementText: "Old published version",
      drugId: drug.id,
      status: "published",
    });
    const vNew = await reviewStore.create({
      id: vNewId,
      assertionRootId: rootId,
      versionNumber: 2,
      previousVersionId: vOld.id,
      assertionKey: "cr.deadlock.key",
      assertionType: "general_info",
      statementText: "New verified version",
      drugId: drug.id,
      status: "reviewed",
    });
    await verificationService.verifyAssertion(rev1Actor, {
      assertionId: vNew.id,
      clinicalReviewNotes: "Approved vNew",
    });

    // 12 & 13. Concurrent publishAssertion(vNew) & recordClinicalConflict(vOld, vNew) -> NO deadlock!
    const [pubRes, confRes] = await Promise.allSettled([
      publishingService.publishAssertion(adminActor, { assertionId: vNew.id }),
      verificationService.recordClinicalConflict(rev2Actor, {
        assertionAId: vOld.id,
        assertionBId: vNew.id,
        conflictSubject: "Concurrent publish vs conflict",
        discrepancyDescription: "Testing lock ordering vOld < vNew",
      }),
    ]);

    expect(confRes.status).toBe("fulfilled");
    // Either publish ran first (fulfilled, then blocked in Consumption) OR conflict ran first (publish rejected 409)
    if (pubRes.status === "rejected") {
      expect(pubRes.reason).toMatchObject({ code: "conflict" });
    } else {
      expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);
    }

    const activeConflict = (confRes as PromiseFulfilledResult<Awaited<ReturnType<typeof verificationService.recordClinicalConflict>>>).value;

    // 14. Concurrent double-Resolve -> exactly 1 succeeds, 1 rejects 409
    const resolveResults = await Promise.allSettled([
      verificationService.resolveConflict(adminActor, {
        conflictId: activeConflict.id,
        outcome: "resolved",
        resolutionNotes: "Resolver 1 wins",
      }),
      verificationService.resolveConflict(adminActor, {
        conflictId: activeConflict.id,
        outcome: "dismissed",
        resolutionNotes: "Resolver 2 loses",
      }),
    ]);
    const resSuccess = resolveResults.filter((r) => r.status === "fulfilled");
    const resFail = resolveResults.filter((r) => r.status === "rejected");
    expect(resSuccess).toHaveLength(1);
    expect(resFail).toHaveLength(1);
    expect((resFail[0] as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });

    // 11. Concurrent Vote + Resolve on a new conflict -> Resolver & History agree!
    const cVoteRace = await verificationService.recordClinicalConflict(rev1Actor, {
      assertionAId: vNew.id,
      assertionBId: vOld.id,
      conflictSubject: "Vote vs Resolve race",
      discrepancyDescription: "Race test",
    });

    const [voteRaceRes, resolveRaceRes] = await Promise.allSettled([
      verificationService.verifyAssertion(rev2Actor, {
        assertionId: vNew.id,
        clinicalReviewNotes: "Concurrent re-vote",
      }),
      verificationService.resolveConflict(adminActor, {
        conflictId: cVoteRace.id,
        outcome: "resolved",
        resolutionNotes: "Concurrent resolve",
      }),
    ]);
    expect(voteRaceRes.status).toBe("fulfilled");
    expect(resolveRaceRes.status).toBe("fulfilled");

    const voteRecord = (voteRaceRes as PromiseFulfilledResult<Awaited<ReturnType<typeof verificationService.verifyAssertion>>>).value.verification;
    const resolvedRecord = (resolveRaceRes as PromiseFulfilledResult<Awaited<ReturnType<typeof verificationService.resolveConflict>>>).value;
    const summaryAfterRace = (
      await resolveAssertionVerificationSummariesFromDb(
        [{ assertionId: vNew.id, aggregateType: "drug", aggregateId: drug.id, assertionType: "general_info" }],
        client.db,
      )
    ).get(vNew.id)!;

    // Logical sequence strictly determines whether vote counted after resolution!
    if ((voteRecord.verificationSeq ?? 0) > (resolvedRecord.resolutionSeq ?? 0)) {
      expect(summaryAfterRace.validApprovalCount).toBe(1);
    } else {
      expect(summaryAfterRace.validApprovalCount).toBe(0);
    }
  });

  it("13b. avoids deadlock in reverse UUID order (v_new < v_old) when Publish and Record Conflict run concurrently", async (ctx) => {
    if (!isConnected || !client) {
      ctx.skip();
      return;
    }

    const drug = await createTestDrug("deadlock-rev");
    const rootId = randomUUID();
    // Reverse deterministic UUID ordering: v_new < v_old
    const vNewId = "00000000-0000-4000-8000-000000000002";
    const vOldId = "ffffffff-ffff-4fff-8fff-fffffffffffe";
    await client.db
      .delete(pocketAssertionAuditLog)
      .where(sql`${pocketAssertionAuditLog.assertionId} IN (${vNewId}::uuid, ${vOldId}::uuid)`)
      .catch(() => {});
    await client.db
      .delete(pocketClinicalConflicts)
      .where(
        sql`${pocketClinicalConflicts.assertionAId} IN (${vNewId}::uuid, ${vOldId}::uuid) OR ${pocketClinicalConflicts.assertionBId} IN (${vNewId}::uuid, ${vOldId}::uuid)`,
      )
      .catch(() => {});
    await client.db
      .delete(pocketAssertionVerifications)
      .where(sql`${pocketAssertionVerifications.assertionId} IN (${vNewId}::uuid, ${vOldId}::uuid)`)
      .catch(() => {});
    await client.db
      .delete(pocketScientificAssertions)
      .where(sql`${pocketScientificAssertions.id} IN (${vNewId}::uuid, ${vOldId}::uuid)`)
      .catch(() => {});

    const vOld = await reviewStore.create({
      id: vOldId,
      assertionRootId: rootId,
      versionNumber: 1,
      assertionKey: "cr.deadlock.rev",
      assertionType: "general_info",
      statementText: "Old published version (higher UUID)",
      drugId: drug.id,
      status: "published",
    });
    const vNew = await reviewStore.create({
      id: vNewId,
      assertionRootId: rootId,
      versionNumber: 2,
      previousVersionId: vOld.id,
      assertionKey: "cr.deadlock.rev",
      assertionType: "general_info",
      statementText: "New verified version (lower UUID)",
      drugId: drug.id,
      status: "reviewed",
    });
    await verificationService.verifyAssertion(rev1Actor, {
      assertionId: vNew.id,
      clinicalReviewNotes: "Approved vNew (lower UUID)",
    });

    const [pubRes, confRes] = await Promise.allSettled([
      publishingService.publishAssertion(adminActor, { assertionId: vNew.id }),
      verificationService.recordClinicalConflict(rev2Actor, {
        assertionAId: vOld.id,
        assertionBId: vNew.id,
        conflictSubject: "Reverse UUID deadlock test",
        discrepancyDescription: "Testing lock ordering when v_new < v_old",
      }),
    ]);

    expect(confRes.status).toBe("fulfilled");
    if (pubRes.status === "rejected") {
      // Conflict committed first -> publish blocked with 409 conflict (never deadlock 40P01)
      expect(pubRes.reason).toMatchObject({ code: "conflict" });
    } else {
      // Publish committed first -> vNew retains published historically, but Consumption is blocked
      const [dbVNew] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, vNew.id));
      expect(dbVNew.status).toBe("published");
      expect((await consumptionStore.findPublishedByAggregate("drug", drug.id))?.assertions ?? []).toHaveLength(0);
    }
  });

  it("15. enforces platform_admin RBAC on POST /resolve and redacts confidential notes/actorUserId for approved teacher & student", async (ctx) => {
    if (!isConnected || !client) {
      ctx.skip();
      return;
    }

    const drug = await createTestDrug("rbac");
    const a1 = await reviewStore.create({
      assertionRootId: randomUUID(),
      versionNumber: 1,
      assertionKey: "cr.rbac.a",
      assertionType: "general_info",
      statementText: "RBAC A",
      drugId: drug.id,
      status: "reviewed",
    });
    const b1 = await reviewStore.create({
      assertionRootId: randomUUID(),
      versionNumber: 1,
      assertionKey: "cr.rbac.b",
      assertionType: "general_info",
      statementText: "RBAC B",
      drugId: drug.id,
      status: "reviewed",
    });

    const conflict = await verificationService.recordClinicalConflict(rev1Actor, {
      assertionAId: a1.id,
      assertionBId: b1.id,
      conflictSubject: "RBAC Conflict",
      discrepancyDescription: "SECRET_DISCREPANCY_DETAILS",
    });

    // Fastify HTTP RBAC test
    const app = fastify();
    await app.register(errorHandlerPlugin);
    const tokenMap: Record<string, { userId: string; email: string; role: string; globalRole: string | null }> = {
      "tok-admin": { userId: adminId, email: "adm@test", role: "platform_admin", globalRole: "platform_admin" },
      "tok-rev1": { userId: rev1Id, email: "rev1@test", role: "teacher", globalRole: null },
      "tok-teacher": { userId: teacherId, email: "tch@test", role: "teacher", globalRole: null },
      "tok-student": { userId: studentId, email: "stu@test", role: "student", globalRole: "user" },
    };

    const sessionService = {
      validateSession: async (token: string) => {
        const u = tokenMap[token];
        return u ?? null;
      },
      validateSessionDetails: async (token: string) => {
        const u = tokenMap[token];
        return u ? { valid: true, revoked: false, user: u } : { valid: false, revoked: false };
      },
      getConfig: () => ({}),
    } as unknown as Parameters<typeof pocketAssertionVerificationRoutes>[1]["sessionService"];

    const userStore = {
      findById: async (id: string) => {
        const found = Object.values(tokenMap).find((u) => u.userId === id);
        return found ? { id: found.userId, email: found.email, role: found.role, globalRole: found.globalRole, teacherStatus: "approved" } : null;
      },
    } as unknown as Parameters<typeof pocketAssertionVerificationRoutes>[1]["userStore"];

    await app.register(pocketAssertionVerificationRoutes, {
      assertionVerificationService: verificationService,
      sessionService,
      userStore,
    });

    // Non-admins (active reviewer, approved teacher, student) get 403 on /resolve
    for (const tok of ["tok-rev1", "tok-teacher", "tok-student"]) {
      const denied = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/conflicts/${conflict.id}/resolve`,
        headers: { authorization: `Bearer ${tok}` },
        payload: { outcome: "dismissed", resolutionNotes: "Attempt" },
      });
      expect(denied.statusCode).toBe(403);
    }

    // platform_admin succeeds -> 200
    const allowed = await app.inject({
      method: "POST",
      url: `/v1/pocket/assertions/conflicts/${conflict.id}/resolve`,
      headers: { authorization: "Bearer tok-admin" },
      payload: { outcome: "dismissed", resolutionNotes: "SECRET_RESOLUTION_NOTES" },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();

    // Redaction in /verifications for teacher (without credential) & student
    const teacherVerifs = await verificationService.getAssertionVerifications(teacherActor, a1.id);
    expect(teacherVerifs.conflicts[0].discrepancyDescription).toBeUndefined();
    expect(teacherVerifs.conflicts[0].resolutionNotes).toBeUndefined();

    const studentVerifs = await verificationService.getAssertionVerifications(studentActor, a1.id);
    expect(studentVerifs.conflicts[0].discrepancyDescription).toBeUndefined();
    expect(studentVerifs.conflicts[0].resolutionNotes).toBeUndefined();

    const revVerifs = await verificationService.getAssertionVerifications(rev1Actor, a1.id);
    expect(revVerifs.conflicts[0].discrepancyDescription).toBe("SECRET_DISCREPANCY_DETAILS");
    expect(revVerifs.conflicts[0].resolutionNotes).toBe("SECRET_RESOLUTION_NOTES");

    // Redaction in /history for approved teacher (actorUserId: null, clinicalNotes: null on conflict events)
    const teacherHist = await reviewService.getAssertionWithHistory(teacherActor, a1.id);
    const conflictAudit = teacherHist.history.find((h) => h.action === "conflict_dismissed");
    expect(conflictAudit).toBeDefined();
    expect(conflictAudit?.actorUserId).toBeNull();
    expect(conflictAudit?.clinicalNotes).toBeNull();

    const adminHist = await reviewService.getAssertionWithHistory(adminActor, a1.id);
    const adminConflictAudit = adminHist.history.find((h) => h.action === "conflict_dismissed");
    expect(adminConflictAudit?.actorUserId).toBe(adminId);
    expect(adminConflictAudit?.clinicalNotes).toBe("SECRET_RESOLUTION_NOTES");
  });
});
