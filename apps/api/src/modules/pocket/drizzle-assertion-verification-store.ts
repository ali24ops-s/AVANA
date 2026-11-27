/**
 * Drizzle-backed implementation of AssertionVerificationStore.
 *
 * Implements Phase 2C-2 persistence for `pocket_assertion_verifications`
 * and `pocket_clinical_conflicts` using Drizzle ORM and PostgreSQL.
 */

import { eq, and, or, desc, isNotNull, sql } from "drizzle-orm";
import type { DbClient, DbRunner, TransactionClient } from "@avana/database/client";
import {
  pocketAssertionVerifications,
  pocketClinicalConflicts,
} from "@avana/database/schema";
import { DomainError } from "@avana/domain";
import type {
  AssertionVerificationRecord,
  AssertionVerificationStore,
  ClinicalConflictRecord,
  CreateAssertionVerificationInput,
  CreateClinicalConflictInput,
  ResolveClinicalConflictInput,
  ResolvedConflictCutoff,
} from "./assertion-verification-store.js";

type VerificationRow = typeof pocketAssertionVerifications.$inferSelect;
type ConflictRow = typeof pocketClinicalConflicts.$inferSelect;

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

function mapRowToVerification(row: VerificationRow): AssertionVerificationRecord {
  return {
    id: row.id,
    assertionId: row.assertionId,
    reviewerUserId: row.reviewerUserId,
    verificationAction: row.verificationAction,
    clinicalReviewNotes: row.clinicalReviewNotes,
    parentVerificationId: row.parentVerificationId ?? null,
    verifiedAt: toDate(row.verifiedAt),
    verificationSeq:
      row.verificationSeq !== null && row.verificationSeq !== undefined
        ? Number(row.verificationSeq)
        : null,
  };
}

function mapRowToConflict(row: ConflictRow): ClinicalConflictRecord {
  return {
    id: row.id,
    conflictSubject: row.conflictSubject,
    assertionAId: row.assertionAId,
    assertionBId: row.assertionBId,
    discrepancyDescription: row.discrepancyDescription,
    status: row.status,
    recordedByUserId: row.recordedByUserId ?? null,
    resolvedByUserId: row.resolvedByUserId ?? null,
    resolvedAt: row.resolvedAt ? toDate(row.resolvedAt) : null,
    resolutionNotes: row.resolutionNotes ?? null,
    resolutionSeq:
      row.resolutionSeq !== null && row.resolutionSeq !== undefined
        ? Number(row.resolutionSeq)
        : null,
    createdAt: toDate(row.createdAt),
  };
}

function isDuplicateActiveConflictError(err: unknown): boolean {
  const errObj = err as { code?: string; constraint?: string; cause?: unknown };
  const causeObj = errObj?.cause as { code?: string; constraint?: string } | undefined;
  const code = errObj?.code ?? causeObj?.code;
  const constraint = errObj?.constraint ?? causeObj?.constraint;
  return code === "23505" && constraint === "uq_pocket_active_conflict_pair";
}

export class DrizzleAssertionVerificationStore implements AssertionVerificationStore {
  constructor(private readonly db: DbClient) {}

  private getRunner(tx?: TransactionClient): DbRunner {
    return tx ?? this.db;
  }

