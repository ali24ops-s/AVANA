/**
 * Clinical Reviewer Governance Service.
 *
 * Enforces authorization, lifecycle rules, and credential verification for
 * AVANA Pocket clinical reviewers according to:
 * - AVANA Pocket Architecture Revision v2.0 (Final Freeze)
 * - TDD v1.3 (Decision-01: Independent Clinical Reviewer Role & Governance)
 *
 * Guarantees:
 * 1. Only platform_admin may grant, suspend, or revoke credentials.
 * 2. Clinical reviewer status is strictly derived from `pocket_clinical_reviewer_credentials`,
 *    never from public generic roles (student, teacher, etc.).
 * 3. Identity is strictly bound to `actor.userId` (from authenticated session/JWT context).
 *    Never relies on GUC in shared connection pools.
 * 4. `assertActiveReviewer` validates active status, absence of suspension, and non-expired license.
 */

import { DomainError, type Actor } from "@avana/domain";
import type { DbClient, TransactionClient } from "@avana/database/client";
import type {
  ClinicalReviewerCredential,
  ListCredentialsOptions,
  ReviewerCredentialEventRecord,
  ReviewerStore,
} from "./reviewer-store.js";

const MAX_CREDENTIAL_REASON_LENGTH = 1000;

function normalizeOptionalReason(reason?: string): string | null {
  if (typeof reason !== "string") {
    return null;
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_CREDENTIAL_REASON_LENGTH) {
    throw new DomainError(
      "bad_request",
      `Reason must not exceed ${MAX_CREDENTIAL_REASON_LENGTH} characters`,
    );
  }
  return trimmed;
}

function requireValidReason(reason: string | undefined, actionLabel: string): string {
  const normalized = normalizeOptionalReason(reason);
  if (!normalized) {
    throw new DomainError("bad_request", `${actionLabel} reason is required`);
  }
  return normalized;
}

export interface GrantCredentialInput {
  userId: string;
  medicalLicenseNumber: string;
  specialty: string;
  licensingAuthority: string;
  licenseExpiresAt: Date | string;
  reason?: string;
}

export interface SuspendCredentialServiceInput {
  credentialId: string;
  reason: string;
}

export interface ReactivateCredentialServiceInput {
  credentialId: string;
  reason?: string;
}

export interface RevokeCredentialServiceInput {
  credentialId: string;
  reason: string;
}

export interface ReviewerServiceDeps {
  reviewerStore: ReviewerStore;
  db?: DbClient;
}

export class ReviewerService {
  private readonly store: ReviewerStore;
  private readonly db?: DbClient;

  constructor(deps: ReviewerServiceDeps) {
    this.store = deps.reviewerStore;
    this.db = deps.db;
  }

