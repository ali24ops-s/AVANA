/**
 * Drizzle-backed PostgreSQL implementation of PocketSearchStore (UI-4.1).
 *
 * Implements:
 * 1. Unified search across Drugs, Diseases, Treatments, Emergencies with:
 *    - Schema-correct alias foreign keys (no treatment alias).
 *    - All 10 ranking tiers evaluated in SQL.
 *    - Parameterized SQL with explicit LIKE escaping (!).
 *    - Deterministic global ordering: `relevance_score DESC, title_fa ASC, type ASC, id ASC`.
 *    - Database-side LIMIT/OFFSET and accurate total count.
 * 2. Search suggestions (Typeahead) bounded via search foundation.
 * 3. Clinical discovery:
 *    - Exact domain category mapping per pillar.
 *    - Database-side pagination with identical filters for count and data queries.
 *    - Global UNION ALL pagination for `type = 'all'`.
 * 4. Related clinical entities:
 *    - Strict publication checks on both root and target entities.
 *    - Deduplication by composite `${type}:${id}` with merged relationship types and notes.
 * 5. Scoped batch verification:
 *    - Latest eligible reviewer action evaluation.
 *    - Supersession of rejection by verification, and verification by rejection.
 *    - Active clinical discrepancy checking.
 *    - Composite aggregate keys `${type}:${id}`.
 *    - Exactly one batch query per non-empty result page; empty array returns empty Map without querying.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient, DbRunner } from "@avana/database/client";
import {
  pocketDrugs,
  pocketDiseases,
  pocketTreatments,
  pocketEmergencies,
  pocketSearchAliases,
  pocketScientificAssertions,
  pocketSafetyOverrides,
  pocketDrugDiseaseLinks,
  pocketDiseaseTreatmentLinks,
  pocketTreatmentDrugs,
  pocketDrugInteractions,
  pocketEmergencyMedications,
} from "@avana/database/schema";
import {
  resolveAssertionVerificationSummariesFromDb,
  type AssertionResolutionContext,
} from "./assertion-verification-resolver.js";
import type {
  DiscoveryStoreParams,
  PocketSearchStore,
  SearchPublishedStoreParams,
  SuggestionsStoreParams,
} from "./pocket-search-store.js";
import type {
  ClinicalPillarType,
  ClinicalVerificationStatus,
  PocketDiscoveryItem,
  PocketDiscoveryResponse,
  PocketRelatedEntitiesResponse,
  PocketRelatedEntityItem,
  PocketRelatedGroup,
  PocketSearchResponse,
  PocketSearchResultItem,
  PocketSearchSuggestion,
  PocketSuggestionsResponse,
} from "./pocket-search-types.js";
import {
  escapeSqlLikePattern,
  normalizeClinicalText,
  tokenizeClinicalText,
  PG_NORMALIZATION_FROM,
  PG_NORMALIZATION_TO,
} from "./pocket-text-normalizer.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDbRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) {
    return raw as T[];
  }
  if (raw && typeof raw === "object" && "rows" in raw && Array.isArray((raw as { rows: unknown }).rows)) {
    return (raw as { rows: T[] }).rows;
  }
  return [];
}

interface SqlSearchResultRow {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  title_en: string;
  title_fa: string;
  classification: string;
  summary: string;
  category: string;
  version_number: number;
  published_at: string | Date | null;
  relevance_score: number;
  normalized_title_sort_key?: string;
}

interface SqlDiscoveryRow {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  title_en: string;
  title_fa: string;
  classification: string;
  summary: string;
  category: string;
  version_number: number;
  published_at: string | Date | null;
}

interface PublishedAssertionLookupRow {
  assertion_id: string;
  drug_id: string | null;
  disease_id: string | null;
  treatment_id: string | null;
  emergency_id: string | null;
  assertion_type: string;
}

export class DrizzlePocketSearchStore implements PocketSearchStore {
  constructor(private readonly db: DbClient) {}

  /**
   * Generates a PostgreSQL SQL expression that normalizes column text:
   * TRANSLATE Arabic Kaf/Yeh to Persian, maps punctuation to spaces, deletes diacritics/ZWNJ,
   * trims, and collapses multiple whitespace characters.
   */
  private buildNormalizedSqlColumn(column: unknown) {
    return sql`regexp_replace(btrim(TRANSLATE(lower(${column}::text), ${PG_NORMALIZATION_FROM}, ${PG_NORMALIZATION_TO})), ${"\\s+"}, ' ', 'g')`;
  }

  /**
   * Scoped batch clinical verification lookup:
   * Fetches published, non-superseded assertions for the requested aggregates,
   * delegates clinical verification evaluation to the shared Phase A Unified
   * Verification Resolver inside a consistent snapshot, and aggregates metrics
   * keyed by composite `${type}:${id}`.
   */
  async getVerificationStatusBatch(
    items: Array<{ type: ClinicalPillarType; id: string }>,
  ): Promise<Map<string, ClinicalVerificationStatus>> {
    const evaluated = await this.evaluateAggregateSafetyBatch(items);
    const resultMap = new Map<string, ClinicalVerificationStatus>();
    for (const [key, entry] of evaluated.entries()) {
      resultMap.set(key, entry.verification);
    }
    return resultMap;
  }

  private async evaluateAggregateSafetyBatch(
    items: Array<{ type: ClinicalPillarType; id: string }>,
  ): Promise<Map<string, { verification: ClinicalVerificationStatus; shouldExclude: boolean }>> {
    const resultMap = new Map<
      string,
      { verification: ClinicalVerificationStatus; shouldExclude: boolean }
    >();
    if (!items || items.length === 0) {
      return resultMap;
    }

    for (const item of items) {
      const key = `${item.type}:${item.id}`;
      if (!resultMap.has(key)) {
        resultMap.set(key, {
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
          shouldExclude: true,
        });
      }
    }

    const drugIds = Array.from(new Set(items.filter((i) => i.type === "drug").map((i) => i.id)));
    const diseaseIds = Array.from(new Set(items.filter((i) => i.type === "disease").map((i) => i.id)));
    const treatmentIds = Array.from(new Set(items.filter((i) => i.type === "treatment").map((i) => i.id)));
    const emergencyIds = Array.from(new Set(items.filter((i) => i.type === "emergency").map((i) => i.id)));

    const filterClauses: ReturnType<typeof sql>[] = [];
    const overrideClauses: ReturnType<typeof sql>[] = [];
    if (drugIds.length > 0) {
      const idsSql = sql.join(drugIds.map((id) => sql`${id}::uuid`), sql`, `);
      filterClauses.push(sql`${pocketScientificAssertions.drugId} IN (${idsSql})`);
      overrideClauses.push(sql`(${pocketSafetyOverrides.targetEntityType} = 'drug' AND ${pocketSafetyOverrides.targetEntityId} IN (${idsSql}))`);
    }
    if (diseaseIds.length > 0) {
      const idsSql = sql.join(diseaseIds.map((id) => sql`${id}::uuid`), sql`, `);
      filterClauses.push(sql`${pocketScientificAssertions.diseaseId} IN (${idsSql})`);
      overrideClauses.push(sql`(${pocketSafetyOverrides.targetEntityType} = 'disease' AND ${pocketSafetyOverrides.targetEntityId} IN (${idsSql}))`);
    }
    if (treatmentIds.length > 0) {
      const idsSql = sql.join(treatmentIds.map((id) => sql`${id}::uuid`), sql`, `);
      filterClauses.push(sql`${pocketScientificAssertions.treatmentId} IN (${idsSql})`);
      overrideClauses.push(sql`(${pocketSafetyOverrides.targetEntityType} = 'treatment' AND ${pocketSafetyOverrides.targetEntityId} IN (${idsSql}))`);
    }
    if (emergencyIds.length > 0) {
      const idsSql = sql.join(emergencyIds.map((id) => sql`${id}::uuid`), sql`, `);
      filterClauses.push(sql`${pocketScientificAssertions.emergencyId} IN (${idsSql})`);
      overrideClauses.push(sql`(${pocketSafetyOverrides.targetEntityType} = 'emergency' AND ${pocketSafetyOverrides.targetEntityId} IN (${idsSql}))`);
    }

    if (filterClauses.length === 0) {
      return resultMap;
    }

    const now = new Date();
    const activeAggregateOverrideKeys = new Set<string>();

    const executeBatch = async (runner: DbRunner): Promise<void> => {
      // Check active aggregate-level safety overrides even if the aggregate has 0 assertions
      const overridesRaw = await runner.execute(sql`
        SELECT
          ${pocketSafetyOverrides.targetEntityType} AS target_entity_type,
          ${pocketSafetyOverrides.targetEntityId} AS target_entity_id
        FROM ${pocketSafetyOverrides}
        WHERE ${pocketSafetyOverrides.isActive} = true
          AND ${pocketSafetyOverrides.actionState} <> 'cleared'
          AND (${sql.join(overrideClauses, sql` OR `)});
      `);
      for (const row of parseDbRows<{ target_entity_type: string; target_entity_id: string }>(overridesRaw)) {
        activeAggregateOverrideKeys.add(`${row.target_entity_type}:${row.target_entity_id}`);
      }

      const assertionsQuery = sql`
        SELECT
          ${pocketScientificAssertions.id} AS assertion_id,
          ${pocketScientificAssertions.drugId} AS drug_id,
          ${pocketScientificAssertions.diseaseId} AS disease_id,
          ${pocketScientificAssertions.treatmentId} AS treatment_id,
          ${pocketScientificAssertions.emergencyId} AS emergency_id,
          ${pocketScientificAssertions.assertionType} AS assertion_type
        FROM ${pocketScientificAssertions}
        WHERE ${pocketScientificAssertions.status} = 'published'
          AND ${pocketScientificAssertions.supersededAt} IS NULL
          AND (${sql.join(filterClauses, sql` OR `)});
      `;

      const rawAssertions = await runner.execute(assertionsQuery);
      const assertionRows = parseDbRows<PublishedAssertionLookupRow>(rawAssertions);

      const contexts: AssertionResolutionContext[] = [];
      const assertionToAggregateKey = new Map<string, string>();

      for (const r of assertionRows) {
        let type: ClinicalPillarType | null = null;
        let id: string | null = null;
        if (r.drug_id) {
          type = "drug";
          id = r.drug_id;
        } else if (r.disease_id) {
          type = "disease";
          id = r.disease_id;
        } else if (r.treatment_id) {
          type = "treatment";
          id = r.treatment_id;
        } else if (r.emergency_id) {
          type = "emergency";
          id = r.emergency_id;
        }

        if (!type || !id) continue;

        const key = `${type}:${id}`;
        assertionToAggregateKey.set(r.assertion_id, key);
        contexts.push({
          assertionId: r.assertion_id,
          aggregateType: type,
          aggregateId: id,
          assertionType: r.assertion_type,
        });
      }

      if (contexts.length > 0) {
        const summaries = await resolveAssertionVerificationSummariesFromDb(contexts, runner, {
          now,
        });

        const aggregateMetrics = new Map<
          string,
          {
            totalAssertions: Set<string>;
            verifiedAssertions: Set<string>;
            latestVerifiedDate: Date | null;
          }
        >();

        for (const ctx of contexts) {
          const key = assertionToAggregateKey.get(ctx.assertionId);
          if (!key) continue;

          let agg = aggregateMetrics.get(key);
          if (!agg) {
            agg = {
              totalAssertions: new Set<string>(),
              verifiedAssertions: new Set<string>(),
              latestVerifiedDate: null,
            };
            aggregateMetrics.set(key, agg);
          }

          agg.totalAssertions.add(ctx.assertionId);

          const summary = summaries.get(ctx.assertionId);
          if (summary?.isClinicallyVerified) {
            agg.verifiedAssertions.add(ctx.assertionId);
            if (summary.lastValidApprovalTimestamp) {
              const d = summary.lastValidApprovalTimestamp;
              if (!agg.latestVerifiedDate || d > agg.latestVerifiedDate) {
                agg.latestVerifiedDate = d;
              }
            }
          }
        }

        for (const [key, agg] of aggregateMetrics.entries()) {
          const verifiedCount = agg.verifiedAssertions.size;
          const totalCount = agg.totalAssertions.size;
          const hasOverride = activeAggregateOverrideKeys.has(key);
          const isEligible = !hasOverride && verifiedCount >= 1;
          resultMap.set(key, {
            verification: {
              isClinicallyVerified: isEligible,
              verifiedAssertionsCount: verifiedCount,
              totalAssertionsCount: totalCount,
              lastVerifiedAt: agg.latestVerifiedDate ? agg.latestVerifiedDate.toISOString() : null,
            },
            shouldExclude: !isEligible,
          });
        }
      }

      for (const key of activeAggregateOverrideKeys) {
        const existing = resultMap.get(key);
        if (existing) {
          existing.shouldExclude = true;
          existing.verification = {
            ...existing.verification,
            isClinicallyVerified: false,
          };
        }
      }
    };

    if (this.db && typeof this.db.transaction === "function") {
      await this.db.transaction(executeBatch, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    } else {
      await executeBatch(this.db);
    }

    return resultMap;
  }

  /**
   * Fetches active clinical verification metrics for a single aggregate entity.
   * Delegates to `getVerificationStatusBatch` ensuring identical domain rules.
   */
  async getVerificationStatusForAggregate(
    type: ClinicalPillarType,
    id: string,
  ): Promise<ClinicalVerificationStatus> {
    const map = await this.getVerificationStatusBatch([{ type, id }]);
    return (
      map.get(`${type}:${id}`) ?? {
        isClinicallyVerified: false,
        verifiedAssertionsCount: 0,
        totalAssertionsCount: 0,
        lastVerifiedAt: null,
      }
    );
  }

  /**
   * Search published clinical entities across all four pillars with:
   * - 10-tier scoring evaluated directly in SQL.
   * - Explicit LIKE escaping using `!` and parameterized patterns.
   * - Correct foreign key alias associations.
   * - Deterministic multi-key global ordering (`relevance_score DESC, title_fa ASC, type ASC, id ASC`).
   * - SQL-level LIMIT/OFFSET with accurate count.
   */
  async searchPublished(params: SearchPublishedStoreParams): Promise<PocketSearchResponse> {
    const { query = "", type } = params;
    const safeLimit = Math.max(1, params.limit ?? 20);
    const safeOffset = Math.max(0, params.offset ?? 0);
    const rawQ = query.trim();
    const normQ = normalizeClinicalText(rawQ);
    const escapedQ = escapeSqlLikePattern(normQ);
    const tokens = tokenizeClinicalText(rawQ);
    const escapedTokens = tokens.map(escapeSqlLikePattern);

    const candidatePillars: ClinicalPillarType[] =
      type === "all" ? ["drug", "disease", "treatment", "emergency"] : [type];

    const pillarQueries: ReturnType<typeof sql>[] = [];

    for (const pillar of candidatePillars) {
      if (pillar === "drug") {
        const drugTokenFilters = escapedTokens.map(
          (esc) => sql`(
            ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketDrugs.drugClass)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketDrugs.mechanismOfAction)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR id IN (
              SELECT drug_id FROM ${pocketSearchAliases}
              WHERE drug_id IS NOT NULL
                AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`%${esc}%`} ESCAPE '!'
                     OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`%${esc}%`} ESCAPE '!')
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${pocketDrugs.brandNames}) AS b
              WHERE ${this.buildNormalizedSqlColumn(sql`b`)} LIKE ${`%${esc}%`} ESCAPE '!'
            )
          )`,
        );

        const drugAllTokensInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` AND `,
              )
            : sql`false`;

        const drugAnyTokenInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` OR `,
              )
            : sql`false`;

        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'drug' AS type,
            generic_name_en AS title_en,
            generic_name_fa AS title_fa,
            drug_class AS classification,
            mechanism_of_action AS summary,
            drug_class AS category,
            version_number,
            published_at,
            ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} AS normalized_title_sort_key,
            ${
              normQ.length === 0
                ? sql`10`
                : sql`
                  CASE
                    WHEN ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} = ${normQ}
                      OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} = ${normQ}
                      THEN 100
                    WHEN id IN (
                      SELECT drug_id FROM ${pocketSearchAliases}
                      WHERE drug_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} = ${normQ}
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} = ${normQ})
                    ) OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements_text(${pocketDrugs.brandNames}) AS b
                      WHERE ${this.buildNormalizedSqlColumn(sql`b`)} = ${normQ}
                    ) THEN 90
                    WHEN ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      THEN 80
                    WHEN id IN (
                      SELECT drug_id FROM ${pocketSearchAliases}
                      WHERE drug_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`${escapedQ}%`} ESCAPE '!')
                    ) OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements_text(${pocketDrugs.brandNames}) AS b
                      WHERE ${this.buildNormalizedSqlColumn(sql`b`)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                    ) THEN 75
                    WHEN ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      THEN 70
                    WHEN ${drugAllTokensInTitle}
                      THEN 65
                    WHEN ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameFa)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketDrugs.genericNameEn)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 60
                    WHEN id IN (
                      SELECT drug_id FROM ${pocketSearchAliases}
                      WHERE drug_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`%${escapedQ}%`} ESCAPE '!')
                    ) OR EXISTS (
                      SELECT 1 FROM jsonb_array_elements_text(${pocketDrugs.brandNames}) AS b
                      WHERE ${this.buildNormalizedSqlColumn(sql`b`)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                    ) THEN 50
                    WHEN ${drugAnyTokenInTitle}
                      THEN 45
                    WHEN ${this.buildNormalizedSqlColumn(pocketDrugs.drugClass)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 40
                    WHEN ${this.buildNormalizedSqlColumn(pocketDrugs.mechanismOfAction)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 20
                    ELSE 20
                  END
                `
            } AS relevance_score
          FROM ${pocketDrugs}
          WHERE ${pocketDrugs.status} = 'published'
            ${
              drugTokenFilters.length === 0
                ? sql``
                : sql`AND ${sql.join(drugTokenFilters, sql` AND `)}`
            }
        `);
      } else if (pillar === "disease") {
        const diseaseTokenFilters = escapedTokens.map(
          (esc) => sql`(
            ${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketDiseases.icd10Code)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketDiseases.definition)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR id IN (
              SELECT disease_id FROM ${pocketSearchAliases}
              WHERE disease_id IS NOT NULL
                AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`%${esc}%`} ESCAPE '!'
                     OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`%${esc}%`} ESCAPE '!')
            )
          )`,
        );

        const diseaseAllTokensInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` AND `,
              )
            : sql`false`;

        const diseaseAnyTokenInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` OR `,
              )
            : sql`false`;

        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'disease' AS type,
            title_en,
            title_fa,
            icd10_code AS classification,
            definition AS summary,
            COALESCE(icd10_code, 'Unclassified') AS category,
            version_number,
            published_at,
            ${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} AS normalized_title_sort_key,
            ${
              normQ.length === 0
                ? sql`10`
                : sql`
                  CASE
                    WHEN ${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} = ${normQ}
                      OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} = ${normQ}
                      THEN 100
                    WHEN id IN (
                      SELECT disease_id FROM ${pocketSearchAliases}
                      WHERE disease_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} = ${normQ}
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} = ${normQ})
                    ) THEN 90
                    WHEN ${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      THEN 80
                    WHEN id IN (
                      SELECT disease_id FROM ${pocketSearchAliases}
                      WHERE disease_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`${escapedQ}%`} ESCAPE '!')
                    ) THEN 75
                    WHEN ${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      THEN 70
                    WHEN ${diseaseAllTokensInTitle}
                      THEN 65
                    WHEN ${this.buildNormalizedSqlColumn(pocketDiseases.titleFa)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketDiseases.titleEn)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 60
                    WHEN id IN (
                      SELECT disease_id FROM ${pocketSearchAliases}
                      WHERE disease_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`%${escapedQ}%`} ESCAPE '!')
                    ) THEN 50
                    WHEN ${diseaseAnyTokenInTitle}
                      THEN 45
                    WHEN ${this.buildNormalizedSqlColumn(pocketDiseases.icd10Code)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 40
                    WHEN ${this.buildNormalizedSqlColumn(pocketDiseases.definition)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 20
                    ELSE 20
                  END
                `
            } AS relevance_score
          FROM ${pocketDiseases}
          WHERE ${pocketDiseases.status} = 'published'
            ${
              diseaseTokenFilters.length === 0
                ? sql``
                : sql`AND ${sql.join(diseaseTokenFilters, sql` AND `)}`
            }
        `);
      } else if (pillar === "treatment") {
        const treatmentTokenFilters = escapedTokens.map(
          (esc) => sql`(
            ${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketTreatments.treatmentType)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketTreatments.pharmacologicalStrategy)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketTreatments.guidelineSummary)} LIKE ${`%${esc}%`} ESCAPE '!'
          )`,
        );

        const treatmentAllTokensInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` AND `,
              )
            : sql`false`;

        const treatmentAnyTokenInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` OR `,
              )
            : sql`false`;

        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'treatment' AS type,
            title_en,
            title_fa,
            treatment_type AS classification,
            pharmacological_strategy AS summary,
            treatment_type AS category,
            version_number,
            published_at,
            ${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} AS normalized_title_sort_key,
            ${
              normQ.length === 0
                ? sql`10`
                : sql`
                  CASE
                    WHEN ${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} = ${normQ}
                      OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} = ${normQ}
                      THEN 100
                    WHEN ${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      THEN 80
                    WHEN ${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      THEN 70
                    WHEN ${treatmentAllTokensInTitle}
                      THEN 65
                    WHEN ${this.buildNormalizedSqlColumn(pocketTreatments.titleFa)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketTreatments.titleEn)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 60
                    WHEN ${treatmentAnyTokenInTitle}
                      THEN 45
                    WHEN ${this.buildNormalizedSqlColumn(pocketTreatments.treatmentType)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 40
                    WHEN ${this.buildNormalizedSqlColumn(pocketTreatments.pharmacologicalStrategy)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketTreatments.guidelineSummary)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 20
                    ELSE 20
                  END
                `
            } AS relevance_score
          FROM ${pocketTreatments}
          WHERE ${pocketTreatments.status} = 'published'
            ${
              treatmentTokenFilters.length === 0
                ? sql``
                : sql`AND ${sql.join(treatmentTokenFilters, sql` AND `)}`
            }
        `);
      } else if (pillar === "emergency") {
        const emergencyTokenFilters = escapedTokens.map(
          (esc) => sql`(
            ${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketEmergencies.conditionType)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR ${this.buildNormalizedSqlColumn(pocketEmergencies.immediateTriageGuidance)} LIKE ${`%${esc}%`} ESCAPE '!'
            OR id IN (
              SELECT emergency_id FROM ${pocketSearchAliases}
              WHERE emergency_id IS NOT NULL
                AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`%${esc}%`} ESCAPE '!'
                     OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`%${esc}%`} ESCAPE '!')
            )
          )`,
        );

        const emergencyAllTokensInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` AND `,
              )
            : sql`false`;

        const emergencyAnyTokenInTitle =
          escapedTokens.length > 0
            ? sql.join(
                escapedTokens.map(
                  (esc) =>
                    sql`(${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} LIKE ${`%${esc}%`} ESCAPE '!' OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} LIKE ${`%${esc}%`} ESCAPE '!')`,
                ),
                sql` OR `,
              )
            : sql`false`;

        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'emergency' AS type,
            title_en,
            title_fa,
            condition_type AS classification,
            immediate_triage_guidance AS summary,
            condition_type AS category,
            version_number,
            published_at,
            ${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} AS normalized_title_sort_key,
            ${
              normQ.length === 0
                ? sql`10`
                : sql`
                  CASE
                    WHEN ${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} = ${normQ}
                      OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} = ${normQ}
                      THEN 100
                    WHEN id IN (
                      SELECT emergency_id FROM ${pocketSearchAliases}
                      WHERE emergency_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} = ${normQ}
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} = ${normQ})
                    ) THEN 90
                    WHEN ${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                      THEN 80
                    WHEN id IN (
                      SELECT emergency_id FROM ${pocketSearchAliases}
                      WHERE emergency_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`${escapedQ}%`} ESCAPE '!'
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`${escapedQ}%`} ESCAPE '!')
                    ) THEN 75
                    WHEN ${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} LIKE ${`% ${escapedQ}%`} ESCAPE '!'
                      THEN 70
                    WHEN ${emergencyAllTokensInTitle}
                      THEN 65
                    WHEN ${this.buildNormalizedSqlColumn(pocketEmergencies.titleFa)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      OR ${this.buildNormalizedSqlColumn(pocketEmergencies.titleEn)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 60
                    WHEN id IN (
                      SELECT emergency_id FROM ${pocketSearchAliases}
                      WHERE emergency_id IS NOT NULL
                        AND (${this.buildNormalizedSqlColumn(pocketSearchAliases.normalizedAlias)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                             OR ${this.buildNormalizedSqlColumn(pocketSearchAliases.rawAlias)} LIKE ${`%${escapedQ}%`} ESCAPE '!')
                    ) THEN 50
                    WHEN ${emergencyAnyTokenInTitle}
                      THEN 45
                    WHEN ${this.buildNormalizedSqlColumn(pocketEmergencies.conditionType)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 40
                    WHEN ${this.buildNormalizedSqlColumn(pocketEmergencies.immediateTriageGuidance)} LIKE ${`%${escapedQ}%`} ESCAPE '!'
                      THEN 20
                    ELSE 20
                  END
                `
            } AS relevance_score
          FROM ${pocketEmergencies}
          WHERE ${pocketEmergencies.status} = 'published'
            ${
              emergencyTokenFilters.length === 0
                ? sql``
                : sql`AND ${sql.join(emergencyTokenFilters, sql` AND `)}`
            }
        `);
      }
    }

    const unionAllQuery = sql.join(pillarQueries, sql` UNION ALL `);

    // Candidate query ordered deterministically; filtered via authoritative Resolver batch before pagination
    const candidatesQuery = sql`
      WITH search_results AS (
        ${unionAllQuery}
      )
      SELECT * FROM search_results
      ORDER BY relevance_score DESC, normalized_title_sort_key COLLATE "C" ASC, type ASC, id ASC;
    `;

    const candidatesRaw = await this.db.execute(candidatesQuery);
    const candidateRows = parseDbRows<SqlSearchResultRow>(candidatesRaw);

    const visibilityMap = await this.evaluateAggregateSafetyBatch(
      candidateRows.map((r) => ({ type: r.type, id: r.id })),
    );

    const eligibleRows = candidateRows.filter((r) => {
      const entry = visibilityMap.get(`${r.type}:${r.id}`);
      return !entry?.shouldExclude;
    });

    const total = eligibleRows.length;
    const rows = eligibleRows.slice(safeOffset, safeOffset + safeLimit);

    const items: PocketSearchResultItem[] = rows.map((r) => {
      const score = Number(r.relevance_score);
      let matchField: PocketSearchResultItem["matchField"] = "name_fa";
      if (score === 100 || score === 80 || score === 70 || score === 60) {
        matchField = "name_fa";
      } else if (score === 90 || score === 75 || score === 50) {
        matchField = r.type === "drug" ? "brand_name" : "alias";
      } else if (score === 40) {
        matchField = "classification";
      } else if (score === 20) {
        matchField = "summary";
      }

      const ver = visibilityMap.get(`${r.type}:${r.id}`)?.verification ?? {
        isClinicallyVerified: false,
        verifiedAssertionsCount: 0,
        totalAssertionsCount: 0,
        lastVerifiedAt: null,
      };

      return {
        id: r.id,
        slug: r.slug,
        type: r.type,
        titleEn: r.title_en,
        titleFa: r.title_fa,
        classification: r.classification,
        summary: r.summary,
        publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
        versionNumber: r.version_number,
        relevanceScore: score,
        matchField,
        matchedTerm: r.title_fa,
        verification: ver,
      };
    });

    return {
      items,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < total,
      query: rawQ,
    };
  }

  /**
   * Fast, lightweight suggestions across published clinical entities.
   */
  async getSuggestions(params: SuggestionsStoreParams): Promise<PocketSuggestionsResponse> {
    const { query, type, limit } = params;
    const rawQ = query.trim();
    const normQ = normalizeClinicalText(rawQ);

    if (normQ.length === 0) {
      return { query: rawQ, suggestions: [] };
    }

    const searchRes = await this.searchPublished({
      query: rawQ,
      type,
      limit: Math.min(10, Math.max(1, limit)),
      offset: 0,
    });

    const suggestions: PocketSearchSuggestion[] = searchRes.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      type: item.type,
      titleEn: item.titleEn,
      titleFa: item.titleFa,
      classification: item.classification,
      matchSource: item.matchField === "summary" ? "name_fa" : item.matchField,
      matchedText: item.matchedTerm || item.titleFa,
    }));

    return {
      query: rawQ,
      suggestions,
    };
  }

  /**
   * Browse published entities without requiring a search query.
   * Uses SQL-side pagination and identical filters for main and count queries.
   */
  async getDiscovery(params: DiscoveryStoreParams): Promise<PocketDiscoveryResponse> {
    const { type, category, sort } = params;
    const safeLimit = Math.max(1, params.limit ?? 20);
    const safeOffset = Math.max(0, params.offset ?? 0);
    const cleanCategory = category ? category.trim() : undefined;

    const candidatePillars: ClinicalPillarType[] =
      type === "all" ? ["drug", "disease", "treatment", "emergency"] : [type];

    const pillarQueries: ReturnType<typeof sql>[] = [];

    for (const pillar of candidatePillars) {
      if (pillar === "drug") {
        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'drug' AS type,
            generic_name_en AS title_en,
            generic_name_fa AS title_fa,
            drug_class AS classification,
            mechanism_of_action AS summary,
            drug_class AS category,
            version_number,
            published_at
          FROM ${pocketDrugs}
          WHERE status = 'published'
            ${cleanCategory ? sql`AND drug_class = ${cleanCategory}` : sql``}
        `);
      } else if (pillar === "disease") {
        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'disease' AS type,
            title_en,
            title_fa,
            icd10_code AS classification,
            definition AS summary,
            COALESCE(icd10_code, 'Unclassified') AS category,
            version_number,
            published_at
          FROM ${pocketDiseases}
          WHERE status = 'published'
            ${cleanCategory ? sql`AND icd10_code = ${cleanCategory}` : sql``}
        `);
      } else if (pillar === "treatment") {
        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'treatment' AS type,
            title_en,
            title_fa,
            treatment_type AS classification,
            pharmacological_strategy AS summary,
            treatment_type AS category,
            version_number,
            published_at
          FROM ${pocketTreatments}
          WHERE status = 'published'
            ${cleanCategory ? sql`AND treatment_type = ${cleanCategory}` : sql``}
        `);
      } else if (pillar === "emergency") {
        pillarQueries.push(sql`
          SELECT
            id::text AS id,
            slug,
            'emergency' AS type,
            title_en,
            title_fa,
            condition_type AS classification,
            immediate_triage_guidance AS summary,
            condition_type AS category,
            version_number,
            published_at
          FROM ${pocketEmergencies}
          WHERE status = 'published'
            ${cleanCategory ? sql`AND condition_type = ${cleanCategory}` : sql``}
        `);
      }
    }

    const unionAllQuery = sql.join(pillarQueries, sql` UNION ALL `);

    const sortOrderSql =
      sort === "name_asc"
        ? sql`title_fa ASC, type ASC, id ASC`
        : sort === "name_desc"
        ? sql`title_fa DESC, type ASC, id ASC`
        : sql`published_at DESC NULLS LAST, type ASC, id ASC`;

    const candidatesQuery = sql`
      WITH discovery_results AS (
        ${unionAllQuery}
      )
      SELECT * FROM discovery_results
      ORDER BY ${sortOrderSql};
    `;

    const candidatesRaw = await this.db.execute(candidatesQuery);
    const candidateRows = parseDbRows<SqlDiscoveryRow>(candidatesRaw);

    const visibilityMap = await this.evaluateAggregateSafetyBatch(
      candidateRows.map((r) => ({ type: r.type, id: r.id })),
    );

    const eligibleRows = candidateRows.filter((r) => {
      const entry = visibilityMap.get(`${r.type}:${r.id}`);
      return !entry?.shouldExclude;
    });

    const total = eligibleRows.length;
    const rows = eligibleRows.slice(safeOffset, safeOffset + safeLimit);

    const items: PocketDiscoveryItem[] = rows.map((r) => {
      const ver = visibilityMap.get(`${r.type}:${r.id}`)?.verification ?? {
        isClinicallyVerified: false,
        verifiedAssertionsCount: 0,
        totalAssertionsCount: 0,
        lastVerifiedAt: null,
      };

      return {
        id: r.id,
        slug: r.slug,
        type: r.type,
        titleEn: r.title_en,
        titleFa: r.title_fa,
        classification: r.classification ?? "Unclassified",
        summary: r.summary,
        category: r.category,
        publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
        versionNumber: r.version_number,
        verification: ver,
      };
    });

    return {
      items,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < total,
      type,
      category,
    };
  }

  /**
   * Discover published entities related to a specific aggregate with:
   * - Strict publication checks on root and target entities.
   * - Deduplication by `${type}:${id}` preserving merged relationship types and non-empty notes.
   * - Deterministic ordering (`titleFa ASC, id ASC`).
   * - Scoped batch verification for all unique related entities.
   */
  async getRelatedEntities(
    type: ClinicalPillarType,
    id: string,
  ): Promise<PocketRelatedEntitiesResponse | null> {
    // 1. Validate root entity publication status and resolve canonical UUID (supports UUID or slug)
    const isUuid = UUID_REGEX.test(id);
    let canonicalId: string | null = null;
    switch (type) {
      case "drug": {
        const condition = isUuid ? eq(pocketDrugs.id, id) : eq(pocketDrugs.slug, id);
        const rows = await this.db
          .select({ id: pocketDrugs.id })
          .from(pocketDrugs)
          .where(and(condition, eq(pocketDrugs.status, "published")))
          .limit(1);
        if (rows.length > 0) canonicalId = rows[0].id;
        break;
      }
      case "disease": {
        const condition = isUuid ? eq(pocketDiseases.id, id) : eq(pocketDiseases.slug, id);
        const rows = await this.db
          .select({ id: pocketDiseases.id })
          .from(pocketDiseases)
          .where(and(condition, eq(pocketDiseases.status, "published")))
          .limit(1);
        if (rows.length > 0) canonicalId = rows[0].id;
        break;
      }
      case "treatment": {
        const condition = isUuid ? eq(pocketTreatments.id, id) : eq(pocketTreatments.slug, id);
        const rows = await this.db
          .select({ id: pocketTreatments.id })
          .from(pocketTreatments)
          .where(and(condition, eq(pocketTreatments.status, "published")))
          .limit(1);
        if (rows.length > 0) canonicalId = rows[0].id;
        break;
      }
      case "emergency": {
        const condition = isUuid ? eq(pocketEmergencies.id, id) : eq(pocketEmergencies.slug, id);
        const rows = await this.db
          .select({ id: pocketEmergencies.id })
          .from(pocketEmergencies)
          .where(and(condition, eq(pocketEmergencies.status, "published")))
          .limit(1);
        if (rows.length > 0) canonicalId = rows[0].id;
        break;
      }
    }

    if (!canonicalId) {
      return null;
    }

    const groups: PocketRelatedGroup[] = [];

    // 2. Discover related entities depending on aggregate pillar
    if (type === "drug") {
      // A. Indicated Diseases via pocketDrugDiseaseLinks
      const diseaseLinks = await this.db
        .select({
          diseaseId: pocketDiseases.id,
          slug: pocketDiseases.slug,
          titleEn: pocketDiseases.titleEn,
          titleFa: pocketDiseases.titleFa,
          classification: pocketDiseases.icd10Code,
          relationshipType: pocketDrugDiseaseLinks.relationshipType,
          clinicalNotes: pocketDrugDiseaseLinks.clinicalNotes,
        })
        .from(pocketDrugDiseaseLinks)
        .innerJoin(
          pocketDiseases,
          and(
            eq(pocketDiseases.id, pocketDrugDiseaseLinks.diseaseId),
            eq(pocketDiseases.status, "published"),
          ),
        )
        .where(eq(pocketDrugDiseaseLinks.drugId, canonicalId));

      if (diseaseLinks.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = diseaseLinks.map((dl) => ({
          id: dl.diseaseId,
          slug: dl.slug,
          type: "disease" as const,
          titleEn: dl.titleEn,
          titleFa: dl.titleFa,
          classification: dl.classification ?? "Unclassified",
          relationshipType: dl.relationshipType,
          clinicalNotes: dl.clinicalNotes,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "indicated_diseases",
          relationshipLabelFa: "بیماری‌ها و اندیکاسیون‌های مرتبط",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }

      // B. Treatments utilizing this drug via pocketTreatmentDrugs
      const treatmentLinks = await this.db
        .select({
          treatmentId: pocketTreatments.id,
          slug: pocketTreatments.slug,
          titleEn: pocketTreatments.titleEn,
          titleFa: pocketTreatments.titleFa,
          classification: pocketTreatments.treatmentType,
          relationshipType: pocketTreatmentDrugs.lineOfTherapy,
          clinicalNotes: pocketTreatmentDrugs.clinicalNotes,
        })
        .from(pocketTreatmentDrugs)
        .innerJoin(
          pocketTreatments,
          and(
            eq(pocketTreatments.id, pocketTreatmentDrugs.treatmentId),
            eq(pocketTreatments.status, "published"),
          ),
        )
        .where(eq(pocketTreatmentDrugs.drugId, canonicalId));

      if (treatmentLinks.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = treatmentLinks.map((tl) => ({
          id: tl.treatmentId,
          slug: tl.slug,
          type: "treatment" as const,
          titleEn: tl.titleEn,
          titleFa: tl.titleFa,
          classification: tl.classification,
          relationshipType: tl.relationshipType,
          clinicalNotes: tl.clinicalNotes,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "treatments",
          relationshipLabelFa: "پروتکل‌های درمانی مربوطه",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }

      // C. Interacting Drugs via pocketDrugInteractions
      const interactions = await this.db
        .select({
          otherDrugId: sql<string>`CASE WHEN ${pocketDrugInteractions.drugAId} = ${canonicalId}::uuid THEN ${pocketDrugInteractions.drugBId} ELSE ${pocketDrugInteractions.drugAId} END`,
          severity: pocketDrugInteractions.severity,
          consequenceFa: pocketDrugInteractions.clinicalConsequencePersian,
          managementFa: pocketDrugInteractions.managementActionPersian,
        })
        .from(pocketDrugInteractions)
        .where(
          and(
            sql`(${pocketDrugInteractions.drugAId} = ${canonicalId}::uuid OR ${pocketDrugInteractions.drugBId} = ${canonicalId}::uuid)`,
            eq(pocketDrugInteractions.status, "published"),
          ),
        );

      if (interactions.length > 0) {
        const otherDrugIds = interactions.map((i) => i.otherDrugId);
        const otherDrugRows = await this.db
          .select({
            id: pocketDrugs.id,
            slug: pocketDrugs.slug,
            titleEn: pocketDrugs.genericNameEn,
            titleFa: pocketDrugs.genericNameFa,
            classification: pocketDrugs.drugClass,
          })
          .from(pocketDrugs)
          .where(
            and(
              inArray(pocketDrugs.id, otherDrugIds),
              eq(pocketDrugs.status, "published"),
            ),
          );

        const drugMap = new Map(otherDrugRows.map((d) => [d.id, d]));
        const rawEntities: PocketRelatedEntityItem[] = [];

        for (const inter of interactions) {
          const od = drugMap.get(inter.otherDrugId);
          if (od) {
            rawEntities.push({
              id: od.id,
              slug: od.slug,
              type: "drug" as const,
              titleEn: od.titleEn,
              titleFa: od.titleFa,
              classification: od.classification,
              relationshipType: `تداخل: ${inter.severity}`,
              clinicalNotes: `${inter.consequenceFa} — اقدام: ${inter.managementFa}`,
              verification: {
                isClinicallyVerified: false,
                verifiedAssertionsCount: 0,
                totalAssertionsCount: 0,
                lastVerifiedAt: null,
              },
            });
          }
        }

        if (rawEntities.length > 0) {
          groups.push({
            relationshipCategory: "interactions",
            relationshipLabelFa: "تداخلات دارویی مهم",
            entities: this.deduplicateRelatedEntities(rawEntities),
          });
        }
      }
    } else if (type === "disease") {
      // A. Drugs linked to Disease
      const drugLinks = await this.db
        .select({
          drugId: pocketDrugs.id,
          slug: pocketDrugs.slug,
          titleEn: pocketDrugs.genericNameEn,
          titleFa: pocketDrugs.genericNameFa,
          classification: pocketDrugs.drugClass,
          relationshipType: pocketDrugDiseaseLinks.relationshipType,
          clinicalNotes: pocketDrugDiseaseLinks.clinicalNotes,
        })
        .from(pocketDrugDiseaseLinks)
        .innerJoin(
          pocketDrugs,
          and(
            eq(pocketDrugs.id, pocketDrugDiseaseLinks.drugId),
            eq(pocketDrugs.status, "published"),
          ),
        )
        .where(eq(pocketDrugDiseaseLinks.diseaseId, canonicalId));

      if (drugLinks.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = drugLinks.map((dl) => ({
          id: dl.drugId,
          slug: dl.slug,
          type: "drug" as const,
          titleEn: dl.titleEn,
          titleFa: dl.titleFa,
          classification: dl.classification,
          relationshipType: dl.relationshipType,
          clinicalNotes: dl.clinicalNotes,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "medications",
          relationshipLabelFa: "داروهای مرتبط و اندیکاسیون",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }

      // B. Treatments linked to Disease
      const treatmentLinks = await this.db
        .select({
          treatmentId: pocketTreatments.id,
          slug: pocketTreatments.slug,
          titleEn: pocketTreatments.titleEn,
          titleFa: pocketTreatments.titleFa,
          classification: pocketTreatments.treatmentType,
          relationshipType: pocketDiseaseTreatmentLinks.lineOfTherapy,
          clinicalNotes: pocketDiseaseTreatmentLinks.clinicalNotes,
        })
        .from(pocketDiseaseTreatmentLinks)
        .innerJoin(
          pocketTreatments,
          and(
            eq(pocketTreatments.id, pocketDiseaseTreatmentLinks.treatmentId),
            eq(pocketTreatments.status, "published"),
          ),
        )
        .where(eq(pocketDiseaseTreatmentLinks.diseaseId, canonicalId));

      if (treatmentLinks.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = treatmentLinks.map((tl) => ({
          id: tl.treatmentId,
          slug: tl.slug,
          type: "treatment" as const,
          titleEn: tl.titleEn,
          titleFa: tl.titleFa,
          classification: tl.classification,
          relationshipType: tl.relationshipType,
          clinicalNotes: tl.clinicalNotes,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "treatments",
          relationshipLabelFa: "راهنماها و خطوط درمان",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }
    } else if (type === "treatment") {
      // A. Diseases linked to Treatment
      const diseaseLinks = await this.db
        .select({
          diseaseId: pocketDiseases.id,
          slug: pocketDiseases.slug,
          titleEn: pocketDiseases.titleEn,
          titleFa: pocketDiseases.titleFa,
          classification: pocketDiseases.icd10Code,
          relationshipType: pocketDiseaseTreatmentLinks.lineOfTherapy,
          clinicalNotes: pocketDiseaseTreatmentLinks.clinicalNotes,
        })
        .from(pocketDiseaseTreatmentLinks)
        .innerJoin(
          pocketDiseases,
          and(
            eq(pocketDiseases.id, pocketDiseaseTreatmentLinks.diseaseId),
            eq(pocketDiseases.status, "published"),
          ),
        )
        .where(eq(pocketDiseaseTreatmentLinks.treatmentId, canonicalId));

      if (diseaseLinks.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = diseaseLinks.map((dl) => ({
          id: dl.diseaseId,
          slug: dl.slug,
          type: "disease" as const,
          titleEn: dl.titleEn,
          titleFa: dl.titleFa,
          classification: dl.classification ?? "Unclassified",
          relationshipType: dl.relationshipType,
          clinicalNotes: dl.clinicalNotes,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "associated_conditions",
          relationshipLabelFa: "بیماری‌های هدف درمان",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }

      // B. Drugs linked to Treatment
      const drugLinks = await this.db
        .select({
          drugId: pocketDrugs.id,
          slug: pocketDrugs.slug,
          titleEn: pocketDrugs.genericNameEn,
          titleFa: pocketDrugs.genericNameFa,
          classification: pocketDrugs.drugClass,
          relationshipType: pocketTreatmentDrugs.lineOfTherapy,
          clinicalNotes: pocketTreatmentDrugs.dosingSummary,
        })
        .from(pocketTreatmentDrugs)
        .innerJoin(
          pocketDrugs,
          and(
            eq(pocketDrugs.id, pocketTreatmentDrugs.drugId),
            eq(pocketDrugs.status, "published"),
          ),
        )
        .where(eq(pocketTreatmentDrugs.treatmentId, canonicalId));

      if (drugLinks.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = drugLinks.map((dl) => ({
          id: dl.drugId,
          slug: dl.slug,
          type: "drug" as const,
          titleEn: dl.titleEn,
          titleFa: dl.titleFa,
          classification: dl.classification,
          relationshipType: dl.relationshipType,
          clinicalNotes: dl.clinicalNotes,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "medications",
          relationshipLabelFa: "داروهای اختصاصی پروتکل",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }
    } else if (type === "emergency") {
      // Medications linked to Emergency via pocketEmergencyMedications
      const emMeds = await this.db
        .select({
          drugId: pocketDrugs.id,
          slug: pocketDrugs.slug,
          titleEn: pocketDrugs.genericNameEn,
          titleFa: pocketDrugs.genericNameFa,
          classification: pocketDrugs.drugClass,
          route: pocketEmergencyMedications.route,
          doseAmount: pocketEmergencyMedications.doseAmount,
          doseUnit: pocketEmergencyMedications.doseUnit,
          precautions: pocketEmergencyMedications.criticalPrecautions,
        })
        .from(pocketEmergencyMedications)
        .innerJoin(
          pocketDrugs,
          and(
            eq(pocketDrugs.id, pocketEmergencyMedications.drugId),
            eq(pocketDrugs.status, "published"),
          ),
        )
        .where(
          and(
            eq(pocketEmergencyMedications.emergencyId, canonicalId),
            eq(pocketEmergencyMedications.status, "published"),
          ),
        );

      if (emMeds.length > 0) {
        const rawEntities: PocketRelatedEntityItem[] = emMeds.map((em) => ({
          id: em.drugId,
          slug: em.slug,
          type: "drug" as const,
          titleEn: em.titleEn,
          titleFa: em.titleFa,
          classification: em.classification,
          relationshipType: `مسیر تجویز: ${em.route}`,
          clinicalNotes: `دوز: ${em.doseAmount} ${em.doseUnit}${em.precautions ? ` — احتیاط: ${em.precautions}` : ""}`,
          verification: {
            isClinicallyVerified: false,
            verifiedAssertionsCount: 0,
            totalAssertionsCount: 0,
            lastVerifiedAt: null,
          },
        }));

        groups.push({
          relationshipCategory: "medications",
          relationshipLabelFa: "داروهای خط اول اورژانس",
          entities: this.deduplicateRelatedEntities(rawEntities),
        });
      }
    }

    // 3. Batch verify root + all unique related entities in a single database roundtrip
    const uniqueTargetItems = Array.from(
      new Map(
        [
          { type, id: canonicalId },
          ...groups.flatMap((g) => g.entities).map((e) => ({ type: e.type, id: e.id })),
        ].map((e) => [`${e.type}:${e.id}`, { type: e.type, id: e.id }]),
      ).values(),
    );

    const visibilityMap = await this.evaluateAggregateSafetyBatch(uniqueTargetItems);
    const rootEntry = visibilityMap.get(`${type}:${canonicalId}`);
    if (rootEntry?.shouldExclude) {
      return null;
    }

    const filteredGroups: PocketRelatedGroup[] = [];
    for (const group of groups) {
      const visibleEntities: PocketRelatedEntityItem[] = [];
      for (const entity of group.entities) {
        const entry = visibilityMap.get(`${entity.type}:${entity.id}`);
        if (entry?.shouldExclude) {
          continue;
        }
        entity.verification = entry?.verification ?? {
          isClinicallyVerified: false,
          verifiedAssertionsCount: 0,
          totalAssertionsCount: 0,
          lastVerifiedAt: null,
        };
        visibleEntities.push(entity);
      }
      if (visibleEntities.length > 0) {
        filteredGroups.push({
          ...group,
          entities: visibleEntities,
        });
      }
    }

    return {
      aggregateType: type,
      aggregateId: canonicalId,
      groups: filteredGroups,
    };
  }

  /**
   * Helper to deduplicate related entities by composite key `${type}:${id}`,
   * preserving merged relationship types and non-empty clinical notes.
   */
  private deduplicateRelatedEntities(entities: PocketRelatedEntityItem[]): PocketRelatedEntityItem[] {
    const map = new Map<string, PocketRelatedEntityItem>();

    for (const e of entities) {
      const key = `${e.type}:${e.id}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...e });
      } else {
        // Merge distinct relationship types
        const types = new Set(
          [...existing.relationshipType.split(", "), ...e.relationshipType.split(", ")]
            .map((s) => s.trim())
            .filter(Boolean),
        );
        existing.relationshipType = Array.from(types).join(", ");

        // Merge distinct non-empty clinical notes
        const notes = [existing.clinicalNotes, e.clinicalNotes]
          .map((n) => n?.trim())
          .filter((n): n is string => Boolean(n && n.length > 0));
        const uniqueNotes = Array.from(new Set(notes));
        existing.clinicalNotes = uniqueNotes.length > 0 ? uniqueNotes.join(" | ") : null;
      }
    }

    const result = Array.from(map.values());
    result.sort((a, b) => a.titleFa.localeCompare(b.titleFa, "fa") || a.id.localeCompare(b.id));
    return result;
  }
}
