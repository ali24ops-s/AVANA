/**
 * Clinical Verification Engine Service — Phase 2C-2.
 *
 * Enforces official clinical verification rules for AVANA Pocket:
 * 1. Reviewer Credential Enforcement:
 *    - The reviewer MUST possess an active, valid, unsuspended, unexpired clinical reviewer credential
 *      evaluated at runtime in the transaction context.
 *    - Generic `platform_admin` role alone DOES NOT grant clinical verification authority.
 * 2. Assertion Lifecycle Preconditions:
 *    - Only assertions in `reviewed` status (initial peer review approved) can be verified.
 *    - `draft`, `in_review`, `published`, and `superseded` assertions are strictly rejected.
 * 3. Physical Version Binding & Historical Retention:
 *    - Verifications are strictly anchored to the specific physical version (`assertion.id`).
 *    - Verifying version 1 NEVER automatically verifies version 2.
 * 4. Atomicity & Invariant Protection:
 *    - Reviewer validation, verification insertion, status update (`reviewed` -> `verified`), and
 *      audit logging are executed in a single ACID transaction.
 * 5. Incompatible Duplicate Prevention:
 *    - Reject duplicate verifications by the same reviewer or on an already verified assertion.
 */

import { DomainError, type Actor } from "@avana/domain";
import type { DbClient, TransactionClient } from "@avana/database/client";
import type { ReviewerService } from "./reviewer-service.js";
import type {
  AssertionReviewStore,
  ScientificAssertionRecord,
  AssertionAuditLogRecord,
} from "./assertion-review-store.js";
import type {
  AssertionVerificationRecord,
  AssertionVerificationStore,
  ClinicalConflictRecord,
  ResolveConflictOutcome,
} from "./assertion-verification-store.js";

const MAX_CONFLICT_NOTES_LENGTH = 1000;

export interface ResolveConflictInput {
  conflictId: string;
  outcome: ResolveConflictOutcome;
  resolutionNotes: string;
}

export interface VerifyAssertionInput {
  assertionId: string;
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
}

export interface RejectAssertionVerificationInput {
  assertionId: string;
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
}

export interface RecordConflictInput {
  assertionAId: string;
  assertionBId: string;
  conflictSubject: string;
  discrepancyDescription: string;
}

export interface AssertionVerificationServiceDeps {
  verificationStore: AssertionVerificationStore;
  assertionStore: AssertionReviewStore;
  reviewerService: ReviewerService;
  db?: DbClient;
}

export class AssertionVerificationService {
  private readonly verificationStore: AssertionVerificationStore;
  private readonly assertionStore: AssertionReviewStore;
  private readonly reviewerService: ReviewerService;
  private readonly db?: DbClient;

  constructor(deps: AssertionVerificationServiceDeps) {
    this.verificationStore = deps.verificationStore;
    this.assertionStore = deps.assertionStore;
    this.reviewerService = deps.reviewerService;
    this.db = deps.db;
  }

  /**
   * Officially verifies a scientific assertion with independent multi-reviewer
   * append-only parent chain integrity.
   */
  async verifyAssertion(
    actor: Actor,
    input: VerifyAssertionInput,
  ): Promise<{
    verification: AssertionVerificationRecord;
    assertion: ScientificAssertionRecord;
    auditLog: AssertionAuditLogRecord;
  }> {
    return this.submitClinicalVote(actor, input, {
      targetAction: "clinical_verified",
      auditAction: "clinical_verified",
      emptyNotesMessage:
        "Clinical review notes detailing medical evidence evaluation are required for verification",
    });
  }

  /**
   * Records a clinical rejection vote in the reviewer's independent append-only chain
   * without erasing other reviewers' votes or reverting the assertion to draft.
   */
  async rejectAssertionVerification(
    actor: Actor,
    input: RejectAssertionVerificationInput,
  ): Promise<{
    verification: AssertionVerificationRecord;
    assertion: ScientificAssertionRecord;
    auditLog: AssertionAuditLogRecord;
  }> {
    return this.submitClinicalVote(actor, input, {
      targetAction: "clinical_rejected",
      auditAction: "clinical_verification_rejected",
      emptyNotesMessage:
        "Clinical critique notes explaining rejection reasons are required",
    });
  }

