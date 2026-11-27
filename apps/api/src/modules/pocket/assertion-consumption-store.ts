/**
 * AVANA Pocket — Assertion Consumption Store Interface & In-Memory Implementation.
 *
 * Implements Phase 2C-4A persistence contracts for reading published clinical assertions
 * and their authoritative entity version:
 * - Strictly filters `status = 'published' AND superseded_at IS NULL` at the query level.
 * - Resolves the current authoritative version from `pocket_entity_version_registry`.
 * - Projects only clinical consumer-safe fields, strictly omitting internal review/verification/audit data.
 */

import type { ScientificAssertionRecord } from "./assertion-review-store.js";
import type { EntityVersionRecord } from "./assertion-publishing-store.js";
import {
  evaluateAssertionVerificationSummary,
  type RawAssertionVerificationRow,
  type RawClinicalConflictRow,
  type RawReviewerCredentialRow,
  type RawSafetyOverrideRow,
} from "./assertion-verification-resolver.js";

export type ClinicalAggregateType = "drug" | "disease" | "treatment" | "emergency";

export const VALID_CLINICAL_AGGREGATE_TYPES: readonly ClinicalAggregateType[] = [
  "drug",
  "disease",
  "treatment",
  "emergency",
] as const;

/**
 * Public, consumer-safe representation of a published scientific assertion.
 * Strictly excludes reviewer identities, clinical review critiques, and internal audit logs.
 */
export interface PublishedAssertionItem {
  id: string;
  assertionRootId: string;
  versionNumber: number;
  previousVersionId: string | null;
  aggregateType: ClinicalAggregateType;
  aggregateId: string;
  assertionType: string;
  assertionKey: string;
  statementText: string;
  jurisdiction: string;
  targetPopulation: string;
  clinicalSetting: string;
  validUntilDate: string | null;
  publishedAt: Date;
  isClinicallyVerified: boolean;
  verifiedAt: Date | null;
}

export interface AggregateAssertionsQueryResult {
  aggregateType: ClinicalAggregateType;
  aggregateId: string;
  currentVersion: number;
  assertions: PublishedAssertionItem[];
}

export interface ClinicalAggregateMetadata {
  id: string;
  type: ClinicalAggregateType;
  slug: string;
  nameEn: string;
  nameFa: string;
  classification: string;
  summary: string;
  publishedAt: string | null;
  versionNumber: number;
}

export interface ClinicalAggregateIdentity {
  canonicalId: string;
  slug: string;
}

export interface AssertionConsumptionStore {
  /**
   * Resolve an aggregate identifier (UUID or canonical slug) to its canonical UUID and slug.
   * Guarantees status = 'published' at the database query level.
   * Returns null if not found or not published.
   */
  resolveAggregateIdentity(
    aggregateType: ClinicalAggregateType,
    identifier: string,
  ): Promise<ClinicalAggregateIdentity | null>;

