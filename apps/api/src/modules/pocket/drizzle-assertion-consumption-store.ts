/**
 * Drizzle-backed PostgreSQL implementation of AssertionConsumptionStore.
 *
 * Implements Phase 2C-4A persistence queries for published clinical assertions:
 * 1. Consistent snapshot isolation: queries run in REPEATABLE READ READ ONLY transaction.
 * 2. Explicit aggregate existence validation: 404 if entity does not exist in pillar table.
 * 3. Safe clinical SQL projection: projects only consumer-safe columns, strictly omitting
 *    release_id, audit logs, reviewer identities, and internal review critiques at SQL level.
 * 4. Deterministic stable ordering: `assertion_key ASC, version_number DESC, id ASC`.
 */

import { and, eq, isNull, asc, desc } from "drizzle-orm";
import type { DbClient, DbRunner } from "@avana/database/client";
import {
  pocketDrugs,
  pocketDiseases,
  pocketTreatments,
  pocketEmergencies,
  pocketScientificAssertions,
  pocketEntityVersionRegistry,
} from "@avana/database/schema";
import {
  hasActiveAggregateSafetyOverride,
  resolveAssertionVerificationSummariesFromDb,
  type AssertionResolutionContext,
} from "./assertion-verification-resolver.js";
import type {
  AssertionConsumptionStore,
  AggregateAssertionsQueryResult,
  ClinicalAggregateIdentity,
  ClinicalAggregateMetadata,
  ClinicalAggregateType,
  PublishedAssertionItem,
} from "./assertion-consumption-store.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ConsumerSafeAssertionRow {
  id: string;
  assertionRootId: string;
  versionNumber: number;
  previousVersionId: string | null;
  assertionType: string;
  assertionKey: string;
  statementText: string;
  jurisdiction: string;
  targetPopulation: string;
  clinicalSetting: string;
  validUntilDate: string | null;
  updatedAt: Date;
}

function toDate(val: unknown): Date {
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return new Date();
}

export interface AssertionVerificationStatus {
  isClinicallyVerified: boolean;
  verifiedAt: Date | null;
}

function mapRowToPublishedItem(
  row: ConsumerSafeAssertionRow,
  aggregateType: ClinicalAggregateType,
  aggregateId: string,
  verificationStatus?: AssertionVerificationStatus,
): PublishedAssertionItem {
  return {
    id: row.id,
    assertionRootId: row.assertionRootId,
    versionNumber: row.versionNumber,
    previousVersionId: row.previousVersionId ?? null,
    aggregateType,
    aggregateId,
    assertionType: row.assertionType,
    assertionKey: row.assertionKey,
    statementText: row.statementText,
    jurisdiction: row.jurisdiction,
    targetPopulation: row.targetPopulation,
    clinicalSetting: row.clinicalSetting,
    validUntilDate: row.validUntilDate ? String(row.validUntilDate) : null,
    publishedAt: toDate(row.updatedAt),
    isClinicallyVerified: verificationStatus?.isClinicallyVerified ?? false,
    verifiedAt: verificationStatus?.verifiedAt ?? null,
  };
}

export class DrizzleAssertionConsumptionStore implements AssertionConsumptionStore {
  constructor(private readonly db: DbClient) {}

  /**
   * Resolves an aggregate identifier (UUID or canonical slug) to its canonical UUID and slug.
   * Query-level guarantee: status = 'published'.
   * Returns null if not found or not published.
   */
  async resolveAggregateIdentity(
    aggregateType: ClinicalAggregateType,
    identifier: string,
    runner: DbRunner = this.db,
  ): Promise<ClinicalAggregateIdentity | null> {
    const isUuid = UUID_REGEX.test(identifier);

    switch (aggregateType) {
      case "drug": {
        const condition = isUuid
          ? eq(pocketDrugs.id, identifier)
          : eq(pocketDrugs.slug, identifier);
        const rows = await runner
          .select({ id: pocketDrugs.id, slug: pocketDrugs.slug })
          .from(pocketDrugs)
          .where(and(condition, eq(pocketDrugs.status, "published")))
          .limit(1);
        if (rows.length === 0) return null;
        return { canonicalId: rows[0].id, slug: rows[0].slug };
      }
      case "disease": {
        const condition = isUuid
          ? eq(pocketDiseases.id, identifier)
          : eq(pocketDiseases.slug, identifier);
        const rows = await runner
          .select({ id: pocketDiseases.id, slug: pocketDiseases.slug })
          .from(pocketDiseases)
          .where(and(condition, eq(pocketDiseases.status, "published")))
          .limit(1);
        if (rows.length === 0) return null;
        return { canonicalId: rows[0].id, slug: rows[0].slug };
      }
      case "treatment": {
        const condition = isUuid
          ? eq(pocketTreatments.id, identifier)
          : eq(pocketTreatments.slug, identifier);
        const rows = await runner
          .select({ id: pocketTreatments.id, slug: pocketTreatments.slug })
          .from(pocketTreatments)
          .where(and(condition, eq(pocketTreatments.status, "published")))
          .limit(1);
        if (rows.length === 0) return null;
        return { canonicalId: rows[0].id, slug: rows[0].slug };
      }
      case "emergency": {
        const condition = isUuid
          ? eq(pocketEmergencies.id, identifier)
          : eq(pocketEmergencies.slug, identifier);
        const rows = await runner
          .select({ id: pocketEmergencies.id, slug: pocketEmergencies.slug })
          .from(pocketEmergencies)
          .where(and(condition, eq(pocketEmergencies.status, "published")))
          .limit(1);
        if (rows.length === 0) return null;
        return { canonicalId: rows[0].id, slug: rows[0].slug };
      }
    }
  }

