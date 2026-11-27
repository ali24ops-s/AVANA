/**
 * AVANA Pocket — Unified Verification Resolver (Phase 6.3.2 — Phase A Foundation).
 *
 * Single authoritative evaluation contract for clinical verification across
 * Consumption, Search, and Publishing Gate.
 *
 * Architecture Separation:
 * 1. Pure TypeScript Evaluation Layer:
 *    - `evaluateCredentialValidity`
 *    - Single and batch assertion summary evaluators
 *    Zero I/O, zero SQL, 100% deterministic and shared across PostgreSQL and In-Memory stores.
 *
 * 2. PostgreSQL Raw Data Extraction Layer:
 *    - `fetchRawVerificationInputs`
 *    - DB-backed batch resolver entry point
 *    Extracts minimal raw facts from PostgreSQL (`pocket_assertion_verifications`,
 *    `pocket_clinical_reviewer_credentials`, `pocket_clinical_conflicts`,
 *    `pocket_safety_overrides`) and delegates all clinical decision logic to the
 *    Pure TypeScript evaluator.
 */

import { sql } from "drizzle-orm";
import type { DbRunner } from "@avana/database/client";
import {
  pocketAssertionVerifications,
  pocketClinicalConflicts,
  pocketClinicalReviewerCredentials,
  pocketSafetyOverrides,
} from "@avana/database/schema";
import type { ClinicalAggregateType } from "./assertion-consumption-store.js";
import {
  ClinicalQuorumPolicy,
  DEFAULT_CLINICAL_QUORUM_POLICY,
} from "./clinical-quorum-policy.js";

// ============================================================================
// Domain Contracts & Output Types
// ============================================================================

export type VerificationActionType = "clinical_verified" | "clinical_rejected";

export type CredentialInvalidationReason =
  | "none"
  | "missing_credential"
  | "inactive"
  | "revoked"
  | "suspended_or_revoked"
  | "expired";

export type VerificationBlockReason =
  | "no_verifications"
  | "quorum_not_met"
  | "active_disagreement"
  | "unresolved_clinical_conflict"
  | "active_safety_override"
  | "all_approvals_invalidated";

export interface ReviewerCredentialValidityStatus {
  isValid: boolean;
  reason: CredentialInvalidationReason;
}

export interface ReviewerDecisionEvaluation {
  reviewerUserId: string;
  latestVerificationId: string;
  latestAction: VerificationActionType;
  verifiedAt: Date;
  parentVerificationId: string | null;
  credentialValid: boolean;
  invalidationReason: CredentialInvalidationReason;
}

export interface AssertionVerificationSummary {
  assertionId: string;
  latestDecisionPerReviewer: ReviewerDecisionEvaluation[];
  validApprovalCount: number;
  validRejectionCount: number;
  invalidatedReviewerDecisions: number;
  activeDisagreement: boolean;
  hasActiveConflict: boolean;
  hasActiveSafetyOverride: boolean;
  lastValidApprovalTimestamp: Date | null;
  reviewerCredentialValidity: Record<string, ReviewerCredentialValidityStatus>;
  requiredApprovals: number;
  quorumSatisfied: boolean;
  isClinicallyVerified: boolean;
  verificationBlockReasons: VerificationBlockReason[];
  latestValidApprovalVerificationId: string | null;
  latestValidApprovalReviewerUserId: string | null;
}

// ============================================================================
// Raw Input Types (Shared by PostgreSQL Extractor and In-Memory Stores)
// ============================================================================

export interface RawAssertionVerificationRow {
  id: string;
  assertionId: string;
  reviewerUserId: string;
  verificationAction: string;
  parentVerificationId?: string | null;
  verifiedAt: Date;
  verificationSeq?: number | null;
}

export interface RawReviewerCredentialRow {
  id: string;
  userId: string;
  isActive: boolean;
  suspendedAt: Date | null;
  revokedAt?: Date | null;
  licenseExpiresAt: Date;
  grantedAt?: Date;
  createdAt?: Date;
}

export interface RawClinicalConflictRow {
  id: string;
  assertionAId: string;
  assertionBId: string;
  status: string;
  resolvedAt?: Date | null;
  resolutionSeq?: number | null;
}

