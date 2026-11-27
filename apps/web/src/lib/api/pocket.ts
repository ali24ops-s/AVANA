/**
 * AVANA Pocket — Typed API Client & Contract Definitions (Phase UI-2).
 *
 * Implements strict, typed contracts for all 17 existing backend Pocket endpoints:
 * 1. Clinical Reviewer Governance (/v1/pocket/reviewers/*)
 * 2. Assertion Review Lifecycle (/v1/pocket/assertions/:id/*)
 * 3. Clinical Verification & Conflicts (/v1/pocket/assertions/:id/verify, reject-verification, conflicts, verifications)
 * 4. Atomic Publishing (/v1/pocket/assertions/:id/publish)
 * 5. Clinical Consumption & Version Probe (/v1/pocket/aggregates/:type/:id/*)
 *
 * All contracts strictly derived from backend route schemas and store definitions. No hypothetical APIs.
 */

import type { ApiClient } from "./client.js";

// ============================================================================
// Core Domain Types & Enums
// ============================================================================

export type ClinicalAggregateType = "drug" | "disease" | "treatment" | "emergency";

export const CLINICAL_AGGREGATE_TYPES: readonly ClinicalAggregateType[] = [
  "drug",
  "disease",
  "treatment",
  "emergency",
] as const;

export type ScientificAssertionStatus =
  | "draft"
  | "in_review"
  | "reviewed"
  | "verified"
  | "published"
  | "superseded"
  | "retired";

export type ReviewDecision = "approve" | "reject" | "request_changes";

// ============================================================================
// Reviewer Governance Contracts
// ============================================================================

export type CredentialLifecycleStatus = "active" | "suspended" | "revoked";
export type CredentialValidityStatus = "valid" | "expired";
export type ReviewerCredentialEventType = "granted" | "suspended" | "reactivated" | "revoked";

export interface ReviewerCredentialEventRecord {
  id: string;
  credentialId: string;
  actorUserId: string;
  eventType: ReviewerCredentialEventType;
  reason: string | null;
  createdAt: string;
}

export interface ClinicalReviewerCredential {
  id: string;
  userId: string;
  medicalLicenseNumber: string;
  specialty: string;
  licensingAuthority: string;
  isActive: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  grantedBy: string;
  grantedAt: string;
  licenseExpiresAt: string;
  createdAt: string;
  updatedAt: string;
  lifecycleStatus?: CredentialLifecycleStatus;
  validityStatus?: CredentialValidityStatus;
  isLegacyStatusAmbiguous?: boolean;
}

export interface ReviewerMeData {
  isReviewer: boolean;
  credential: ClinicalReviewerCredential | null;
}

export interface GrantReviewerCredentialRequest {
  userId: string;
  medicalLicenseNumber: string;
  specialty: string;
  licensingAuthority: string;
  licenseExpiresAt: string; // ISO 8601 date string
  reason?: string;
}

export interface SuspendReviewerCredentialRequest {
  reason: string;
}

export interface ReactivateReviewerCredentialRequest {
  reason?: string;
}

export interface RevokeReviewerCredentialRequest {
  reason: string;
}

export interface ListReviewerCredentialsQuery {
  userId?: string;
  isActive?: boolean | string;
  limit?: number | string;
  offset?: number | string;
}

// ============================================================================
// Scientific Assertion & Review Contracts
// ============================================================================