  /**
   * Validates whether the aggregate entity actually exists in its corresponding pillar table.
   * Supports both UUID and canonical slug.
   */
  async aggregateExists(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
    runner: DbRunner = this.db,
  ): Promise<boolean> {
    const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId, runner);
    return identity !== null;
  }

  /**
   * Internal helper to fetch version within the current snapshot runner.
   */
  private async readCurrentVersion(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
    runner: DbRunner,
  ): Promise<number> {
    const rows = await runner
      .select({ currentVersion: pocketEntityVersionRegistry.currentVersion })
      .from(pocketEntityVersionRegistry)
      .where(
        and(
          eq(pocketEntityVersionRegistry.aggregateType, aggregateType),
          eq(pocketEntityVersionRegistry.aggregateId, aggregateId),
        ),
      )
      .limit(1);

    if (rows.length === 0 || rows[0].currentVersion === null) {
      return 0;
    }

    return Number(rows[0].currentVersion);
  }

  /**
   * Resolves authoritative clinical verification status and latest verification timestamp
   * for a set of physical assertion contexts by delegating strictly to the shared
   * Phase A Unified Verification Resolver (`resolveAssertionVerificationSummariesFromDb`).
   */
  async resolveVerificationStatuses(
    contexts: AssertionResolutionContext[],
    runner: DbRunner = this.db,
  ): Promise<Map<string, AssertionVerificationStatus>> {
    const result = new Map<string, AssertionVerificationStatus>();
    if (
      contexts.length === 0 ||
      !runner ||
      typeof (runner as unknown as { execute?: unknown }).execute !== "function"
    ) {
      return result;
    }

    const summaries = await resolveAssertionVerificationSummariesFromDb(contexts, runner);
    for (const [assertionId, summary] of summaries.entries()) {
      result.set(assertionId, {
        isClinicallyVerified: summary.isClinicallyVerified,
        verifiedAt: summary.isClinicallyVerified ? summary.lastValidApprovalTimestamp : null,
      });
    }

    return result;
  }

  /**
   * Fetch published assertions and authoritative entity version within a single
   * consistent snapshot (REPEATABLE READ READ ONLY).
   * Supports both UUID and canonical slug.
   */
  async findPublishedByAggregate(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<AggregateAssertionsQueryResult | null> {
    const execute = async (runner: DbRunner): Promise<AggregateAssertionsQueryResult | null> => {
      // 1. Resolve aggregate identity (supports UUID or canonical slug)
      const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId, runner);
      if (!identity) {
        return null;
      }
      const { canonicalId } = identity;

      // 2. Fetch current monotonic version from version registry using canonical UUID
      const currentVersion = await this.readCurrentVersion(aggregateType, canonicalId, runner);

      // 3. Select appropriate foreign key condition for aggregate pillar
      const aggregateColumn = this.resolveAggregateColumn(aggregateType);

      // 4. Execute query with strict query-level filter and explicit column projection
      // Explicit projection ensures release_id, created_at, foreign keys, and internal fields
      // are never retrieved from the database over the network.
      const rows = await runner
        .select({
          id: pocketScientificAssertions.id,
          assertionRootId: pocketScientificAssertions.assertionRootId,
          versionNumber: pocketScientificAssertions.versionNumber,
          previousVersionId: pocketScientificAssertions.previousVersionId,
          assertionType: pocketScientificAssertions.assertionType,
          assertionKey: pocketScientificAssertions.assertionKey,
          statementText: pocketScientificAssertions.statementText,
          jurisdiction: pocketScientificAssertions.jurisdiction,
          targetPopulation: pocketScientificAssertions.targetPopulation,
          clinicalSetting: pocketScientificAssertions.clinicalSetting,
          validUntilDate: pocketScientificAssertions.validUntilDate,
          updatedAt: pocketScientificAssertions.updatedAt,
        })
        .from(pocketScientificAssertions)
        .where(
          and(
            eq(aggregateColumn, canonicalId),
            eq(pocketScientificAssertions.status, "published"),
            isNull(pocketScientificAssertions.supersededAt),
          ),
        )
        .orderBy(
          asc(pocketScientificAssertions.assertionKey),
          desc(pocketScientificAssertions.versionNumber),
          asc(pocketScientificAssertions.id),
        );

      const verificationContexts: AssertionResolutionContext[] = rows.map((r) => ({
        assertionId: r.id,
        aggregateType,
        aggregateId: canonicalId,
        assertionType: r.assertionType,
      }));
      const verificationStatuses = await this.resolveVerificationStatuses(verificationContexts, runner);

      const assertions = rows
        .filter((row) => verificationStatuses.get(row.id)?.isClinicallyVerified === true)
        .map((row) =>
          mapRowToPublishedItem(
            row,
            aggregateType,
            canonicalId,
            verificationStatuses.get(row.id),
          ),
        );

      return {
        aggregateType,
        aggregateId: canonicalId,
        currentVersion,
        assertions,
      };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(execute, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    }

    return await execute(this.db);
  }

  async getCurrentVersion(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<number | null> {
    const execute = async (runner: DbRunner): Promise<number | null> => {
      const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId, runner);
      if (!identity) {
        return null;
      }
      return await this.readCurrentVersion(aggregateType, identity.canonicalId, runner);
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(execute, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    }

    return await execute(this.db);
  }

  async findPublishedAssertionById(id: string): Promise<PublishedAssertionItem | null> {
    const execute = async (runner: DbRunner): Promise<PublishedAssertionItem | null> => {
      const rows = await runner
        .select({
          id: pocketScientificAssertions.id,
          assertionRootId: pocketScientificAssertions.assertionRootId,
          versionNumber: pocketScientificAssertions.versionNumber,
          previousVersionId: pocketScientificAssertions.previousVersionId,
          drugId: pocketScientificAssertions.drugId,
          diseaseId: pocketScientificAssertions.diseaseId,
          treatmentId: pocketScientificAssertions.treatmentId,
          emergencyId: pocketScientificAssertions.emergencyId,
          assertionType: pocketScientificAssertions.assertionType,
          assertionKey: pocketScientificAssertions.assertionKey,
          statementText: pocketScientificAssertions.statementText,
          jurisdiction: pocketScientificAssertions.jurisdiction,
          targetPopulation: pocketScientificAssertions.targetPopulation,
          clinicalSetting: pocketScientificAssertions.clinicalSetting,
          validUntilDate: pocketScientificAssertions.validUntilDate,
          updatedAt: pocketScientificAssertions.updatedAt,
        })
        .from(pocketScientificAssertions)
        .where(
          and(
            eq(pocketScientificAssertions.id, id),
            eq(pocketScientificAssertions.status, "published"),
            isNull(pocketScientificAssertions.supersededAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      let aggregateType: ClinicalAggregateType = "drug";
      let aggregateId = "";
      if (row.drugId) {
        aggregateType = "drug";
        aggregateId = row.drugId;
      } else if (row.diseaseId) {
        aggregateType = "disease";
        aggregateId = row.diseaseId;
      } else if (row.treatmentId) {
        aggregateType = "treatment";
        aggregateId = row.treatmentId;
      } else if (row.emergencyId) {
        aggregateType = "emergency";
        aggregateId = row.emergencyId;
      }

      // Direct access protection: parent aggregate must also be published!
      const parentPublished = await this.aggregateExists(aggregateType, aggregateId, runner);
      if (!parentPublished) {
        return null;
      }

      const verificationStatuses = await this.resolveVerificationStatuses(
        [
          {
            assertionId: row.id,
            aggregateType,
            aggregateId,
            assertionType: row.assertionType,
          },
        ],
        runner,
      );

      const status = verificationStatuses.get(row.id);
      if (!status?.isClinicallyVerified) {
        return null;
      }

      return mapRowToPublishedItem(
        row,
        aggregateType,
        aggregateId,
        status,
      );
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(execute, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    }

    return await execute(this.db);
  }

  async getAggregateMetadata(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<ClinicalAggregateMetadata | null> {
    const execute = async (runner: DbRunner): Promise<ClinicalAggregateMetadata | null> => {
      const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId, runner);
      if (!identity) {
        return null;
      }
      const { canonicalId } = identity;

      // Enforce active aggregate-level safety override gate consistently with Consumption & Search
      if (await hasActiveAggregateSafetyOverride(aggregateType, canonicalId, runner)) {
        return null;
      }

      switch (aggregateType) {
        case "drug": {
          const rows = await runner
            .select({
              id: pocketDrugs.id,
              slug: pocketDrugs.slug,
              nameEn: pocketDrugs.genericNameEn,
              nameFa: pocketDrugs.genericNameFa,
              classification: pocketDrugs.drugClass,
              summary: pocketDrugs.mechanismOfAction,
              versionNumber: pocketDrugs.versionNumber,
              publishedAt: pocketDrugs.publishedAt,
            })
            .from(pocketDrugs)
            .where(and(eq(pocketDrugs.id, canonicalId), eq(pocketDrugs.status, "published")))
            .limit(1);
          if (rows.length === 0) return null;
          const r = rows[0];
          return {
            id: r.id,
            type: "drug",
            slug: r.slug,
            nameEn: r.nameEn,
            nameFa: r.nameFa,
            classification: r.classification,
            summary: r.summary,
            versionNumber: r.versionNumber,
            publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
          };
        }
        case "disease": {
          const rows = await runner
            .select({
              id: pocketDiseases.id,
              slug: pocketDiseases.slug,
              nameEn: pocketDiseases.titleEn,
              nameFa: pocketDiseases.titleFa,
              classification: pocketDiseases.icd10Code,
              summary: pocketDiseases.definition,
              versionNumber: pocketDiseases.versionNumber,
              publishedAt: pocketDiseases.publishedAt,
            })
            .from(pocketDiseases)
            .where(and(eq(pocketDiseases.id, canonicalId), eq(pocketDiseases.status, "published")))
            .limit(1);
          if (rows.length === 0) return null;
          const r = rows[0];
          return {
            id: r.id,
            type: "disease",
            slug: r.slug,
            nameEn: r.nameEn,
            nameFa: r.nameFa,
            classification: r.classification || "Unclassified",
            summary: r.summary,
            versionNumber: r.versionNumber,
            publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
          };
        }
        case "treatment": {
          const rows = await runner
            .select({
              id: pocketTreatments.id,
              slug: pocketTreatments.slug,
              nameEn: pocketTreatments.titleEn,
              nameFa: pocketTreatments.titleFa,
              classification: pocketTreatments.treatmentType,
              summary: pocketTreatments.pharmacologicalStrategy,
              versionNumber: pocketTreatments.versionNumber,
              publishedAt: pocketTreatments.publishedAt,
            })
            .from(pocketTreatments)
            .where(and(eq(pocketTreatments.id, canonicalId), eq(pocketTreatments.status, "published")))
            .limit(1);
          if (rows.length === 0) return null;
          const r = rows[0];
          return {
            id: r.id,
            type: "treatment",
            slug: r.slug,
            nameEn: r.nameEn,
            nameFa: r.nameFa,
            classification: r.classification,
            summary: r.summary,
            versionNumber: r.versionNumber,
            publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
          };
        }
        case "emergency": {
          const rows = await runner
            .select({
              id: pocketEmergencies.id,
              slug: pocketEmergencies.slug,
              nameEn: pocketEmergencies.titleEn,
              nameFa: pocketEmergencies.titleFa,
              classification: pocketEmergencies.conditionType,
              summary: pocketEmergencies.immediateTriageGuidance,
              versionNumber: pocketEmergencies.versionNumber,
              publishedAt: pocketEmergencies.publishedAt,
            })
            .from(pocketEmergencies)
            .where(and(eq(pocketEmergencies.id, canonicalId), eq(pocketEmergencies.status, "published")))
            .limit(1);
          if (rows.length === 0) return null;
          const r = rows[0];
          return {
            id: r.id,
            type: "emergency",
            slug: r.slug,
            nameEn: r.nameEn,
            nameFa: r.nameFa,
            classification: r.classification,
            summary: r.summary,
            versionNumber: r.versionNumber,
            publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
          };
        }
      }
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(execute, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    }

    return await execute(this.db);
  }

  private resolveAggregateColumn(aggregateType: ClinicalAggregateType) {
    switch (aggregateType) {
      case "drug":
        return pocketScientificAssertions.drugId;
      case "disease":
        return pocketScientificAssertions.diseaseId;
      case "treatment":
        return pocketScientificAssertions.treatmentId;
      case "emergency":
        return pocketScientificAssertions.emergencyId;
    }
  }
}

