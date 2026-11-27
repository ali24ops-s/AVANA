/**
 * AVANA Pocket — Assertion Verification Store Interface & In-Memory Implementation.
 *
 * Implements Phase 2C-2 (Clinical Verification Engine) persistence contracts
 * for `pocket_assertion_verifications` and `pocket_clinical_conflicts`.
 */

import { DomainError } from "@avana/domain";
import type { TransactionClient } from "@avana/database/client";

export type ConflictStatus = "active_discrepancy" | "resolved" | "dismissed";
export type ResolveConflictOutcome = "resolved" | "dismissed";

export interface AssertionVerificationRecord {
  id: string;
  assertionId: string;
  reviewerUserId: string;
  verificationAction: string;
  clinicalReviewNotes: string;
  parentVerificationId: string | null;
  verifiedAt: Date;
  verificationSeq?: number | null;
}

export interface CreateAssertionVerificationInput {
  id?: string;
  assertionId: string;
  reviewerUserId: string;
  verificationAction: string;
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
  verifiedAt?: Date;
}

export interface ClinicalConflictRecord {
  id: string;
  conflictSubject: string;
  assertionAId: string;
  assertionBId: string;
  discrepancyDescription: string;
  status: string;
  recordedByUserId: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  resolutionSeq: number | null;
  createdAt: Date;
}

export interface CreateClinicalConflictInput {
  id?: string;
  conflictSubject: string;
  assertionAId: string;
  assertionBId: string;
  discrepancyDescription: string;
  recordedByUserId?: string | null;
  status?: ConflictStatus;
}

export interface ResolveClinicalConflictInput {
  conflictId: string;
  outcome: ResolveConflictOutcome;
  resolvedByUserId: string;
  resolutionNotes: string;
  resolvedAt?: Date;
}

export interface ResolvedConflictCutoff {
  resolvedAt: Date;
  resolutionSeq: number | null;
}