  /**
   * Helper to verify if the actor holds the platform_admin role.
   * Credential lifecycle mutations are strictly reserved for platform_admin.
   */
  private assertPlatformAdmin(actor: Actor, actionDescription: string): void {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isPlatformAdmin) {
      throw new DomainError(
        "forbidden",
        `Only platform_admin may ${actionDescription}`,
      );
    }
  }

  /**
   * Central validation method for clinical operations.
   *
   * Verifies that the specified user currently possesses an active, valid clinical
   * reviewer credential:
   * 1. A credential record exists for the user.
   * 2. is_active === true.
   * 3. suspended_at IS NULL.
   * 4. license_expires_at > current time.
   *
   * Throws DomainError("forbidden") if any condition is not met.
   */
  async assertActiveReviewer(
    userId: string,
    tx?: TransactionClient,
    options?: { forUpdate?: boolean },
  ): Promise<ClinicalReviewerCredential> {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new DomainError("unauthorized", "User identity is required for reviewer validation");
    }

    const activeCredential = options?.forUpdate
      ? await this.store.findActiveByUserIdForUpdate(userId, tx)
      : await this.store.findActiveByUserId(userId, tx);
    if (!activeCredential) {
      throw new DomainError(
        "forbidden",
        "User lacks active clinical reviewer credentials",
      );
    }

    if (activeCredential.revokedAt !== null) {
      throw new DomainError(
        "forbidden",
        "Clinical reviewer credential has been permanently revoked",
      );
    }

    if (!activeCredential.isActive) {
      throw new DomainError(
        "forbidden",
        "Clinical reviewer credential is inactive",
      );
    }

    if (activeCredential.suspendedAt !== null) {
      throw new DomainError(
        "forbidden",
        `Clinical reviewer credential is suspended: ${activeCredential.suspensionReason ?? "No reason specified"}`,
      );
    }

    const now = Date.now();
    const expiresAt = activeCredential.licenseExpiresAt.getTime();
    if (expiresAt <= now) {
      throw new DomainError(
        "forbidden",
        "Clinical reviewer medical license has expired",
      );
    }

    return activeCredential;
  }

  /**
   * Grant a clinical reviewer credential to a user.
   *
   * Authorization: Only platform_admin.
   * Invariants:
   * - At most one active credential per user (partial unique constraint).
   * - Expiration date must be strictly in the future.
   * - `grantedBy` is explicitly bound to authenticated actor.userId.
   */
  async grantCredential(
    actor: Actor,
    input: GrantCredentialInput,
  ): Promise<ClinicalReviewerCredential> {
    this.assertPlatformAdmin(actor, "grant clinical reviewer credentials");

    if (!input.userId || typeof input.userId !== "string" || input.userId.trim() === "") {
      throw new DomainError("bad_request", "Target user ID is required");
    }
    if (!input.medicalLicenseNumber || input.medicalLicenseNumber.trim() === "") {
      throw new DomainError("bad_request", "Medical license number is required");
    }
    if (!input.specialty || input.specialty.trim() === "") {
      throw new DomainError("bad_request", "Medical specialty is required");
    }
    if (!input.licensingAuthority || input.licensingAuthority.trim() === "") {
      throw new DomainError("bad_request", "Licensing authority is required");
    }

    const expiresAt =
      input.licenseExpiresAt instanceof Date
        ? input.licenseExpiresAt
        : new Date(input.licenseExpiresAt);

    if (isNaN(expiresAt.getTime())) {
      throw new DomainError("bad_request", "Invalid license expiration date");
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new DomainError(
        "bad_request",
        "License expiration date must be in the future",
      );
    }

    const normalizedReason = normalizeOptionalReason(input.reason);
    const record = {
      userId: input.userId.trim(),
      medicalLicenseNumber: input.medicalLicenseNumber.trim(),
      specialty: input.specialty.trim(),
      licensingAuthority: input.licensingAuthority.trim(),
      grantedBy: actor.userId,
      licenseExpiresAt: expiresAt,
    };

    const runGrant = async (tx?: TransactionClient): Promise<ClinicalReviewerCredential> => {
      const existingActive = await this.store.findActiveByUserId(record.userId, tx);
      if (existingActive) {
        throw new DomainError(
          "conflict",
          `User ${input.userId} already has an active clinical reviewer credential`,
        );
      }
      const created = await this.store.create(record, tx);
      await this.store.insertEvent(
        {
          credentialId: created.id,
          actorUserId: actor.userId,
          eventType: "granted",
          reason: normalizedReason,
        },
        tx,
      );
      return created;
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(runGrant);
    }

    return await runGrant();
  }

  /**
   * Suspend an active credential with a documented clinical or administrative reason.
   *
   * Authorization: Only platform_admin.
   */
  async suspendCredential(
    actor: Actor,
    input: SuspendCredentialServiceInput,
  ): Promise<ClinicalReviewerCredential> {
    this.assertPlatformAdmin(actor, "suspend clinical reviewer credentials");

    if (!input.credentialId || input.credentialId.trim() === "") {
      throw new DomainError("bad_request", "Credential ID is required");
    }
    const normalizedReason = requireValidReason(input.reason, "Suspension");

    const record = {
      id: input.credentialId.trim(),
      suspensionReason: normalizedReason,
      suspendedAt: new Date(),
    };

    const runSuspend = async (tx?: TransactionClient): Promise<ClinicalReviewerCredential> => {
      const existing = await this.store.findByIdForUpdate(record.id, tx);
      if (!existing) {
        throw new DomainError("not_found", "Clinical reviewer credential not found");
      }
      if (existing.revokedAt !== null) {
        throw new DomainError("conflict", "Cannot suspend a revoked credential");
      }
      if (!existing.isActive || existing.suspendedAt !== null) {
        throw new DomainError("conflict", "Credential is already suspended");
      }

      const updated = await this.store.suspend(record, tx);
      await this.store.insertEvent(
        {
          credentialId: updated.id,
          actorUserId: actor.userId,
          eventType: "suspended",
          reason: normalizedReason,
        },
        tx,
      );
      return updated;
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(runSuspend);
    }

    return await runSuspend();
  }

  /**
   * Reactivate a temporarily suspended credential (if not revoked and not expired).
   *
   * Authorization: Only platform_admin.
   */
  async reactivateCredential(
    actor: Actor,
    input: ReactivateCredentialServiceInput,
  ): Promise<ClinicalReviewerCredential> {
    this.assertPlatformAdmin(actor, "reactivate clinical reviewer credentials");

    if (!input.credentialId || input.credentialId.trim() === "") {
      throw new DomainError("bad_request", "Credential ID is required");
    }
    const normalizedReason = normalizeOptionalReason(input.reason);
    const credentialId = input.credentialId.trim();

    const runReactivate = async (tx?: TransactionClient): Promise<ClinicalReviewerCredential> => {
      const existing = await this.store.findByIdForUpdate(credentialId, tx);
      if (!existing) {
        throw new DomainError("not_found", "Clinical reviewer credential not found");
      }
      if (existing.revokedAt !== null) {
        throw new DomainError("conflict", "Revoked credentials cannot be reactivated");
      }
      if (existing.isActive && existing.suspendedAt === null) {
        throw new DomainError("conflict", "Credential is already active");
      }
      if (existing.licenseExpiresAt.getTime() <= Date.now()) {
        throw new DomainError("conflict", "Cannot reactivate an expired credential");
      }

      const otherActive = await this.store.findActiveByUserId(existing.userId, tx);
      if (otherActive && otherActive.id !== existing.id) {
        throw new DomainError(
          "conflict",
          `User ${existing.userId} already has an active clinical reviewer credential`,
        );
      }

      const updated = await this.store.reactivate(
        { id: credentialId, reactivatedAt: new Date() },
        tx,
      );
      await this.store.insertEvent(
        {
          credentialId: updated.id,
          actorUserId: actor.userId,
          eventType: "reactivated",
          reason: normalizedReason,
        },
        tx,
      );
      return updated;
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(runReactivate);
    }

    return await runReactivate();
  }

  /**
   * Permanently revoke a clinical reviewer credential. Irreversible.
   *
   * Authorization: Only platform_admin.
   */
  async revokeCredential(
    actor: Actor,
    input: RevokeCredentialServiceInput,
  ): Promise<ClinicalReviewerCredential> {
    this.assertPlatformAdmin(actor, "revoke clinical reviewer credentials");

    if (!input.credentialId || input.credentialId.trim() === "") {
      throw new DomainError("bad_request", "Credential ID is required");
    }
    const normalizedReason = requireValidReason(input.reason, "Revocation");

    const record = {
      id: input.credentialId.trim(),
      revokedBy: actor.userId,
      reason: normalizedReason,
      revokedAt: new Date(),
    };

    const runRevoke = async (tx?: TransactionClient): Promise<ClinicalReviewerCredential> => {
      const existing = await this.store.findByIdForUpdate(record.id, tx);
      if (!existing) {
        throw new DomainError("not_found", "Clinical reviewer credential not found");
      }
      if (existing.revokedAt !== null) {
        throw new DomainError("conflict", "Credential is already revoked");
      }

      const updated = await this.store.revoke(record, tx);
      await this.store.insertEvent(
        {
          credentialId: updated.id,
          actorUserId: actor.userId,
          eventType: "revoked",
          reason: normalizedReason,
        },
        tx,
      );
      return updated;
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(runRevoke);
    }

    return await runRevoke();
  }

  /**
   * List append-only lifecycle events for a credential.
   *
   * Authorization: Only platform_admin.
   */
  async listCredentialEvents(
    actor: Actor,
    credentialId: string,
  ): Promise<ReviewerCredentialEventRecord[]> {
    this.assertPlatformAdmin(actor, "view clinical reviewer credential events");

    if (!credentialId || credentialId.trim() === "") {
      throw new DomainError("bad_request", "Credential ID is required");
    }

    const cred = await this.store.findById(credentialId.trim());
    if (!cred) {
      throw new DomainError("not_found", "Clinical reviewer credential not found");
    }

    return await this.store.listEventsByCredentialId(cred.id);
  }

  /**
   * Fetch credential details by ID.
   *
   * Authorization:
   * - platform_admin can view any credential.
   * - Non-admin users can ONLY view their own credential records.
   */
  async getCredential(actor: Actor, credentialId: string): Promise<ClinicalReviewerCredential> {
    const cred = await this.store.findById(credentialId);
    if (!cred) {
      throw new DomainError("not_found", "Clinical reviewer credential not found");
    }

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isPlatformAdmin && cred.userId !== actor.userId) {
      throw new DomainError(
        "forbidden",
        "Access denied to clinical reviewer credential details",
      );
    }

    return cred;
  }

  /**
   * List credentials.
   *
   * Authorization:
   * - platform_admin can list all credentials or filter by any user.
   * - Non-admin users are strictly restricted to listing only their own credentials.
   */
  async listCredentials(
    actor: Actor,
    options?: ListCredentialsOptions,
  ): Promise<ClinicalReviewerCredential[]> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    if (!isPlatformAdmin) {
      // Non-admins cannot inspect credentials of other users
      if (options?.userId && options.userId !== actor.userId) {
        throw new DomainError(
          "forbidden",
          "Access denied: cannot inspect credentials of other users",
        );
      }
      return await this.store.listByUserId(actor.userId);
    }

    if (options?.userId) {
      return await this.store.listByUserId(options.userId);
    }

    return await this.store.listAll(options);
  }

  /**
   * Non-throwing inquiry of active reviewer credential for the caller or specified user.
   */
  async getActiveCredentialForUser(
    actor: Actor,
    targetUserId?: string,
  ): Promise<ClinicalReviewerCredential | null> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    const effectiveTargetId = targetUserId ?? actor.userId;

    if (!isPlatformAdmin && effectiveTargetId !== actor.userId) {
      throw new DomainError(
        "forbidden",
        "Access denied to reviewer status of other users",
      );
    }

    const cred = await this.store.findActiveByUserId(effectiveTargetId);
    if (!cred) {
      return null;
    }

    // Check expiration, revocation, and suspension
    if (
      !cred.isActive ||
      cred.revokedAt !== null ||
      cred.suspendedAt !== null ||
      cred.licenseExpiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    return cred;
  }
}