export interface ScientificAssertionRecord {
  id: string;
  assertionRootId: string;
  versionNumber: number;
  previousVersionId: string | null;
  drugId: string | null;
  diseaseId: string | null;
  treatmentId: string | null;
  emergencyId: string | null;
  assertionType: string;
  assertionKey: string;
  statementText: string;
  jurisdiction: string;
  targetPopulation: string;
  clinicalSetting: string;
  status: ScientificAssertionStatus;
  releaseId: string | null;
  validUntilDate: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssertionAuditLogRecord {
  id: string;
  assertionId: string;
  actorUserId: string | null;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  clinicalNotes: string | null;
  createdAt: string;
}

export interface SubmitReviewRequest {
  notes?: string;
}

export interface RecordReviewDecisionRequest {
  decision: ReviewDecision;
  notes?: string;
}

export interface WithdrawReviewRequest {
  reason?: string;
}

export interface AssertionReviewActionResult {
  assertion: ScientificAssertionRecord;
  auditLog: AssertionAuditLogRecord;
}

export interface AssertionHistoryResult {
  assertion: ScientificAssertionRecord;
  history: AssertionAuditLogRecord[];
}

// ============================================================================
// Clinical Verification & Conflicts Contracts
// ============================================================================

export interface AssertionVerificationRecord {
  id: string;
  assertionId: string;
  reviewerUserId?: string;
  verificationAction: string;
  clinicalReviewNotes?: string;
  parentVerificationId?: string | null;
  verifiedAt: string;
}

export type ResolveConflictOutcome = "resolved" | "dismissed";

export interface ClinicalConflictRecord {
  id: string;
  conflictSubject: string;
  assertionAId: string;
  assertionBId: string;
  discrepancyDescription?: string;
  status: string;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
}

export interface ResolveConflictRequest {
  outcome: ResolveConflictOutcome;
  resolutionNotes: string;
}

export interface VerifyAssertionRequest {
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
}

export interface RejectVerificationRequest {
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
}

export interface RecordConflictRequest {
  assertionAId: string;
  assertionBId: string;
  conflictSubject: string;
  discrepancyDescription: string;
}

export interface AssertionVerificationActionResult {
  verification: AssertionVerificationRecord;
  assertion: ScientificAssertionRecord;
  auditLog: AssertionAuditLogRecord;
}

export interface AssertionVerificationsResult {
  verifications: AssertionVerificationRecord[];
  conflicts: ClinicalConflictRecord[];
}

// ============================================================================
// Atomic Publishing Contracts
// ============================================================================

export interface EntityVersionRecord {
  aggregateType: string;
  aggregateId: string;
  currentVersion: number;
  updatedAt: string;
}

export interface PocketOutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseExpiresAt?: string | null;
  leaseToken?: string | null;
  lastError?: string | null;
  globalEpoch: number;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface PublishAssertionRequest {
  notes?: string;
}

export interface PublishAssertionResult {
  publishedAssertion: ScientificAssertionRecord;
  supersededAssertion: ScientificAssertionRecord | null;
  entityVersion: EntityVersionRecord;
  outboxEvent: PocketOutboxRecord;
  auditLog: AssertionAuditLogRecord;
}

// ============================================================================
// Clinical Consumption & Version Probe Contracts
// ============================================================================

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
  publishedAt: string;
  isClinicallyVerified: boolean;
  verifiedAt: string | null;
}

export interface AggregateAssertionsQueryResult {
  aggregateType: ClinicalAggregateType;
  aggregateId: string;
  currentVersion: number;
  assertions: PublishedAssertionItem[];
}

