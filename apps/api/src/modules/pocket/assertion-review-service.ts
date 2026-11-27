/**
 * Clinical Assertion Review Service — Phase 2C-1.
 *
 * Implements the state machine, validation, and audit logging for the
 * scientific assertion review workflow:
 *
 * Transitions:
 * - draft -> in_review (Action: submitted_for_review)
 * - in_review -> reviewed (Action: review_approved)
 * - in_review -> draft (Action: review_rejected / review_changes_requested)
 * - in_review -> draft (Action: review_withdrawn)
 *
 * Invariants:
 * 1. Operation atomicity: Status update and audit log are ALWAYS written in a single ACID transaction.
 * 2. Immutability: Published or superseded assertions can NEVER be submitted, modified, or transitioned.
 * 3. Identity binding: `actorUserId` is strictly derived from the authenticated session context (`actor.userId`).
 * 4. Structural validation: Assertions must satisfy clinical triad arc checks and have non-empty statement text.
 * 5. Rejection feedback: Rejection or change requests strictly require non-empty explanatory notes.
 * 6. Role segregation: Students are strictly forbidden from submitting or reviewing assertions.
 */

import { DomainError, type Actor } from "@avana/domain";
import type { DbClient, TransactionClient } from "@avana/database/client";
import type { ReviewerService } from "./reviewer-service.js";
import type {
  AssertionAuditLogRecord,
  AssertionReviewStore,
  CreateAssertionRecordInput,
  ScientificAssertionRecord,
  ScientificAssertionStatus,
} from "./assertion-review-store.js";

const CONFIDENTIAL_CLINICAL_AUDIT_ACTIONS = new Set([
  "clinical_verified",
  "clinical_verification_rejected",
  "clinical_conflict_recorded",
  "conflict_recorded",
  "conflict_resolved",
  "conflict_dismissed",
]);

export type ReviewDecision = "approve" | "reject" | "request_changes";

export interface SubmitForReviewInput {
  assertionId: string;
  notes?: string;
}

export interface RecordReviewDecisionInput {
  assertionId: string;
  decision: ReviewDecision;
  notes?: string;
}

export interface WithdrawReviewInput {
  assertionId: string;
  reason?: string;
}

export interface AssertionReviewServiceDeps {
  assertionReviewStore: AssertionReviewStore;
  reviewerService?: ReviewerService;
  db?: DbClient;
}

export class AssertionReviewService {
  private readonly store: AssertionReviewStore;
  private readonly reviewerService?: ReviewerService;
  private readonly db?: DbClient;

  constructor(deps: AssertionReviewServiceDeps) {
    this.store = deps.assertionReviewStore;
    this.reviewerService = deps.reviewerService;
    this.db = deps.db;
  }

  /**
   * Fail-closed explicit allowlist authorization for assertion review operations.
   *
   * Allowed actors:
   * 1. platform_admin (`actor.globalRole === "platform_admin"` or `actor.role === "platform_admin"`).
   * 2. Approved teacher (`actor.role === "teacher"` or `actor.globalRole === "teacher"`),
   *    strictly provided `actor.teacherStatus` is neither `"pending"` nor `"rejected"`.
   * 3. Active clinical reviewer verified via `reviewerService.assertActiveReviewer`
   *    (active, unsuspended, unexpired credential in `pocket_clinical_reviewer_credentials`).
   *
   * All other actors (including students with `globalRole: "user"`, missing roles,
   * unapproved teachers, or suspended/expired reviewers) are denied with 403.
   */
  private async assertAuthorizedActor(
    actor: Actor,
    actionDescription: string,
    tx?: TransactionClient,
  ): Promise<void> {
    if (!actor || !actor.userId || typeof actor.userId !== "string" || actor.userId.trim() === "") {
      throw new DomainError("unauthorized", "User identity is required");
    }

    // 1. Platform Admin allowlist
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return;
    }

    // 2. Approved Teacher allowlist (strictly requires explicit teacherStatus === "approved")
    const hasTeacherRole = actor.role === "teacher" || actor.globalRole === "teacher";
    if (hasTeacherRole && actor.teacherStatus === "approved") {
      return;
    }

    // 3. Active Clinical Reviewer Credential allowlist
    if (this.reviewerService) {
      try {
        await this.reviewerService.assertActiveReviewer(actor.userId, tx);
        return;
      } catch {
        // Fall through to fail-closed forbidden error
      }
    }

    const message =
      actor.role === "student"
        ? `Access denied: students cannot ${actionDescription}`
        : `Access denied: actor is not authorized to ${actionDescription}`;

