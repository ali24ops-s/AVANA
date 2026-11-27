/**
 * AVANA Pocket — Admin Dashboard Store Interface & In-Memory Implementation.
 *
 * Provides aggregated operational and clinical verification counts for
 * GET /v1/pocket/admin/summary without duplicating Quorum/Resolver logic.
 */

import type {
  AssertionResolutionContext,
  AssertionVerificationSummary,
  VerificationBlockReason,
} from "./assertion-verification-resolver.js";
import type { ClinicalAggregateType } from "./assertion-consumption-store.js";
import {
  evaluateBatchAssertionVerificationSummaries,
  type RawAssertionVerificationRow,
  type RawClinicalConflictRow,
  type RawReviewerCredentialRow,
  type RawSafetyOverrideRow,
} from "./assertion-verification-resolver.js";
import { DEFAULT_CLINICAL_QUORUM_POLICY, type ClinicalQuorumPolicy } from "./clinical-quorum-policy.js";

export interface PocketAssertionStatusCounts {
  total: number;
  draft: number;
  inReview: number;
  reviewed: number;
  verified: number;
  published: number;
  superseded: number;
  retired: number;
}

export interface PocketClinicalVerificationCounts {
  /** Number of assertions in reviewed/verified/published evaluated by the Resolver */
  evaluatedAssertionsCount: number;
  quorumMetCount: number;
  quorumNotMetCount: number;
  activeConflictCount: number;
  activeSafetyOverrideCount: number;
  verificationBlockedCount: number;
}

export interface PocketOperationalCounts {
  activeReviewerCredentialsCount: number;
  activeSafetyOverridesCount: number;
}

export interface PocketAdminSummary {
  assertions: PocketAssertionStatusCounts;
  clinical: PocketClinicalVerificationCounts;
  operations: PocketOperationalCounts;
  generatedAt: string;
}

