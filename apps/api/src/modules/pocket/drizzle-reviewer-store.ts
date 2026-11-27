/**
 * Drizzle-backed implementation of ReviewerStore.
 *
 * Interacts directly with `pocket_clinical_reviewer_credentials` defined in
 * Migration 0107_pocket_core.ts and exports in `@avana/database/schema`.
 *
 * Supports optional `tx` injection for atomic multi-step transactions.
 */

import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { DbClient, DbRunner, TransactionClient } from "@avana/database/client";
import {
  pocketClinicalReviewerCredentials,
  pocketReviewerCredentialEvents,
} from "@avana/database/schema";
import { DomainError } from "@avana/domain";
import {
  deriveCredentialLifecycleStatus,
  deriveCredentialValidityStatus,
  isLegacyCredentialStatusAmbiguous,
  type ClinicalReviewerCredential,
  type CreateCredentialRecord,
  type CreateReviewerCredentialEventInput,
  type ListCredentialsOptions,
  type ReactivateCredentialRecord,
  type ReviewerCredentialEventRecord,
  type ReviewerCredentialEventType,
  type ReviewerStore,
  type RevokeCredentialRecord,
  type SuspendCredentialRecord,
} from "./reviewer-store.js";

type CredentialRow = typeof pocketClinicalReviewerCredentials.$inferSelect;
type CredentialEventRow = typeof pocketReviewerCredentialEvents.$inferSelect;

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

function mapRowToCredential(
  row: CredentialRow,
  hasRecordedSuspendEvent = true,
): ClinicalReviewerCredential {
  const suspendedAt = row.suspendedAt ? toDate(row.suspendedAt) : null;
  const revokedAt = row.revokedAt ? toDate(row.revokedAt) : null;
  const licenseExpiresAt = toDate(row.licenseExpiresAt);

  return {
    id: row.id,
    userId: row.userId,
    medicalLicenseNumber: row.medicalLicenseNumber,
    specialty: row.specialty,
    licensingAuthority: row.licensingAuthority,
    isActive: row.isActive,
    suspendedAt,
    suspensionReason: row.suspensionReason ?? null,
    revokedAt,
    revokedBy: row.revokedBy ?? null,
    revocationReason: row.revocationReason ?? null,
    grantedBy: row.grantedBy,
    grantedAt: toDate(row.grantedAt),
    licenseExpiresAt,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    lifecycleStatus: deriveCredentialLifecycleStatus({
      isActive: row.isActive,
      suspendedAt,
      revokedAt,
    }),
    validityStatus: deriveCredentialValidityStatus(licenseExpiresAt),
    isLegacyStatusAmbiguous: isLegacyCredentialStatusAmbiguous({
      isActive: row.isActive,
      suspendedAt,
      revokedAt,
      hasRecordedSuspendEvent,
    }),
  };
}

function mapRowToEvent(row: CredentialEventRow): ReviewerCredentialEventRecord {
  return {
    id: row.id,
    credentialId: row.credentialId,
    actorUserId: row.actorUserId,
    eventType: row.eventType as ReviewerCredentialEventType,
    reason: row.reason ?? null,
    createdAt: toDate(row.createdAt),
  };
}

function isUniqueActiveReviewerViolation(err: unknown): boolean {
  const errObj = err as { code?: string; constraint?: string; cause?: unknown };
  const causeObj = errObj?.cause as { code?: string; constraint?: string } | undefined;
  const code = errObj?.code ?? causeObj?.code;
  const constraint = errObj?.constraint ?? causeObj?.constraint;
  return code === "23505" && constraint === "uq_pocket_active_reviewer";
}

export class DrizzleReviewerStore implements ReviewerStore {
  constructor(private readonly db: DbClient) {}

  private getRunner(tx?: TransactionClient): DbRunner {
    return tx ?? this.db;
  }

  async findActiveByUserId(
    userId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketClinicalReviewerCredentials)
      .where(
        and(
          eq(pocketClinicalReviewerCredentials.userId, userId),
          eq(pocketClinicalReviewerCredentials.isActive, true),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }
    return mapRowToCredential(rows[0]);
  }