export interface RawSafetyOverrideRow {
  id: string;
  targetEntityType: string;
  targetEntityId: string;
  actionState: string;
  isActive: boolean;
}

export interface AssertionResolutionContext {
  assertionId: string;
  aggregateType?: ClinicalAggregateType | string | null;
  aggregateId?: string | null;
  assertionType?: string | null;
}

export interface EvaluateVerificationInputs {
  context: AssertionResolutionContext;
  verifications: readonly RawAssertionVerificationRow[];
  credentials: readonly RawReviewerCredentialRow[];
  conflicts: readonly RawClinicalConflictRow[];
  safetyOverrides: readonly RawSafetyOverrideRow[];
  quorumPolicy?: ClinicalQuorumPolicy;
  now?: Date;
}

export interface EvaluateBatchVerificationInputs {
  contexts: readonly AssertionResolutionContext[];
  verifications: readonly RawAssertionVerificationRow[];
  credentials: readonly RawReviewerCredentialRow[];
  conflicts: readonly RawClinicalConflictRow[];
  safetyOverrides: readonly RawSafetyOverrideRow[];
  quorumPolicy?: ClinicalQuorumPolicy;
  now?: Date;
}

// ============================================================================
// Pure TypeScript Evaluation Layer
// ============================================================================

function isKnownVerificationAction(action: string): action is VerificationActionType {
  return action === "clinical_verified" || action === "clinical_rejected";
}

function compareVerificationRecencyDesc(
  a: RawAssertionVerificationRow,
  b: RawAssertionVerificationRow,
): number {
  const timeDiff = b.verifiedAt.getTime() - a.verifiedAt.getTime();
  if (timeDiff !== 0) return timeDiff;
  return b.id.localeCompare(a.id);
}

function compareCredentialAuthorityDesc(
  a: RawReviewerCredentialRow,
  b: RawReviewerCredentialRow,
): number {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }
  const grantedA = a.grantedAt ? a.grantedAt.getTime() : 0;
  const grantedB = b.grantedAt ? b.grantedAt.getTime() : 0;
  if (grantedB !== grantedA) return grantedB - grantedA;

  const createdA = a.createdAt ? a.createdAt.getTime() : 0;
  const createdB = b.createdAt ? b.createdAt.getTime() : 0;
  if (createdB !== createdA) return createdB - createdA;

  return b.id.localeCompare(a.id);
}

/**
 * Evaluates a single reviewer's credential validity at `evaluationTime`.
 *
 * Handles multiple historical credential rows for the same reviewer by selecting
 * the authoritative record (`isActive DESC, grantedAt DESC, createdAt DESC, id DESC`).
 *
 * Note on DB limitation: `DrizzleReviewerStore.suspend` and `.revoke` both set
 * `isActive = false` and `suspendedAt = now`, so `suspendedAt !== null` is
 * classified as `"suspended_or_revoked"`.
 */
export function evaluateCredentialValidity(
  credentialsForReviewer: readonly RawReviewerCredentialRow[],
  evaluationTime: Date = new Date(),
): ReviewerCredentialValidityStatus {
  if (credentialsForReviewer.length === 0) {
    return { isValid: false, reason: "missing_credential" };
  }

  const authoritative =
    credentialsForReviewer.length === 1
      ? credentialsForReviewer[0]
      : [...credentialsForReviewer].sort(compareCredentialAuthorityDesc)[0];

  if (authoritative.revokedAt !== undefined && authoritative.revokedAt !== null) {
    return { isValid: false, reason: "revoked" };
  }

  if (authoritative.suspendedAt !== null) {
    return { isValid: false, reason: "suspended_or_revoked" };
  }

  if (!authoritative.isActive) {
    return { isValid: false, reason: "inactive" };
  }

  if (authoritative.licenseExpiresAt.getTime() <= evaluationTime.getTime()) {
    return { isValid: false, reason: "expired" };
  }

  return { isValid: true, reason: "none" };
}

interface ResolvedConflictCutoffInfo {
  resolvedAt: Date;
  resolutionSeq: number | null;
}