export interface PocketAdminAssertionsQuery {
  status?: string;
  aggregateType?: ClinicalAggregateType;
  q?: string;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface PocketAdminAssertionRow {
  id: string;
  assertionRootId: string;
  versionNumber: number;
  assertionKey: string;
  statementText: string;
  assertionType: string;
  aggregateType: ClinicalAggregateType;
  aggregateId: string;
  aggregateTitleFa: string | null;
  aggregateTitleEn: string | null;
  aggregateSlug: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PocketAssertionClinicalSummary {
  isClinicallyVerified: boolean;
  quorumSatisfied: boolean;
  requiredApprovals: number;
  validApprovalCount: number;
  validRejectionCount: number;
  activeDisagreement: boolean;
  hasActiveConflict: boolean;
  hasActiveSafetyOverride: boolean;
  verificationBlockReasons: VerificationBlockReason[];
}

export interface PocketAdminAssertionListItem {
  id: string;
  assertionRootId: string;
  versionNumber: number;
  assertionKey: string;
  statementText: string;
  assertionType: string;
  aggregateType: ClinicalAggregateType;
  aggregateId: string;
  aggregateTitleFa: string | null;
  aggregateTitleEn: string | null;
  aggregateSlug: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  clinicalSummary: PocketAssertionClinicalSummary;
}

export interface PocketAdminAssertionsResult {
  items: PocketAdminAssertionListItem[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface PocketAdminAssertionDetailRecord extends PocketAdminAssertionRow {
  previousVersionId: string | null;
  jurisdiction: string;
  targetPopulation: string;
  clinicalSetting: string;
  releaseId: string | null;
  validUntilDate: string | null;
  supersededAt: Date | null;
}

export interface PocketAdminAssertionCitation {
  id: string;
  sourceId: string;
  sourceCode: string;
  sourceTitle: string;
  publisher: string;
  sourceType: string;
  editionOrVersion: string;
  publicationDate: string | null;
  doi: string | null;
  canonicalUrl: string | null;
  sourceAuditStatus: string;
  locationReference: string;
  sourceSnapshotUrl: string | null;
  accessedAt: string;
  evidenceGrade: string | null;
  citationStatus: string;
}

export interface PocketAdminAssertionVersionItem {
  id: string;
  versionNumber: number;
  previousVersionId: string | null;
  status: string;
  isActivePublished: boolean;
  supersededAt: string | null;
  createdAt: string;
}

export interface PocketAdminAssertionConflictItem {
  id: string;
  conflictSubject: string;
  assertionAId: string;
  assertionBId: string;
  discrepancyDescription: string;
  status: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
}

export interface PocketAdminAssertionAuditItem {
  id: string;
  assertionId: string;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  clinicalNotes: string | null;
  createdAt: string;
}

export interface PocketAdminAssertionDetail {
  assertion: {
    id: string;
    assertionRootId: string;
    versionNumber: number;
    previousVersionId: string | null;
    assertionKey: string;
    statementText: string;
    assertionType: string;
    aggregateType: ClinicalAggregateType;
    aggregateId: string;
    aggregateTitleFa: string | null;
    aggregateTitleEn: string | null;
    aggregateSlug: string | null;
    jurisdiction: string;
    targetPopulation: string;
    clinicalSetting: string;
    status: string;
    releaseId: string | null;
    validUntilDate: string | null;
    supersededAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  clinicalSummary: PocketAssertionClinicalSummary;
  citations: PocketAdminAssertionCitation[];
  versions: PocketAdminAssertionVersionItem[];
  conflicts: PocketAdminAssertionConflictItem[];
  history: PocketAdminAssertionAuditItem[];
}

export interface PocketReviewerAssertionDetail extends PocketAdminAssertionDetail {
  myLatestVote: {
    id: string;
    verificationAction: string;
    verifiedAt: string;
  } | null;
}

export interface PocketAdminStore {
  getAssertionStatusCounts(): Promise<PocketAssertionStatusCounts>;
  getClinicalAssertionContextsForSummary(): Promise<AssertionResolutionContext[]>;
  resolveVerificationSummaries(
    contexts: readonly AssertionResolutionContext[],
    quorumPolicy?: ClinicalQuorumPolicy,
  ): Promise<Map<string, AssertionVerificationSummary>>;
  getOperationalCounts(): Promise<PocketOperationalCounts>;
  listAssertions(query: PocketAdminAssertionsQuery): Promise<{
    rows: PocketAdminAssertionRow[];
    totalCount: number;
  }>;
  getAssertionDetail(id: string): Promise<{
    assertion: PocketAdminAssertionDetailRecord;
    citations: PocketAdminAssertionCitation[];
    versions: PocketAdminAssertionVersionItem[];
    conflicts: PocketAdminAssertionConflictItem[];
    history: PocketAdminAssertionAuditItem[];
  } | null>;
}

export function buildClinicalVerificationCountsFromSummaries(
  summaries: Map<string, AssertionVerificationSummary>,
): PocketClinicalVerificationCounts {
  let quorumMetCount = 0;
  let quorumNotMetCount = 0;
  let activeConflictCount = 0;
  let activeSafetyOverrideCount = 0;
  let verificationBlockedCount = 0;

  for (const summary of summaries.values()) {
    if (summary.quorumSatisfied) {
      quorumMetCount += 1;
    } else {
      quorumNotMetCount += 1;
    }

    if (summary.hasActiveConflict) {
      activeConflictCount += 1;
    }

    if (summary.hasActiveSafetyOverride) {
      activeSafetyOverrideCount += 1;
    }

    if (!summary.isClinicallyVerified) {
      verificationBlockedCount += 1;
    }
  }

  return {
    evaluatedAssertionsCount: summaries.size,
    quorumMetCount,
    quorumNotMetCount,
    activeConflictCount,
    activeSafetyOverrideCount,
    verificationBlockedCount,
  };
}

export interface InMemoryPocketAdminStoreSeed {
  assertions?: Array<{
    id: string;
    assertionRootId?: string;
    versionNumber?: number;
    previousVersionId?: string | null;
    assertionKey?: string;
    statementText?: string;
    status: string;
    aggregateType: string;
    aggregateId: string;
    aggregateTitleFa?: string | null;
    aggregateTitleEn?: string | null;
    aggregateSlug?: string | null;
    assertionType: string;
    jurisdiction?: string;
    targetPopulation?: string;
    clinicalSetting?: string;
    releaseId?: string | null;
    validUntilDate?: string | null;
    supersededAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  verifications?: RawAssertionVerificationRow[];
  credentials?: RawReviewerCredentialRow[];
  conflicts?: Array<
    RawClinicalConflictRow & {
      conflictSubject?: string;
      discrepancyDescription?: string;
      createdAt?: Date;
    }
  >;
  safetyOverrides?: RawSafetyOverrideRow[];
  citationsByAssertionId?: Record<string, PocketAdminAssertionCitation[]>;
  historyByAssertionId?: Record<string, PocketAdminAssertionAuditItem[]>;
}

export class InMemoryPocketAdminStore implements PocketAdminStore {
  private readonly assertions: NonNullable<InMemoryPocketAdminStoreSeed["assertions"]>;
  private readonly verifications: RawAssertionVerificationRow[];
  private readonly credentials: RawReviewerCredentialRow[];
  private readonly conflicts: NonNullable<InMemoryPocketAdminStoreSeed["conflicts"]>;
  private readonly safetyOverrides: RawSafetyOverrideRow[];
  private readonly citationsByAssertionId: Record<string, PocketAdminAssertionCitation[]>;
  private readonly historyByAssertionId: Record<string, PocketAdminAssertionAuditItem[]>;

  constructor(seed?: InMemoryPocketAdminStoreSeed) {
    this.assertions = seed?.assertions ?? [];
    this.verifications = seed?.verifications ?? [];
    this.credentials = seed?.credentials ?? [];
    this.conflicts = seed?.conflicts ?? [];
    this.safetyOverrides = seed?.safetyOverrides ?? [];
    this.citationsByAssertionId = seed?.citationsByAssertionId ?? {};
    this.historyByAssertionId = seed?.historyByAssertionId ?? {};
  }

  async getAssertionStatusCounts(): Promise<PocketAssertionStatusCounts> {
    const counts: PocketAssertionStatusCounts = {
      total: this.assertions.length,
      draft: 0,
      inReview: 0,
      reviewed: 0,
      verified: 0,
      published: 0,
      superseded: 0,
      retired: 0,
    };

    for (const row of this.assertions) {
      switch (row.status) {
        case "draft":
          counts.draft += 1;
          break;
        case "in_review":
          counts.inReview += 1;
          break;
        case "reviewed":
          counts.reviewed += 1;
          break;
        case "verified":
          counts.verified += 1;
          break;
        case "published":
          counts.published += 1;
          break;
        case "superseded":
          counts.superseded += 1;
          break;
        case "retired":
          counts.retired += 1;
          break;
      }
    }

    return counts;
  }

  async getClinicalAssertionContextsForSummary(): Promise<AssertionResolutionContext[]> {
    return this.assertions
      .filter((a) => a.status === "reviewed" || a.status === "verified" || a.status === "published")
      .map((a) => ({
        assertionId: a.id,
        aggregateType: a.aggregateType,
        aggregateId: a.aggregateId,
        assertionType: a.assertionType,
      }));
  }

  async resolveVerificationSummaries(
    contexts: readonly AssertionResolutionContext[],
    quorumPolicy?: ClinicalQuorumPolicy,
  ): Promise<Map<string, AssertionVerificationSummary>> {
    return evaluateBatchAssertionVerificationSummaries({
      contexts,
      verifications: this.verifications,
      credentials: this.credentials,
      conflicts: this.conflicts,
      safetyOverrides: this.safetyOverrides,
      quorumPolicy: quorumPolicy ?? DEFAULT_CLINICAL_QUORUM_POLICY,
    });
  }

  async getOperationalCounts(): Promise<PocketOperationalCounts> {
    const now = Date.now();
    const activeReviewerCredentialsCount = this.credentials.filter(
      (c) =>
        c.isActive &&
        c.suspendedAt === null &&
        c.licenseExpiresAt.getTime() > now,
    ).length;

    const activeSafetyOverridesCount = this.safetyOverrides.filter(
      (o) => o.isActive && o.actionState !== "cleared",
    ).length;

    return {
      activeReviewerCredentialsCount,
      activeSafetyOverridesCount,
    };
  }

  async listAssertions(query: PocketAdminAssertionsQuery): Promise<{
    rows: PocketAdminAssertionRow[];
    totalCount: number;
  }> {
    const search = query.q?.trim().toLowerCase() ?? "";
    const filtered = this.assertions.filter((a) => {
      if (query.status && a.status !== query.status) return false;
      if (query.aggregateType && a.aggregateType !== query.aggregateType) return false;
      if (search) {
        const key = (a.assertionKey ?? "").toLowerCase();
        const text = (a.statementText ?? "").toLowerCase();
        const type = (a.assertionType ?? "").toLowerCase();
        const titleFa = (a.aggregateTitleFa ?? "").toLowerCase();
        const titleEn = (a.aggregateTitleEn ?? "").toLowerCase();
        if (
          !key.includes(search) &&
          !text.includes(search) &&
          !type.includes(search) &&
          !titleFa.includes(search) &&
          !titleEn.includes(search)
        ) {
          return false;
        }
      }
      return true;
    });

    const sortBy = query.sortBy === "createdAt" ? "createdAt" : "updatedAt";
    const sortOrder = query.sortOrder === "asc" ? 1 : -1;

    const sorted = [...filtered].sort((a, b) => {
      const aTime = (sortBy === "createdAt" ? a.createdAt : a.updatedAt)?.getTime() ?? 0;
      const bTime = (sortBy === "createdAt" ? b.createdAt : b.updatedAt)?.getTime() ?? 0;
      return (aTime - bTime) * sortOrder;
    });

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const sliced = sorted.slice(offset, offset + limit);

    return {
      totalCount: sorted.length,
      rows: sliced.map((a) => ({
        id: a.id,
        assertionRootId: a.assertionRootId ?? a.id,
        versionNumber: a.versionNumber ?? 1,
        assertionKey: a.assertionKey ?? a.id,
        statementText: a.statementText ?? "",
        assertionType: a.assertionType,
        aggregateType: a.aggregateType as ClinicalAggregateType,
        aggregateId: a.aggregateId,
        aggregateTitleFa: a.aggregateTitleFa ?? null,
        aggregateTitleEn: a.aggregateTitleEn ?? null,
        aggregateSlug: a.aggregateSlug ?? null,
        status: a.status,
        createdAt: a.createdAt ?? new Date(0),
        updatedAt: a.updatedAt ?? new Date(0),
      })),
    };
  }

  async getAssertionDetail(id: string): Promise<{
    assertion: PocketAdminAssertionDetailRecord;
    citations: PocketAdminAssertionCitation[];
    versions: PocketAdminAssertionVersionItem[];
    conflicts: PocketAdminAssertionConflictItem[];
    history: PocketAdminAssertionAuditItem[];
  } | null> {
    const found = this.assertions.find((a) => a.id === id);
    if (!found) {
      return null;
    }

    const rootId = found.assertionRootId ?? found.id;
    const versions = this.assertions
      .filter((a) => (a.assertionRootId ?? a.id) === rootId)
      .sort((a, b) => (b.versionNumber ?? 1) - (a.versionNumber ?? 1))
      .map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber ?? 1,
        previousVersionId: v.previousVersionId ?? null,
        status: v.status,
        isActivePublished: v.status === "published",
        supersededAt: v.supersededAt ? v.supersededAt.toISOString() : null,
        createdAt: (v.createdAt ?? new Date(0)).toISOString(),
      }));

    const conflicts = this.conflicts
      .filter((c) => c.assertionAId === id || c.assertionBId === id)
      .map((c) => ({
        id: c.id,
        conflictSubject: c.conflictSubject ?? "تعارض بالینی",
        assertionAId: c.assertionAId,
        assertionBId: c.assertionBId,
        discrepancyDescription: c.discrepancyDescription ?? "",
        status: c.status,
        createdAt: (c.createdAt ?? new Date(0)).toISOString(),
      }));

    return {
      assertion: {
        id: found.id,
        assertionRootId: rootId,
        versionNumber: found.versionNumber ?? 1,
        previousVersionId: found.previousVersionId ?? null,
        assertionKey: found.assertionKey ?? found.id,
        statementText: found.statementText ?? "",
        assertionType: found.assertionType,
        aggregateType: found.aggregateType as ClinicalAggregateType,
        aggregateId: found.aggregateId,
        aggregateTitleFa: found.aggregateTitleFa ?? null,
        aggregateTitleEn: found.aggregateTitleEn ?? null,
        aggregateSlug: found.aggregateSlug ?? null,
        jurisdiction: found.jurisdiction ?? "global",
        targetPopulation: found.targetPopulation ?? "general_adult",
        clinicalSetting: found.clinicalSetting ?? "all",
        status: found.status,
        releaseId: found.releaseId ?? null,
        validUntilDate: found.validUntilDate ?? null,
        supersededAt: found.supersededAt ?? null,
        createdAt: found.createdAt ?? new Date(0),
        updatedAt: found.updatedAt ?? new Date(0),
      },
      citations: this.citationsByAssertionId[id] ?? [],
      versions,
      conflicts,
      history: this.historyByAssertionId[id] ?? [],
    };
  }
}
