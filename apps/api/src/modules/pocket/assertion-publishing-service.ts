/**
 * AVANA Pocket — Assertion Publishing Service (Phase 2C-3: Atomic Publishing Workflow).
 *
 * Implements the atomic production publishing cycle for scientific assertions:
 * 1. Precondition Verification:
 *    - Status MUST be `verified`. (draft, in_review, reviewed, published, superseded are rejected).
 *    - Must possess official clinical verification specifically on THIS physical version.
 * 2. Conceptual Aggregate Resolution:
 *    - Resolves clinical pillar linkage (drug, disease, treatment, emergency).
 * 3. Atomic Single-Transaction Pipeline:
 *    - Supersedes any active published version under the same `assertion_root_id` (setting status = 'superseded', superseded_at = now()).
 *    - Preserves scientific statements and clinical links of previous versions intact.
 *    - Marks target assertion as `published`.
 *    - Atomically increments monotonic version in `pocket_entity_version_registry`.
 *    - Inserts atomic event into `pocket_outbox` (`assertion.published`).
 *    - Writes comprehensive audit trail entries into `pocket_assertion_audit_log`.
 */

import { DomainError, type Actor } from "@avana/domain";
import type { DbClient, TransactionClient } from "@avana/database/client";
import type {
  AssertionPublishingStore,
  EntityVersionRecord,
  PocketOutboxRecord,
} from "./assertion-publishing-store.js";
import type {
  AssertionReviewStore,
  ScientificAssertionRecord,
  AssertionAuditLogRecord,
} from "./assertion-review-store.js";
import type { AssertionVerificationStore } from "./assertion-verification-store.js";
import {
  DEFAULT_CLINICAL_QUORUM_POLICY,
  type ClinicalQuorumPolicy,
} from "./clinical-quorum-policy.js";
import {
  evaluateAssertionVerificationSummary,
  resolveAssertionVerificationSummariesFromDb,
  type AssertionResolutionContext,
  type AssertionVerificationSummary,
} from "./assertion-verification-resolver.js";

export interface PublishAssertionInput {
  assertionId: string;
  notes?: string;
}

export interface PublishAssertionResult {
  publishedAssertion: ScientificAssertionRecord;
  supersededAssertion: ScientificAssertionRecord | null;
  entityVersion: EntityVersionRecord;
  outboxEvent: PocketOutboxRecord;
  auditLog: AssertionAuditLogRecord;
}

export interface AssertionPublishingServiceDeps {
  publishingStore: AssertionPublishingStore;
  assertionStore: AssertionReviewStore;
  verificationStore: AssertionVerificationStore;
  db?: DbClient;
  quorumPolicy?: ClinicalQuorumPolicy;
  resolveVerificationSummary?: (
    context: AssertionResolutionContext,
    tx?: TransactionClient,
  ) => Promise<AssertionVerificationSummary>;
  onPublicationCommitted?: () => void;
}

export interface AggregateIdentity {
  aggregateType: "drug" | "disease" | "treatment" | "emergency";
  aggregateId: string;
}

export function resolveAssertionAggregate(assertion: ScientificAssertionRecord): AggregateIdentity {
  if (assertion.drugId) {
    return { aggregateType: "drug", aggregateId: assertion.drugId };
  }
  if (assertion.diseaseId) {
    return { aggregateType: "disease", aggregateId: assertion.diseaseId };
  }
  if (assertion.treatmentId) {
    return { aggregateType: "treatment", aggregateId: assertion.treatmentId };
  }
  if (assertion.emergencyId) {
    return { aggregateType: "emergency", aggregateId: assertion.emergencyId };
  }
  throw new DomainError(
    "bad_request",
    `Assertion ${assertion.id} does not reference a valid clinical aggregate pillar (drug, disease, treatment, emergency)`,
  );
}

export class AssertionPublishingService {
  private readonly publishingStore: AssertionPublishingStore;
  private readonly assertionStore: AssertionReviewStore;
  private readonly verificationStore: AssertionVerificationStore;
  private readonly db?: DbClient;
  private readonly quorumPolicy: ClinicalQuorumPolicy;
  private readonly customResolveSummary?: (
    context: AssertionResolutionContext,
    tx?: TransactionClient,
  ) => Promise<AssertionVerificationSummary>;
  private readonly onPublicationCommitted?: () => void;

  constructor(deps: AssertionPublishingServiceDeps) {
    this.publishingStore = deps.publishingStore;
    this.assertionStore = deps.assertionStore;
    this.verificationStore = deps.verificationStore;
    this.db = deps.db;
    this.quorumPolicy = deps.quorumPolicy ?? DEFAULT_CLINICAL_QUORUM_POLICY;
    this.customResolveSummary = deps.resolveVerificationSummary;
    this.onPublicationCommitted = deps.onPublicationCommitted;
  }