function isVotePreResolution(
  vote: RawAssertionVerificationRow,
  cutoff: ResolvedConflictCutoffInfo | undefined,
): boolean {
  if (!cutoff) {
    return false;
  }
  if (
    vote.verificationSeq !== null &&
    vote.verificationSeq !== undefined &&
    cutoff.resolutionSeq !== null
  ) {
    return vote.verificationSeq <= cutoff.resolutionSeq;
  }
  return vote.verifiedAt.getTime() <= cutoff.resolvedAt.getTime();
}

function evaluateSingleWithIndexedData(
  context: AssertionResolutionContext,
  verificationsForAssertion: readonly RawAssertionVerificationRow[],
  credentialsByUser: ReadonlyMap<string, readonly RawReviewerCredentialRow[]>,
  activeConflictAssertionIds: ReadonlySet<string>,
  resolvedCutoffByAssertionId: ReadonlyMap<string, ResolvedConflictCutoffInfo>,
  safetyOverrides: readonly RawSafetyOverrideRow[],
  quorumPolicy: ClinicalQuorumPolicy,
  evaluationTime: Date,
): AssertionVerificationSummary {
  const { assertionId, aggregateType, aggregateId, assertionType } = context;
  const resolvedCutoff = resolvedCutoffByAssertionId.get(assertionId);

  // 1. Latest decision per reviewer ordered by (verifiedAt DESC, id DESC)
  const sortedVerifications = [...verificationsForAssertion]
    .filter((v) => isKnownVerificationAction(v.verificationAction))
    .sort(compareVerificationRecencyDesc);

  const latestByReviewer = new Map<string, RawAssertionVerificationRow>();
  for (const v of sortedVerifications) {
    if (!latestByReviewer.has(v.reviewerUserId)) {
      latestByReviewer.set(v.reviewerUserId, v);
    }
  }

  // 2. Evaluate each reviewer's latest decision & credential independently
  const latestDecisionPerReviewer: ReviewerDecisionEvaluation[] = [];
  const reviewerCredentialValidity: Record<string, ReviewerCredentialValidityStatus> = {};

  let validApprovalCount = 0;
  let validRejectionCount = 0;
  let invalidatedReviewerDecisions = 0;
  let invalidatedApprovalCount = 0;
  let latestValidApproval: RawAssertionVerificationRow | null = null;

  for (const [reviewerUserId, latestRow] of latestByReviewer.entries()) {
    const reviewerCreds = credentialsByUser.get(reviewerUserId) ?? [];
    const credStatus = evaluateCredentialValidity(reviewerCreds, evaluationTime);
    reviewerCredentialValidity[reviewerUserId] = credStatus;

    const latestAction = latestRow.verificationAction as VerificationActionType;

    latestDecisionPerReviewer.push({
      reviewerUserId,
      latestVerificationId: latestRow.id,
      latestAction,
      verifiedAt: latestRow.verifiedAt,
      parentVerificationId: latestRow.parentVerificationId ?? null,
      credentialValid: credStatus.isValid,
      invalidationReason: credStatus.reason,
    });

    if (!credStatus.isValid) {
      invalidatedReviewerDecisions += 1;
      if (latestAction === "clinical_verified") {
        invalidatedApprovalCount += 1;
      }
      continue;
    }

    if (isVotePreResolution(latestRow, resolvedCutoff)) {
      invalidatedReviewerDecisions += 1;
      if (latestAction === "clinical_verified") {
        invalidatedApprovalCount += 1;
      }
      continue;
    }

    if (latestAction === "clinical_verified") {
      validApprovalCount += 1;
      if (
        !latestValidApproval ||
        compareVerificationRecencyDesc(latestRow, latestValidApproval) < 0
      ) {
        latestValidApproval = latestRow;
      }
    } else if (latestAction === "clinical_rejected") {
      validRejectionCount += 1;
    }
  }

  // Deterministic ordering of latestDecisionPerReviewer
  latestDecisionPerReviewer.sort((a, b) =>
    a.reviewerUserId.localeCompare(b.reviewerUserId),
  );

  // 3. Disagreement, conflicts, and safety overrides
  const activeDisagreement = validApprovalCount > 0 && validRejectionCount > 0;
  const hasActiveConflict = activeConflictAssertionIds.has(assertionId);

  const hasActiveSafetyOverride = safetyOverrides.some((o) => {
    if (!o.isActive || o.actionState === "cleared") {
      return false;
    }
    if (o.targetEntityType === "assertion" && o.targetEntityId === assertionId) {
      return true;
    }
    if (
      aggregateType &&
      aggregateId &&
      o.targetEntityType === aggregateType &&
      o.targetEntityId === aggregateId
    ) {
      return true;
    }
    return false;
  });

  // 4. Quorum resolution via centralized policy
  const quorum = quorumPolicy.resolve({ aggregateType, assertionType });
  const requiredApprovals = quorum.requiredApprovals;
  const quorumSatisfied = validApprovalCount >= requiredApprovals;

  // 5. Block reasons (Fail-Closed)
  const verificationBlockReasons: VerificationBlockReason[] = [];

  if (latestDecisionPerReviewer.length === 0) {
    verificationBlockReasons.push("no_verifications");
  } else if (validApprovalCount === 0 && invalidatedApprovalCount > 0 && validRejectionCount === 0) {
    verificationBlockReasons.push("all_approvals_invalidated");
  }

  if (!quorumSatisfied && latestDecisionPerReviewer.length > 0) {
    verificationBlockReasons.push("quorum_not_met");
  }

  if (activeDisagreement || validRejectionCount > 0) {
    // Any valid rejection blocks final verification; if paired with valid approval it's active_disagreement
    if (activeDisagreement) {
      verificationBlockReasons.push("active_disagreement");
    } else if (validRejectionCount > 0 && !verificationBlockReasons.includes("active_disagreement")) {
      verificationBlockReasons.push("active_disagreement");
    }
  }

  if (hasActiveConflict) {
    verificationBlockReasons.push("unresolved_clinical_conflict");
  }

  if (hasActiveSafetyOverride) {
    verificationBlockReasons.push("active_safety_override");
  }

  // 6. Final verification eligibility:
  // Quorum met + zero valid rejections + no active conflict + no active safety override
  const isClinicallyVerified =
    quorumSatisfied &&
    validRejectionCount === 0 &&
    !activeDisagreement &&
    !hasActiveConflict &&
    !hasActiveSafetyOverride;

  return {
    assertionId,
    latestDecisionPerReviewer,
    validApprovalCount,
    validRejectionCount,
    invalidatedReviewerDecisions,
    activeDisagreement,
    hasActiveConflict,
    hasActiveSafetyOverride,
    lastValidApprovalTimestamp: latestValidApproval ? latestValidApproval.verifiedAt : null,
    reviewerCredentialValidity,
    requiredApprovals,
    quorumSatisfied,
    isClinicallyVerified,
    verificationBlockReasons,
    latestValidApprovalVerificationId: latestValidApproval ? latestValidApproval.id : null,
    latestValidApprovalReviewerUserId: latestValidApproval
      ? latestValidApproval.reviewerUserId
      : null,
  };
}

