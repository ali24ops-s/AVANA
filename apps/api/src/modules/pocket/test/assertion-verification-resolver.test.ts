import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ClinicalQuorumPolicy,
  DEFAULT_CLINICAL_QUORUM_POLICY,
  resolveRequiredApprovals,
} from "../clinical-quorum-policy.js";
import {
  evaluateAssertionVerificationSummary,
  evaluateBatchAssertionVerificationSummaries,
  evaluateCredentialValidity,
  type RawAssertionVerificationRow,
  type RawClinicalConflictRow,
  type RawReviewerCredentialRow,
  type RawSafetyOverrideRow,
} from "../assertion-verification-resolver.js";

describe("AVANA Pocket Phase 6.3.2 (Phase A): Clinical Quorum Policy & Unified Verification Resolver", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const futureExpiry = new Date("2028-01-01T00:00:00Z");
  const pastExpiry = new Date("2026-01-01T00:00:00Z");

  function makeActiveCredential(
    userId: string,
    overrides?: Partial<RawReviewerCredentialRow>,
  ): RawReviewerCredentialRow {
    return {
      id: randomUUID(),
      userId,
      isActive: true,
      suspendedAt: null,
      licenseExpiresAt: futureExpiry,
      grantedAt: new Date("2025-01-01T00:00:00Z"),
      createdAt: new Date("2025-01-01T00:00:00Z"),
      ...overrides,
    };
  }

  function makeVerification(
    assertionId: string,
    reviewerUserId: string,
    action: "clinical_verified" | "clinical_rejected",
    verifiedAt: Date,
    overrides?: Partial<RawAssertionVerificationRow>,
  ): RawAssertionVerificationRow {
    return {
      id: randomUUID(),
      assertionId,
      reviewerUserId,
      verificationAction: action,
      parentVerificationId: null,
      verifiedAt,
      ...overrides,
    };
  }

  // ===========================================================================
  // 1. ClinicalQuorumPolicy Tests
  // ===========================================================================
  describe("ClinicalQuorumPolicy", () => {
    it("resolves provisional single-approval types (general_information, mechanism_of_action)", () => {
      const genInfo = resolveRequiredApprovals({
        aggregateType: "drug",
        assertionType: "general_information",
      });
      expect(genInfo.requiredApprovals).toBe(1);
      expect(genInfo.isProvisionalDefault).toBe(true);
      expect(genInfo.isFailClosedFallback).toBe(false);

      const mech = resolveRequiredApprovals({
        aggregateType: "drug",
        assertionType: "mechanism_of_action",
      });
      expect(mech.requiredApprovals).toBe(1);
      expect(mech.isFailClosedFallback).toBe(false);
    });

    it("resolves provisional dual-approval types (dosing_rule, emergency, safety_warning, drug_interaction)", () => {
      for (const type of [
        "dosing_rule",
        "dosing",
        "emergency_protocol",
        "safety_warning",
        "contraindication",
        "drug_interaction",
        "interaction",
      ]) {
        const res = resolveRequiredApprovals({ aggregateType: "drug", assertionType: type });
        expect(res.requiredApprovals).toBe(2);
        expect(res.isProvisionalDefault).toBe(true);
        expect(res.isFailClosedFallback).toBe(false);
      }
    });

    it("fails closed (>= 2 approvals) for unknown, unmapped, empty, or missing assertionType", () => {
      for (const unknown of ["custom_unmapped_type", "", "   ", null, undefined]) {
        const res = resolveRequiredApprovals({
          aggregateType: "drug",
          assertionType: unknown,
        });
        expect(res.requiredApprovals).toBe(2);
        expect(res.isFailClosedFallback).toBe(true);
      }
    });

    it("enforces aggregate minimum on emergency pillar even for low-risk assertionType", () => {
      const res = resolveRequiredApprovals({
        aggregateType: "emergency",
        assertionType: "general_information",
      });
      expect(res.requiredApprovals).toBe(2);
      expect(res.matchedRuleKey).toBe("aggregate_minimum:emergency");
    });

    it("supports custom clinical-approved policy configurations without touching resolver code", () => {
      const customPolicy = new ClinicalQuorumPolicy(
        {
          byAssertionType: {
            general_information: 1,
            dosing_rule: 3,
          },
          byAggregateMinimum: {
            emergency: 3,
          },
          unknownAssertionTypeFallback: 2,
        },
        { isProvisionalDefault: false },
      );

      const res = customPolicy.resolve({
        aggregateType: "drug",
        assertionType: "dosing_rule",
      });
      expect(res.requiredApprovals).toBe(3);
      expect(res.isProvisionalDefault).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Credential Validity Evaluation (Including Multiple Historical Rows)
  // ===========================================================================
  describe("evaluateCredentialValidity", () => {
    it("correctly classifies missing, inactive, suspended_or_revoked, expired, and valid credentials", () => {
      const userId = randomUUID();

      expect(evaluateCredentialValidity([], now)).toEqual({
        isValid: false,
        reason: "missing_credential",
      });

      expect(
        evaluateCredentialValidity(
          [makeActiveCredential(userId, { isActive: false, suspendedAt: null })],
          now,
        ),
      ).toEqual({
        isValid: false,
        reason: "inactive",
      });

      expect(
        evaluateCredentialValidity(
          [makeActiveCredential(userId, { isActive: false, suspendedAt: new Date("2026-10-01Z") })],
          now,
        ),
      ).toEqual({
        isValid: false,
        reason: "suspended_or_revoked",
      });

      expect(
        evaluateCredentialValidity(
          [makeActiveCredential(userId, { licenseExpiresAt: pastExpiry })],
          now,
        ),
      ).toEqual({
        isValid: false,
        reason: "expired",
      });

      expect(evaluateCredentialValidity([makeActiveCredential(userId)], now)).toEqual({
        isValid: true,
        reason: "none",
      });
    });

    it("selects authoritative active credential when reviewer has multiple historical revoked credentials", () => {
      const userId = randomUUID();
      const oldRevoked1 = makeActiveCredential(userId, {
        isActive: false,
        suspendedAt: new Date("2024-05-01T00:00:00Z"),
        grantedAt: new Date("2024-01-01T00:00:00Z"),
        createdAt: new Date("2024-01-01T00:00:00Z"),
      });
      const oldRevoked2 = makeActiveCredential(userId, {
        isActive: false,
        suspendedAt: new Date("2025-05-01T00:00:00Z"),
        grantedAt: new Date("2025-01-01T00:00:00Z"),
        createdAt: new Date("2025-01-01T00:00:00Z"),
      });
      const currentActive = makeActiveCredential(userId, {
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: futureExpiry,
        grantedAt: new Date("2026-01-01T00:00:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
      });

      expect(
        evaluateCredentialValidity([oldRevoked1, currentActive, oldRevoked2], now),
      ).toEqual({
        isValid: true,
        reason: "none",
      });
    });
  });

  // ===========================================================================
  // 3. Unified Verification Resolver — All 14 Required Scenarios
  // ===========================================================================
  describe("evaluateAssertionVerificationSummary — 14 Mandatory Scenarios", () => {
    it("1. one valid approval satisfies single-quorum assertionType (general_information)", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();
      const t1 = new Date("2026-11-20T10:00:00Z");

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "general_information",
        },
        verifications: [makeVerification(assertionId, reviewerA, "clinical_verified", t1)],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.validApprovalCount).toBe(1);
      expect(summary.validRejectionCount).toBe(0);
      expect(summary.invalidatedReviewerDecisions).toBe(0);
      expect(summary.activeDisagreement).toBe(false);
      expect(summary.requiredApprovals).toBe(1);
      expect(summary.quorumSatisfied).toBe(true);
      expect(summary.isClinicallyVerified).toBe(true);
      expect(summary.lastValidApprovalTimestamp).toEqual(t1);
      expect(summary.verificationBlockReasons).toEqual([]);
    });

    it("2. two valid approvals satisfy dual-quorum assertionType (dosing_rule)", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();
      const reviewerB = randomUUID();
      const t1 = new Date("2026-11-20T10:00:00Z");
      const t2 = new Date("2026-11-21T15:30:00Z");

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "dosing_rule",
        },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", t1),
          makeVerification(assertionId, reviewerB, "clinical_verified", t2),
        ],
        credentials: [makeActiveCredential(reviewerA), makeActiveCredential(reviewerB)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.validApprovalCount).toBe(2);
      expect(summary.validRejectionCount).toBe(0);
      expect(summary.activeDisagreement).toBe(false);
      expect(summary.requiredApprovals).toBe(2);
      expect(summary.quorumSatisfied).toBe(true);
      expect(summary.isClinicallyVerified).toBe(true);
      expect(summary.lastValidApprovalTimestamp).toEqual(t2);
      expect(summary.verificationBlockReasons).toEqual([]);
    });

    it("3. one approval and one rejection triggers activeDisagreement and blocks verification", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();
      const reviewerB = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "general_information",
        },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", new Date("2026-11-20T10:00:00Z")),
          makeVerification(assertionId, reviewerB, "clinical_rejected", new Date("2026-11-21T10:00:00Z")),
        ],
        credentials: [makeActiveCredential(reviewerA), makeActiveCredential(reviewerB)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.validApprovalCount).toBe(1);
      expect(summary.validRejectionCount).toBe(1);
      expect(summary.activeDisagreement).toBe(true);
      expect(summary.quorumSatisfied).toBe(true);
      expect(summary.isClinicallyVerified).toBe(false);
      expect(summary.verificationBlockReasons).toContain("active_disagreement");
    });

    it("4. two approvals and one rejection still blocks verification (simple majority does NOT resolve disagreement)", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();
      const reviewerB = randomUUID();
      const reviewerC = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "dosing_rule", // requires 2 approvals -> quorum IS met, yet must stay blocked!
        },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", new Date("2026-11-20T10:00:00Z")),
          makeVerification(assertionId, reviewerB, "clinical_rejected", new Date("2026-11-21T10:00:00Z")),
          makeVerification(assertionId, reviewerC, "clinical_verified", new Date("2026-11-22T10:00:00Z")),
        ],
        credentials: [
          makeActiveCredential(reviewerA),
          makeActiveCredential(reviewerB),
          makeActiveCredential(reviewerC),
        ],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.validApprovalCount).toBe(2);
      expect(summary.validRejectionCount).toBe(1);
      expect(summary.quorumSatisfied).toBe(true);
      expect(summary.activeDisagreement).toBe(true);
      expect(summary.isClinicallyVerified).toBe(false);
      expect(summary.verificationBlockReasons).toContain("active_disagreement");
    });

    it("5. reviewer changing their own vote (verified -> rejected, and rejected -> verified) uses latest by (verifiedAt DESC, id DESC)", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();
      const t1 = new Date("2026-11-20T10:00:00Z");
      const t2 = new Date("2026-11-21T10:00:00Z");

      // Case 5a: verified then rejected
      const v1 = makeVerification(assertionId, reviewerA, "clinical_verified", t1, { id: "00000001-0000-0000-0000-000000000001" });
      const v2 = makeVerification(assertionId, reviewerA, "clinical_rejected", t2, {
        id: "00000002-0000-0000-0000-000000000002",
        parentVerificationId: v1.id,
      });

      const rejectedSummary = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [v1, v2],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(rejectedSummary.latestDecisionPerReviewer).toHaveLength(1);
      expect(rejectedSummary.latestDecisionPerReviewer[0].latestAction).toBe("clinical_rejected");
      expect(rejectedSummary.validApprovalCount).toBe(0);
      expect(rejectedSummary.validRejectionCount).toBe(1);
      expect(rejectedSummary.isClinicallyVerified).toBe(false);
      expect(rejectedSummary.lastValidApprovalTimestamp).toBeNull();

      // Case 5b: rejected then verified (tie timestamp resolved by id DESC)
      const vTie1 = makeVerification(assertionId, reviewerA, "clinical_rejected", t2, {
        id: "10000000-0000-0000-0000-000000000001",
      });
      const vTie2 = makeVerification(assertionId, reviewerA, "clinical_verified", t2, {
        id: "20000000-0000-0000-0000-000000000002",
        parentVerificationId: vTie1.id,
      });

      const reVerifiedSummary = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [vTie1, vTie2],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(reVerifiedSummary.latestDecisionPerReviewer[0].latestAction).toBe("clinical_verified");
      expect(reVerifiedSummary.validApprovalCount).toBe(1);
      expect(reVerifiedSummary.validRejectionCount).toBe(0);
      expect(reVerifiedSummary.isClinicallyVerified).toBe(true);
      expect(reVerifiedSummary.lastValidApprovalTimestamp).toEqual(t2);
    });

    it("6. credential expiration of reviewer A invalidates only A without affecting reviewer B", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();
      const reviewerB = randomUUID();
      const tA = new Date("2026-11-22T10:00:00Z"); // newer, but expired
      const tB = new Date("2026-11-20T10:00:00Z"); // older, but valid

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "general_information",
        },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", tA),
          makeVerification(assertionId, reviewerB, "clinical_verified", tB),
        ],
        credentials: [
          makeActiveCredential(reviewerA, { licenseExpiresAt: pastExpiry }),
          makeActiveCredential(reviewerB),
        ],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.reviewerCredentialValidity[reviewerA]).toEqual({
        isValid: false,
        reason: "expired",
      });
      expect(summary.reviewerCredentialValidity[reviewerB]).toEqual({
        isValid: true,
        reason: "none",
      });
      expect(summary.validApprovalCount).toBe(1);
      expect(summary.invalidatedReviewerDecisions).toBe(1);
      expect(summary.isClinicallyVerified).toBe(true);
      // Must NOT use expired reviewer A's timestamp tA!
      expect(summary.lastValidApprovalTimestamp).toEqual(tB);
    });

    it("7. suspended credential invalidates reviewer decision with reason 'suspended_or_revoked'", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", new Date("2026-11-20T10:00:00Z")),
        ],
        credentials: [
          makeActiveCredential(reviewerA, {
            isActive: false,
            suspendedAt: new Date("2026-11-24T00:00:00Z"),
          }),
        ],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.reviewerCredentialValidity[reviewerA]).toEqual({
        isValid: false,
        reason: "suspended_or_revoked",
      });
      expect(summary.validApprovalCount).toBe(0);
      expect(summary.invalidatedReviewerDecisions).toBe(1);
      expect(summary.isClinicallyVerified).toBe(false);
      expect(summary.verificationBlockReasons).toContain("all_approvals_invalidated");
      expect(summary.verificationBlockReasons).toContain("quorum_not_met");
    });

    it("8. inactive credential (isActive = false, suspendedAt = null) invalidates decision with reason 'inactive'", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", new Date("2026-11-20T10:00:00Z")),
        ],
        credentials: [
          makeActiveCredential(reviewerA, {
            isActive: false,
            suspendedAt: null,
          }),
        ],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.reviewerCredentialValidity[reviewerA]).toEqual({
        isValid: false,
        reason: "inactive",
      });
      expect(summary.validApprovalCount).toBe(0);
      expect(summary.invalidatedReviewerDecisions).toBe(1);
      expect(summary.isClinicallyVerified).toBe(false);
    });

    it("9. missing credential invalidates decision with reason 'missing_credential'", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [
          makeVerification(assertionId, reviewerA, "clinical_verified", new Date("2026-11-20T10:00:00Z")),
        ],
        credentials: [],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.reviewerCredentialValidity[reviewerA]).toEqual({
        isValid: false,
        reason: "missing_credential",
      });
      expect(summary.validApprovalCount).toBe(0);
      expect(summary.invalidatedReviewerDecisions).toBe(1);
      expect(summary.isClinicallyVerified).toBe(false);
      expect(summary.verificationBlockReasons).toContain("all_approvals_invalidated");
    });

    it("10. unresolved clinical conflict (active_discrepancy) blocks verification while resolved conflict does not", () => {
      const assertionId = randomUUID();
      const otherAssertionId = randomUUID();
      const reviewerA = randomUUID();

      const activeConflict: RawClinicalConflictRow = {
        id: randomUUID(),
        assertionAId: assertionId,
        assertionBId: otherAssertionId,
        status: "active_discrepancy",
      };

      const blocked = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [makeVerification(assertionId, reviewerA, "clinical_verified", now)],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [activeConflict],
        safetyOverrides: [],
        now,
      });

      expect(blocked.hasActiveConflict).toBe(true);
      expect(blocked.isClinicallyVerified).toBe(false);
      expect(blocked.verificationBlockReasons).toContain("unresolved_clinical_conflict");

      const resolved = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "general_information" },
        verifications: [makeVerification(assertionId, reviewerA, "clinical_verified", now)],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [{ ...activeConflict, status: "resolved" }],
        safetyOverrides: [],
        now,
      });

      expect(resolved.hasActiveConflict).toBe(false);
      expect(resolved.isClinicallyVerified).toBe(true);
    });

    it("11. active safety override (on assertion or parent aggregate) blocks verification", () => {
      const assertionId = randomUUID();
      const drugId = randomUUID();
      const reviewerA = randomUUID();

      const assertionOverride: RawSafetyOverrideRow = {
        id: randomUUID(),
        targetEntityType: "assertion",
        targetEntityId: assertionId,
        actionState: "quarantined",
        isActive: true,
      };

      const blockedByAssertion = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          aggregateId: drugId,
          assertionType: "general_information",
        },
        verifications: [makeVerification(assertionId, reviewerA, "clinical_verified", now)],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [],
        safetyOverrides: [assertionOverride],
        now,
      });

      expect(blockedByAssertion.hasActiveSafetyOverride).toBe(true);
      expect(blockedByAssertion.isClinicallyVerified).toBe(false);
      expect(blockedByAssertion.verificationBlockReasons).toContain("active_safety_override");

      const aggregateOverride: RawSafetyOverrideRow = {
        id: randomUUID(),
        targetEntityType: "drug",
        targetEntityId: drugId,
        actionState: "quarantined",
        isActive: true,
      };

      const blockedByAggregate = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          aggregateId: drugId,
          assertionType: "general_information",
        },
        verifications: [makeVerification(assertionId, reviewerA, "clinical_verified", now)],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [],
        safetyOverrides: [aggregateOverride],
        now,
      });

      expect(blockedByAggregate.hasActiveSafetyOverride).toBe(true);
      expect(blockedByAggregate.isClinicallyVerified).toBe(false);
    });

    it("12. insufficient approvals for required quorum (1 of 2 for dosing_rule) marks quorumSatisfied = false", () => {
      const assertionId = randomUUID();
      const reviewerA = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "dosing_rule",
        },
        verifications: [makeVerification(assertionId, reviewerA, "clinical_verified", now)],
        credentials: [makeActiveCredential(reviewerA)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.validApprovalCount).toBe(1);
      expect(summary.requiredApprovals).toBe(2);
      expect(summary.quorumSatisfied).toBe(false);
      expect(summary.isClinicallyVerified).toBe(false);
      expect(summary.verificationBlockReasons).toContain("quorum_not_met");
    });

    it("13. computes lastValidApprovalTimestamp strictly from eligible valid approvals (ignoring rejections & invalidated votes)", () => {
      const assertionId = randomUUID();
      const reviewerValidOlder = randomUUID();
      const reviewerValidNewer = randomUUID();
      const reviewerInvalidNewest = randomUUID();
      const reviewerRejectNewest = randomUUID();

      const tOlder = new Date("2026-11-10T08:00:00Z");
      const tNewer = new Date("2026-11-15T12:00:00Z");
      const tNewest = new Date("2026-11-24T18:00:00Z");

      const summary = evaluateAssertionVerificationSummary({
        context: { assertionId, aggregateType: "drug", assertionType: "dosing_rule" },
        verifications: [
          makeVerification(assertionId, reviewerValidOlder, "clinical_verified", tOlder),
          makeVerification(assertionId, reviewerValidNewer, "clinical_verified", tNewer),
          makeVerification(assertionId, reviewerInvalidNewest, "clinical_verified", tNewest),
          makeVerification(assertionId, reviewerRejectNewest, "clinical_rejected", tNewest),
        ],
        credentials: [
          makeActiveCredential(reviewerValidOlder),
          makeActiveCredential(reviewerValidNewer),
          makeActiveCredential(reviewerInvalidNewest, { licenseExpiresAt: pastExpiry }),
          makeActiveCredential(reviewerRejectNewest),
        ],
        conflicts: [],
        safetyOverrides: [],
        quorumPolicy: DEFAULT_CLINICAL_QUORUM_POLICY,
        now,
      });

      expect(summary.lastValidApprovalTimestamp).toEqual(tNewer);
      expect(summary.latestValidApprovalReviewerUserId).toBe(reviewerValidNewer);
    });

    it("14. invalidated approvals do not contribute to quorum (1 valid + 1 expired != 2 approvals)", () => {
      const assertionId = randomUUID();
      const reviewerValid = randomUUID();
      const reviewerExpired = randomUUID();

      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          aggregateType: "drug",
          assertionType: "dosing_rule", // requires 2 approvals
        },
        verifications: [
          makeVerification(assertionId, reviewerValid, "clinical_verified", new Date("2026-11-20T10:00:00Z")),
          makeVerification(assertionId, reviewerExpired, "clinical_verified", new Date("2026-11-21T10:00:00Z")),
        ],
        credentials: [
          makeActiveCredential(reviewerValid),
          makeActiveCredential(reviewerExpired, { licenseExpiresAt: pastExpiry }),
        ],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(summary.validApprovalCount).toBe(1);
      expect(summary.invalidatedReviewerDecisions).toBe(1);
      expect(summary.requiredApprovals).toBe(2);
      expect(summary.quorumSatisfied).toBe(false);
      expect(summary.isClinicallyVerified).toBe(false);
      expect(summary.verificationBlockReasons).toEqual(["quorum_not_met"]);
    });
  });

  // ===========================================================================
  // 4. Batch Evaluation Parity
  // ===========================================================================
  describe("evaluateBatchAssertionVerificationSummaries", () => {
    it("evaluates multiple assertions in a single batch without cross-assertion leakage", () => {
      const a1 = randomUUID();
      const a2 = randomUUID();
      const reviewerA = randomUUID();
      const reviewerB = randomUUID();

      const map = evaluateBatchAssertionVerificationSummaries({
        contexts: [
          { assertionId: a1, aggregateType: "drug", assertionType: "general_information" },
          { assertionId: a2, aggregateType: "drug", assertionType: "dosing_rule" },
        ],
        verifications: [
          makeVerification(a1, reviewerA, "clinical_verified", now),
          makeVerification(a2, reviewerA, "clinical_verified", now),
          makeVerification(a2, reviewerB, "clinical_rejected", now),
        ],
        credentials: [makeActiveCredential(reviewerA), makeActiveCredential(reviewerB)],
        conflicts: [],
        safetyOverrides: [],
        now,
      });

      expect(map.get(a1)?.isClinicallyVerified).toBe(true);
      expect(map.get(a2)?.isClinicallyVerified).toBe(false);
      expect(map.get(a2)?.activeDisagreement).toBe(true);
    });
  });
});