    throw new DomainError("forbidden", message);
  }

  /**
   * Validates that an assertion has valid structural invariants prior to review submission.
   */
  private validateAssertionForSubmission(assertion: ScientificAssertionRecord): void {
    if (!assertion.statementText || assertion.statementText.trim() === "") {
      throw new DomainError(
        "bad_request",
        "Assertion cannot be submitted for review: statement text is empty",
      );
    }

    if (!assertion.assertionKey || assertion.assertionKey.trim() === "") {
      throw new DomainError(
        "bad_request",
        "Assertion cannot be submitted for review: assertion key is required",
      );
    }

    if (!assertion.assertionType || assertion.assertionType.trim() === "") {
      throw new DomainError(
        "bad_request",
        "Assertion cannot be submitted for review: assertion type is required",
      );
    }

    // Arc check: exactly 1 pillar ID must be non-null
    const pillars = [
      assertion.drugId,
      assertion.diseaseId,
      assertion.treatmentId,
      assertion.emergencyId,
    ].filter((p) => p !== null && p !== undefined);

    if (pillars.length !== 1) {
      throw new DomainError(
        "bad_request",
        "Assertion cannot be submitted for review: must be linked to exactly one clinical pillar (drug, disease, treatment, emergency)",
      );
    }
  }

  /**
   * Helper to create a draft assertion (convenience for authors/tests).
   */
  async createDraftAssertion(
    actor: Actor,
    input: CreateAssertionRecordInput,
  ): Promise<ScientificAssertionRecord> {
    await this.assertAuthorizedActor(actor, "create scientific assertions");

    return await this.store.create({
      ...input,
      status: "draft",
    });
  }

  /**
   * Submits an assertion version for peer review.
   *
   * Valid transitions:
   * draft -> in_review
   */
  async submitForReview(
    actor: Actor,
    input: SubmitForReviewInput,
  ): Promise<{ assertion: ScientificAssertionRecord; auditLog: AssertionAuditLogRecord }> {
    if (!input.assertionId || input.assertionId.trim() === "") {
      await this.assertAuthorizedActor(actor, "submit assertion for review");
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const executeInTx = async (tx?: TransactionClient) => {
      await this.assertAuthorizedActor(actor, "submit assertion for review", tx);
      const assertion = await this.store.findById(input.assertionId, tx);
      if (!assertion) {
        throw new DomainError("not_found", `Assertion ${input.assertionId} not found`);
      }

      // Immutability checks
      if (assertion.status === "published") {
        throw new DomainError("forbidden", "Cannot modify or submit a published assertion");
      }
      if (assertion.status === "superseded" || assertion.status === "retired") {
        throw new DomainError("conflict", "Cannot submit a superseded or retired assertion");
      }
      if (assertion.status === "in_review") {
        throw new DomainError("conflict", "Assertion is already in review");
      }
      if (assertion.status !== "draft") {
        throw new DomainError(
          "bad_request",
          `Invalid state transition: cannot submit assertion with status '${assertion.status}' for review`,
        );
      }

      // Validate content invariants
      this.validateAssertionForSubmission(assertion);

      const previousStatus = assertion.status;
      const newStatus: ScientificAssertionStatus = "in_review";

      const updated = await this.store.updateStatus(assertion.id, newStatus, tx);
      const auditLog = await this.store.insertAuditLog(
        {
          assertionId: assertion.id,
          actorUserId: actor.userId,
          action: "submitted_for_review",
          previousStatus,
          newStatus,
          clinicalNotes: input.notes?.trim() || null,
        },
        tx,
      );

      return { assertion: updated, auditLog };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Records a review decision on an assertion currently in review.
   *
   * Valid transitions:
   * in_review -> reviewed (decision: approve)
   * in_review -> draft    (decision: reject / request_changes)
   */
  async recordReviewDecision(
    actor: Actor,
    input: RecordReviewDecisionInput,
  ): Promise<{ assertion: ScientificAssertionRecord; auditLog: AssertionAuditLogRecord }> {
    if (!input.assertionId || input.assertionId.trim() === "") {
      await this.assertAuthorizedActor(actor, "record review decision");
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const validDecisions: ReviewDecision[] = ["approve", "reject", "request_changes"];
    if (!validDecisions.includes(input.decision)) {
      await this.assertAuthorizedActor(actor, "record review decision");
      throw new DomainError(
        "bad_request",
        `Invalid review decision: '${input.decision}'. Must be one of: approve, reject, request_changes`,
      );
    }

    // Explanatory feedback is strictly required when rejecting or requesting changes
    if (
      (input.decision === "reject" || input.decision === "request_changes") &&
      (!input.notes || input.notes.trim() === "")
    ) {
      await this.assertAuthorizedActor(actor, "record review decision");
      throw new DomainError(
        "bad_request",
        "Clinical review notes explaining the rejection or requested changes are required",
      );
    }

    const executeInTx = async (tx?: TransactionClient) => {
      await this.assertAuthorizedActor(actor, "record review decision", tx);
      const assertion = await this.store.findById(input.assertionId, tx);
      if (!assertion) {
        throw new DomainError("not_found", `Assertion ${input.assertionId} not found`);
      }

      // Immutability checks
      if (assertion.status === "published") {
        throw new DomainError("forbidden", "Cannot review or modify a published assertion");
      }
      if (assertion.status === "superseded" || assertion.status === "retired") {
        throw new DomainError("conflict", "Cannot review a superseded or retired assertion");
      }
      if (assertion.status !== "in_review") {
        throw new DomainError(
          "bad_request",
          `Invalid state transition: assertion must be 'in_review' to record a review decision (current: '${assertion.status}')`,
        );
      }

      let newStatus: ScientificAssertionStatus;
      let action: string;

      switch (input.decision) {
        case "approve":
          newStatus = "reviewed";
          action = "review_approved";
          break;
        case "reject":
          newStatus = "draft";
          action = "review_rejected";
          break;
        case "request_changes":
          newStatus = "draft";
          action = "review_changes_requested";
          break;
      }

      const updated = await this.store.updateStatus(assertion.id, newStatus, tx);
      const auditLog = await this.store.insertAuditLog(
        {
          assertionId: assertion.id,
          actorUserId: actor.userId,
          action,
          previousStatus: assertion.status,
          newStatus,
          clinicalNotes: input.notes?.trim() || null,
        },
        tx,
      );

      return { assertion: updated, auditLog };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Withdraws an in-review assertion back to draft status.
   *
   * Valid transitions:
   * in_review -> draft
   */
  async withdrawReview(
    actor: Actor,
    input: WithdrawReviewInput,
  ): Promise<{ assertion: ScientificAssertionRecord; auditLog: AssertionAuditLogRecord }> {
    if (!input.assertionId || input.assertionId.trim() === "") {
      await this.assertAuthorizedActor(actor, "withdraw review request");
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const executeInTx = async (tx?: TransactionClient) => {
      await this.assertAuthorizedActor(actor, "withdraw review request", tx);
      const assertion = await this.store.findById(input.assertionId, tx);
      if (!assertion) {
        throw new DomainError("not_found", `Assertion ${input.assertionId} not found`);
      }

      if (assertion.status !== "in_review") {
        throw new DomainError(
          "bad_request",
          `Cannot withdraw review: assertion is not in review (current: '${assertion.status}')`,
        );
      }

      const newStatus: ScientificAssertionStatus = "draft";
      const updated = await this.store.updateStatus(assertion.id, newStatus, tx);
      const auditLog = await this.store.insertAuditLog(
        {
          assertionId: assertion.id,
          actorUserId: actor.userId,
          action: "review_withdrawn",
          previousStatus: assertion.status,
          newStatus,
          clinicalNotes: input.reason?.trim() || null,
        },
        tx,
      );

      return { assertion: updated, auditLog };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Determines whether the authenticated actor is privileged to view confidential
   * clinical verification/conflict audit details (`clinicalNotes` and `actorUserId`).
   *
   * Matches `AssertionVerificationService.getAssertionVerifications`:
   * - `platform_admin`
   * - Active clinical reviewer with a valid, unsuspended, unexpired credential
   */
  private async hasPrivilegedClinicalHistoryAccess(actor: Actor): Promise<boolean> {
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return true;
    }

    if (this.reviewerService) {
      try {
        await this.reviewerService.assertActiveReviewer(actor.userId);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Retrieves an assertion along with its audit trail, redacting confidential
   * clinical verification/conflict notes and reviewer identities for actors
   * without privileged clinical access (e.g. approved teachers without credential).
   */
  async getAssertionWithHistory(
    actor: Actor,
    assertionId: string,
  ): Promise<{ assertion: ScientificAssertionRecord; history: AssertionAuditLogRecord[] }> {
    await this.assertAuthorizedActor(actor, "view assertion history");

    if (!assertionId || assertionId.trim() === "") {
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const assertion = await this.store.findById(assertionId);
    if (!assertion) {
      throw new DomainError("not_found", `Assertion ${assertionId} not found`);
    }

    const rawHistory = await this.store.listAuditLogsByAssertionId(assertionId);
    const canViewClinicalDetails = await this.hasPrivilegedClinicalHistoryAccess(actor);

    const history = canViewClinicalDetails
      ? rawHistory
      : rawHistory.map((entry) =>
          CONFIDENTIAL_CLINICAL_AUDIT_ACTIONS.has(entry.action)
            ? {
                ...entry,
                actorUserId: null,
                clinicalNotes: null,
              }
            : entry,
        );

    return { assertion, history };
  }
}