/**
 * Pure TypeScript resolver for a single assertion.
 */
export function evaluateAssertionVerificationSummary(
  input: EvaluateVerificationInputs,
): AssertionVerificationSummary {
  const map = evaluateBatchAssertionVerificationSummaries({
    contexts: [input.context],
    verifications: input.verifications,
    credentials: input.credentials,
    conflicts: input.conflicts,
    safetyOverrides: input.safetyOverrides,
    quorumPolicy: input.quorumPolicy,
    now: input.now,
  });

  return map.get(input.context.assertionId)!;
}

/**
 * Pure TypeScript batch resolver for multiple assertions.
 * Groups raw records once in O(N) before evaluating each assertion context.
 */
export function evaluateBatchAssertionVerificationSummaries(
  input: EvaluateBatchVerificationInputs,
): Map<string, AssertionVerificationSummary> {
  const evaluationTime = input.now ?? new Date();
  const quorumPolicy = input.quorumPolicy ?? DEFAULT_CLINICAL_QUORUM_POLICY;
  const result = new Map<string, AssertionVerificationSummary>();

  if (input.contexts.length === 0) {
    return result;
  }

  const verificationsByAssertion = new Map<string, RawAssertionVerificationRow[]>();
  for (const v of input.verifications) {
    const list = verificationsByAssertion.get(v.assertionId);
    if (list) {
      list.push(v);
    } else {
      verificationsByAssertion.set(v.assertionId, [v]);
    }
  }

  const credentialsByUser = new Map<string, RawReviewerCredentialRow[]>();
  for (const c of input.credentials) {
    const list = credentialsByUser.get(c.userId);
    if (list) {
      list.push(c);
    } else {
      credentialsByUser.set(c.userId, [c]);
    }
  }

  const activeConflictAssertionIds = new Set<string>();
  const resolvedCutoffByAssertionId = new Map<string, ResolvedConflictCutoffInfo>();

  const updateResolvedCutoff = (assertionId: string, candidate: ResolvedConflictCutoffInfo) => {
    const existing = resolvedCutoffByAssertionId.get(assertionId);
    if (!existing) {
      resolvedCutoffByAssertionId.set(assertionId, candidate);
      return;
    }
    if (candidate.resolutionSeq !== null && existing.resolutionSeq !== null) {
      if (candidate.resolutionSeq > existing.resolutionSeq) {
        resolvedCutoffByAssertionId.set(assertionId, candidate);
      }
      return;
    }
    if (candidate.resolvedAt.getTime() > existing.resolvedAt.getTime()) {
      resolvedCutoffByAssertionId.set(assertionId, candidate);
    }
  };

  for (const conflict of input.conflicts) {
    if (conflict.status === "active_discrepancy") {
      activeConflictAssertionIds.add(conflict.assertionAId);
      activeConflictAssertionIds.add(conflict.assertionBId);
    } else if (conflict.status === "resolved" && conflict.resolvedAt) {
      const candidate: ResolvedConflictCutoffInfo = {
        resolvedAt: conflict.resolvedAt,
        resolutionSeq: conflict.resolutionSeq ?? null,
      };
      updateResolvedCutoff(conflict.assertionAId, candidate);
      updateResolvedCutoff(conflict.assertionBId, candidate);
    }
  }

  for (const context of input.contexts) {
    const verifs = verificationsByAssertion.get(context.assertionId) ?? [];
    const summary = evaluateSingleWithIndexedData(
      context,
      verifs,
      credentialsByUser,
      activeConflictAssertionIds,
      resolvedCutoffByAssertionId,
      input.safetyOverrides,
      quorumPolicy,
      evaluationTime,
    );
    result.set(context.assertionId, summary);
  }

  return result;
}