  async findActiveByUserIdForUpdate(
    userId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketClinicalReviewerCredentials)
      .where(
        and(
          eq(pocketClinicalReviewerCredentials.userId, userId),
          eq(pocketClinicalReviewerCredentials.isActive, true),
        ),
      )
      .limit(1)
      .for("update");

    if (rows.length === 0) {
      return null;
    }
    return mapRowToCredential(rows[0]);
  }

  private async mapRowsWithLegacyCheck(
    rows: CredentialRow[],
    runner: DbRunner,
  ): Promise<ClinicalReviewerCredential[]> {
    if (rows.length === 0) {
      return [];
    }

    const candidateIds = rows
      .filter((r) => r.revokedAt === null && (!r.isActive || r.suspendedAt !== null))
      .map((r) => r.id);

    const recordedSuspendIds = new Set<string>();
    if (candidateIds.length > 0) {
      const eventRows = await runner
        .select({ credentialId: pocketReviewerCredentialEvents.credentialId })
        .from(pocketReviewerCredentialEvents)
        .where(
          and(
            inArray(pocketReviewerCredentialEvents.credentialId, candidateIds),
            eq(pocketReviewerCredentialEvents.eventType, "suspended"),
          ),
        );
      for (const er of eventRows) {
        recordedSuspendIds.add(er.credentialId);
      }
    }

    return rows.map((row) =>
      mapRowToCredential(row, recordedSuspendIds.has(row.id)),
    );
  }

  async findById(
    id: string,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketClinicalReviewerCredentials)
      .where(eq(pocketClinicalReviewerCredentials.id, id))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }
    const mapped = await this.mapRowsWithLegacyCheck(rows, runner);
    return mapped[0];
  }

  async findByIdForUpdate(
    id: string,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential | null> {
    const runner = this.getRunner(tx);
    const baseQuery = runner
      .select()
      .from(pocketClinicalReviewerCredentials)
      .where(eq(pocketClinicalReviewerCredentials.id, id))
      .limit(1);

    const rows = tx ? await baseQuery.for("update") : await baseQuery;
    if (rows.length === 0) {
      return null;
    }
    const mapped = await this.mapRowsWithLegacyCheck(rows, runner);
    return mapped[0];
  }

  async listByUserId(
    userId: string,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential[]> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketClinicalReviewerCredentials)
      .where(eq(pocketClinicalReviewerCredentials.userId, userId))
      .orderBy(desc(pocketClinicalReviewerCredentials.createdAt));

    return await this.mapRowsWithLegacyCheck(rows, runner);
  }

  async listAll(
    options?: ListCredentialsOptions,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential[]> {
    const runner = this.getRunner(tx);
    const conditions: SQL[] = [];

    if (options?.userId) {
      conditions.push(eq(pocketClinicalReviewerCredentials.userId, options.userId));
    }
    if (options?.isActive !== undefined) {
      conditions.push(eq(pocketClinicalReviewerCredentials.isActive, options.isActive));
    }

    let query = runner
      .select()
      .from(pocketClinicalReviewerCredentials)
      .orderBy(desc(pocketClinicalReviewerCredentials.createdAt))
      .$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const rows = await query;
    return await this.mapRowsWithLegacyCheck(rows, runner);
  }

  async create(
    record: CreateCredentialRecord,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential> {
    const runner = this.getRunner(tx);

    try {
      const now = new Date();
      const insertValues: typeof pocketClinicalReviewerCredentials.$inferInsert = {
        userId: record.userId,
        medicalLicenseNumber: record.medicalLicenseNumber,
        specialty: record.specialty,
        licensingAuthority: record.licensingAuthority,
        grantedBy: record.grantedBy,
        licenseExpiresAt: record.licenseExpiresAt,
        isActive: true,
        grantedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      if (record.id) {
        insertValues.id = record.id;
      }

      const [row] = await runner
        .insert(pocketClinicalReviewerCredentials)
        .values(insertValues)
        .returning();

      return mapRowToCredential(row);
    } catch (err: unknown) {
      // Check for PostgreSQL unique constraint violation on uq_pocket_active_reviewer specifically
      const pgErr = err as {
        code?: string;
        constraint?: string;
        message?: string;
        cause?: { code?: string; constraint?: string; message?: string };
      };
      const code = pgErr.code ?? pgErr.cause?.code;
      const constraint = pgErr.constraint ?? pgErr.cause?.constraint;
      const message = `${pgErr.message ?? ""} ${pgErr.cause?.message ?? ""}`;

      const isTargetConstraint =
        constraint === "uq_pocket_active_reviewer" ||
        message.includes("uq_pocket_active_reviewer");

      // Only map to DomainError("conflict") if uq_pocket_active_reviewer is specifically violated
      if ((code === "23505" || !code) && isTargetConstraint) {
        throw new DomainError(
          "conflict",
          `User ${record.userId} already has an active clinical reviewer credential`,
        );
      }
      throw err;
    }
  }

  async suspend(
    record: SuspendCredentialRecord,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential> {
    const runner = this.getRunner(tx);
    const now = record.suspendedAt ?? new Date();

    const [row] = await runner
      .update(pocketClinicalReviewerCredentials)
      .set({
        isActive: false,
        suspendedAt: now,
        suspensionReason: record.suspensionReason,
        updatedAt: now,
      })
      .where(eq(pocketClinicalReviewerCredentials.id, record.id))
      .returning();

    if (!row) {
      throw new DomainError("not_found", `Credential ${record.id} not found`);
    }

    return mapRowToCredential(row);
  }

  async reactivate(
    record: ReactivateCredentialRecord,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential> {
    const runner = this.getRunner(tx);
    const now = record.reactivatedAt ?? new Date();

    try {
      const [row] = await runner
        .update(pocketClinicalReviewerCredentials)
        .set({
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: now,
        })
        .where(eq(pocketClinicalReviewerCredentials.id, record.id))
        .returning();

      if (!row) {
        throw new DomainError("not_found", `Credential ${record.id} not found`);
      }

      return mapRowToCredential(row);
    } catch (err: unknown) {
      if (isUniqueActiveReviewerViolation(err)) {
        throw new DomainError(
          "conflict",
          "User already has an active clinical reviewer credential",
        );
      }
      throw err;
    }
  }

  async revoke(
    record: RevokeCredentialRecord,
    tx?: TransactionClient,
  ): Promise<ClinicalReviewerCredential> {
    const runner = this.getRunner(tx);
    const now = record.revokedAt ?? new Date();

    const [row] = await runner
      .update(pocketClinicalReviewerCredentials)
      .set({
        isActive: false,
        revokedAt: now,
        revokedBy: record.revokedBy,
        revocationReason: record.reason,
        updatedAt: now,
      })
      .where(eq(pocketClinicalReviewerCredentials.id, record.id))
      .returning();

    if (!row) {
      throw new DomainError("not_found", `Credential ${record.id} not found`);
    }

    return mapRowToCredential(row);
  }

  async insertEvent(
    event: CreateReviewerCredentialEventInput,
    tx?: TransactionClient,
  ): Promise<ReviewerCredentialEventRecord> {
    const runner = this.getRunner(tx);
    const now = new Date();

    const insertValues: typeof pocketReviewerCredentialEvents.$inferInsert = {
      credentialId: event.credentialId,
      actorUserId: event.actorUserId,
      eventType: event.eventType,
      reason: event.reason ?? null,
      createdAt: now,
    };

    if (event.id) {
      insertValues.id = event.id;
    }

    const [row] = await runner
      .insert(pocketReviewerCredentialEvents)
      .values(insertValues)
      .returning();

    return mapRowToEvent(row);
  }

  async listEventsByCredentialId(
    credentialId: string,
    tx?: TransactionClient,
  ): Promise<ReviewerCredentialEventRecord[]> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketReviewerCredentialEvents)
      .where(eq(pocketReviewerCredentialEvents.credentialId, credentialId))
      .orderBy(
        asc(pocketReviewerCredentialEvents.createdAt),
        asc(pocketReviewerCredentialEvents.id),
      );

    return rows.map(mapRowToEvent);
  }
}