export interface VersionProbeQueryResult {
  aggregateType: ClinicalAggregateType;
  aggregateId: string;
  currentVersion: number;
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

export interface ConditionalResult<T> {
  notModified: boolean;
  data: T | null;
  etag?: string;
  entityVersion?: number;
}

// ============================================================================
// Clinical Discovery & Search Contracts (UI-4.1 / UI-4.2)
// ============================================================================

export type ClinicalSearchAggregateType = "all" | "drug" | "disease" | "treatment" | "emergency";
export type ClinicalPillarType = ClinicalAggregateType;

export const VALID_SEARCH_AGGREGATE_TYPES: readonly ClinicalSearchAggregateType[] = [
  "all",
  "drug",
  "disease",
  "treatment",
  "emergency",
] as const;

export const VALID_PILLAR_TYPES: readonly ClinicalPillarType[] = CLINICAL_AGGREGATE_TYPES;

export interface ClinicalVerificationStatus {
  isClinicallyVerified: boolean;
  verifiedAssertionsCount: number;
  totalAssertionsCount: number;
  lastVerifiedAt: string | null;
}

export interface PocketSearchResultItem {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  summary: string;
  publishedAt: string | null;
  versionNumber: number;
  relevanceScore: number;
  matchField: "name_fa" | "name_en" | "brand_name" | "alias" | "classification" | "summary";
  matchedTerm: string;
  verification: ClinicalVerificationStatus;
}

export interface PocketSearchResponse {
  items: PocketSearchResultItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  query: string;
}

export interface PocketSearchQueryParams {
  q?: string;
  type?: ClinicalSearchAggregateType;
  limit?: number | string;
  offset?: number | string;
}

export interface PocketSearchSuggestion {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  matchSource: "name_fa" | "name_en" | "brand_name" | "alias" | "classification";
  matchedText: string;
}

export interface PocketSuggestionsResponse {
  query: string;
  suggestions: PocketSearchSuggestion[];
}

export interface PocketSuggestionsQueryParams {
  q?: string;
  type?: ClinicalSearchAggregateType;
  limit?: number | string;
}

export type DiscoverySortOption = "recent" | "name_asc" | "name_desc";
export const VALID_DISCOVERY_SORT_OPTIONS: readonly DiscoverySortOption[] = [
  "recent",
  "name_asc",
  "name_desc",
] as const;

export interface PocketDiscoveryItem {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  summary: string;
  category: string;
  publishedAt: string | null;
  versionNumber: number;
  verification: ClinicalVerificationStatus;
}

export interface PocketDiscoveryResponse {
  items: PocketDiscoveryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  type: ClinicalSearchAggregateType;
  category?: string;
}

export interface PocketDiscoveryQueryParams {
  type?: ClinicalSearchAggregateType;
  category?: string;
  sort?: DiscoverySortOption;
  limit?: number | string;
  offset?: number | string;
}

export interface PocketRelatedEntityItem {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  relationshipType: string;
  clinicalNotes?: string | null;
  verification: ClinicalVerificationStatus;
}

export interface PocketRelatedGroup {
  relationshipCategory: "indicated_diseases" | "treatments" | "interactions" | "medications" | "associated_conditions";
  relationshipLabelFa: string;
  entities: PocketRelatedEntityItem[];
}

export interface PocketRelatedEntitiesResponse {
  aggregateType: ClinicalPillarType;
  aggregateId: string;
  groups: PocketRelatedGroup[];
}

// ============================================================================
// Safety Override Management Contracts (Phase D.3)
// ============================================================================

export type SafetyOverrideTargetType =
  | "assertion"
  | "drug"
  | "disease"
  | "treatment"
  | "emergency";

export type SafetyOverrideActionState = "active" | "cleared";

export type SafetyOverrideEventType = "activated" | "cleared";

export interface SafetyOverrideRecord {
  id: string;
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  actionState: SafetyOverrideActionState;
  isActive: boolean;
  currentEventId: string | null;
  updatedAt: string;
}

export interface SafetyOverrideEventRecord {
  id: string;
  overrideId: string;
  eventType: SafetyOverrideEventType;
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  actorUserId: string;
  reason: string;
  previousState: SafetyOverrideActionState | null;
  newState: SafetyOverrideActionState;
  eventTimestamp: string;
}

export interface ActivateSafetyOverrideRequest {
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  reason: string;
}

export interface ClearSafetyOverrideRequest {
  reason: string;
}

export interface ListSafetyOverridesQuery {
  targetEntityType?: SafetyOverrideTargetType;
  targetEntityId?: string;
  isActive?: boolean | string;
  limit?: number | string;
  offset?: number | string;
}

export interface SafetyOverrideActionResult {
  override: SafetyOverrideRecord;
  event: SafetyOverrideEventRecord;
}

export interface SafetyOverrideWithHistoryResult {
  override: SafetyOverrideRecord;
  events: SafetyOverrideEventRecord[];
}

// ============================================================================
// Admin Dashboard Summary Contracts (Phase 2.1)
// ============================================================================

export interface PocketAdminSummary {
  assertions: {
    total: number;
    draft: number;
    inReview: number;
    reviewed: number;
    verified: number;
    published: number;
    superseded: number;
    retired: number;
  };
  clinical: {
    evaluatedAssertionsCount: number;
    quorumMetCount: number;
    quorumNotMetCount: number;
    activeConflictCount: number;
    activeSafetyOverrideCount: number;
    verificationBlockedCount: number;
  };
  operations: {
    activeReviewerCredentialsCount: number;
    activeSafetyOverridesCount: number;
  };
  generatedAt: string;
}

// ============================================================================
// Admin Assertions List Contracts (Phase 2.2)
// ============================================================================

export interface PocketAdminAssertionsQuery {
  status?: ScientificAssertionStatus;
  aggregateType?: ClinicalAggregateType;
  q?: string;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
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
  verificationBlockReasons: string[];
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
  status: ScientificAssertionStatus;
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

// ============================================================================
// Admin Assertion Detail Contracts (Phase 2.3)
// ============================================================================

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
  status: ScientificAssertionStatus;
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
    status: ScientificAssertionStatus;
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

// Standard backend success envelope
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// ============================================================================
// Pocket API Client Factory
// ============================================================================

export function createPocketApi(client: ApiClient) {
  return {
    // -------------------------------------------------------------------------
    // 1. Clinical Reviewer Governance
    // -------------------------------------------------------------------------

    async getMe(signal?: AbortSignal): Promise<ReviewerMeData> {
      const res = await client.get<ApiResponse<ReviewerMeData>>("/v1/pocket/reviewers/me", {
        signal,
      });
      return res.data;
    },

    async listCredentials(
      query?: ListReviewerCredentialsQuery,
      signal?: AbortSignal,
    ): Promise<ClinicalReviewerCredential[]> {
      const res = await client.get<ApiResponse<ClinicalReviewerCredential[]>>(
        "/v1/pocket/reviewers/credentials",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getCredential(id: string, signal?: AbortSignal): Promise<ClinicalReviewerCredential> {
      const res = await client.get<ApiResponse<ClinicalReviewerCredential>>(
        `/v1/pocket/reviewers/credentials/${id}`,
        { signal },
      );
      return res.data;
    },

    async grantCredential(body: GrantReviewerCredentialRequest): Promise<ClinicalReviewerCredential> {
      const res = await client.post<ApiResponse<ClinicalReviewerCredential>>(
        "/v1/pocket/reviewers/credentials",
        body,
      );
      return res.data;
    },

    async suspendCredential(
      id: string,
      body: SuspendReviewerCredentialRequest,
    ): Promise<ClinicalReviewerCredential> {
      const res = await client.post<ApiResponse<ClinicalReviewerCredential>>(
        `/v1/pocket/reviewers/credentials/${id}/suspend`,
        body,
      );
      return res.data;
    },

    async revokeCredential(
      id: string,
      body: RevokeReviewerCredentialRequest,
    ): Promise<ClinicalReviewerCredential> {
      const res = await client.post<ApiResponse<ClinicalReviewerCredential>>(
        `/v1/pocket/reviewers/credentials/${id}/revoke`,
        body,
      );
      return res.data;
    },

    async reactivateCredential(
      id: string,
      body?: ReactivateReviewerCredentialRequest,
    ): Promise<ClinicalReviewerCredential> {
      const res = await client.post<ApiResponse<ClinicalReviewerCredential>>(
        `/v1/pocket/reviewers/credentials/${id}/reactivate`,
        body ?? {},
      );
      return res.data;
    },

    async listCredentialEvents(
      id: string,
      signal?: AbortSignal,
    ): Promise<ReviewerCredentialEventRecord[]> {
      const res = await client.get<ApiResponse<ReviewerCredentialEventRecord[]>>(
        `/v1/pocket/reviewers/credentials/${id}/events`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 2. Assertion Review Lifecycle
    // -------------------------------------------------------------------------

    async submitReview(
      id: string,
      body?: SubmitReviewRequest,
    ): Promise<AssertionReviewActionResult> {
      const res = await client.post<ApiResponse<AssertionReviewActionResult>>(
        `/v1/pocket/assertions/${id}/submit-review`,
        body ?? {},
      );
      return res.data;
    },

    async recordReviewDecision(
      id: string,
      body: RecordReviewDecisionRequest,
    ): Promise<AssertionReviewActionResult> {
      const res = await client.post<ApiResponse<AssertionReviewActionResult>>(
        `/v1/pocket/assertions/${id}/review-decision`,
        body,
      );
      return res.data;
    },

    async withdrawReview(
      id: string,
      body?: WithdrawReviewRequest,
    ): Promise<AssertionReviewActionResult> {
      const res = await client.post<ApiResponse<AssertionReviewActionResult>>(
        `/v1/pocket/assertions/${id}/withdraw-review`,
        body ?? {},
      );
      return res.data;
    },

    async getAssertionHistory(id: string, signal?: AbortSignal): Promise<AssertionHistoryResult> {
      const res = await client.get<ApiResponse<AssertionHistoryResult>>(
        `/v1/pocket/assertions/${id}/history`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 3. Clinical Verification & Conflicts
    // -------------------------------------------------------------------------

    async verifyAssertion(
      id: string,
      body: VerifyAssertionRequest,
    ): Promise<AssertionVerificationActionResult> {
      const res = await client.post<ApiResponse<AssertionVerificationActionResult>>(
        `/v1/pocket/assertions/${id}/verify`,
        body,
      );
      return res.data;
    },

    async rejectVerification(
      id: string,
      body: RejectVerificationRequest,
    ): Promise<AssertionVerificationActionResult> {
      const res = await client.post<ApiResponse<AssertionVerificationActionResult>>(
        `/v1/pocket/assertions/${id}/reject-verification`,
        body,
      );
      return res.data;
    },

    async recordConflict(body: RecordConflictRequest): Promise<ClinicalConflictRecord> {
      const res = await client.post<ApiResponse<ClinicalConflictRecord>>(
        "/v1/pocket/assertions/conflicts",
        body,
      );
      return res.data;
    },

    async resolveConflict(
      conflictId: string,
      body: ResolveConflictRequest,
    ): Promise<ClinicalConflictRecord> {
      const res = await client.post<ApiResponse<ClinicalConflictRecord>>(
        `/v1/pocket/assertions/conflicts/${conflictId}/resolve`,
        body,
      );
      return res.data;
    },

    async getVerifications(id: string, signal?: AbortSignal): Promise<AssertionVerificationsResult> {
      const res = await client.get<ApiResponse<AssertionVerificationsResult>>(
        `/v1/pocket/assertions/${id}/verifications`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 4. Atomic Publishing
    // -------------------------------------------------------------------------

    async publishAssertion(
      id: string,
      body?: PublishAssertionRequest,
    ): Promise<PublishAssertionResult> {
      const res = await client.post<ApiResponse<PublishAssertionResult>>(
        `/v1/pocket/assertions/${id}/publish`,
        body ?? {},
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 5. Clinical Consumption & Version Probe (Conditional ETag / 304 Support)
    // -------------------------------------------------------------------------

    async getPublishedAssertions(
      type: ClinicalAggregateType,
      id: string,
      ifNoneMatch?: string,
      signal?: AbortSignal,
    ): Promise<ConditionalResult<AggregateAssertionsQueryResult>> {
      const headers: Record<string, string> = {};
      if (ifNoneMatch) {
        headers["if-none-match"] = ifNoneMatch;
      }

      const res = await client.getConditional<ApiResponse<AggregateAssertionsQueryResult>>(
        `/v1/pocket/aggregates/${type}/${id}/assertions`,
        { headers, signal },
      );

      if (res.notModified) {
        return {
          notModified: true,
          data: null,
          etag: res.etag,
          entityVersion: res.entityVersion,
        };
      }

      return {
        notModified: false,
        data: res.data ? res.data.data : null,
        etag: res.etag,
        entityVersion: res.entityVersion,
      };
    },

    async getCurrentVersion(
      type: ClinicalAggregateType,
      id: string,
      ifNoneMatch?: string,
      signal?: AbortSignal,
    ): Promise<ConditionalResult<VersionProbeQueryResult>> {
      const headers: Record<string, string> = {};
      if (ifNoneMatch) {
        headers["if-none-match"] = ifNoneMatch;
      }

      const res = await client.getConditional<ApiResponse<VersionProbeQueryResult>>(
        `/v1/pocket/aggregates/${type}/${id}/version`,
        { headers, signal },
      );

      if (res.notModified) {
        return {
          notModified: true,
          data: null,
          etag: res.etag,
          entityVersion: res.entityVersion,
        };
      }

      return {
        notModified: false,
        data: res.data ? res.data.data : null,
        etag: res.etag,
        entityVersion: res.entityVersion,
      };
    },

    async getPublishedAssertion(id: string, signal?: AbortSignal): Promise<PublishedAssertionItem> {
      const res = await client.get<ApiResponse<PublishedAssertionItem>>(
        `/v1/pocket/assertions/${id}`,
        { signal },
      );
      return res.data;
    },

    async getAggregateMetadata(
      type: ClinicalAggregateType,
      id: string,
      signal?: AbortSignal,
    ): Promise<ClinicalAggregateMetadata> {
      const res = await client.get<ApiResponse<ClinicalAggregateMetadata>>(
        `/v1/pocket/aggregates/${type}/${id}/metadata`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 6. Clinical Search & Discovery (Phase UI-4.1 / UI-4.2)
    // -------------------------------------------------------------------------

    async search(
      query?: PocketSearchQueryParams,
      signal?: AbortSignal,
    ): Promise<PocketSearchResponse> {
      const res = await client.get<ApiResponse<PocketSearchResponse>>(
        "/v1/pocket/search",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getSuggestions(
      query?: PocketSuggestionsQueryParams,
      signal?: AbortSignal,
    ): Promise<PocketSuggestionsResponse> {
      const res = await client.get<ApiResponse<PocketSuggestionsResponse>>(
        "/v1/pocket/search/suggestions",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getDiscovery(
      query?: PocketDiscoveryQueryParams,
      signal?: AbortSignal,
    ): Promise<PocketDiscoveryResponse> {
      const res = await client.get<ApiResponse<PocketDiscoveryResponse>>(
        "/v1/pocket/discovery",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getRelatedEntities(
      type: ClinicalPillarType,
      id: string,
      signal?: AbortSignal,
    ): Promise<PocketRelatedEntitiesResponse> {
      const res = await client.get<ApiResponse<PocketRelatedEntitiesResponse>>(
        `/v1/pocket/aggregates/${type}/${id}/related`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 7. Safety Override Management (Phase D.3)
    // -------------------------------------------------------------------------

    async activateSafetyOverride(
      body: ActivateSafetyOverrideRequest,
    ): Promise<SafetyOverrideActionResult> {
      const res = await client.post<ApiResponse<SafetyOverrideActionResult>>(
        "/v1/pocket/safety-overrides",
        body,
      );
      return res.data;
    },

    async clearSafetyOverride(
      id: string,
      body: ClearSafetyOverrideRequest,
    ): Promise<SafetyOverrideActionResult> {
      const res = await client.post<ApiResponse<SafetyOverrideActionResult>>(
        `/v1/pocket/safety-overrides/${id}/clear`,
        body,
      );
      return res.data;
    },

    async listSafetyOverrides(
      query?: ListSafetyOverridesQuery,
      signal?: AbortSignal,
    ): Promise<SafetyOverrideRecord[]> {
      const res = await client.get<ApiResponse<SafetyOverrideRecord[]>>(
        "/v1/pocket/safety-overrides",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getSafetyOverride(
      id: string,
      signal?: AbortSignal,
    ): Promise<SafetyOverrideWithHistoryResult> {
      const res = await client.get<ApiResponse<SafetyOverrideWithHistoryResult>>(
        `/v1/pocket/safety-overrides/${id}`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 8. Admin Dashboard Summary (Phase 2.1)
    // -------------------------------------------------------------------------

    async getAdminSummary(signal?: AbortSignal): Promise<PocketAdminSummary> {
      const res = await client.get<ApiResponse<PocketAdminSummary>>(
        "/v1/pocket/admin/summary",
        { signal },
      );
      return res.data;
    },

    async listAdminAssertions(
      query?: PocketAdminAssertionsQuery,
      signal?: AbortSignal,
    ): Promise<PocketAdminAssertionsResult> {
      const res = await client.get<ApiResponse<PocketAdminAssertionsResult>>(
        "/v1/pocket/admin/assertions",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getAdminAssertionDetail(
      id: string,
      signal?: AbortSignal,
    ): Promise<PocketAdminAssertionDetail> {
      const res = await client.get<ApiResponse<PocketAdminAssertionDetail>>(
        `/v1/pocket/admin/assertions/${id}`,
        { signal },
      );
      return res.data;
    },

    // -------------------------------------------------------------------------
    // 9. Clinical Reviewer Workbench (Phase 2.4)
    // -------------------------------------------------------------------------

    async listReviewerAssertions(
      query?: PocketAdminAssertionsQuery,
      signal?: AbortSignal,
    ): Promise<PocketAdminAssertionsResult> {
      const res = await client.get<ApiResponse<PocketAdminAssertionsResult>>(
        "/v1/pocket/reviewer/assertions",
        { params: query as Record<string, unknown>, signal },
      );
      return res.data;
    },

    async getReviewerAssertionDetail(
      id: string,
      signal?: AbortSignal,
    ): Promise<PocketReviewerAssertionDetail> {
      const res = await client.get<ApiResponse<PocketReviewerAssertionDetail>>(
        `/v1/pocket/reviewer/assertions/${id}`,
        { signal },
      );
      return res.data;
    },
  };
}

export type PocketApi = ReturnType<typeof createPocketApi>;
