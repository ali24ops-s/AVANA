/**
 * Clinical Reviewer Governance Store Interface.
 *
 * Defines the contract for persisting and retrieving clinical reviewer credentials
 * in accordance with AVANA Pocket Architecture Revision v2.0 (Final Freeze)
 * and Migration 0107_pocket_core.ts (pocket_clinical_reviewer_credentials).
 */

import { randomUUID } from "node:crypto";
import { DomainError } from "@avana/domain";
import type { TransactionClient } from "@avana/database/client";

export type CredentialLifecycleStatus = "active" | "suspended" | "revoked";
export type CredentialValidityStatus = "valid" | "expired";
export type ReviewerCredentialEventType = "granted" | "suspended" | "reactivated" | "revoked";

export interface ReviewerCredentialEventRecord {
  id: string;
  credentialId: string;
  actorUserId: string;
  eventType: ReviewerCredentialEventType;
  reason: string | null;
  createdAt: Date;
}

export interface CreateReviewerCredentialEventInput {
  id?: string;
  credentialId: string;
  actorUserId: string;
  eventType: ReviewerCredentialEventType;
  reason?: string | null;
}

export interface ClinicalReviewerCredential {
  id: string;
  userId: string;
  medicalLicenseNumber: string;
  specialty: string;
  licensingAuthority: string;
  isActive: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: string | null;
  grantedBy: string;
  grantedAt: Date;
  licenseExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lifecycleStatus: CredentialLifecycleStatus;
  validityStatus: CredentialValidityStatus;
  isLegacyStatusAmbiguous: boolean;
}

export function deriveCredentialLifecycleStatus(params: {
  isActive: boolean;
  suspendedAt: Date | null;
  revokedAt: Date | null;
}): CredentialLifecycleStatus {
  if (params.revokedAt !== null) {
    return "revoked";
  }
  if (!params.isActive || params.suspendedAt !== null) {
    return "suspended";
  }
  return "active";
}

export function deriveCredentialValidityStatus(
  licenseExpiresAt: Date,
  now: Date = new Date(),
): CredentialValidityStatus {
  return licenseExpiresAt.getTime() <= now.getTime() ? "expired" : "valid";
}

export function isLegacyCredentialStatusAmbiguous(params: {
  isActive: boolean;
  suspendedAt: Date | null;
  revokedAt: Date | null;
  hasRecordedSuspendEvent: boolean;
}): boolean {
  return (
    params.revokedAt === null &&
    (!params.isActive || params.suspendedAt !== null) &&
    !params.hasRecordedSuspendEvent
  );
}

export interface CreateCredentialRecord {
  id?: string;
  userId: string;
  medicalLicenseNumber: string;
  specialty: string;
  licensingAuthority: string;
  grantedBy: string;
  licenseExpiresAt: Date;
}

export interface SuspendCredentialRecord {
  id: string;
  suspensionReason: string;
  suspendedAt?: Date;
}

export interface ReactivateCredentialRecord {
  id: string;
  reactivatedAt?: Date;
}

export interface RevokeCredentialRecord {
  id: string;
  revokedBy: string;
  reason: string;
  revokedAt?: Date;
}