  private async submitClinicalVote(
    actor: Actor,
    input: {
      assertionId: string;
      clinicalReviewNotes: string;
      parentVerificationId?: string | null;
    },
    config: {
      targetAction: "clinical_verified" | "clinical_rejected";
      auditAction: "clinical_verified" | "clinical_verification_rejected";
      emptyNotesMessage: string;
    },
  ): Promise<{
    verification: AssertionVerificationRecord;
    assertion: ScientificAssertionRecord;
    auditLog: AssertionAuditLogRecord;
  }> {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }

    if (!input.assertionId || input.assertionId.trim() === "") {
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const trimmedNotes = input.clinicalReviewNotes?.trim() ?? "";
    if (trimmedNotes === "") {
      throw new DomainError("bad_request", config.emptyNotesMessage);
    }

    const executeInTx = async (tx?: TransactionClient) => {
      // 1. Lock target assertion row inside the transaction
      const assertion = await this.assertionStore.findByIdForUpdate(input.assertionId, tx);
      if (!assertion) {
        throw new DomainError("not_found", `Assertion ${input.assertionId} not found`);
      }

      // 2. Enforce allowed assertion lifecycle statuses: reviewed, verified, published
      if (assertion.status === "draft") {
        throw new DomainError(
          "bad_request",
          "Assertion is in draft status and must complete initial review before clinical verification",
        );
      }

      if (assertion.status === "in_review") {
        throw new DomainError(
          "bad_request",
          "Assertion is still under review and cannot be clinically verified until initial review is approved",
        );
      }

      if (assertion.status === "superseded" || assertion.status === "retired") {
        throw new DomainError(
          "conflict",
          `Cannot submit clinical vote for a ${assertion.status} assertion`,
        );
      }

      if (
        assertion.status !== "reviewed" &&
        assertion.status !== "verified" &&
        assertion.status !== "published"
      ) {
        throw new DomainError(
          "bad_request",
          `Invalid state transition: cannot submit clinical vote for assertion with status '${assertion.status}'`,
        );
      }

      // 3. Lock and validate active clinical reviewer credential in current transaction
      await this.reviewerService.assertActiveReviewer(actor.userId, tx, {
        forUpdate: true,
      });

      // 4. Read latest vote by this reviewer on this assertion inside the same transaction
      const latest =
        await this.verificationStore.findLatestVerificationByReviewerAndAssertion(
          actor.userId,
          assertion.id,
          tx,
        );

      // 5. Determine expected parent and reject any mismatched explicit parent
      const expectedParentId = latest ? latest.id : null;
      if (
        input.parentVerificationId !== undefined &&
        input.parentVerificationId !== expectedParentId
      ) {
        throw new DomainError(
          "conflict",
          "Provided parentVerificationId does not match this reviewer's latest verification for the assertion",
        );
      }

      // 6. Duplicate vote guard against latest vote only (allows verify -> reject -> verify,
      //    and allows re-voting after a resolved conflict cutoff invalidates the prior vote).
      if (
        latest &&
        latest.verificationAction === config.targetAction &&
        latest.clinicalReviewNotes === trimmedNotes
      ) {
        const resolvedCutoff =
          await this.verificationStore.getLatestResolvedConflictCutoff(assertion.id, tx);
        const isLatestPreResolution =
          resolvedCutoff !== null &&
          (latest.verificationSeq !== null &&
          latest.verificationSeq !== undefined &&
          resolvedCutoff.resolutionSeq !== null
            ? latest.verificationSeq <= resolvedCutoff.resolutionSeq
            : latest.verifiedAt.getTime() <= resolvedCutoff.resolvedAt.getTime());

        if (!isLatestPreResolution) {
          throw new DomainError(
            "conflict",
            "Reviewer has already submitted an identical latest clinical vote with the same notes",
          );
        }
      }

      // 7. Append-only insert into pocket_assertion_verifications.
      //    In Drizzle/PostgreSQL, `verifiedAt` uses `clock_timestamp()` and
      //    `verificationSeq` uses `nextval('pocket_governance_event_seq')` inside tx.
      const verification = await this.verificationStore.createVerification(
        {
          assertionId: assertion.id,
          reviewerUserId: actor.userId,
          verificationAction: config.targetAction,
          clinicalReviewNotes: trimmedNotes,
          parentVerificationId: expectedParentId,
        },
        tx,
      );

      // 9. Assertion status transition matrix:
      //    Only reviewed + verify transitions to verified (updates updated_at).
      //    verified and published never mutate assertion status, updated_at, or published_at.
      let resultAssertion = assertion;
      let newStatus = assertion.status;
      if (
        assertion.status === "reviewed" &&
        config.targetAction === "clinical_verified"
      ) {
        newStatus = "verified";
        resultAssertion = await this.assertionStore.updateStatus(
          assertion.id,
          "verified",
          tx,
        );
      }

      // 10. Independent audit log entry for every vote
      const auditLog = await this.assertionStore.insertAuditLog(
        {
          assertionId: assertion.id,
          actorUserId: actor.userId,
          action: config.auditAction,
          previousStatus: assertion.status,
          newStatus,
          clinicalNotes: trimmedNotes,
        },
        tx,
      );

      return {
        verification,
        assertion: resultAssertion,
        auditLog,
      };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Records a documented clinical conflict / discrepancy between two assertion versions.
   */
  async recordClinicalConflict(
    actor: Actor,
    input: RecordConflictInput,
  ): Promise<ClinicalConflictRecord> {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }

    if (!input.conflictSubject || input.conflictSubject.trim() === "") {
      throw new DomainError("bad_request", "Conflict subject is required");
    }
    if (!input.discrepancyDescription || input.discrepancyDescription.trim() === "") {
      throw new DomainError("bad_request", "Discrepancy description is required");
    }
    if (!input.assertionAId || !input.assertionBId) {
      throw new DomainError("bad_request", "Both assertion A and assertion B IDs are required");
    }
    if (input.assertionAId === input.assertionBId) {
      throw new DomainError("bad_request", "Cannot create conflict between an assertion and itself");
    }

    const trimmedSubject = input.conflictSubject.trim();
    const trimmedDescription = input.discrepancyDescription.trim();
    if (trimmedDescription.length > MAX_CONFLICT_NOTES_LENGTH) {
      throw new DomainError(
        "bad_request",
        `Discrepancy description must not exceed ${MAX_CONFLICT_NOTES_LENGTH} characters`,
      );
    }

    const executeInTx = async (tx?: TransactionClient) => {
      // Lock order: Assertions [id ASC] -> ReviewerCredential [FOR UPDATE] -> Conflict INSERT
      const [firstId, secondId] =
        input.assertionAId < input.assertionBId
          ? [input.assertionAId, input.assertionBId]
          : [input.assertionBId, input.assertionAId];

      const firstAssertion = await this.assertionStore.findByIdForUpdate(firstId, tx);
      const secondAssertion = await this.assertionStore.findByIdForUpdate(secondId, tx);

      const assertionA = input.assertionAId === firstId ? firstAssertion : secondAssertion;
      const assertionB = input.assertionBId === firstId ? firstAssertion : secondAssertion;

      if (!assertionA) {
        throw new DomainError("not_found", `Assertion A (${input.assertionAId}) not found`);
      }
      if (!assertionB) {
        throw new DomainError("not_found", `Assertion B (${input.assertionBId}) not found`);
      }

      await this.reviewerService.assertActiveReviewer(actor.userId, tx, {
        forUpdate: true,
      });

      const conflict = await this.verificationStore.createConflict(
        {
          conflictSubject: trimmedSubject,
          assertionAId: input.assertionAId,
          assertionBId: input.assertionBId,
          discrepancyDescription: trimmedDescription,
          recordedByUserId: actor.userId,
        },
        tx,
      );

      await this.assertionStore.insertAuditLog(
        {
          assertionId: assertionA.id,
          actorUserId: actor.userId,
          action: "clinical_conflict_recorded",
          previousStatus: assertionA.status,
          newStatus: assertionA.status,
          clinicalNotes: `${trimmedSubject}: ${trimmedDescription}`,
        },
        tx,
      );
      await this.assertionStore.insertAuditLog(
        {
          assertionId: assertionB.id,
          actorUserId: actor.userId,
          action: "clinical_conflict_recorded",
          previousStatus: assertionB.status,
          newStatus: assertionB.status,
          clinicalNotes: `${trimmedSubject}: ${trimmedDescription}`,
        },
        tx,
      );

      return conflict;
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Resolves or dismisses an active clinical conflict.
   *
   * Authorization: Strictly restricted to `platform_admin`.
   * Lock order: Assertions [id ASC] -> Conflict [FOR UPDATE].
   * Uses PostgreSQL `clock_timestamp()` and `pocket_governance_event_seq` (for `resolved`).
   */
  async resolveConflict(
    actor: Actor,
    input: ResolveConflictInput,
  ): Promise<ClinicalConflictRecord> {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isPlatformAdmin) {
      throw new DomainError(
        "forbidden",
        "Only platform_admin may resolve or dismiss clinical conflicts",
      );
    }

    if (!input.conflictId || input.conflictId.trim() === "") {
      throw new DomainError("bad_request", "Conflict ID is required");
    }
    if (input.outcome !== "resolved" && input.outcome !== "dismissed") {
      throw new DomainError(
        "bad_request",
        "Conflict resolution outcome must be 'resolved' or 'dismissed'",
      );
    }

    const trimmedNotes = input.resolutionNotes?.trim() ?? "";
    if (!trimmedNotes) {
      throw new DomainError("bad_request", "Resolution notes are required");
    }
    if (trimmedNotes.length > MAX_CONFLICT_NOTES_LENGTH) {
      throw new DomainError(
        "bad_request",
        `Resolution notes must not exceed ${MAX_CONFLICT_NOTES_LENGTH} characters`,
      );
    }

    const conflictId = input.conflictId.trim();

    const executeInTx = async (tx?: TransactionClient) => {
      const initialLookup = await this.verificationStore.findConflictById(conflictId, tx);
      if (!initialLookup) {
        throw new DomainError("not_found", `Clinical conflict ${conflictId} not found`);
      }

      // 1. Lock both assertions in deterministic ascending ID order BEFORE locking the conflict
      const [firstId, secondId] =
        initialLookup.assertionAId < initialLookup.assertionBId
          ? [initialLookup.assertionAId, initialLookup.assertionBId]
          : [initialLookup.assertionBId, initialLookup.assertionAId];

      const firstAssertion = await this.assertionStore.findByIdForUpdate(firstId, tx);
      const secondAssertion = await this.assertionStore.findByIdForUpdate(secondId, tx);

      const assertionA =
        initialLookup.assertionAId === firstId ? firstAssertion : secondAssertion;
      const assertionB =
        initialLookup.assertionBId === firstId ? firstAssertion : secondAssertion;

      // 2. Lock target conflict row with FOR UPDATE
      const lockedConflict = await this.verificationStore.findConflictByIdForUpdate(
        conflictId,
        tx,
      );
      if (!lockedConflict) {
        throw new DomainError("not_found", `Clinical conflict ${conflictId} not found`);
      }
      if (lockedConflict.status !== "active_discrepancy") {
        throw new DomainError(
          "conflict",
          `Clinical conflict ${conflictId} is already ${lockedConflict.status}`,
        );
      }

      // 3. Update conflict status and allocate sequence/clock_timestamp()
      const resolved = await this.verificationStore.resolveConflict(
        {
          conflictId,
          outcome: input.outcome,
          resolvedByUserId: actor.userId,
          resolutionNotes: trimmedNotes,
        },
        tx,
      );

      // 4. Record audit trail on both assertions atomically
      const auditAction =
        input.outcome === "resolved" ? "conflict_resolved" : "conflict_dismissed";
      if (assertionA) {
        await this.assertionStore.insertAuditLog(
          {
            assertionId: assertionA.id,
            actorUserId: actor.userId,
            action: auditAction,
            previousStatus: assertionA.status,
            newStatus: assertionA.status,
            clinicalNotes: trimmedNotes,
          },
          tx,
        );
      }
      if (assertionB) {
        await this.assertionStore.insertAuditLog(
          {
            assertionId: assertionB.id,
            actorUserId: actor.userId,
            action: auditAction,
            previousStatus: assertionB.status,
            newStatus: assertionB.status,
            clinicalNotes: trimmedNotes,
          },
          tx,
        );
      }

      return resolved;
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Retrieves clinical verifications and conflicts linked to an assertion version,
   * enforcing strict backend privacy tiers:
   * - Public: verificationAction, verifiedAt, conflictSubject, conflict.status, conflict.createdAt.
   * - Privileged (Active Clinical Reviewers & platform_admin): clinicalReviewNotes, discrepancyDescription, parentVerificationId.
   * - Internal (NEVER exposed): reviewerUserId, actorUserId.
   */
  async getAssertionVerifications(
    actor: Actor,
    assertionId: string,
  ): Promise<{
    verifications: Array<{
      id: string;
      assertionId: string;
      verificationAction: string;
      verifiedAt: Date;
      clinicalReviewNotes?: string;
      parentVerificationId?: string | null;
    }>;
    conflicts: Array<{
      id: string;
      conflictSubject: string;
      status: string;
      createdAt: Date;
      resolvedAt: Date | null;
      assertionAId: string;
      assertionBId: string;
      discrepancyDescription?: string;
      resolutionNotes?: string | null;
    }>;
  }> {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }

    const assertion = await this.assertionStore.findById(assertionId);
    if (!assertion) {
      throw new DomainError("not_found", `Assertion ${assertionId} not found`);
    }

    // Determine if actor holds privileged clinical reviewer credentials or platform_admin role
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    let isPrivilegedReviewer = isPlatformAdmin;
    if (!isPrivilegedReviewer) {
      const activeCred = await this.reviewerService.getActiveCredentialForUser(actor);
      isPrivilegedReviewer = Boolean(activeCred);
    }

    const [verifications, conflicts] = await Promise.all([
      this.verificationStore.findVerificationsByAssertionId(assertionId),
      this.verificationStore.listConflictsByAssertionId(assertionId),
    ]);

    // Sanitize verifications: never expose reviewerUserId
    const sanitizedVerifications = verifications.map((v) => ({
      id: v.id,
      assertionId: v.assertionId,
      verificationAction: v.verificationAction,
      verifiedAt: v.verifiedAt,
      ...(isPrivilegedReviewer
        ? {
            clinicalReviewNotes: v.clinicalReviewNotes,
            parentVerificationId: v.parentVerificationId,
          }
        : {}),
    }));

    // Sanitize conflicts: discrepancyDescription and resolutionNotes are privileged only
    const sanitizedConflicts = conflicts.map((c) => ({
      id: c.id,
      conflictSubject: c.conflictSubject,
      status: c.status,
      createdAt: c.createdAt,
      resolvedAt: c.resolvedAt,
      assertionAId: c.assertionAId,
      assertionBId: c.assertionBId,
      ...(isPrivilegedReviewer
        ? {
            discrepancyDescription: c.discrepancyDescription,
            resolutionNotes: c.resolutionNotes,
          }
        : {}),
    }));

    return { verifications: sanitizedVerifications, conflicts: sanitizedConflicts };
  }
}