// ============================================================================
// PostgreSQL Raw Data Extraction Layer
// ============================================================================

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

function parseRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && "rows" in raw && Array.isArray((raw as { rows: unknown }).rows)) {
    return (raw as { rows: T[] }).rows;
  }
  return [];
}

interface SqlLatestVerificationRow {
  id: string;
  assertion_id: string;
  reviewer_user_id: string;
  verification_action: string;
  parent_verification_id: string | null;
  verified_at: string | Date;
  verification_seq: number | string | null;
}

interface SqlAuthoritativeCredentialRow {
  id: string;
  user_id: string;
  is_active: boolean;
  suspended_at: string | Date | null;
  revoked_at: string | Date | null;
  license_expires_at: string | Date;
  granted_at: string | Date;
  created_at: string | Date;
}

interface SqlConflictRow {
  id: string;
  assertion_a_id: string;
  assertion_b_id: string;
  status: string;
  resolved_at: string | Date | null;
  resolution_seq: number | string | null;
}

interface SqlSafetyOverrideRow {
  id: string;
  target_entity_type: string;
  target_entity_id: string;
  action_state: string;
  is_active: boolean;
}

export interface ExtractedRawVerificationInputs {
  verifications: RawAssertionVerificationRow[];
  credentials: RawReviewerCredentialRow[];
  conflicts: RawClinicalConflictRow[];
  safetyOverrides: RawSafetyOverrideRow[];
}

