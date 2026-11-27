/**
 * Drizzle-backed implementation of PocketAdminStore.
 *
 * Uses aggregated SQL counts for assertion statuses and operational totals,
 * and delegates all clinical verification / quorum evaluation to
 * the Unified Verification Resolver.
 */

import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  pocketAssertionAuditLog,
  pocketAssertionCitations,
  pocketClinicalConflicts,
  pocketClinicalReviewerCredentials,
  pocketDiseases,
  pocketDrugs,
  pocketEmergencies,
  pocketSafetyOverrides,
  pocketScientificAssertions,
  pocketSources,
  pocketTreatments,
} from "@avana/database/schema";
import type { ClinicalAggregateType } from "./assertion-consumption-store.js";
import {
  resolveAssertionVerificationSummariesFromDb,
  type AssertionResolutionContext,
  type AssertionVerificationSummary,
} from "./assertion-verification-resolver.js";
import type { ClinicalQuorumPolicy } from "./clinical-quorum-policy.js";
import type {
  PocketAdminAssertionAuditItem,
  PocketAdminAssertionCitation,
  PocketAdminAssertionConflictItem,
  PocketAdminAssertionDetailRecord,
  PocketAdminAssertionRow,
  PocketAdminAssertionsQuery,
  PocketAdminAssertionVersionItem,
  PocketAdminStore,
  PocketAssertionStatusCounts,
  PocketOperationalCounts,
} from "./pocket-admin-store.js";

export class DrizzlePocketAdminStore implements PocketAdminStore {
  constructor(private readonly db: DbClient) {}

  async getAssertionStatusCounts(): Promise<PocketAssertionStatusCounts> {
    const rows = await this.db
      .select({
        status: pocketScientificAssertions.status,
        count: sql<number>`count(*)::int`,
      })
      .from(pocketScientificAssertions)
      .groupBy(pocketScientificAssertions.status);

    const counts: PocketAssertionStatusCounts = {
      total: 0,
      draft: 0,
      inReview: 0,
      reviewed: 0,
      verified: 0,
      published: 0,
      superseded: 0,
      retired: 0,
    };

    for (const row of rows) {
      const count = Number(row.count ?? 0);
      counts.total += count;

      switch (row.status) {
        case "draft":
          counts.draft = count;
          break;
        case "in_review":
          counts.inReview = count;
          break;
        case "reviewed":
          counts.reviewed = count;
          break;
        case "verified":
          counts.verified = count;
          break;
        case "published":
          counts.published = count;
          break;
        case "superseded":
          counts.superseded = count;
          break;
        case "retired":
          counts.retired = count;
          break;
      }
    }

    return counts;
  }

  async getClinicalAssertionContextsForSummary(): Promise<AssertionResolutionContext[]> {
    const rows = await this.db
      .select({
        id: pocketScientificAssertions.id,
        assertionType: pocketScientificAssertions.assertionType,
        drugId: pocketScientificAssertions.drugId,
        diseaseId: pocketScientificAssertions.diseaseId,
        treatmentId: pocketScientificAssertions.treatmentId,
        emergencyId: pocketScientificAssertions.emergencyId,
      })
      .from(pocketScientificAssertions)
      .where(inArray(pocketScientificAssertions.status, ["reviewed", "verified", "published"]));

    return rows.map((row) => {
      if (row.drugId) {
        return {
          assertionId: row.id,
          aggregateType: "drug",
          aggregateId: row.drugId,
          assertionType: row.assertionType,
        };
      }
      if (row.diseaseId) {
        return {
          assertionId: row.id,
          aggregateType: "disease",
          aggregateId: row.diseaseId,
          assertionType: row.assertionType,
        };
      }
      if (row.treatmentId) {
        return {
          assertionId: row.id,
          aggregateType: "treatment",
          aggregateId: row.treatmentId,
          assertionType: row.assertionType,
        };
      }
      return {
        assertionId: row.id,
        aggregateType: row.emergencyId ? "emergency" : null,
        aggregateId: row.emergencyId ?? null,
        assertionType: row.assertionType,
      };
    });
  }

  async resolveVerificationSummaries(
    contexts: readonly AssertionResolutionContext[],
    quorumPolicy?: ClinicalQuorumPolicy,
  ): Promise<Map<string, AssertionVerificationSummary>> {
    return resolveAssertionVerificationSummariesFromDb(contexts, this.db, {
      quorumPolicy,
    });
  }

