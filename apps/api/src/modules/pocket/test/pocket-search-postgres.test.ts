/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq, inArray } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import {
  users,
  pocketDrugs,
  pocketDiseases,
  pocketTreatments,
  pocketEmergencies,
  pocketSearchAliases,
  pocketScientificAssertions,
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
  pocketClinicalConflicts,
  pocketDrugDiseaseLinks,
  pocketDrugInteractions,
} from "@avana/database/schema";
import { DrizzlePocketSearchStore } from "../drizzle-pocket-search-store.js";
import {
  normalizeClinicalText,
  escapeSqlLikePattern,
  PG_NORMALIZATION_FROM,
  PG_NORMALIZATION_TO,
} from "../pocket-text-normalizer.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("DrizzlePocketSearchStore PostgreSQL Integration", () => {
  let client: ReturnType<typeof createDbClient> | null = null;
  let store: DrizzlePocketSearchStore;
  const isNetworkUnavailable = false;

  // Test data IDs
  const testUserId = randomUUID();
  const testReviewerCredId = randomUUID();
  const testUser2Id = randomUUID();
  const testReviewer2CredId = randomUUID();

  const testDrugId = randomUUID();
  const testDrugSlug = `pg-drug-metoprolol-${Date.now()}`;
  const testDrug2Id = randomUUID();
  const testDrug2Slug = `pg-drug-verapamil-${Date.now()}`;
  const interactionId = randomUUID();
  const testDiseaseId = randomUUID();
  const testTreatmentId = randomUUID();
  const testEmergencyId = randomUUID();
  const unpublishedDrugId = randomUUID();

  const drugAliasId = randomUUID();
  const diseaseAliasId = randomUUID();
  const emergencyAliasId = randomUUID();

  const assertion1Id = randomUUID();
  const assertion2Id = randomUUID();
  const verif1Id = randomUUID();
  const verif1BId = randomUUID();
  const verif2Id = randomUUID();
  const verif2BId = randomUUID();
  const verif3Id = randomUUID();
  const conflictId = randomUUID();

  const link1Id = randomUUID();
  const link2Id = randomUUID();

  beforeAll(async () => {
    const dbUrl = resolveSafePostgresTestUrl();
    client = createDbClient(dbUrl);
    await client.db.execute(sql`SELECT 1;`);
    store = new DrizzlePocketSearchStore(client.db);

    // Seed test fixtures
    // 1. Users and Reviewer Credentials (2 valid reviewers for dual-quorum assertions)
    await client.db.insert(users).values([
      {
        id: testUserId,
        email: `pocket-pg-test-${Date.now()}@avana.local`,
        name: "Pocket Reviewer MD 1",
      },
      {
        id: testUser2Id,
        email: `pocket-pg-test2-${Date.now()}@avana.local`,
        name: "Pocket Reviewer MD 2",
      },
    ]);

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await client.db.insert(pocketClinicalReviewerCredentials).values([
        {
          id: testReviewerCredId,
          userId: testUserId,
          medicalLicenseNumber: `MED-TEST-${Date.now()}`,
          specialty: "Clinical Pharmacology",
          licensingAuthority: "Medical Council",
          isActive: true,
          suspendedAt: null,
          grantedBy: testUserId,
          licenseExpiresAt: futureDate,
        },
        {
          id: testReviewer2CredId,
          userId: testUser2Id,
          medicalLicenseNumber: `MED-TEST2-${Date.now()}`,
          specialty: "Internal Medicine",
          licensingAuthority: "Medical Council",
          isActive: true,
          suspendedAt: null,
          grantedBy: testUserId,
          licenseExpiresAt: futureDate,
        },
      ]);

      // 2. Pillars: 4 published entities + 1 draft/unpublished drug
      const now = new Date();

      await client.db.insert(pocketDrugs).values([
        {
          id: testDrugId,
          slug: testDrugSlug,
          genericNameEn: "Metoprolol Tartrate",
          genericNameFa: "متوپرولول تارترات",
          brandNames: ["Lopressor", "Betaloc"],
          drugClass: "Beta-Blocker",
          mechanismOfAction: "Selective beta-1 adrenoceptor blocker",
          status: "published",
          publishedAt: now,
        },
        {
          id: testDrug2Id,
          slug: testDrug2Slug,
          genericNameEn: "Verapamil Hydrochloride",
          genericNameFa: "وراپامیل هیدروکلراید",
          brandNames: ["Calan", "Isoptin"],
          drugClass: "Calcium Channel Blocker",
          mechanismOfAction: "Non-dihydropyridine calcium channel blocker",
          status: "published",
          publishedAt: now,
        },
        {
          id: unpublishedDrugId,
          slug: `pg-drug-draft-${Date.now()}`,
          genericNameEn: "Draft Only Drug",
          genericNameFa: "داروی پیش نویس",
          drugClass: "Experimental",
          mechanismOfAction: "Unknown",
          status: "draft",
          publishedAt: null,
        },
      ]);

      await client.db.insert(pocketDiseases).values({
        id: testDiseaseId,
        slug: `pg-disease-htn-${Date.now()}`,
        icd10Code: "I10",
        titleEn: "Hypertension",
        titleFa: "فشار خون بالا",
        definition: "Essential hypertension condition",
        status: "published",
        publishedAt: now,
      });

      await client.db.insert(pocketTreatments).values({
        id: testTreatmentId,
        slug: `pg-treatment-beta-${Date.now()}`,
        titleEn: "Beta-Blocker Titration Protocol",
        titleFa: "پروتکل تیتراسیون مسدودکننده بتا",
        treatmentType: "protocol",
        pharmacologicalStrategy: "Stepwise dose escalation protocol",
        efficacyMonitoring: "Blood pressure and heart rate monitoring",
        safetyMonitoring: "Bradycardia and hypotension screening",
        status: "published",
        publishedAt: now,
      });

      await client.db.insert(pocketEmergencies).values({
        id: testEmergencyId,
        slug: `pg-emergency-anaph-${Date.now()}`,
        titleEn: "Anaphylaxis Emergency",
        titleFa: "شوک آنافیلاکسی",
        conditionType: "allergic",
        immediateTriageGuidance: "Administer intramuscular epinephrine",
        referralAndEscalationCriteria: "Immediate emergency department transfer",
        status: "published",
        publishedAt: now,
      });

      // 3. Search Aliases (schema-correct: drug, disease, emergency; no treatment alias)
      await client.db.insert(pocketSearchAliases).values([
        {
          id: drugAliasId,
          drugId: testDrugId,
          rawAlias: "Lopressor Express",
          normalizedAlias: normalizeClinicalText("Lopressor Express"),
          aliasType: "brand",
          language: "en",
          priorityWeight: 100,
        },
        {
          id: diseaseAliasId,
          diseaseId: testDiseaseId,
          rawAlias: "High Blood Pressure",
          normalizedAlias: normalizeClinicalText("High Blood Pressure"),
          aliasType: "synonym",
          language: "en",
          priorityWeight: 100,
        },
        {
          id: emergencyAliasId,
          emergencyId: testEmergencyId,
          rawAlias: "Allergic Shock",
          normalizedAlias: normalizeClinicalText("Allergic Shock"),
          aliasType: "synonym",
          language: "en",
          priorityWeight: 100,
        },
      ]);

      // 4. Assertions on testDrugId + baseline valid assertions for testDrug2Id, testDiseaseId, testTreatmentId, testEmergencyId
      const drug2AssertionId = randomUUID();
      const diseaseAssertionId = randomUUID();
      const treatmentAssertionId = randomUUID();
      const emergencyAssertionId = randomUUID();

      await client.db.insert(pocketScientificAssertions).values([
        {
          id: assertion1Id,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: testDrugId,
          assertionType: "dosing_rule",
          assertionKey: "dosing.metoprolol.oral",
          statementText: "Metoprolol oral initial dose 25-50mg",
          status: "published",
        },
        {
          id: assertion2Id,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: testDrugId,
          assertionType: "contraindication",
          assertionKey: "contraindication.metoprolol.bradycardia",
          statementText: "Contraindicated in severe bradycardia",
          status: "published",
        },
        {
          id: drug2AssertionId,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: testDrug2Id,
          assertionType: "general_info",
          assertionKey: "info.verapamil.general",
          statementText: "Verapamil calcium channel blocker overview",
          status: "published",
        },
        {
          id: diseaseAssertionId,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          diseaseId: testDiseaseId,
          assertionType: "general_info",
          assertionKey: "info.htn.general",
          statementText: "Essential hypertension clinical overview",
          status: "published",
        },
        {
          id: treatmentAssertionId,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          treatmentId: testTreatmentId,
          assertionType: "general_info",
          assertionKey: "info.titration.general",
          statementText: "Beta-blocker titration protocol overview",
          status: "published",
        },
        {
          id: emergencyAssertionId,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          emergencyId: testEmergencyId,
          assertionType: "general_info",
          assertionKey: "info.anaph.general",
          statementText: "Anaphylaxis emergency overview",
          status: "published",
        },
      ]);

      // 5. Assertion Verifications (dual-quorum for dosing_rule & contraindication; single-quorum for general_info):
      // Assertion 1: clinical_verified by 2 reviewers
      await client.db.insert(pocketAssertionVerifications).values([
        {
          id: randomUUID(),
          assertionId: drug2AssertionId,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Verified Verapamil general info",
          verifiedAt: new Date(Date.now() - 60000),
        },
        {
          id: randomUUID(),
          assertionId: diseaseAssertionId,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Verified Hypertension general info",
          verifiedAt: new Date(Date.now() - 60000),
        },
        {
          id: randomUUID(),
          assertionId: treatmentAssertionId,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Verified Treatment general info",
          verifiedAt: new Date(Date.now() - 60000),
        },
        {
          id: randomUUID(),
          assertionId: emergencyAssertionId,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Verified Anaphylaxis general info",
          verifiedAt: new Date(Date.now() - 60000),
        },
        {
          id: randomUUID(),
          assertionId: emergencyAssertionId,
          reviewerUserId: testUser2Id,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Second approval for Anaphylaxis general info",
          verifiedAt: new Date(Date.now() - 60000),
        },
        {
          id: verif1Id,
          assertionId: assertion1Id,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Verified dosing according to clinical guidelines (Reviewer 1)",
          verifiedAt: new Date(Date.now() - 60000),
        },
        {
          id: verif1BId,
          assertionId: assertion1Id,
          reviewerUserId: testUser2Id,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Verified dosing according to clinical guidelines (Reviewer 2)",
          verifiedAt: new Date(Date.now() - 55000),
        },
      ]);

      // Assertion 2: Reviewer 2 verified; Reviewer 1 verified first, then clinical_rejected (supersedes verification)
      await client.db.insert(pocketAssertionVerifications).values([
        {
          id: verif2BId,
          assertionId: assertion2Id,
          reviewerUserId: testUser2Id,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Reviewer 2 signoff",
          verifiedAt: new Date(Date.now() - 35000),
        },
        {
          id: verif2Id,
          assertionId: assertion2Id,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Initial signoff",
          verifiedAt: new Date(Date.now() - 30000),
        },
        {
          id: verif3Id,
          assertionId: assertion2Id,
          reviewerUserId: testUserId,
          verificationAction: "clinical_rejected",
          clinicalReviewNotes: "Found conflicting documentation, rejected signoff",
          parentVerificationId: verif2Id,
          verifiedAt: new Date(Date.now() - 10000),
        },
      ]);

      // 6. Related entity links: Two links between testDrugId and testDiseaseId
      await client.db.insert(pocketDrugDiseaseLinks).values([
        {
          id: link1Id,
          drugId: testDrugId,
          diseaseId: testDiseaseId,
          relationshipType: "primary_indication",
          clinicalNotes: "First-line antihypertensive therapy",
        },
        {
          id: link2Id,
          drugId: testDrugId,
          diseaseId: testDiseaseId,
          relationshipType: "secondary_prevention",
          clinicalNotes: "Post-myocardial infarction protection",
        },
      ]);

      // 7. Drug-Drug Interaction (enforce chk_interaction_canonical_order: drug_a_id < drug_b_id & required assertionId)
      const [orderedDrugAId, orderedDrugBId] =
        testDrugId < testDrug2Id ? [testDrugId, testDrug2Id] : [testDrug2Id, testDrugId];

      await client.db.insert(pocketDrugInteractions).values({
        id: interactionId,
        drugAId: orderedDrugAId,
        drugBId: orderedDrugBId,
        assertionId: assertion1Id,
        severity: "major",
        clinicalConsequencePersian: "خطر تشدید برادی‌کاردی و بلاک قلبی",
        managementActionPersian: "پایش دقیق ضربان قلب و فشار خون",
        status: "published",
      });
  });

  afterAll(async () => {
    if (!client || isNetworkUnavailable) return;

    try {
      // Clean up in reverse FK order
      await client.db.delete(pocketDrugInteractions).where(eq(pocketDrugInteractions.id, interactionId)).catch(() => {});
      await client.db.delete(pocketDrugDiseaseLinks).where(inArray(pocketDrugDiseaseLinks.id, [link1Id, link2Id]));
      if (conflictId) {
        await client.db.delete(pocketClinicalConflicts).where(eq(pocketClinicalConflicts.id, conflictId)).catch(() => {});
      }
      await client.db.delete(pocketAssertionVerifications).where(eq(pocketAssertionVerifications.id, verif3Id)).catch(() => {});
      await client.db.delete(pocketAssertionVerifications).where(inArray(pocketAssertionVerifications.id, [verif1Id, verif1BId, verif2Id, verif2BId])).catch(() => {});
      await client.db.delete(pocketAssertionVerifications).where(inArray(pocketAssertionVerifications.reviewerUserId, [testUserId, testUser2Id])).catch(() => {});
      await client.db.delete(pocketScientificAssertions).where(inArray(pocketScientificAssertions.drugId, [testDrugId, testDrug2Id])).catch(() => {});
      await client.db.delete(pocketScientificAssertions).where(eq(pocketScientificAssertions.diseaseId, testDiseaseId)).catch(() => {});
      await client.db.delete(pocketScientificAssertions).where(eq(pocketScientificAssertions.treatmentId, testTreatmentId)).catch(() => {});
      await client.db.delete(pocketScientificAssertions).where(eq(pocketScientificAssertions.emergencyId, testEmergencyId)).catch(() => {});
      await client.db.delete(pocketSearchAliases).where(inArray(pocketSearchAliases.id, [drugAliasId, diseaseAliasId, emergencyAliasId])).catch(() => {});
      await client.db.delete(pocketDrugs).where(inArray(pocketDrugs.id, [testDrugId, testDrug2Id, unpublishedDrugId])).catch(() => {});
      await client.db.delete(pocketDiseases).where(eq(pocketDiseases.id, testDiseaseId)).catch(() => {});
      await client.db.delete(pocketTreatments).where(eq(pocketTreatments.id, testTreatmentId)).catch(() => {});
      await client.db.delete(pocketEmergencies).where(eq(pocketEmergencies.id, testEmergencyId)).catch(() => {});
      await client.db.delete(pocketClinicalReviewerCredentials).where(inArray(pocketClinicalReviewerCredentials.id, [testReviewerCredId, testReviewer2CredId])).catch(() => {});
      await client.db.delete(users).where(inArray(users.id, [testUserId, testUser2Id])).catch(() => {});
      await client.close().catch(() => {});
    } catch {
      // Best-effort cleanup
    }
  });

  // -------------------------------------------------------------------------
  // 1. PostgreSQL Normalization Expression Parity
  // -------------------------------------------------------------------------
  describe("1. PostgreSQL Normalization Expression Parity", () => {
    it("matches JavaScript normalizeClinicalText exactly for Persian, Arabic, and punctuation", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      const sampleInputs = [
        "يوسف كمالي", // Arabic Yeh + Kaf
        "فشار خون\u200cبالا", // ZWNJ
        "قرص متوپرولول (50mg) / روزانه؛ تست: ویژه", // All types of punctuation
        "Dosing-Rule, [IV/IM]; oral...",
      ];

      for (const input of sampleInputs) {
        const jsNormalized = normalizeClinicalText(input);

        const result = await client.db.execute<{ normalized: string }>(
          sql`SELECT regexp_replace(btrim(TRANSLATE(lower(${input}::text), ${PG_NORMALIZATION_FROM}, ${PG_NORMALIZATION_TO})), '\\s+', ' ', 'g') AS normalized`,
        );

        const pgNormalized = (result.rows[0] as { normalized: string }).normalized;
        expect(pgNormalized).toBe(jsNormalized);
      }
    });

    it("verifies LIKE pattern escaping preserves literal symbols", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      const rawPattern = "100%_safe!test";
      const escaped = escapeSqlLikePattern(rawPattern);
      expect(escaped).toBe("100!%!_safe!!test");

      const res = await client.db.execute<{ matched: boolean }>(
        sql`SELECT ('100%_safe!test' LIKE ${'%' + escaped + '%'} ESCAPE '!') AS matched`,
      );
      expect((res.rows[0] as { matched: boolean }).matched).toBe(true);

      const nonMatch = await client.db.execute<{ matched: boolean }>(
        sql`SELECT ('100000safe9test' LIKE ${'%' + escaped + '%'} ESCAPE '!') AS matched`,
      );
      expect((nonMatch.rows[0] as { matched: boolean }).matched).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Scoped Batch Clinical Verification
  // -------------------------------------------------------------------------
  describe("2. Scoped Batch Clinical Verification", () => {
    it("returns empty map without querying database when aggregates array is empty", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const result = await store.getVerificationStatusBatch([]);
      expect(result.size).toBe(0);
    });

    it("evaluates latest eligible action and handles clinical_rejected superseding clinical_verified", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      const resultMap = await store.getVerificationStatusBatch([
        { type: "drug", id: testDrugId },
      ]);

      const status = resultMap.get(`drug:${testDrugId}`);
      expect(status).toBeDefined();
      expect(status?.totalAssertionsCount).toBe(2);
      // Assertion 1 is verified; Assertion 2 has latest action = clinical_rejected, so only 1 verified
      expect(status?.verifiedAssertionsCount).toBe(1);
      expect(status?.isClinicallyVerified).toBe(true);
    });

    it("supersedes clinical_rejected when a newer clinical_verified action is recorded", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      const supersedingVerifId = randomUUID();
      try {
        // Insert newer clinical_verified for Assertion 2
        await client.db.insert(pocketAssertionVerifications).values({
          id: supersedingVerifId,
          assertionId: assertion2Id,
          reviewerUserId: testUserId,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "Re-reviewed after clarification: now clinically verified",
          parentVerificationId: verif3Id,
          verifiedAt: new Date(Date.now() + 5000),
        });

        const resultMap = await store.getVerificationStatusBatch([
          { type: "drug", id: testDrugId },
        ]);

        const status = resultMap.get(`drug:${testDrugId}`);
        expect(status?.totalAssertionsCount).toBe(2);
        // Both assertions are now verified
        expect(status?.verifiedAssertionsCount).toBe(2);
        expect(status?.isClinicallyVerified).toBe(true);
      } finally {
        await client.db
          .delete(pocketAssertionVerifications)
          .where(eq(pocketAssertionVerifications.id, supersedingVerifId))
          .catch(() => {});
      }
    });

    it("flags active clinical conflicts for the aggregate and invalidates verification", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      try {
        await client.db.insert(pocketClinicalConflicts).values({
          id: conflictId,
          conflictSubject: "Dosing discrepancy",
          assertionAId: assertion1Id,
          assertionBId: assertion2Id,
          discrepancyDescription: "Active discrepancy between assertions",
          status: "active_discrepancy",
        });

        const resultMap = await store.getVerificationStatusBatch([
          { type: "drug", id: testDrugId },
        ]);

        const status = resultMap.get(`drug:${testDrugId}`);
        // Active conflict invalidates Assertion 1 verification
        expect(status?.verifiedAssertionsCount).toBe(0);
        expect(status?.isClinicallyVerified).toBe(false);
      } finally {
        await client.db
          .delete(pocketClinicalConflicts)
          .where(eq(pocketClinicalConflicts.id, conflictId))
          .catch(() => {});
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. PostgreSQL-backed 4-Pillar Search & Relevance Ranking
  // -------------------------------------------------------------------------
  describe("3. PostgreSQL Search Published across 4 Pillars", () => {
    it("returns exact title match at tier 1 (score 100) and excludes unpublished entities", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const res = await store.searchPublished({
        query: "Metoprolol Tartrate",
        type: "all",
        offset: 0,
        limit: 10,
      });

      expect(res.total).toBeGreaterThanOrEqual(1);
      const drugMatch = res.items.find((i) => i.id === testDrugId);
      expect(drugMatch).toBeDefined();
      expect(drugMatch?.relevanceScore).toBe(100);
      expect(drugMatch?.type).toBe("drug");

      // Verify unpublished draft drug is NEVER returned
      const unpublishedMatch = res.items.find((i) => i.id === unpublishedDrugId);
      expect(unpublishedMatch).toBeUndefined();
    });

    it("matches alias on disease at alias tier (score 90) and emergency at alias tier", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      // Disease alias match
      const diseaseRes = await store.searchPublished({
        query: "High Blood Pressure",
        type: "disease",
        offset: 0,
        limit: 10,
      });

      expect(diseaseRes.total).toBeGreaterThanOrEqual(1);
      const diseaseMatch = diseaseRes.items.find((i) => i.id === testDiseaseId);
      expect(diseaseMatch).toBeDefined();
      expect(diseaseMatch?.matchField).toBe("alias");
      expect(diseaseMatch?.relevanceScore).toBe(90);

      // Emergency alias match
      const emergencyRes = await store.searchPublished({
        query: "Allergic Shock",
        type: "emergency",
        offset: 0,
        limit: 10,
      });

      expect(emergencyRes.total).toBeGreaterThanOrEqual(1);
      const emergencyMatch = emergencyRes.items.find((i) => i.id === testEmergencyId);
      expect(emergencyMatch).toBeDefined();
      expect(emergencyMatch?.matchField).toBe("alias");
      expect(emergencyMatch?.relevanceScore).toBe(90);
    });

    it("searches treatments directly without aliases and returns exact matches", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const res = await store.searchPublished({
        query: "Beta-Blocker Titration Protocol",
        type: "treatment",
        offset: 0,
        limit: 10,
      });

      expect(res.total).toBeGreaterThanOrEqual(1);
      const treatmentMatch = res.items.find((i) => i.id === testTreatmentId);
      expect(treatmentMatch).toBeDefined();
      expect(treatmentMatch?.relevanceScore).toBe(100);
      expect(treatmentMatch?.matchField).toBe("name_fa");
    });

    it("implements deterministic global ordering across pillars", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const res = await store.searchPublished({
        query: "Beta",
        type: "all",
        offset: 0,
        limit: 20,
      });

      expect(res.items.length).toBeGreaterThanOrEqual(2);

      // Verify ordering: relevance_score DESC, title_fa ASC, type ASC, id ASC
      for (let i = 0; i < res.items.length - 1; i++) {
        const curr = res.items[i];
        const next = res.items[i + 1];

        if (curr.relevanceScore !== next.relevanceScore) {
          expect(curr.relevanceScore).toBeGreaterThan(next.relevanceScore);
        } else if (curr.titleFa !== next.titleFa) {
          expect(curr.titleFa.localeCompare(next.titleFa, "fa")).toBeLessThanOrEqual(0);
        } else if (curr.type !== next.type) {
          expect(curr.type.localeCompare(next.type)).toBeLessThanOrEqual(0);
        } else {
          expect(curr.id.localeCompare(next.id)).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. PostgreSQL-backed Discovery
  // -------------------------------------------------------------------------
  describe("4. PostgreSQL-backed Discovery", () => {
    it("filters by category correctly per pillar", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const res = await store.getDiscovery({
        type: "drug",
        category: "Beta-Blocker",
        sort: "name_asc",
        offset: 0,
        limit: 10,
      });

      expect(res.total).toBeGreaterThanOrEqual(1);
      const found = res.items.find((i) => i.id === testDrugId);
      expect(found).toBeDefined();
      expect(found?.category).toBe("Beta-Blocker");
    });

    it("paginates across all pillars with deterministic ordering", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const page1 = await store.getDiscovery({
        type: "all",
        sort: "name_asc",
        offset: 0,
        limit: 2,
      });

      expect(page1.items.length).toBeLessThanOrEqual(2);
      expect(page1.total).toBeGreaterThanOrEqual(4);

      if (page1.items.length === 2) {
        const page2 = await store.getDiscovery({
          type: "all",
          sort: "name_asc",
          offset: 2,
          limit: 2,
        });

        // Ensure no overlapping items between page 1 and page 2
        const page1Ids = new Set(page1.items.map((i) => i.id));
        for (const item of page2.items) {
          expect(page1Ids.has(item.id)).toBe(false);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Related Entity Deduplication
  // -------------------------------------------------------------------------
  describe("5. Related Entity Deduplication by composite key", () => {
    it("deduplicates multiple links to same entity and merges relationship types and clinical notes", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      const relatedRes = await store.getRelatedEntities("drug", testDrugId);
      expect(relatedRes).not.toBeNull();
      expect(relatedRes?.aggregateId).toBe(testDrugId);
      expect(relatedRes?.aggregateType).toBe("drug");

      // Find indicated_diseases group
      const diseaseGroup = relatedRes?.groups.find((g) => g.relationshipCategory === "indicated_diseases");
      expect(diseaseGroup).toBeDefined();

      // Look for testDiseaseId in the disease group
      const diseaseEntities = diseaseGroup?.entities.filter((e) => e.id === testDiseaseId) || [];
      expect(diseaseEntities.length).toBe(1); // Exactly 1 deduplicated item!

      const item = diseaseEntities[0];
      // Merged relationship types
      expect(item.relationshipType).toContain("primary_indication");
      expect(item.relationshipType).toContain("secondary_prevention");

      // Merged clinical notes
      expect(item.clinicalNotes).toContain("First-line antihypertensive therapy");
      expect(item.clinicalNotes).toContain("Post-myocardial infarction protection");
    });

    it("resolves drug related entities by slug and executes pocketDrugInteractions with canonical UUID", async (ctx) => {
      if (isNetworkUnavailable) {
        ctx.skip();
        return;
      }

      // 1. Drug requested with Slug
      const relatedRes = await store.getRelatedEntities("drug", testDrugSlug);
      expect(relatedRes).not.toBeNull();
      // 2. Canonical UUID returned
      expect(relatedRes?.aggregateId).toBe(testDrugId);
      expect(relatedRes?.aggregateType).toBe("drug");

      // 3. Interactions group returned
      const interactionGroup = relatedRes?.groups.find((g) => g.relationshipCategory === "interactions");
      expect(interactionGroup).toBeDefined();

      // 4. Other drug ID and relationship info returned accurately
      const interactingDrug = interactionGroup?.entities.find((e) => e.id === testDrug2Id);
      expect(interactingDrug).toBeDefined();
      expect(interactingDrug?.titleEn).toBe("Verapamil Hydrochloride");
      expect(interactingDrug?.relationshipType).toBe("تداخل: major");
      expect(interactingDrug?.clinicalNotes).toContain("خطر تشدید برادی‌کاردی");
    });

    it("invalidates Search clinical verification after Reviewer Suspend and Revoke while preserving Assertion and Verification rows", async (ctx) => {
      if (isNetworkUnavailable || !client) {
        ctx.skip();
        return;
      }

      const uniqueSuffix = Date.now();
      const lcAdminId = randomUUID();
      const lcRevId = randomUUID();
      const lcDrugId = randomUUID();
      const lcDrugName = `LifecycleSearchDrug-${uniqueSuffix}`;
      const lcAssertionId = randomUUID();
      const lcVerifId = randomUUID();

      await client.db.insert(users).values([
        { id: lcAdminId, email: `lc-adm-${uniqueSuffix}@avana.local`, name: "LC Admin", globalRole: "platform_admin" },
        { id: lcRevId, email: `lc-rev-${uniqueSuffix}@avana.local`, name: "LC Reviewer", role: "teacher" },
      ]);

      await client.db.insert(pocketDrugs).values({
        id: lcDrugId,
        slug: `lc-search-drug-${uniqueSuffix}`,
        genericNameEn: lcDrugName,
        genericNameFa: `داروی-تست-${uniqueSuffix}`,
        drugClass: "Test Class",
        mechanismOfAction: "Test Mechanism",
        status: "published",
        publishedAt: new Date(),
      });

      const { DrizzleReviewerStore } = await import("../drizzle-reviewer-store.js");
      const { ReviewerService } = await import("../reviewer-service.js");
      const revService = new ReviewerService({
        reviewerStore: new DrizzleReviewerStore(client.db),
        db: client.db,
      });
      const adminActor = { userId: lcAdminId, role: "platform_admin", globalRole: "platform_admin" } as const;

      const cred = await revService.grantCredential(adminActor, {
        userId: lcRevId,
        medicalLicenseNumber: `MD-SRCH-${uniqueSuffix}`,
        specialty: "Internal Medicine",
        licensingAuthority: "IRIMC",
        licenseExpiresAt: new Date(Date.now() + 365 * 86_400_000),
      });

      await client.db.insert(pocketScientificAssertions).values({
        id: lcAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: lcDrugId,
        assertionType: "general_info",
        assertionKey: `lc.search.${uniqueSuffix}`,
        statementText: "Lifecycle search verification statement",
        status: "published",
      });

      await client.db.insert(pocketAssertionVerifications).values({
        id: lcVerifId,
        assertionId: lcAssertionId,
        reviewerUserId: lcRevId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified for search lifecycle test",
      });

      // 1. Active credential -> clinically verified in Search
      const resActive = await store.searchPublished({
        query: lcDrugName,
        type: "drug",
        offset: 0,
        limit: 20,
      });
      const itemActive = resActive.items.find((i) => i.id === lcDrugId);
      expect(itemActive).toBeDefined();
      expect(itemActive?.verification.isClinicallyVerified).toBe(true);

      // 2. Suspend credential -> no longer clinically verified in Search
      await revService.suspendCredential(adminActor, {
        credentialId: cred.id,
        reason: "Suspended during search audit",
      });
      const resSuspended = await store.searchPublished({
        query: lcDrugName,
        type: "drug",
        offset: 0,
        limit: 20,
      });
      const itemSuspended = resSuspended.items.find((i) => i.id === lcDrugId);
      expect(itemSuspended?.verification.isClinicallyVerified ?? false).toBe(false);

      // 3. Reactivate -> clinically verified again in Search
      await revService.reactivateCredential(adminActor, { credentialId: cred.id });
      const resReactivated = await store.searchPublished({
        query: lcDrugName,
        type: "drug",
        offset: 0,
        limit: 20,
      });
      const itemReactivated = resReactivated.items.find((i) => i.id === lcDrugId);
      expect(itemReactivated?.verification.isClinicallyVerified).toBe(true);

      // 4. Revoke -> no longer clinically verified in Search
      await revService.revokeCredential(adminActor, {
        credentialId: cred.id,
        reason: "Revoked during search audit",
      });
      const resRevoked = await store.searchPublished({
        query: lcDrugName,
        type: "drug",
        offset: 0,
        limit: 20,
      });
      const itemRevoked = resRevoked.items.find((i) => i.id === lcDrugId);
      expect(itemRevoked?.verification.isClinicallyVerified ?? false).toBe(false);

      // 5. Historical assertion and verification rows are preserved
      const [preservedAssertion] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, lcAssertionId));
      expect(preservedAssertion?.status).toBe("published");

      const preservedVerifs = await client.db
        .select()
        .from(pocketAssertionVerifications)
        .where(eq(pocketAssertionVerifications.id, lcVerifId));
      expect(preservedVerifs).toHaveLength(1);
    });
  });
});