/**
 * Extracts raw verification, authoritative credential, conflict, and safety override
 * records from PostgreSQL without performing clinical decision logic in SQL.
 *
 * Guarantees:
 * - Returns empty arrays with 0 queries when `contexts` is empty.
 * - Uses `DISTINCT ON (assertion_id, reviewer_user_id) ORDER BY verified_at DESC, id DESC`
 *   to extract each reviewer's latest vote per assertion.
 * - Uses `DISTINCT ON (user_id) ORDER BY is_active DESC, granted_at DESC, created_at DESC, id DESC`
 *   so historical revoked/suspended credentials are still surfaced for exact invalidation
 *   diagnosis (`missing_credential` vs `inactive` vs `suspended_or_revoked` vs `expired`)
 *   without causing row multiplication.
 */
export async function fetchRawVerificationInputs(
  contexts: readonly AssertionResolutionContext[],
  runner: DbRunner,
): Promise<ExtractedRawVerificationInputs> {
  if (
    contexts.length === 0 ||
    !runner ||
    typeof (runner as unknown as { execute?: unknown }).execute !== "function"
  ) {
    return {
      verifications: [],
      credentials: [],
      conflicts: [],
      safetyOverrides: [],
    };
  }

  const assertionIds = Array.from(new Set(contexts.map((c) => c.assertionId)));
  const idsSql = sql.join(
    assertionIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  // 1. Latest verification per (assertion_id, reviewer_user_id)
  const verificationsRaw = await runner.execute(sql`
    SELECT DISTINCT ON (pav.assertion_id, pav.reviewer_user_id)
      pav.id,
      pav.assertion_id,
      pav.reviewer_user_id,
      pav.verification_action,
      pav.parent_verification_id,
      pav.verified_at,
      pav.verification_seq
    FROM ${pocketAssertionVerifications} pav
    WHERE pav.assertion_id IN (${idsSql})
    ORDER BY pav.assertion_id, pav.reviewer_user_id, pav.verified_at DESC, pav.id DESC;
  `);

  const verificationRows = parseRows<SqlLatestVerificationRow>(verificationsRaw);
  const verifications: RawAssertionVerificationRow[] = verificationRows.map((r) => ({
    id: r.id,
    assertionId: r.assertion_id,
    reviewerUserId: r.reviewer_user_id,
    verificationAction: r.verification_action,
    parentVerificationId: r.parent_verification_id ?? null,
    verifiedAt: toDate(r.verified_at),
    verificationSeq:
      r.verification_seq !== null && r.verification_seq !== undefined
        ? Number(r.verification_seq)
        : null,
  }));

  // 2. Authoritative credential per involved reviewer_user_id
  const reviewerIds = Array.from(new Set(verifications.map((v) => v.reviewerUserId)));
  let credentials: RawReviewerCredentialRow[] = [];

  if (reviewerIds.length > 0) {
    const reviewerIdsSql = sql.join(
      reviewerIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const credsRaw = await runner.execute(sql`
      SELECT DISTINCT ON (pcrc.user_id)
        pcrc.id,
        pcrc.user_id,
        pcrc.is_active,
        pcrc.suspended_at,
        pcrc.revoked_at,
        pcrc.license_expires_at,
        pcrc.granted_at,
        pcrc.created_at
      FROM ${pocketClinicalReviewerCredentials} pcrc
      WHERE pcrc.user_id IN (${reviewerIdsSql})
      ORDER BY pcrc.user_id, pcrc.is_active DESC, pcrc.granted_at DESC, pcrc.created_at DESC, pcrc.id DESC;
    `);

    credentials = parseRows<SqlAuthoritativeCredentialRow>(credsRaw).map((r) => ({
      id: r.id,
      userId: r.user_id,
      isActive: Boolean(r.is_active),
      suspendedAt: r.suspended_at ? toDate(r.suspended_at) : null,
      revokedAt: r.revoked_at ? toDate(r.revoked_at) : null,
      licenseExpiresAt: toDate(r.license_expires_at),
      grantedAt: toDate(r.granted_at),
      createdAt: toDate(r.created_at),
    }));
  }

  // 3. Active & resolved clinical conflicts
  const conflictsRaw = await runner.execute(sql`
    SELECT
      pcc.id,
      pcc.assertion_a_id,
      pcc.assertion_b_id,
      pcc.status,
      pcc.resolved_at,
      pcc.resolution_seq
    FROM ${pocketClinicalConflicts} pcc
    WHERE pcc.status IN ('active_discrepancy', 'resolved')
      AND (pcc.assertion_a_id IN (${idsSql}) OR pcc.assertion_b_id IN (${idsSql}));
  `);

  const conflicts: RawClinicalConflictRow[] = parseRows<SqlConflictRow>(conflictsRaw).map((r) => ({
    id: r.id,
    assertionAId: r.assertion_a_id,
    assertionBId: r.assertion_b_id,
    status: r.status,
    resolvedAt: r.resolved_at ? toDate(r.resolved_at) : null,
    resolutionSeq:
      r.resolution_seq !== null && r.resolution_seq !== undefined
        ? Number(r.resolution_seq)
        : null,
  }));

  // 4. Active safety overrides (for assertions and their parent aggregates)
  const aggregateFilters: ReturnType<typeof sql>[] = [
    sql`(pso.target_entity_type = 'assertion' AND pso.target_entity_id IN (${idsSql}))`,
  ];

  const aggregateTargets = new Map<string, { type: string; id: string }>();
  for (const c of contexts) {
    if (c.aggregateType && c.aggregateId) {
      aggregateTargets.set(`${c.aggregateType}:${c.aggregateId}`, {
        type: String(c.aggregateType),
        id: c.aggregateId,
      });
    }
  }
  for (const target of aggregateTargets.values()) {
    aggregateFilters.push(
      sql`(pso.target_entity_type = ${target.type} AND pso.target_entity_id = ${target.id}::uuid)`,
    );
  }

  const overridesRaw = await runner.execute(sql`
    SELECT
      pso.id,
      pso.target_entity_type,
      pso.target_entity_id,
      pso.action_state,
      pso.is_active
    FROM ${pocketSafetyOverrides} pso
    WHERE pso.is_active = true
      AND (${sql.join(aggregateFilters, sql` OR `)});
  `);

  const safetyOverrides: RawSafetyOverrideRow[] = parseRows<SqlSafetyOverrideRow>(overridesRaw).map(
    (r) => ({
      id: r.id,
      targetEntityType: r.target_entity_type,
      targetEntityId: r.target_entity_id,
      actionState: r.action_state,
      isActive: Boolean(r.is_active),
    }),
  );

  return {
    verifications,
    credentials,
    conflicts,
    safetyOverrides,
  };
}

/**
 * Convenience DB-backed resolver combining PostgreSQL raw extraction with
 * Pure TypeScript verification summary evaluation.
 */
export async function resolveAssertionVerificationSummariesFromDb(
  contexts: readonly AssertionResolutionContext[],
  runner: DbRunner,
  options?: {
    quorumPolicy?: ClinicalQuorumPolicy;
    now?: Date;
  },
): Promise<Map<string, AssertionVerificationSummary>> {
  if (contexts.length === 0) {
    return new Map();
  }

  const raw = await fetchRawVerificationInputs(contexts, runner);

  return evaluateBatchAssertionVerificationSummaries({
    contexts,
    verifications: raw.verifications,
    credentials: raw.credentials,
    conflicts: raw.conflicts,
    safetyOverrides: raw.safetyOverrides,
    quorumPolicy: options?.quorumPolicy,
    now: options?.now,
  });
}

/**
 * Authoritative DB check for whether an aggregate has an active Safety Override.
 * Mirrors the exact predicate used by the Unified Verification Resolver and Search Store
 * (`is_active = true AND action_state <> 'cleared'`).
 */
export async function hasActiveAggregateSafetyOverride(
  aggregateType: ClinicalAggregateType | string,
  aggregateId: string,
  runner: DbRunner,
): Promise<boolean> {
  if (!runner || typeof (runner as unknown as { execute?: unknown }).execute !== "function") {
    return false;
  }

  const raw = await runner.execute(sql`
    SELECT 1
    FROM ${pocketSafetyOverrides} pso
    WHERE pso.is_active = true
      AND pso.action_state <> 'cleared'
      AND pso.target_entity_type = ${String(aggregateType)}
      AND pso.target_entity_id = ${aggregateId}::uuid
    LIMIT 1;
  `);

  return parseRows<Record<string, unknown>>(raw).length > 0;
}