  /**
   * Fetch all active, published assertions for a specific clinical aggregate.
   * Query-level guarantee: status = 'published' AND superseded_at IS NULL.
   * Returns current entity version and ordered assertions list.
   * Returns null if the clinical aggregate does not exist.
   */
  findPublishedByAggregate(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<AggregateAssertionsQueryResult | null>;

  /**
   * Fetch a single published assertion by ID.
   * Query-level guarantee: status = 'published' AND superseded_at IS NULL.
   * Returns null if not found or not published.
   */
  findPublishedAssertionById(
    id: string,
  ): Promise<PublishedAssertionItem | null>;

  /**
   * Fetch aggregate metadata (name, classification, summary, version).
   * Returns null if aggregate does not exist.
   */
  getAggregateMetadata(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<ClinicalAggregateMetadata | null>;

  /**
   * Fetch only the current monotonic version number for a clinical aggregate.
   * Returns null if the clinical aggregate does not exist.
   */
  getCurrentVersion(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<number | null>;

  /**
   * Check whether the clinical aggregate entity actually exists.
   */
  aggregateExists(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<boolean>;
}

export interface InMemoryVerificationRecord {
  id: string;
  assertionId: string;
  reviewerUserId: string;
  verificationAction: "clinical_verified" | "clinical_rejected";
  clinicalReviewNotes?: string;
  parentVerificationId?: string | null;
  verifiedAt: Date;
}

export interface InMemoryReviewerCredential {
  id?: string;
  userId: string;
  isActive: boolean;
  suspendedAt: Date | null;
  revokedAt?: Date | null;
  licenseExpiresAt: Date;
  grantedAt?: Date;
  createdAt?: Date;
}

export interface InMemoryClinicalConflict {
  id: string;
  assertionAId: string;
  assertionBId: string;
  status: "active_discrepancy" | "resolved" | "dismissed";
  resolvedAt?: Date | null;
  resolutionSeq?: number | null;
}

export interface InMemorySafetyOverride {
  id: string;
  targetEntityType: string;
  targetEntityId: string;
  actionState: string;
  isActive: boolean;
}

/**
 * In-memory implementation for unit testing and local development.
 */
export class InMemoryAssertionConsumptionStore implements AssertionConsumptionStore {
  private readonly assertions: Map<string, ScientificAssertionRecord>;
  private readonly versionRegistry: Map<string, EntityVersionRecord>;
  private readonly registeredAggregates: Set<string>;
  private readonly draftAggregates: Set<string>;
  private readonly metadataRegistry: Map<string, ClinicalAggregateMetadata>;
  private readonly verifications: InMemoryVerificationRecord[] = [];
  private readonly reviewerCredentials: InMemoryReviewerCredential[] = [];
  private readonly conflicts: InMemoryClinicalConflict[] = [];
  private readonly safetyOverrides: InMemorySafetyOverride[] = [];

  constructor(
    sharedAssertions?: Map<string, ScientificAssertionRecord>,
    sharedVersionRegistry?: Map<string, EntityVersionRecord>,
    initialAggregates?: Iterable<string>,
    initialMetadata?: Iterable<[string, ClinicalAggregateMetadata]>,
  ) {
    this.assertions = sharedAssertions ?? new Map<string, ScientificAssertionRecord>();
    this.versionRegistry = sharedVersionRegistry ?? new Map<string, EntityVersionRecord>();
    this.registeredAggregates = new Set<string>(initialAggregates ?? []);
    this.draftAggregates = new Set<string>();
    this.metadataRegistry = new Map<string, ClinicalAggregateMetadata>(initialMetadata ?? []);
  }

  registerVerification(verification: InMemoryVerificationRecord): void {
    this.verifications.push(verification);
  }

  registerReviewerCredential(credential: InMemoryReviewerCredential): void {
    this.reviewerCredentials.push(credential);
  }

  registerConflict(conflict: InMemoryClinicalConflict): void {
    this.conflicts.push(conflict);
  }

  registerSafetyOverride(override: InMemorySafetyOverride): void {
    this.safetyOverrides.push(override);
  }

  clearSafetyOverride(overrideId: string): void {
    const target = this.safetyOverrides.find((o) => o.id === overrideId);
    if (target) {
      target.actionState = "cleared";
      target.isActive = false;
    }
  }

  resolveVerificationStatus(
    assertionId: string,
    now: Date = new Date(),
    contextOverrides?: {
      aggregateType?: ClinicalAggregateType;
      aggregateId?: string;
      assertionType?: string;
    },
  ): { isClinicallyVerified: boolean; verifiedAt: Date | null } {
    const assertionRecord = this.assertions.get(assertionId);
    const resolvedAggregateType =
      contextOverrides?.aggregateType ??
      (assertionRecord?.drugId
        ? "drug"
        : assertionRecord?.diseaseId
          ? "disease"
          : assertionRecord?.treatmentId
            ? "treatment"
            : assertionRecord?.emergencyId
              ? "emergency"
              : undefined);
    const resolvedAggregateId =
      contextOverrides?.aggregateId ??
      (assertionRecord?.drugId ||
        assertionRecord?.diseaseId ||
        assertionRecord?.treatmentId ||
        assertionRecord?.emergencyId ||
        undefined);
    const resolvedAssertionType =
      contextOverrides?.assertionType ?? assertionRecord?.assertionType;

    const rawVerifications: RawAssertionVerificationRow[] = this.verifications.map((v) => ({
      id: v.id,
      assertionId: v.assertionId,
      reviewerUserId: v.reviewerUserId,
      verificationAction: v.verificationAction,
      parentVerificationId: v.parentVerificationId ?? null,
      verifiedAt: v.verifiedAt,
    }));

    const rawCredentials: RawReviewerCredentialRow[] = this.reviewerCredentials.map((c, idx) => ({
      id: c.id ?? `inmem-cred-${c.userId}-${idx}`,
      userId: c.userId,
      isActive: c.isActive,
      suspendedAt: c.suspendedAt,
      revokedAt: c.revokedAt ?? null,
      licenseExpiresAt: c.licenseExpiresAt,
      grantedAt: c.grantedAt,
      createdAt: c.createdAt,
    }));

    const rawConflicts: RawClinicalConflictRow[] = this.conflicts.map((c) => ({
      id: c.id,
      assertionAId: c.assertionAId,
      assertionBId: c.assertionBId,
      status: c.status,
      resolvedAt: c.resolvedAt ?? null,
      resolutionSeq: c.resolutionSeq ?? null,
    }));

    const rawSafetyOverrides: RawSafetyOverrideRow[] = this.safetyOverrides.map((o) => ({
      id: o.id,
      targetEntityType: o.targetEntityType,
      targetEntityId: o.targetEntityId,
      actionState: o.actionState,
      isActive: o.isActive,
    }));

    const summary = evaluateAssertionVerificationSummary({
      context: {
        assertionId,
        aggregateType: resolvedAggregateType,
        aggregateId: resolvedAggregateId,
        assertionType: resolvedAssertionType,
      },
      verifications: rawVerifications,
      credentials: rawCredentials,
      conflicts: rawConflicts,
      safetyOverrides: rawSafetyOverrides,
      now,
    });

    return {
      isClinicallyVerified: summary.isClinicallyVerified,
      verifiedAt: summary.isClinicallyVerified ? summary.lastValidApprovalTimestamp : null,
    };
  }

  registerMetadata(metadata: ClinicalAggregateMetadata): void {
    this.metadataRegistry.set(`${metadata.type}:${metadata.id}`, metadata);
    this.registerAggregate(metadata.type, metadata.id);
  }

  registerDraftAggregate(aggregateType: ClinicalAggregateType, aggregateId: string, metadata?: ClinicalAggregateMetadata): void {
    const key = `${aggregateType}:${aggregateId}`;
    this.draftAggregates.add(key);
    this.registeredAggregates.delete(key);
    if (metadata) {
      this.metadataRegistry.set(key, metadata);
    }
  }

  registerAggregate(aggregateType: ClinicalAggregateType, aggregateId: string): void {
    const key = `${aggregateType}:${aggregateId}`;
    this.draftAggregates.delete(key);
    this.registeredAggregates.add(key);
  }

  async resolveAggregateIdentity(
    aggregateType: ClinicalAggregateType,
    identifier: string,
  ): Promise<ClinicalAggregateIdentity | null> {
    // 1. Direct match by UUID / ID key
    const directKey = `${aggregateType}:${identifier}`;
    if (!this.draftAggregates.has(directKey)) {
      if (this.registeredAggregates.has(directKey) || this.versionRegistry.has(directKey)) {
        const meta = this.metadataRegistry.get(directKey);
        return {
          canonicalId: identifier,
          slug: meta ? meta.slug : identifier,
        };
      }
      for (const record of this.assertions.values()) {
        if (
          (aggregateType === "drug" && record.drugId === identifier) ||
          (aggregateType === "disease" && record.diseaseId === identifier) ||
          (aggregateType === "treatment" && record.treatmentId === identifier) ||
          (aggregateType === "emergency" && record.emergencyId === identifier)
        ) {
          const meta = this.metadataRegistry.get(directKey);
          return {
            canonicalId: identifier,
            slug: meta ? meta.slug : identifier,
          };
        }
      }
    }

    // 2. Slug match in metadata registry
    for (const [key, meta] of this.metadataRegistry.entries()) {
      if (meta.type === aggregateType && meta.slug === identifier) {
        if (this.draftAggregates.has(key)) {
          return null;
        }
        return {
          canonicalId: meta.id,
          slug: meta.slug,
        };
      }
    }

    return null;
  }

  async aggregateExists(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<boolean> {
    const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId);
    return identity !== null;
  }

  async findPublishedByAggregate(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<AggregateAssertionsQueryResult | null> {
    const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId);
    if (!identity) {
      return null;
    }
    const { canonicalId } = identity;

    const currentVersion = await this.getCurrentVersion(aggregateType, canonicalId);

    const matches: PublishedAssertionItem[] = [];

    for (const record of this.assertions.values()) {
      // 1. Mandatory status and supersede guard
      if (record.status !== "published" || record.supersededAt !== null) {
        continue;
      }

      // 2. Aggregate pillar match against canonical UUID
      let matchesAggregate = false;
      if (aggregateType === "drug" && record.drugId === canonicalId) matchesAggregate = true;
      if (aggregateType === "disease" && record.diseaseId === canonicalId) matchesAggregate = true;
      if (aggregateType === "treatment" && record.treatmentId === canonicalId) matchesAggregate = true;
      if (aggregateType === "emergency" && record.emergencyId === canonicalId) matchesAggregate = true;

      if (!matchesAggregate) {
        continue;
      }

      // 3. Safe consumer projection (Phase D.4: withhold clinically invalid assertions)
      const verificationStatus = this.resolveVerificationStatus(record.id, undefined, {
        aggregateType,
        aggregateId: canonicalId,
        assertionType: record.assertionType,
      });

      if (!verificationStatus.isClinicallyVerified) {
        continue;
      }

      matches.push({
        id: record.id,
        assertionRootId: record.assertionRootId,
        versionNumber: record.versionNumber,
        previousVersionId: record.previousVersionId,
        aggregateType,
        aggregateId: canonicalId,
        assertionType: record.assertionType,
        assertionKey: record.assertionKey,
        statementText: record.statementText,
        jurisdiction: record.jurisdiction,
        targetPopulation: record.targetPopulation,
        clinicalSetting: record.clinicalSetting,
        validUntilDate: record.validUntilDate,
        publishedAt: record.updatedAt,
        isClinicallyVerified: verificationStatus.isClinicallyVerified,
        verifiedAt: verificationStatus.verifiedAt,
      });
    }

    // 4. Deterministic stable ordering: assertionKey ASC, versionNumber DESC, id ASC
    matches.sort((a, b) => {
      const keyCmp = a.assertionKey.localeCompare(b.assertionKey);
      if (keyCmp !== 0) return keyCmp;
      if (b.versionNumber !== a.versionNumber) return b.versionNumber - a.versionNumber;
      return a.id.localeCompare(b.id);
    });

    return {
      aggregateType,
      aggregateId: canonicalId,
      currentVersion: currentVersion ?? 0,
      assertions: matches,
    };
  }

  async getCurrentVersion(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<number | null> {
    const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId);
    if (!identity) {
      return null;
    }

    const key = `${aggregateType}:${identity.canonicalId}`;
    const entry = this.versionRegistry.get(key);
    return entry ? entry.currentVersion : 0;
  }

  async findPublishedAssertionById(id: string): Promise<PublishedAssertionItem | null> {
    const record = this.assertions.get(id);
    if (!record || record.status !== "published" || record.supersededAt !== null) {
      return null;
    }

    let aggregateType: ClinicalAggregateType = "drug";
    let aggregateId = "";
    if (record.drugId) {
      aggregateType = "drug";
      aggregateId = record.drugId;
    } else if (record.diseaseId) {
      aggregateType = "disease";
      aggregateId = record.diseaseId;
    } else if (record.treatmentId) {
      aggregateType = "treatment";
      aggregateId = record.treatmentId;
    } else if (record.emergencyId) {
      aggregateType = "emergency";
      aggregateId = record.emergencyId;
    }

    // Direct access protection: parent aggregate must be published!
    const parentPublished = await this.aggregateExists(aggregateType, aggregateId);
    if (!parentPublished) {
      return null;
    }

    const verificationStatus = this.resolveVerificationStatus(record.id, undefined, {
      aggregateType,
      aggregateId,
      assertionType: record.assertionType,
    });

    if (!verificationStatus.isClinicallyVerified) {
      return null;
    }

    return {
      id: record.id,
      assertionRootId: record.assertionRootId,
      versionNumber: record.versionNumber,
      previousVersionId: record.previousVersionId,
      aggregateType,
      aggregateId,
      assertionType: record.assertionType,
      assertionKey: record.assertionKey,
      statementText: record.statementText,
      jurisdiction: record.jurisdiction,
      targetPopulation: record.targetPopulation,
      clinicalSetting: record.clinicalSetting,
      validUntilDate: record.validUntilDate,
      publishedAt: record.updatedAt,
      isClinicallyVerified: verificationStatus.isClinicallyVerified,
      verifiedAt: verificationStatus.verifiedAt,
    };
  }

  async getAggregateMetadata(
    aggregateType: ClinicalAggregateType,
    aggregateId: string,
  ): Promise<ClinicalAggregateMetadata | null> {
    const identity = await this.resolveAggregateIdentity(aggregateType, aggregateId);
    if (!identity) {
      return null;
    }
    const key = `${aggregateType}:${identity.canonicalId}`;
    if (this.draftAggregates.has(key)) {
      return null;
    }
    const hasActiveAggregateOverride = this.safetyOverrides.some(
      (o) =>
        o.isActive &&
        o.actionState !== "cleared" &&
        o.targetEntityType === aggregateType &&
        o.targetEntityId === identity.canonicalId,
    );
    if (hasActiveAggregateOverride) {
      return null;
    }
    return this.metadataRegistry.get(key) ?? null;
  }
}
