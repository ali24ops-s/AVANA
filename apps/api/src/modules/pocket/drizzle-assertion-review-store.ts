/**
 * Drizzle-backed implementation of AssertionReviewStore.
 *
 * Implements Phase 2C-1 persistence for `pocket_scientific_assertions`
 * and `pocket_assertion_audit_log` using Drizzle ORM and PostgreSQL.
 */

import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import type { DbClient, DbRunner, TransactionClient } from "@avana/database/client";
import {
  pocketScientificAssertions,
  pocketAssertionAuditLog,
} from "@avana/database/schema";
import { DomainError } from "@avana/domain";
import type {
  AssertionAuditLogRecord,
  AssertionReviewStore,
  CreateAssertionAuditLogInput,
  CreateAssertionRecordInput,
  ScientificAssertionRecord,
  ScientificAssertionStatus,
} from "./assertion-review-store.js";

type AssertionRow = typeof pocketScientificAssertions.$inferSelect;
type AuditLogRow = typeof pocketAssertionAuditLog.$inferSelect;

function toDate(val: unknown): Date {
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return new Date();
}

function mapRowToAssertion(row: AssertionRow): ScientificAssertionRecord {
  return {
    id: row.id,
    assertionRootId: row.assertionRootId,
    versionNumber: row.versionNumber,
    previousVersionId: row.previousVersionId ?? null,
    drugId: row.drugId ?? null,
    diseaseId: row.diseaseId ?? null,
    treatmentId: row.treatmentId ?? null,
    emergencyId: row.emergencyId ?? null,
    assertionType: row.assertionType,
    assertionKey: row.assertionKey,
    statementText: row.statementText,
    jurisdiction: row.jurisdiction,
    targetPopulation: row.targetPopulation,
    clinicalSetting: row.clinicalSetting,
    status: row.status as ScientificAssertionStatus,
    releaseId: row.releaseId ?? null,
    validUntilDate: row.validUntilDate ? String(row.validUntilDate) : null,
    supersededAt: row.supersededAt ? toDate(row.supersededAt) : null,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function mapRowToAuditLog(row: AuditLogRow): AssertionAuditLogRecord {
  return {
    id: row.id,
    assertionId: row.assertionId,
    actorUserId: row.actorUserId,
    action: row.action,
    previousStatus: row.previousStatus ?? null,
    newStatus: row.newStatus,
    clinicalNotes: row.clinicalNotes ?? null,
    createdAt: toDate(row.createdAt),
  };
}

export class DrizzleAssertionReviewStore implements AssertionReviewStore {
  constructor(private readonly db: DbClient) {}

  private getRunner(tx?: TransactionClient): DbRunner {
    return tx ?? this.db;
  }

  async findById(
    id: string,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketScientificAssertions)
      .where(eq(pocketScientificAssertions.id, id))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }
    return mapRowToAssertion(rows[0]);
  }

  async findByIdForUpdate(
    id: string,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketScientificAssertions)
      .where(eq(pocketScientificAssertions.id, id))
      .limit(1)
      .for("update");

    if (rows.length === 0) {
      return null;
    }
    return mapRowToAssertion(rows[0]);
  }

  async create(
    input: CreateAssertionRecordInput,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    const insertValues: typeof pocketScientificAssertions.$inferInsert = {
      assertionRootId: input.assertionRootId ?? randomUUID(),
      assertionType: input.assertionType,
      assertionKey: input.assertionKey,
      statementText: input.statementText,
      jurisdiction: input.jurisdiction ?? "global",
      targetPopulation: input.targetPopulation ?? "general_adult",
      clinicalSetting: input.clinicalSetting ?? "all",
      status: input.status ?? "draft",
      drugId: input.drugId ?? null,
      diseaseId: input.diseaseId ?? null,
      treatmentId: input.treatmentId ?? null,
      emergencyId: input.emergencyId ?? null,
      previousVersionId: input.previousVersionId ?? null,
      releaseId: input.releaseId ?? null,
      validUntilDate: input.validUntilDate ?? null,
      createdAt: now,
      updatedAt: now,
    };

    if (input.id) {
      insertValues.id = input.id;
    }
    if (input.versionNumber !== undefined) {
      insertValues.versionNumber = input.versionNumber;
    }

    const [row] = await runner
      .insert(pocketScientificAssertions)
      .values(insertValues)
      .returning();

    return mapRowToAssertion(row);
  }

  async updateStatus(
    id: string,
    newStatus: ScientificAssertionStatus,
    tx?: TransactionClient,
  ): Promise<ScientificAssertionRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    const [row] = await runner
      .update(pocketScientificAssertions)
      .set({
        status: newStatus,
        updatedAt: now,
      })
      .where(eq(pocketScientificAssertions.id, id))
      .returning();

    if (!row) {
      throw new DomainError("not_found", `Assertion ${id} not found`);
    }

    return mapRowToAssertion(row);
  }

  async insertAuditLog(
    input: CreateAssertionAuditLogInput,
    tx?: TransactionClient,
  ): Promise<AssertionAuditLogRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    const insertValues: typeof pocketAssertionAuditLog.$inferInsert = {
      assertionId: input.assertionId,
      actorUserId: input.actorUserId,
      action: input.action,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
      clinicalNotes: input.clinicalNotes ?? null,
      createdAt: now,
    };

    if (input.id) {
      insertValues.id = input.id;
    }

    const [row] = await runner
      .insert(pocketAssertionAuditLog)
      .values(insertValues)
      .returning();

    return mapRowToAuditLog(row);
  }

  async listAuditLogsByAssertionId(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionAuditLogRecord[]> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketAssertionAuditLog)
      .where(eq(pocketAssertionAuditLog.assertionId, assertionId))
      .orderBy(asc(pocketAssertionAuditLog.createdAt));

    return rows.map(mapRowToAuditLog);
  }
}
