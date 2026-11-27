/**
 * AVANA Pocket — Assertion Review Store Interface & In-Memory Implementation.
 *
 * Implements Phase 2C-1 (Assertion Review Workflow) persistence contracts
 * for `pocket_scientific_assertions` and `pocket_assertion_audit_log`.
 */

import { DomainError } from "@avana/domain";
import type { TransactionClient } from "@avana/database/client";

export type ScientificAssertionStatus =
  | "draft"
  | "in_review"
  | "reviewed"
  | "verified"
  | "published"
  | "superseded"
  | "retired";

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
  supersededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAssertionRecordInput {
  id?: string;
  assertionRootId?: string;
  versionNumber?: number;
  previousVersionId?: string | null;
  drugId?: string | null;
  diseaseId?: string | null;
  treatmentId?: string | null;
  emergencyId?: string | null;
  assertionType: string;
  assertionKey: string;
  statementText: string;
  jurisdiction?: string;
  targetPopulation?: string;
  clinicalSetting?: string;
  status?: ScientificAssertionStatus;
  releaseId?: string | null;
  validUntilDate?: string | null;
}

export interface AssertionAuditLogRecord {
  id: string;
  assertionId: string;
  actorUserId: string | null;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  clinicalNotes: string | null;
  createdAt: Date;
}

export interface CreateAssertionAuditLogInput {
  id?: string;
  assertionId: string;
  actorUserId: string;
  action: string;
  previousStatus: string | null;
  newStatus: string;
  clinicalNotes?: string | null;
}

export interface AssertionReviewStore {
  /**
   * Find an assertion version by its unique physical ID.
   */
  findById(id: string, tx?: TransactionClient): Promise<ScientificAssertionRecord | null>;

  /**
   * Find and row-lock an assertion version for update inside a transaction
   * (`SELECT ... FOR UPDATE`).
   */
  findByIdForUpdate(id: string, tx?: TransactionClient): Promise<ScientificAssertionRecord | null>;

  /**
   * Create an assertion record (useful for seeding and creating draft versions).
   */
  create(input: CreateAssertionRecordInput, tx?: TransactionClient): Promise<ScientificAssertionRecord>;

  /**
   * Update the status and updatedAt timestamp of an assertion.
   */
  updateStatus(
    id: string,
    newStatus: ScientificAssertionStatus,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord>;

  /**
   * Insert an immutable audit log entry into `pocket_assertion_audit_log`.
   */
  insertAuditLog(
    input: CreateAssertionAuditLogInput,
    tx?: TransactionClient,
  ): Promise<AssertionAuditLogRecord>;

  /**
   * List all audit logs for a given assertion version ordered by creation time.
   */
  listAuditLogsByAssertionId(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionAuditLogRecord[]>;
}

/**
 * In-memory implementation of AssertionReviewStore for unit tests and local isolation.
 */
export class InMemoryAssertionReviewStore implements AssertionReviewStore {
  private readonly assertions: Map<string, ScientificAssertionRecord>;
  private readonly auditLogs: AssertionAuditLogRecord[] = [];

  constructor(sharedAssertionsMap?: Map<string, ScientificAssertionRecord>) {
    this.assertions = sharedAssertionsMap ?? new Map<string, ScientificAssertionRecord>();
  }

  async findById(id: string): Promise<ScientificAssertionRecord | null> {
    const record = this.assertions.get(id);
    return record ? { ...record } : null;
  }

  async findByIdForUpdate(id: string): Promise<ScientificAssertionRecord | null> {
    return this.findById(id);
  }

  async create(input: CreateAssertionRecordInput): Promise<ScientificAssertionRecord> {
    const now = new Date();
    const id = input.id ?? `asrt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const rootId = input.assertionRootId ?? `root-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const record: ScientificAssertionRecord = {
      id,
      assertionRootId: rootId,
      versionNumber: input.versionNumber ?? 1,
      previousVersionId: input.previousVersionId ?? null,
      drugId: input.drugId ?? null,
      diseaseId: input.diseaseId ?? null,
      treatmentId: input.treatmentId ?? null,
      emergencyId: input.emergencyId ?? null,
      assertionType: input.assertionType,
      assertionKey: input.assertionKey,
      statementText: input.statementText,
      jurisdiction: input.jurisdiction ?? "global",
      targetPopulation: input.targetPopulation ?? "general_adult",
      clinicalSetting: input.clinicalSetting ?? "all",
      status: input.status ?? "draft",
      releaseId: input.releaseId ?? null,
      validUntilDate: input.validUntilDate ?? null,
      supersededAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.assertions.set(id, record);
    return { ...record };
  }

  async updateStatus(
    id: string,
    newStatus: ScientificAssertionStatus,
  ): Promise<ScientificAssertionRecord> {
    const existing = this.assertions.get(id);
    if (!existing) {
      throw new DomainError("not_found", `Assertion ${id} not found`);
    }

    const updated: ScientificAssertionRecord = {
      ...existing,
      status: newStatus,
      updatedAt: new Date(),
    };

    this.assertions.set(id, updated);
    return { ...updated };
  }

  async insertAuditLog(input: CreateAssertionAuditLogInput): Promise<AssertionAuditLogRecord> {
    const id = input.id ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const logRecord: AssertionAuditLogRecord = {
      id,
      assertionId: input.assertionId,
      actorUserId: input.actorUserId,
      action: input.action,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
      clinicalNotes: input.clinicalNotes ?? null,
      createdAt: new Date(),
    };

    this.auditLogs.push(logRecord);
    return { ...logRecord };
  }

  async listAuditLogsByAssertionId(assertionId: string): Promise<AssertionAuditLogRecord[]> {
    return this.auditLogs
      .filter((log) => log.assertionId === assertionId)
      .map((log) => ({ ...log }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