  private async resolveGateSummary(
    context: AssertionResolutionContext,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationSummary> {
    if (this.customResolveSummary) {
      return await this.customResolveSummary(context, tx);
    }

    if (tx) {
      const summaries = await resolveAssertionVerificationSummariesFromDb([context], tx, {
        quorumPolicy: this.quorumPolicy,
      });
      const summary = summaries.get(context.assertionId);
      if (summary) {
        return summary;
      }
    }

    // Fail-closed fallback when running without a DB transaction and without a custom resolver:
    // Evaluates via the authoritative Resolver with empty credentials so unauthorized/in-memory
    // callers without an explicit credential-backed resolver cannot bypass quorum/credential checks.
    const verifications = await this.verificationStore.findVerificationsByAssertionId(
      context.assertionId,
      tx,
    );
    return evaluateAssertionVerificationSummary({
      context,
      verifications: verifications.map((v) => ({
        id: v.id,
        assertionId: v.assertionId,
        reviewerUserId: v.reviewerUserId,
        verificationAction: v.verificationAction,
        parentVerificationId: v.parentVerificationId,
        verifiedAt: v.verifiedAt,
      })),
      credentials: [],
      conflicts: [],
      safetyOverrides: [],
      quorumPolicy: this.quorumPolicy,
    });
  }

  /**
   * Atomically publishes a clinically verified scientific assertion.
   */
  async publishAssertion(
    actor: Actor,
    input: PublishAssertionInput,
  ): Promise<PublishAssertionResult> {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    if (!isPlatformAdmin) {
      throw new DomainError(
        "forbidden",
        "Publishing clinical assertions is restricted strictly to platform administrators",
      );
    }

    if (!input.assertionId || input.assertionId.trim() === "") {
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const executeInTx = async (tx?: TransactionClient): Promise<PublishAssertionResult> => {
      // 0. Resolve immutable assertionRootId and serialize at the Root level via
      //    pg_advisory_xact_lock BEFORE acquiring any row locks (prevents concurrent
      //    publishes of different versions under the same root from racing or deadlocking).
      const initialLookup = await this.assertionStore.findById(input.assertionId, tx);
      if (!initialLookup) {
        throw new DomainError("not_found", `Assertion ${input.assertionId} not found`);
      }
      await this.publishingStore.lockPublishRoot(initialLookup.assertionRootId, tx);

      // 0b. Lock all assertion rows of this root in deterministic `id ASC` order
      //     before reading target/activePublished so lock ordering matches
      //     recordClinicalConflict and resolveConflict (deadlock-free).
      await this.publishingStore.lockRootAssertionsForUpdate(initialLookup.assertionRootId, tx);

      // 1. Read and lock target assertion row inside the transaction
      const assertion = await this.assertionStore.findByIdForUpdate(input.assertionId, tx);
      if (!assertion) {
        throw new DomainError("not_found", `Assertion ${input.assertionId} not found`);
      }

      // 2. Strict status precondition checks
      if (assertion.status === "draft") {
        throw new DomainError(
          "bad_request",
          "Cannot publish draft assertion: it must complete peer review and clinical verification first",
        );
      }

      if (assertion.status === "in_review") {
        throw new DomainError(
          "bad_request",
          "Cannot publish assertion in review: peer review and clinical verification required",
        );
      }

      if (assertion.status === "reviewed") {
        throw new DomainError(
          "bad_request",
          "Cannot publish assertion in reviewed status: official clinical verification is strictly required",
        );
      }

      if (assertion.status === "published") {
        throw new DomainError("conflict", "Assertion is already published");
      }

      if (assertion.status === "superseded") {
        throw new DomainError("conflict", "Cannot publish a superseded assertion");
      }

      if (assertion.status !== "verified") {
        throw new DomainError(
          "bad_request",
          `Invalid status for publishing: cannot publish assertion with status '${assertion.status}'`,
        );
      }

      // 3. Resolve conceptual clinical aggregate
      const aggregate = resolveAssertionAggregate(assertion);
      const now = new Date();

      // 4. Query and lock active published assertion under the same assertionRootId
      const activePublished = await this.publishingStore.findActivePublishedByRootId(
        assertion.assertionRootId,
        tx,
      );

      // 5. Lock involved reviewer credentials, active safety overrides, and active conflicts
      //    in consistent order before invoking the authoritative Resolver inside tx.
      await this.publishingStore.lockClinicalGateInputsForPublish(
        assertion.id,
        aggregate.aggregateType,
        aggregate.aggregateId,
        tx,
      );

      // 6. Authoritative Resolver & Quorum Policy evaluation inside the transaction
      const resolutionContext: AssertionResolutionContext = {
        assertionId: assertion.id,
        aggregateType: aggregate.aggregateType,
        aggregateId: aggregate.aggregateId,
        assertionType: assertion.assertionType,
      };
      const summary = await this.resolveGateSummary(resolutionContext, tx);

      if (
        !summary.isClinicallyVerified ||
        !summary.latestValidApprovalVerificationId ||
        !summary.latestValidApprovalReviewerUserId
      ) {
        throw new DomainError(
          "conflict",
          `Assertion ${assertion.id} failed the clinical verification publishing gate: ${summary.verificationBlockReasons.join(", ") || "not_clinically_verified"}`,
          {
            assertionId: assertion.id,
            primaryBlockReason:
              summary.verificationBlockReasons[0] ?? "not_clinically_verified",
            verificationBlockReasons: summary.verificationBlockReasons.join(","),
            validApprovalCount: summary.validApprovalCount,
            validRejectionCount: summary.validRejectionCount,
            requiredApprovals: summary.requiredApprovals,
            quorumSatisfied: summary.quorumSatisfied,
            activeDisagreement: summary.activeDisagreement,
            hasActiveConflict: summary.hasActiveConflict,
            hasActiveSafetyOverride: summary.hasActiveSafetyOverride,
          },
        );
      }

      const quorumResolution = this.quorumPolicy.resolve({
        aggregateType: aggregate.aggregateType,
        assertionType: assertion.assertionType,
      });
      const validApprovalIds = summary.latestDecisionPerReviewer
        .filter((d) => d.credentialValid && d.latestAction === "clinical_verified")
        .map((d) => d.latestVerificationId);

      // 7. Supersede active published version (only after gate passes!)
      let supersededAssertion: ScientificAssertionRecord | null = null;
      if (activePublished && activePublished.id !== assertion.id) {
        supersededAssertion = await this.publishingStore.markAssertionSuperseded(
          activePublished.id,
          now,
          tx,
        );

        await this.assertionStore.insertAuditLog(
          {
            assertionId: activePublished.id,
            actorUserId: actor.userId,
            action: "superseded",
            previousStatus: activePublished.status,
            newStatus: "superseded",
            clinicalNotes: `Superseded by version ${assertion.versionNumber} (${assertion.id})`,
          },
          tx,
        );
      }

      // 8. Transition target assertion to published
      const publishedAssertion = await this.publishingStore.markAssertionPublished(
        assertion.id,
        tx,
      );

      // 9. Atomically bump monotonic entity version
      const entityVersion = await this.publishingStore.incrementEntityVersion(
        aggregate.aggregateType,
        aggregate.aggregateId,
        tx,
      );

      // 10. Enqueue Outbox event (preserving backward-compatible fields + additive quorum metadata)
      const outboxPayload: Record<string, unknown> = {
        assertionId: publishedAssertion.id,
        assertionRootId: publishedAssertion.assertionRootId,
        versionNumber: publishedAssertion.versionNumber,
        previousVersionId: publishedAssertion.previousVersionId,
        assertionType: publishedAssertion.assertionType,
        assertionKey: publishedAssertion.assertionKey,
        statementText: publishedAssertion.statementText,
        jurisdiction: publishedAssertion.jurisdiction,
        targetPopulation: publishedAssertion.targetPopulation,
        clinicalSetting: publishedAssertion.clinicalSetting,
        aggregateType: aggregate.aggregateType,
        aggregateId: aggregate.aggregateId,
        entityVersion: entityVersion.currentVersion,
        publishedAt: now.toISOString(),
        publisherUserId: actor.userId,
        verificationId: summary.latestValidApprovalVerificationId,
        clinicalVerifierUserId: summary.latestValidApprovalReviewerUserId,
        validApprovalCount: summary.validApprovalCount,
        requiredApprovals: summary.requiredApprovals,
        supersededAssertionId: supersededAssertion ? supersededAssertion.id : null,
        notes: input.notes?.trim() || null,
      };

      const outboxEvent = await this.publishingStore.enqueueOutboxEvent(
        {
          aggregateType: aggregate.aggregateType,
          aggregateId: aggregate.aggregateId,
          eventType: "assertion.published",
          payload: outboxPayload,
          globalEpoch: Date.now(),
        },
        tx,
      );

      // 11. Record publication audit log with quorum policy & authorization metadata
      const baseNote =
        input.notes?.trim() ||
        `Clinically verified assertion published (version ${assertion.versionNumber})`;
      const auditMetadata = `[quorumPolicy=${quorumResolution.matchedRuleKey}, validApprovals=${summary.validApprovalCount}/${summary.requiredApprovals}, verificationIds=${validApprovalIds.join(",")}]`;

      const auditLog = await this.assertionStore.insertAuditLog(
        {
          assertionId: publishedAssertion.id,
          actorUserId: actor.userId,
          action: "published",
          previousStatus: assertion.status,
          newStatus: "published",
          clinicalNotes: `${baseNote} ${auditMetadata}`,
        },
        tx,
      );

      return {
        publishedAssertion,
        supersededAssertion,
        entityVersion,
        outboxEvent,
        auditLog,
      };
    };

    const result =
      this.db && typeof this.db.transaction === "function"
        ? await this.db.transaction(executeInTx)
        : await executeInTx();

    try {
      this.onPublicationCommitted?.();
    } catch {
      // Non-blocking trigger notification
    }

    return result;
  }
}