  async getOperationalCounts(): Promise<PocketOperationalCounts> {
    const [reviewerRows, overrideRows] = await Promise.all([
      this.db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(pocketClinicalReviewerCredentials)
        .where(
          sql`${pocketClinicalReviewerCredentials.isActive} = true
            AND ${pocketClinicalReviewerCredentials.suspendedAt} IS NULL
            AND ${pocketClinicalReviewerCredentials.licenseExpiresAt} > NOW()`,
        ),
      this.db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(pocketSafetyOverrides)
        .where(
          sql`${pocketSafetyOverrides.isActive} = true
            AND ${pocketSafetyOverrides.actionState} <> 'cleared'`,
        ),
    ]);

    return {
      activeReviewerCredentialsCount: Number(reviewerRows[0]?.count ?? 0),
      activeSafetyOverridesCount: Number(overrideRows[0]?.count ?? 0),
    };
  }

  async listAssertions(query: PocketAdminAssertionsQuery): Promise<{
    rows: PocketAdminAssertionRow[];
    totalCount: number;
  }> {
    const conditions: SQL[] = [];

    if (query.status) {
      conditions.push(eq(pocketScientificAssertions.status, query.status));
    }

    if (query.aggregateType === "drug") {
      conditions.push(isNotNull(pocketScientificAssertions.drugId));
    } else if (query.aggregateType === "disease") {
      conditions.push(isNotNull(pocketScientificAssertions.diseaseId));
    } else if (query.aggregateType === "treatment") {
      conditions.push(isNotNull(pocketScientificAssertions.treatmentId));
    } else if (query.aggregateType === "emergency") {
      conditions.push(isNotNull(pocketScientificAssertions.emergencyId));
    }

    const term = query.q?.trim();
    if (term) {
      const pattern = `%${term}%`;
      const searchCond = or(
        ilike(pocketScientificAssertions.assertionKey, pattern),
        ilike(pocketScientificAssertions.statementText, pattern),
        ilike(pocketScientificAssertions.assertionType, pattern),
        ilike(pocketDrugs.genericNameFa, pattern),
        ilike(pocketDrugs.genericNameEn, pattern),
        ilike(pocketDiseases.titleFa, pattern),
        ilike(pocketDiseases.titleEn, pattern),
        ilike(pocketTreatments.titleFa, pattern),
        ilike(pocketTreatments.titleEn, pattern),
        ilike(pocketEmergencies.titleFa, pattern),
        ilike(pocketEmergencies.titleEn, pattern),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const sortColumn =
      query.sortBy === "createdAt"
        ? pocketScientificAssertions.createdAt
        : pocketScientificAssertions.updatedAt;
    const orderExpr = query.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);

    const [countRows, dataRows] = await Promise.all([
      this.db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(pocketScientificAssertions)
        .leftJoin(pocketDrugs, eq(pocketScientificAssertions.drugId, pocketDrugs.id))
        .leftJoin(pocketDiseases, eq(pocketScientificAssertions.diseaseId, pocketDiseases.id))
        .leftJoin(pocketTreatments, eq(pocketScientificAssertions.treatmentId, pocketTreatments.id))
        .leftJoin(pocketEmergencies, eq(pocketScientificAssertions.emergencyId, pocketEmergencies.id))
        .where(whereClause),
      this.db
        .select({
          id: pocketScientificAssertions.id,
          assertionRootId: pocketScientificAssertions.assertionRootId,
          versionNumber: pocketScientificAssertions.versionNumber,
          assertionKey: pocketScientificAssertions.assertionKey,
          statementText: pocketScientificAssertions.statementText,
          assertionType: pocketScientificAssertions.assertionType,
          drugId: pocketScientificAssertions.drugId,
          diseaseId: pocketScientificAssertions.diseaseId,
          treatmentId: pocketScientificAssertions.treatmentId,
          emergencyId: pocketScientificAssertions.emergencyId,
          drugNameFa: pocketDrugs.genericNameFa,
          drugNameEn: pocketDrugs.genericNameEn,
          drugSlug: pocketDrugs.slug,
          diseaseTitleFa: pocketDiseases.titleFa,
          diseaseTitleEn: pocketDiseases.titleEn,
          diseaseSlug: pocketDiseases.slug,
          treatmentTitleFa: pocketTreatments.titleFa,
          treatmentTitleEn: pocketTreatments.titleEn,
          treatmentSlug: pocketTreatments.slug,
          emergencyTitleFa: pocketEmergencies.titleFa,
          emergencyTitleEn: pocketEmergencies.titleEn,
          emergencySlug: pocketEmergencies.slug,
          status: pocketScientificAssertions.status,
          createdAt: pocketScientificAssertions.createdAt,
          updatedAt: pocketScientificAssertions.updatedAt,
        })
        .from(pocketScientificAssertions)
        .leftJoin(pocketDrugs, eq(pocketScientificAssertions.drugId, pocketDrugs.id))
        .leftJoin(pocketDiseases, eq(pocketScientificAssertions.diseaseId, pocketDiseases.id))
        .leftJoin(pocketTreatments, eq(pocketScientificAssertions.treatmentId, pocketTreatments.id))
        .leftJoin(pocketEmergencies, eq(pocketScientificAssertions.emergencyId, pocketEmergencies.id))
        .where(whereClause)
        .orderBy(orderExpr, desc(pocketScientificAssertions.id))
        .limit(limit)
        .offset(offset),
    ]);

    const rows: PocketAdminAssertionRow[] = dataRows.map((row) => {
      let aggregateType: ClinicalAggregateType = "drug";
      let aggregateId = "";
      let aggregateTitleFa: string | null = null;
      let aggregateTitleEn: string | null = null;
      let aggregateSlug: string | null = null;

      if (row.drugId) {
        aggregateType = "drug";
        aggregateId = row.drugId;
        aggregateTitleFa = row.drugNameFa ?? null;
        aggregateTitleEn = row.drugNameEn ?? null;
        aggregateSlug = row.drugSlug ?? null;
      } else if (row.diseaseId) {
        aggregateType = "disease";
        aggregateId = row.diseaseId;
        aggregateTitleFa = row.diseaseTitleFa ?? null;
        aggregateTitleEn = row.diseaseTitleEn ?? null;
        aggregateSlug = row.diseaseSlug ?? null;
      } else if (row.treatmentId) {
        aggregateType = "treatment";
        aggregateId = row.treatmentId;
        aggregateTitleFa = row.treatmentTitleFa ?? null;
        aggregateTitleEn = row.treatmentTitleEn ?? null;
        aggregateSlug = row.treatmentSlug ?? null;
      } else if (row.emergencyId) {
        aggregateType = "emergency";
        aggregateId = row.emergencyId;
        aggregateTitleFa = row.emergencyTitleFa ?? null;
        aggregateTitleEn = row.emergencyTitleEn ?? null;
        aggregateSlug = row.emergencySlug ?? null;
      }

      return {
        id: row.id,
        assertionRootId: row.assertionRootId,
        versionNumber: row.versionNumber,
        assertionKey: row.assertionKey,
        statementText: row.statementText,
        assertionType: row.assertionType,
        aggregateType,
        aggregateId,
        aggregateTitleFa,
        aggregateTitleEn,
        aggregateSlug,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return {
      rows,
      totalCount: Number(countRows[0]?.count ?? 0),
    };
  }

  async getAssertionDetail(id: string): Promise<{
    assertion: PocketAdminAssertionDetailRecord;
    citations: PocketAdminAssertionCitation[];
    versions: PocketAdminAssertionVersionItem[];
    conflicts: PocketAdminAssertionConflictItem[];
    history: PocketAdminAssertionAuditItem[];
  } | null> {
    const assertionRows = await this.db
      .select({
        id: pocketScientificAssertions.id,
        assertionRootId: pocketScientificAssertions.assertionRootId,
        versionNumber: pocketScientificAssertions.versionNumber,
        previousVersionId: pocketScientificAssertions.previousVersionId,
        assertionKey: pocketScientificAssertions.assertionKey,
        statementText: pocketScientificAssertions.statementText,
        assertionType: pocketScientificAssertions.assertionType,
        drugId: pocketScientificAssertions.drugId,
        diseaseId: pocketScientificAssertions.diseaseId,
        treatmentId: pocketScientificAssertions.treatmentId,
        emergencyId: pocketScientificAssertions.emergencyId,
        drugNameFa: pocketDrugs.genericNameFa,
        drugNameEn: pocketDrugs.genericNameEn,
        drugSlug: pocketDrugs.slug,
        diseaseTitleFa: pocketDiseases.titleFa,
        diseaseTitleEn: pocketDiseases.titleEn,
        diseaseSlug: pocketDiseases.slug,
        treatmentTitleFa: pocketTreatments.titleFa,
        treatmentTitleEn: pocketTreatments.titleEn,
        treatmentSlug: pocketTreatments.slug,
        emergencyTitleFa: pocketEmergencies.titleFa,
        emergencyTitleEn: pocketEmergencies.titleEn,
        emergencySlug: pocketEmergencies.slug,
        jurisdiction: pocketScientificAssertions.jurisdiction,
        targetPopulation: pocketScientificAssertions.targetPopulation,
        clinicalSetting: pocketScientificAssertions.clinicalSetting,
        status: pocketScientificAssertions.status,
        releaseId: pocketScientificAssertions.releaseId,
        validUntilDate: pocketScientificAssertions.validUntilDate,
        supersededAt: pocketScientificAssertions.supersededAt,
        createdAt: pocketScientificAssertions.createdAt,
        updatedAt: pocketScientificAssertions.updatedAt,
      })
      .from(pocketScientificAssertions)
      .leftJoin(pocketDrugs, eq(pocketScientificAssertions.drugId, pocketDrugs.id))
      .leftJoin(pocketDiseases, eq(pocketScientificAssertions.diseaseId, pocketDiseases.id))
      .leftJoin(pocketTreatments, eq(pocketScientificAssertions.treatmentId, pocketTreatments.id))
      .leftJoin(pocketEmergencies, eq(pocketScientificAssertions.emergencyId, pocketEmergencies.id))
      .where(eq(pocketScientificAssertions.id, id))
      .limit(1);

    const row = assertionRows[0];
    if (!row) {
      return null;
    }

    let aggregateType: ClinicalAggregateType = "drug";
    let aggregateId = "";
    let aggregateTitleFa: string | null = null;
    let aggregateTitleEn: string | null = null;
    let aggregateSlug: string | null = null;

    if (row.drugId) {
      aggregateType = "drug";
      aggregateId = row.drugId;
      aggregateTitleFa = row.drugNameFa ?? null;
      aggregateTitleEn = row.drugNameEn ?? null;
      aggregateSlug = row.drugSlug ?? null;
    } else if (row.diseaseId) {
      aggregateType = "disease";
      aggregateId = row.diseaseId;
      aggregateTitleFa = row.diseaseTitleFa ?? null;
      aggregateTitleEn = row.diseaseTitleEn ?? null;
      aggregateSlug = row.diseaseSlug ?? null;
    } else if (row.treatmentId) {
      aggregateType = "treatment";
      aggregateId = row.treatmentId;
      aggregateTitleFa = row.treatmentTitleFa ?? null;
      aggregateTitleEn = row.treatmentTitleEn ?? null;
      aggregateSlug = row.treatmentSlug ?? null;
    } else if (row.emergencyId) {
      aggregateType = "emergency";
      aggregateId = row.emergencyId;
      aggregateTitleFa = row.emergencyTitleFa ?? null;
      aggregateTitleEn = row.emergencyTitleEn ?? null;
      aggregateSlug = row.emergencySlug ?? null;
    }

    const [citationRows, versionRows, conflictRows, historyRows] = await Promise.all([
      this.db
        .select({
          id: pocketAssertionCitations.id,
          sourceId: pocketAssertionCitations.sourceId,
          sourceCode: pocketSources.code,
          sourceTitle: pocketSources.title,
          publisher: pocketSources.publisher,
          sourceType: pocketSources.sourceType,
          editionOrVersion: pocketSources.editionOrVersion,
          publicationDate: pocketSources.publicationDate,
          doi: pocketSources.doi,
          canonicalUrl: pocketSources.canonicalUrl,
          sourceAuditStatus: pocketSources.auditStatus,
          locationReference: pocketAssertionCitations.locationReference,
          sourceSnapshotUrl: pocketAssertionCitations.sourceSnapshotUrl,
          accessedAt: pocketAssertionCitations.accessedAt,
          evidenceGrade: pocketAssertionCitations.evidenceGrade,
          citationStatus: pocketAssertionCitations.status,
        })
        .from(pocketAssertionCitations)
        .innerJoin(pocketSources, eq(pocketAssertionCitations.sourceId, pocketSources.id))
        .where(eq(pocketAssertionCitations.assertionId, id))
        .orderBy(asc(pocketAssertionCitations.createdAt)),
      this.db
        .select({
          id: pocketScientificAssertions.id,
          versionNumber: pocketScientificAssertions.versionNumber,
          previousVersionId: pocketScientificAssertions.previousVersionId,
          status: pocketScientificAssertions.status,
          supersededAt: pocketScientificAssertions.supersededAt,
          createdAt: pocketScientificAssertions.createdAt,
        })
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.assertionRootId, row.assertionRootId))
        .orderBy(desc(pocketScientificAssertions.versionNumber)),
      this.db
        .select({
          id: pocketClinicalConflicts.id,
          conflictSubject: pocketClinicalConflicts.conflictSubject,
          assertionAId: pocketClinicalConflicts.assertionAId,
          assertionBId: pocketClinicalConflicts.assertionBId,
          discrepancyDescription: pocketClinicalConflicts.discrepancyDescription,
          status: pocketClinicalConflicts.status,
          resolvedAt: pocketClinicalConflicts.resolvedAt,
          resolutionNotes: pocketClinicalConflicts.resolutionNotes,
          createdAt: pocketClinicalConflicts.createdAt,
        })
        .from(pocketClinicalConflicts)
        .where(
          or(
            eq(pocketClinicalConflicts.assertionAId, id),
            eq(pocketClinicalConflicts.assertionBId, id),
          ),
        )
        .orderBy(desc(pocketClinicalConflicts.createdAt)),
      this.db
        .select({
          id: pocketAssertionAuditLog.id,
          assertionId: pocketAssertionAuditLog.assertionId,
          action: pocketAssertionAuditLog.action,
          previousStatus: pocketAssertionAuditLog.previousStatus,
          newStatus: pocketAssertionAuditLog.newStatus,
          clinicalNotes: pocketAssertionAuditLog.clinicalNotes,
          createdAt: pocketAssertionAuditLog.createdAt,
        })
        .from(pocketAssertionAuditLog)
        .where(eq(pocketAssertionAuditLog.assertionId, id))
        .orderBy(desc(pocketAssertionAuditLog.createdAt)),
    ]);

    return {
      assertion: {
        id: row.id,
        assertionRootId: row.assertionRootId,
        versionNumber: row.versionNumber,
        previousVersionId: row.previousVersionId ?? null,
        assertionKey: row.assertionKey,
        statementText: row.statementText,
        assertionType: row.assertionType,
        aggregateType,
        aggregateId,
        aggregateTitleFa,
        aggregateTitleEn,
        aggregateSlug,
        jurisdiction: row.jurisdiction,
        targetPopulation: row.targetPopulation,
        clinicalSetting: row.clinicalSetting,
        status: row.status,
        releaseId: row.releaseId ?? null,
        validUntilDate: row.validUntilDate ? String(row.validUntilDate) : null,
        supersededAt: row.supersededAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      citations: citationRows.map((c) => ({
        ...c,
        publicationDate: c.publicationDate ? String(c.publicationDate) : null,
        doi: c.doi ?? null,
        canonicalUrl: c.canonicalUrl ?? null,
        sourceSnapshotUrl: c.sourceSnapshotUrl ?? null,
        accessedAt: String(c.accessedAt),
        evidenceGrade: c.evidenceGrade ?? null,
      })),
      versions: versionRows.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        previousVersionId: v.previousVersionId ?? null,
        status: v.status,
        isActivePublished: v.status === "published",
        supersededAt: v.supersededAt ? v.supersededAt.toISOString() : null,
        createdAt: v.createdAt.toISOString(),
      })),
      conflicts: conflictRows.map((conf) => ({
        ...conf,
        resolvedAt: conf.resolvedAt ? conf.resolvedAt.toISOString() : null,
        resolutionNotes: conf.resolutionNotes ?? null,
        createdAt: conf.createdAt.toISOString(),
      })),
      history: historyRows.map((h) => ({
        ...h,
        previousStatus: h.previousStatus ?? null,
        clinicalNotes: h.clinicalNotes ?? null,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }
}