export interface AssertionVerificationStore {
  /**
   * Create an official clinical verification record in `pocket_assertion_verifications`.
   */
  createVerification(
    input: CreateAssertionVerificationInput,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord>;

  /**
   * Find a verification record by its unique ID.
   */
  findVerificationById(
    id: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord | null>;

  /**
   * List all clinical verifications associated with a specific assertion version.
   */
  findVerificationsByAssertionId(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord[]>;

  /**
   * Find the latest verification by a specific reviewer for an assertion version,
   * ordered deterministically by (verifiedAt DESC, id DESC).
   */
  findVerificationByReviewerAndAssertion(
    reviewerUserId: string,
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord | null>;

  /**
   * Explicit alias for finding the latest verification in a reviewer's chain
   * for an assertion, ordered deterministically by (verifiedAt DESC, id DESC).
   */
  findLatestVerificationByReviewerAndAssertion(
    reviewerUserId: string,
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord | null>;

  /**
   * Check whether a verification record already has a child verification
   * referencing it via parentVerificationId.
   */
  hasChildVerification(
    parentVerificationId: string,
    tx?: TransactionClient,
  ): Promise<boolean>;

  /**
   * Record a clinical conflict / discrepancy between two assertions.
   */
  createConflict(
    input: CreateClinicalConflictInput,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord>;

  /**
   * List all conflicts involving an assertion (as assertion A or assertion B).
   */
  listConflictsByAssertionId(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord[]>;

  /**
   * Find a clinical conflict by ID.
   */
  findConflictById(
    conflictId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord | null>;

  /**
   * Find and row-lock a clinical conflict by ID (`SELECT ... FOR UPDATE`).
   */
  findConflictByIdForUpdate(
    conflictId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord | null>;

  /**
   * Transition an active conflict to 'resolved' or 'dismissed'.
   */
  resolveConflict(
    input: ResolveClinicalConflictInput,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord>;

  /**
   * Get the latest 'resolved' conflict cutoff (MAX resolution_seq / resolved_at)
   * involving the specified assertion, or null if none exist.
   */
  getLatestResolvedConflictCutoff(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<ResolvedConflictCutoff | null>;
}

/**
 * In-memory implementation of AssertionVerificationStore for unit tests and local isolation.
 */
export class InMemoryAssertionVerificationStore implements AssertionVerificationStore {
  private readonly verifications = new Map<string, AssertionVerificationRecord>();
  private readonly conflicts = new Map<string, ClinicalConflictRecord>();
  private eventSeq = 0;

  async createVerification(
    input: CreateAssertionVerificationInput,
  ): Promise<AssertionVerificationRecord> {
    const id = input.id ?? `verif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let now = input.verifiedAt ?? new Date();
    if (!input.verifiedAt) {
      for (const existing of this.verifications.values()) {
        if (
          existing.assertionId === input.assertionId &&
          existing.reviewerUserId === input.reviewerUserId &&
          existing.verifiedAt.getTime() >= now.getTime()
        ) {
          now = new Date(existing.verifiedAt.getTime() + 1);
        }
      }
    }
    this.eventSeq += 1;

    const record: AssertionVerificationRecord = {
      id,
      assertionId: input.assertionId,
      reviewerUserId: input.reviewerUserId,
      verificationAction: input.verificationAction,
      clinicalReviewNotes: input.clinicalReviewNotes,
      parentVerificationId: input.parentVerificationId ?? null,
      verifiedAt: now,
      verificationSeq: this.eventSeq,
    };

    this.verifications.set(id, record);
    return { ...record };
  }

  async findVerificationById(id: string): Promise<AssertionVerificationRecord | null> {
    const record = this.verifications.get(id);
    return record ? { ...record } : null;
  }

  async findVerificationsByAssertionId(
    assertionId: string,
  ): Promise<AssertionVerificationRecord[]> {
    const results: AssertionVerificationRecord[] = [];
    for (const v of this.verifications.values()) {
      if (v.assertionId === assertionId) {
        results.push({ ...v });
      }
    }
    return results.sort(
      (a, b) =>
        b.verifiedAt.getTime() - a.verifiedAt.getTime() ||
        b.id.localeCompare(a.id),
    );
  }

  async findVerificationByReviewerAndAssertion(
    reviewerUserId: string,
    assertionId: string,
  ): Promise<AssertionVerificationRecord | null> {
    const matches: AssertionVerificationRecord[] = [];
    for (const v of this.verifications.values()) {
      if (v.reviewerUserId === reviewerUserId && v.assertionId === assertionId) {
        matches.push({ ...v });
      }
    }
    if (matches.length === 0) {
      return null;
    }
    matches.sort(
      (a, b) =>
        b.verifiedAt.getTime() - a.verifiedAt.getTime() ||
        b.id.localeCompare(a.id),
    );
    return matches[0];
  }

  async findLatestVerificationByReviewerAndAssertion(
    reviewerUserId: string,
    assertionId: string,
  ): Promise<AssertionVerificationRecord | null> {
    return this.findVerificationByReviewerAndAssertion(reviewerUserId, assertionId);
  }

  async hasChildVerification(
    parentVerificationId: string,
  ): Promise<boolean> {
    for (const v of this.verifications.values()) {
      if (v.parentVerificationId === parentVerificationId) {
        return true;
      }
    }
    return false;
  }

  async createConflict(input: CreateClinicalConflictInput): Promise<ClinicalConflictRecord> {
    if (input.assertionAId === input.assertionBId) {
      throw new DomainError("bad_request", "Cannot create a conflict between an assertion and itself");
    }

    const status = input.status ?? "active_discrepancy";
    if (status === "active_discrepancy") {
      const [lowId, highId] =
        input.assertionAId < input.assertionBId
          ? [input.assertionAId, input.assertionBId]
          : [input.assertionBId, input.assertionAId];

      for (const existing of this.conflicts.values()) {
        if (existing.status !== "active_discrepancy") continue;
        const [exLow, exHigh] =
          existing.assertionAId < existing.assertionBId
            ? [existing.assertionAId, existing.assertionBId]
            : [existing.assertionBId, existing.assertionAId];
        if (exLow === lowId && exHigh === highId) {
          throw new DomainError(
            "conflict",
            "An active clinical conflict already exists between these assertions",
          );
        }
      }
    }

    const id = input.id ?? `conf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const record: ClinicalConflictRecord = {
      id,
      conflictSubject: input.conflictSubject,
      assertionAId: input.assertionAId,
      assertionBId: input.assertionBId,
      discrepancyDescription: input.discrepancyDescription,
      status,
      recordedByUserId: input.recordedByUserId ?? null,
      resolvedByUserId: null,
      resolvedAt: null,
      resolutionNotes: null,
      resolutionSeq: null,
      createdAt: new Date(),
    };

    this.conflicts.set(id, record);
    return { ...record };
  }

  async listConflictsByAssertionId(assertionId: string): Promise<ClinicalConflictRecord[]> {
    const results: ClinicalConflictRecord[] = [];
    for (const c of this.conflicts.values()) {
      if (c.assertionAId === assertionId || c.assertionBId === assertionId) {
        results.push({ ...c });
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findConflictById(conflictId: string): Promise<ClinicalConflictRecord | null> {
    const c = this.conflicts.get(conflictId);
    return c ? { ...c } : null;
  }

  async findConflictByIdForUpdate(conflictId: string): Promise<ClinicalConflictRecord | null> {
    return this.findConflictById(conflictId);
  }

  async resolveConflict(input: ResolveClinicalConflictInput): Promise<ClinicalConflictRecord> {
    const c = this.conflicts.get(input.conflictId);
    if (!c) {
      throw new DomainError("not_found", `Clinical conflict ${input.conflictId} not found`);
    }
    if (c.status !== "active_discrepancy") {
      throw new DomainError("conflict", `Clinical conflict ${input.conflictId} is already ${c.status}`);
    }

    const resolvedAt = input.resolvedAt ?? new Date();
    let resolutionSeq: number | null = null;
    if (input.outcome === "resolved") {
      this.eventSeq += 1;
      resolutionSeq = this.eventSeq;
    }

    const updated: ClinicalConflictRecord = {
      ...c,
      status: input.outcome,
      resolvedByUserId: input.resolvedByUserId,
      resolvedAt,
      resolutionNotes: input.resolutionNotes,
      resolutionSeq,
    };
    this.conflicts.set(c.id, updated);
    return { ...updated };
  }

  async getLatestResolvedConflictCutoff(
    assertionId: string,
  ): Promise<ResolvedConflictCutoff | null> {
    let latest: ResolvedConflictCutoff | null = null;
    for (const c of this.conflicts.values()) {
      if (
        c.status === "resolved" &&
        c.resolvedAt !== null &&
        (c.assertionAId === assertionId || c.assertionBId === assertionId)
      ) {
        if (!latest) {
          latest = { resolvedAt: c.resolvedAt, resolutionSeq: c.resolutionSeq };
        } else if (
          c.resolutionSeq !== null &&
          latest.resolutionSeq !== null &&
          c.resolutionSeq > latest.resolutionSeq
        ) {
          latest = { resolvedAt: c.resolvedAt, resolutionSeq: c.resolutionSeq };
        } else if (c.resolvedAt.getTime() > latest.resolvedAt.getTime()) {
          latest = { resolvedAt: c.resolvedAt, resolutionSeq: c.resolutionSeq };
        }
      }
    }
    return latest;
  }
}
