/**
 * Generation progress store abstraction and implementations.
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import type {
  DocumentId,
  OrganizationId,
  GenerationProgressStatus,
  GenerationPipelineStage,
  DocumentGenerationProgressRecord,
} from "@avana/domain";
import { documentGenerationProgress } from "@avana/database/schema";

export interface GenerationProgressStore {
  findByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord | null>;

  findByDocuments(
    documentIds: DocumentId[],
    organizationId?: OrganizationId,
  ): Promise<Map<DocumentId, DocumentGenerationProgressRecord>>;

  upsert(
    record: DocumentGenerationProgressRecord,
  ): Promise<DocumentGenerationProgressRecord>;

  updateMonotonic(
    documentId: DocumentId,
    organizationId: OrganizationId,
    updates: {
      status?: GenerationProgressStatus;
      stage?: GenerationPipelineStage | null;
      progressCurrent?: number;
      progressTotal?: number;
      stageStartedAt?: string | null;
      lastActivityAt?: string | null;
      errorMessage?: string | null;
      expectedVersion?: number;
    },
  ): Promise<DocumentGenerationProgressRecord>;

  deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void>;
}

export class InMemoryGenerationProgressStore implements GenerationProgressStore {
  private readonly records = new Map<string, DocumentGenerationProgressRecord>();

  async findByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord | null> {
    const record = this.records.get(documentId);
    if (!record) return null;
    if (organizationId && record.organizationId !== organizationId) return null;
    return { ...record };
  }

  async findByDocuments(
    documentIds: DocumentId[],
    organizationId?: OrganizationId,
  ): Promise<Map<DocumentId, DocumentGenerationProgressRecord>> {
    const result = new Map<DocumentId, DocumentGenerationProgressRecord>();
    for (const id of documentIds) {
      const record = this.records.get(id);
      if (record && (!organizationId || record.organizationId === organizationId)) {
        result.set(id, { ...record });
      }
    }
    return result;
  }

  async upsert(
    record: DocumentGenerationProgressRecord,
  ): Promise<DocumentGenerationProgressRecord> {
    const existing = this.records.get(record.documentId);
    const updated: DocumentGenerationProgressRecord = {
      ...record,
      version: existing ? existing.version + 1 : 1,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(record.documentId, updated);
    return { ...updated };
  }

  async updateMonotonic(
    documentId: DocumentId,
    organizationId: OrganizationId,
    updates: {
      status?: GenerationProgressStatus;
      stage?: GenerationPipelineStage | null;
      progressCurrent?: number;
      progressTotal?: number;
      stageStartedAt?: string | null;
      lastActivityAt?: string | null;
      errorMessage?: string | null;
      expectedVersion?: number;
    },
  ): Promise<DocumentGenerationProgressRecord> {
    const existing = this.records.get(documentId);
    const now = new Date().toISOString();

    if (!existing) {
      const newRecord: DocumentGenerationProgressRecord = {
        documentId,
        organizationId,
        status: updates.status ?? "idle",
        stage: updates.stage ?? null,
        progressCurrent: updates.progressCurrent ?? 0,
        progressTotal: updates.progressTotal ?? 0,
        stageStartedAt: updates.stageStartedAt ?? null,
        lastActivityAt: updates.lastActivityAt ?? now,
        errorMessage: updates.errorMessage ?? null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(documentId, newRecord);
      return { ...newRecord };
    }

    if (updates.expectedVersion !== undefined && existing.version !== updates.expectedVersion) {
      // Optimistic concurrency mismatch - reload and apply monotonic safe update
    }

    // Determine current progress with monotonic guarantee within the same stage
    let current = existing.progressCurrent;
    if (updates.stage !== undefined && updates.stage !== existing.stage) {
      current = updates.progressCurrent ?? 0;
    } else if (updates.progressCurrent !== undefined) {
      current = Math.max(existing.progressCurrent, updates.progressCurrent);
    }

    const updated: DocumentGenerationProgressRecord = {
      ...existing,
      status: updates.status ?? existing.status,
      stage: updates.stage !== undefined ? updates.stage : existing.stage,
      progressCurrent: current,
      progressTotal: updates.progressTotal !== undefined ? updates.progressTotal : existing.progressTotal,
      stageStartedAt: updates.stageStartedAt !== undefined ? updates.stageStartedAt : existing.stageStartedAt,
      lastActivityAt: updates.lastActivityAt !== undefined ? updates.lastActivityAt : existing.lastActivityAt,
      errorMessage: updates.errorMessage !== undefined ? updates.errorMessage : existing.errorMessage,
      version: existing.version + 1,
      updatedAt: now,
    };

    this.records.set(documentId, updated);
    return { ...updated };
  }

  async deleteByDocument(
    documentId: DocumentId,
    _organizationId: OrganizationId,
  ): Promise<void> {
    this.records.delete(documentId);
  }
}

export class DrizzleGenerationProgressStore implements GenerationProgressStore {
  constructor(private readonly db: DbClient) {}

  async findByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord | null> {
    const conditions = [eq(documentGenerationProgress.documentId, documentId)];
    if (organizationId) {
      conditions.push(eq(documentGenerationProgress.organizationId, organizationId));
    }

    const rows = await this.db
      .select()
      .from(documentGenerationProgress)
      .where(and(...conditions))
      .limit(1);

    if (rows.length === 0) return null;
    return this.toRecord(rows[0]);
  }

  async findByDocuments(
    documentIds: DocumentId[],
    organizationId?: OrganizationId,
  ): Promise<Map<DocumentId, DocumentGenerationProgressRecord>> {
    const result = new Map<DocumentId, DocumentGenerationProgressRecord>();
    if (documentIds.length === 0) return result;

    const conditions = [inArray(documentGenerationProgress.documentId, documentIds)];
    if (organizationId) {
      conditions.push(eq(documentGenerationProgress.organizationId, organizationId));
    }

    const rows = await this.db
      .select()
      .from(documentGenerationProgress)
      .where(and(...conditions));

    for (const row of rows) {
      result.set(row.documentId as DocumentId, this.toRecord(row));
    }
    return result;
  }

  async upsert(
    record: DocumentGenerationProgressRecord,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date();
    const rows = await this.db
      .insert(documentGenerationProgress)
      .values({
        documentId: record.documentId,
        organizationId: record.organizationId,
        status: record.status,
        stage: record.stage,
        progressCurrent: record.progressCurrent,
        progressTotal: record.progressTotal,
        stageStartedAt: record.stageStartedAt ? new Date(record.stageStartedAt) : null,
        lastActivityAt: record.lastActivityAt ? new Date(record.lastActivityAt) : null,
        errorMessage: record.errorMessage,
        version: record.version || 1,
        createdAt: new Date(record.createdAt),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: documentGenerationProgress.documentId,
        set: {
          organizationId: record.organizationId,
          status: record.status,
          stage: record.stage,
          progressCurrent: record.progressCurrent,
          progressTotal: record.progressTotal,
          stageStartedAt: record.stageStartedAt ? new Date(record.stageStartedAt) : null,
          lastActivityAt: record.lastActivityAt ? new Date(record.lastActivityAt) : null,
          errorMessage: record.errorMessage,
          version: sql`${documentGenerationProgress.version} + 1`,
          updatedAt: now,
        },
      })
      .returning();

    return this.toRecord(rows[0]);
  }

  async updateMonotonic(
    documentId: DocumentId,
    organizationId: OrganizationId,
    updates: {
      status?: GenerationProgressStatus;
      stage?: GenerationPipelineStage | null;
      progressCurrent?: number;
      progressTotal?: number;
      stageStartedAt?: string | null;
      lastActivityAt?: string | null;
      errorMessage?: string | null;
      expectedVersion?: number;
    },
  ): Promise<DocumentGenerationProgressRecord> {
    const existing = await this.findByDocument(documentId, organizationId);
    if (!existing) {
      const now = new Date().toISOString();
      return this.upsert({
        documentId,
        organizationId,
        status: updates.status ?? "idle",
        stage: updates.stage ?? null,
        progressCurrent: updates.progressCurrent ?? 0,
        progressTotal: updates.progressTotal ?? 0,
        stageStartedAt: updates.stageStartedAt ?? null,
        lastActivityAt: updates.lastActivityAt ?? now,
        errorMessage: updates.errorMessage ?? null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Monotonic current progress guarantee
    let current = existing.progressCurrent;
    if (updates.stage !== undefined && updates.stage !== existing.stage) {
      current = updates.progressCurrent ?? 0;
    } else if (updates.progressCurrent !== undefined) {
      current = Math.max(existing.progressCurrent, updates.progressCurrent);
    }

    const now = new Date();
    const rows = await this.db
      .update(documentGenerationProgress)
      .set({
        status: updates.status ?? existing.status,
        stage: updates.stage !== undefined ? updates.stage : existing.stage,
        progressCurrent: current,
        progressTotal: updates.progressTotal !== undefined ? updates.progressTotal : existing.progressTotal,
        stageStartedAt: updates.stageStartedAt !== undefined
          ? updates.stageStartedAt ? new Date(updates.stageStartedAt) : null
          : existing.stageStartedAt ? new Date(existing.stageStartedAt) : null,
        lastActivityAt: updates.lastActivityAt !== undefined
          ? updates.lastActivityAt ? new Date(updates.lastActivityAt) : null
          : existing.lastActivityAt ? new Date(existing.lastActivityAt) : null,
        errorMessage: updates.errorMessage !== undefined ? updates.errorMessage : existing.errorMessage,
        version: sql`${documentGenerationProgress.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(documentGenerationProgress.documentId, documentId),
          eq(documentGenerationProgress.organizationId, organizationId),
        ),
      )
      .returning();

    return this.toRecord(rows[0]);
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .delete(documentGenerationProgress)
      .where(
        and(
          eq(documentGenerationProgress.documentId, documentId),
          eq(documentGenerationProgress.organizationId, organizationId),
        ),
      );
  }

  private toRecord(row: typeof documentGenerationProgress.$inferSelect): DocumentGenerationProgressRecord {
    return {
      documentId: row.documentId as DocumentId,
      organizationId: row.organizationId as OrganizationId,
      status: row.status as GenerationProgressStatus,
      stage: (row.stage as GenerationPipelineStage | null) ?? null,
      progressCurrent: row.progressCurrent,
      progressTotal: row.progressTotal,
      stageStartedAt: row.stageStartedAt ? row.stageStartedAt.toISOString() : null,
      lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
      errorMessage: row.errorMessage,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