export interface ListCredentialsOptions {
  userId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface ReviewerStore {
  /**
   * Find the currently active credential for a user.
   * By definition and unique constraint `uq_pocket_active_reviewer`,
   * a user can have at most one active credential.
   */
  findActiveByUserId(userId: string, tx?: TransactionClient): Promise<ClinicalReviewerCredential | null>;

  /**
   * Find and row-lock the currently active credential for a user inside a
   * transaction (`SELECT ... FOR UPDATE`).
   */
  findActiveByUserIdForUpdate(userId: string, tx?: TransactionClient): Promise<ClinicalReviewerCredential | null>;

  /**
   * Find a credential by its unique primary key ID.
   */
  findById(id: string, tx?: TransactionClient): Promise<ClinicalReviewerCredential | null>;

  /**
   * Find and row-lock a credential by ID inside a transaction (`SELECT ... FOR UPDATE`).
   */
  findByIdForUpdate(id: string, tx?: TransactionClient): Promise<ClinicalReviewerCredential | null>;

  /**
   * List all historical and active credentials for a specific user.
   */
  listByUserId(userId: string, tx?: TransactionClient): Promise<ClinicalReviewerCredential[]>;

  /**
   * List credentials with optional filtering.
   */
  listAll(options?: ListCredentialsOptions, tx?: TransactionClient): Promise<ClinicalReviewerCredential[]>;

  /**
   * Create a new active reviewer credential.
   */
  create(record: CreateCredentialRecord, tx?: TransactionClient): Promise<ClinicalReviewerCredential>;

  /**
   * Suspend an active credential. Sets isActive = false, suspendedAt = now, suspensionReason.
   */
  suspend(record: SuspendCredentialRecord, tx?: TransactionClient): Promise<ClinicalReviewerCredential>;

  /**
   * Reactivate a suspended credential. Sets isActive = true, suspendedAt = null, suspensionReason = null.
   */
  reactivate(record: ReactivateCredentialRecord, tx?: TransactionClient): Promise<ClinicalReviewerCredential>;

  /**
   * Permanently revoke a credential. Sets isActive = false, revokedAt = now, revokedBy, revocationReason.
   */
  revoke(record: RevokeCredentialRecord, tx?: TransactionClient): Promise<ClinicalReviewerCredential>;

  /**
   * Insert an append-only credential lifecycle event.
   */
  insertEvent(
    event: CreateReviewerCredentialEventInput,
    tx?: TransactionClient,
  ): Promise<ReviewerCredentialEventRecord>;

  /**
   * List all append-only lifecycle events for a credential in chronological order.
   */
  listEventsByCredentialId(
    credentialId: string,
    tx?: TransactionClient,
  ): Promise<ReviewerCredentialEventRecord[]>;
}

/**
 * In-memory implementation of ReviewerStore for unit tests and fast test suites.
 * Faithfully mirrors the partial unique index `uq_pocket_active_reviewer` on (userId) WHERE isActive = true.
 */
export class InMemoryReviewerStore implements ReviewerStore {
  private readonly credentials = new Map<string, ClinicalReviewerCredential>();
  private readonly events: ReviewerCredentialEventRecord[] = [];

  private withDerivedFields(cred: ClinicalReviewerCredential): ClinicalReviewerCredential {
    const hasRecordedSuspendEvent = this.events.some(
      (e) => e.credentialId === cred.id && e.eventType === "suspended",
    );
    return {
      ...cred,
      lifecycleStatus: deriveCredentialLifecycleStatus(cred),
      validityStatus: deriveCredentialValidityStatus(cred.licenseExpiresAt),
      isLegacyStatusAmbiguous: isLegacyCredentialStatusAmbiguous({
        isActive: cred.isActive,
        suspendedAt: cred.suspendedAt,
        revokedAt: cred.revokedAt,
        hasRecordedSuspendEvent,
      }),
    };
  }

  async findActiveByUserId(userId: string): Promise<ClinicalReviewerCredential | null> {
    for (const cred of this.credentials.values()) {
      if (cred.userId === userId && cred.isActive) {
        return { ...cred };
      }
    }
    return null;
  }

  async findActiveByUserIdForUpdate(userId: string): Promise<ClinicalReviewerCredential | null> {
    return this.findActiveByUserId(userId);
  }

  async findById(id: string): Promise<ClinicalReviewerCredential | null> {
    const cred = this.credentials.get(id);
    return cred ? this.withDerivedFields(cred) : null;
  }

  async findByIdForUpdate(id: string): Promise<ClinicalReviewerCredential | null> {
    return this.findById(id);
  }

  async listByUserId(userId: string): Promise<ClinicalReviewerCredential[]> {
    const result: ClinicalReviewerCredential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.userId === userId) {
        result.push({ ...cred });
      }
    }
    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listAll(options?: ListCredentialsOptions): Promise<ClinicalReviewerCredential[]> {
    let result = Array.from(this.credentials.values());
    if (options?.userId) {
      result = result.filter((c) => c.userId === options.userId);
    }
    if (options?.isActive !== undefined) {
      result = result.filter((c) => c.isActive === options.isActive);
    }
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (options?.offset) {
      result = result.slice(options.offset);
    }
    if (options?.limit) {
      result = result.slice(0, options.limit);
    }
    return result.map((c) => ({ ...c }));
  }