  async createVerification(
    input: CreateAssertionVerificationInput,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord> {
    const runner = this.getRunner(tx);

    const [row] = await runner
      .insert(pocketAssertionVerifications)
      .values({
        ...(input.id ? { id: input.id } : {}),
        assertionId: input.assertionId,
        reviewerUserId: input.reviewerUserId,
        verificationAction: input.verificationAction,
        clinicalReviewNotes: input.clinicalReviewNotes,
        parentVerificationId: input.parentVerificationId ?? null,
        verifiedAt: input.verifiedAt ?? sql<Date>`clock_timestamp()`,
        verificationSeq: sql<number>`nextval('pocket_governance_event_seq')`,
      })
      .returning();

    return mapRowToVerification(row);
  }

  async findVerificationById(
    id: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketAssertionVerifications)
      .where(eq(pocketAssertionVerifications.id, id))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }
    return mapRowToVerification(rows[0]);
  }

  async findVerificationsByAssertionId(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord[]> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketAssertionVerifications)
      .where(eq(pocketAssertionVerifications.assertionId, assertionId))
      .orderBy(
        desc(pocketAssertionVerifications.verifiedAt),
        desc(pocketAssertionVerifications.id),
      );

    return rows.map(mapRowToVerification);
  }

  async findVerificationByReviewerAndAssertion(
    reviewerUserId: string,
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketAssertionVerifications)
      .where(
        and(
          eq(pocketAssertionVerifications.reviewerUserId, reviewerUserId),
          eq(pocketAssertionVerifications.assertionId, assertionId),
        ),
      )
      .orderBy(
        desc(pocketAssertionVerifications.verifiedAt),
        desc(pocketAssertionVerifications.id),
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }
    return mapRowToVerification(rows[0]);
  }

  async findLatestVerificationByReviewerAndAssertion(
    reviewerUserId: string,
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<AssertionVerificationRecord | null> {
    return this.findVerificationByReviewerAndAssertion(
      reviewerUserId,
      assertionId,
      tx,
    );
  }

  async hasChildVerification(
    parentVerificationId: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select({ id: pocketAssertionVerifications.id })
      .from(pocketAssertionVerifications)
      .where(eq(pocketAssertionVerifications.parentVerificationId, parentVerificationId))
      .limit(1);

    return rows.length > 0;
  }

  async createConflict(
    input: CreateClinicalConflictInput,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord> {
    const runner = this.getRunner(tx);

    try {
      const [row] = await runner
        .insert(pocketClinicalConflicts)
        .values({
          ...(input.id ? { id: input.id } : {}),
          conflictSubject: input.conflictSubject,
          assertionAId: input.assertionAId,
          assertionBId: input.assertionBId,
          discrepancyDescription: input.discrepancyDescription,
          status: input.status ?? "active_discrepancy",
          recordedByUserId: input.recordedByUserId ?? null,
          createdAt: sql<Date>`clock_timestamp()`,
        })
        .returning();

      return mapRowToConflict(row);
    } catch (err: unknown) {
      if (isDuplicateActiveConflictError(err)) {
        throw new DomainError(
          "conflict",
          "An active clinical conflict already exists between these assertions",
        );
      }
      throw err;
    }
  }

  async listConflictsByAssertionId(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord[]> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketClinicalConflicts)
      .where(
        or(
          eq(pocketClinicalConflicts.assertionAId, assertionId),
          eq(pocketClinicalConflicts.assertionBId, assertionId),
        ),
      )
      .orderBy(desc(pocketClinicalConflicts.createdAt));

    return rows.map(mapRowToConflict);
  }

  async findConflictById(
    conflictId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketClinicalConflicts)
      .where(eq(pocketClinicalConflicts.id, conflictId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }
    return mapRowToConflict(rows[0]);
  }

  async findConflictByIdForUpdate(
    conflictId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord | null> {
    const runner = this.getRunner(tx);
    const baseQuery = runner
      .select()
      .from(pocketClinicalConflicts)
      .where(eq(pocketClinicalConflicts.id, conflictId))
      .limit(1);

    const rows = tx ? await baseQuery.for("update") : await baseQuery;
    if (rows.length === 0) {
      return null;
    }
    return mapRowToConflict(rows[0]);
  }

  async resolveConflict(
    input: ResolveClinicalConflictInput,
    tx?: TransactionClient,
  ): Promise<ClinicalConflictRecord> {
    const runner = this.getRunner(tx);

    const updateSet = {
      status: input.outcome,
      resolvedByUserId: input.resolvedByUserId,
      resolvedAt: input.resolvedAt ?? sql`clock_timestamp()`,
      resolutionNotes: input.resolutionNotes,
      resolutionSeq:
        input.outcome === "resolved"
          ? sql`nextval('pocket_governance_event_seq')`
          : null,
    } as Partial<typeof pocketClinicalConflicts.$inferInsert>;

    const [row] = await runner
      .update(pocketClinicalConflicts)
      .set(updateSet)
      .where(
        and(
          eq(pocketClinicalConflicts.id, input.conflictId),
          eq(pocketClinicalConflicts.status, "active_discrepancy"),
        ),
      )
      .returning();

    if (!row) {
      throw new DomainError(
        "conflict",
        `Clinical conflict ${input.conflictId} is not active or was already resolved`,
      );
    }

    return mapRowToConflict(row);
  }

  async getLatestResolvedConflictCutoff(
    assertionId: string,
    tx?: TransactionClient,
  ): Promise<ResolvedConflictCutoff | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select({
        resolvedAt: pocketClinicalConflicts.resolvedAt,
        resolutionSeq: pocketClinicalConflicts.resolutionSeq,
      })
      .from(pocketClinicalConflicts)
      .where(
        and(
          eq(pocketClinicalConflicts.status, "resolved"),
          isNotNull(pocketClinicalConflicts.resolvedAt),
          or(
            eq(pocketClinicalConflicts.assertionAId, assertionId),
            eq(pocketClinicalConflicts.assertionBId, assertionId),
          ),
        ),
      )
      .orderBy(
        sql`${pocketClinicalConflicts.resolutionSeq} DESC NULLS LAST`,
        desc(pocketClinicalConflicts.resolvedAt),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].resolvedAt) {
      return null;
    }

    return {
      resolvedAt: toDate(rows[0].resolvedAt),
      resolutionSeq:
        rows[0].resolutionSeq !== null && rows[0].resolutionSeq !== undefined
          ? Number(rows[0].resolutionSeq)
          : null,
    };
  }
}