  async create(record: CreateCredentialRecord): Promise<ClinicalReviewerCredential> {
    // Partial unique index emulation: at most one active credential per user
    for (const existing of this.credentials.values()) {
      if (existing.userId === record.userId && existing.isActive) {
        throw new DomainError(
          "conflict",
          `User ${record.userId} already has an active clinical reviewer credential`,
        );
      }
    }

    const now = new Date();
    const id = record.id ?? `rev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newCred: ClinicalReviewerCredential = {
      id,
      userId: record.userId,
      medicalLicenseNumber: record.medicalLicenseNumber,
      specialty: record.specialty,
      licensingAuthority: record.licensingAuthority,
      isActive: true,
      suspendedAt: null,
      suspensionReason: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      grantedBy: record.grantedBy,
      grantedAt: now,
      licenseExpiresAt: record.licenseExpiresAt,
      createdAt: now,
      updatedAt: now,
      lifecycleStatus: "active",
      validityStatus: deriveCredentialValidityStatus(record.licenseExpiresAt, now),
      isLegacyStatusAmbiguous: false,
    };

    this.credentials.set(id, newCred);
    return this.withDerivedFields(newCred);
  }

  async suspend(record: SuspendCredentialRecord): Promise<ClinicalReviewerCredential> {
    const cred = this.credentials.get(record.id);
    if (!cred) {
      throw new DomainError("not_found", `Credential ${record.id} not found`);
    }

    const now = record.suspendedAt ?? new Date();
    cred.isActive = false;
    cred.suspendedAt = now;
    cred.suspensionReason = record.suspensionReason;
    cred.updatedAt = now;
    this.credentials.set(record.id, cred);
    return this.withDerivedFields(cred);
  }

  async reactivate(record: ReactivateCredentialRecord): Promise<ClinicalReviewerCredential> {
    const cred = this.credentials.get(record.id);
    if (!cred) {
      throw new DomainError("not_found", `Credential ${record.id} not found`);
    }

    for (const existing of this.credentials.values()) {
      if (existing.id !== cred.id && existing.userId === cred.userId && existing.isActive) {
        throw new DomainError(
          "conflict",
          `User ${cred.userId} already has an active clinical reviewer credential`,
        );
      }
    }

    const now = record.reactivatedAt ?? new Date();
    cred.isActive = true;
    cred.suspendedAt = null;
    cred.suspensionReason = null;
    cred.updatedAt = now;
    this.credentials.set(record.id, cred);
    return this.withDerivedFields(cred);
  }

  async revoke(record: RevokeCredentialRecord): Promise<ClinicalReviewerCredential> {
    const cred = this.credentials.get(record.id);
    if (!cred) {
      throw new DomainError("not_found", `Credential ${record.id} not found`);
    }

    const now = record.revokedAt ?? new Date();
    cred.isActive = false;
    cred.revokedAt = now;
    cred.revokedBy = record.revokedBy;
    cred.revocationReason = record.reason;
    cred.updatedAt = now;
    this.credentials.set(record.id, cred);
    return this.withDerivedFields(cred);
  }

  async insertEvent(
    event: CreateReviewerCredentialEventInput,
  ): Promise<ReviewerCredentialEventRecord> {
    const created: ReviewerCredentialEventRecord = {
      id: event.id ?? randomUUID(),
      credentialId: event.credentialId,
      actorUserId: event.actorUserId,
      eventType: event.eventType,
      reason: event.reason ?? null,
      createdAt: new Date(),
    };
    this.events.push(created);
    return { ...created };
  }

  async listEventsByCredentialId(credentialId: string): Promise<ReviewerCredentialEventRecord[]> {
    return this.events
      .filter((e) => e.credentialId === credentialId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) => ({ ...e }));
  }
}
