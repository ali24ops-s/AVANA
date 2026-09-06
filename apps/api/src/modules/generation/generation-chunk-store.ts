/**
 * Generation chunk store abstraction (PR Resumable / Incremental Generation).
 *
 * Decouples generation chunk lifecycle data access from the database.
 * Each chunk represents a discrete AI execution unit (planning, session lesson,
 * session flashcards, session quiz, review summary) with immediate persistence.
 */

import type {
  CourseId,
  DocumentId,
  OrganizationId,
  GenerationJobId,
  GenerationChunkRecord,
  GenerationChunkStage,
  GenerationChunkStatus,
} from "@avana/domain";

export type {
  GenerationChunkRecord,
  GenerationChunkStage,
  GenerationChunkStatus,
};

export type ClaimChunkResult =
  | { status: "completed"; record: GenerationChunkRecord }
  | { status: "claimed"; record: GenerationChunkRecord }
  | { status: "locked"; record: GenerationChunkRecord };

export interface GenerationChunkStore {
  /**
   * Find a generation chunk by document ID and chunk key within an organization.
   * Returns undefined if missing or soft-deleted.
   */
  findByDocumentAndKey(
    documentId: DocumentId,
    chunkKey: string,
    organizationId: OrganizationId,
  ): Promise<GenerationChunkRecord | undefined>;

  /**
   * List all active generation chunks for a document within an organization.
   */
  listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GenerationChunkRecord[]>;

  /**
   * Insert or update a generation chunk record atomically (idempotent upsert).
   * Keyed on (document_id, chunk_key) where deleted_at IS NULL.
   */
  upsert(record: GenerationChunkRecord): Promise<GenerationChunkRecord>;

  /**
   * Atomically claims a chunk for execution by this worker.
   * If already completed, returns status: 'completed' with payload.
   * If actively running by another worker (within lock window), returns status: 'locked'.
   * If unclaimed/failed/stale, transitions to 'running' and returns status: 'claimed'.
   */
  claimChunk(params: {
    id?: string;
    organizationId: OrganizationId;
    documentId: DocumentId;
    courseId?: CourseId | null;
    stage: GenerationChunkStage;
    chunkIndex: number;
    chunkKey: string;
    lockTimeoutMs?: number;
  }): Promise<ClaimChunkResult>;

  /**
   * Update heartbeat timestamp for an actively running chunk.
   */
  updateHeartbeat?(
    documentId: DocumentId,
    chunkKey: string,
    organizationId: OrganizationId,
    heartbeatAt?: string,
  ): Promise<void>;

  /**
   * Soft delete all generation chunks for a document in an organization.
   */
  deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void>;

  /**
   * Soft delete generation chunks for specific stages of a document (e.g. during selective regeneration).
   */
  deleteByDocumentAndStages(
    documentId: DocumentId,
    stages: GenerationChunkStage[],
    organizationId: OrganizationId,
  ): Promise<void>;

  /**
   * Soft delete all generation chunks associated with a specific generation job.
   */
  deleteByJob?(
    generationJobId: GenerationJobId,
    organizationId: OrganizationId,
  ): Promise<void>;
}

import { randomUUID } from "node:crypto";

export class InMemoryGenerationChunkStore implements GenerationChunkStore {
  private chunks: Map<string, GenerationChunkRecord> = new Map();

  async findByDocumentAndKey(
    documentId: DocumentId,
    chunkKey: string,
    organizationId: OrganizationId,
  ): Promise<GenerationChunkRecord | undefined> {
    for (const c of this.chunks.values()) {
      if (
        c.documentId === documentId &&
        c.chunkKey === chunkKey &&
        c.organizationId === organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        return { ...c };
      }
    }
    return undefined;
  }

  async listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GenerationChunkRecord[]> {
    return Array.from(this.chunks.values())
      .filter(
        (c) =>
          c.documentId === documentId &&
          c.organizationId === organizationId &&
          (c.deletedAt === null || c.deletedAt === undefined),
      )
      .map((c) => ({ ...c }));
  }

  async upsert(record: GenerationChunkRecord): Promise<GenerationChunkRecord> {
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === record.documentId &&
        c.chunkKey === record.chunkKey &&
        c.organizationId === record.organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        const updated = {
          ...c,
          ...record,
          id,
          updatedAt: new Date().toISOString(),
        };
        this.chunks.set(id, updated);
        return { ...updated };
      }
    }
    const newRecord = { ...record, id: record.id ?? randomUUID() };
    this.chunks.set(newRecord.id, newRecord);
    return { ...newRecord };
  }

  async claimChunk(params: {
    id?: string;
    organizationId: OrganizationId;
    documentId: DocumentId;
    courseId?: CourseId | null;
    stage: GenerationChunkStage;
    chunkIndex: number;
    chunkKey: string;
    lockTimeoutMs?: number;
  }): Promise<ClaimChunkResult> {
    let existingKey: string | undefined;
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === params.documentId &&
        c.chunkKey === params.chunkKey &&
        c.organizationId === params.organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        existingKey = id;
        break;
      }
    }
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + 600_000).toISOString();

    if (existingKey) {
      const existing = this.chunks.get(existingKey)!;
      if (existing.status === "completed") {
        return { status: "completed", record: { ...existing } };
      }
      if (existing.status === "running") {
        const isLockActive =
          existing.leaseExpiresAt &&
          new Date(existing.leaseExpiresAt).getTime() > now.getTime();
        if (isLockActive) {
          return { status: "locked", record: { ...existing } };
        }
      }
      const claimed: GenerationChunkRecord = {
        ...existing,
        status: "running",
        attempts: (existing.attempts ?? 0) + 1,
        heartbeatAt: now.toISOString(),
        leaseExpiresAt,
        updatedAt: now.toISOString(),
      };
      this.chunks.set(existingKey, claimed);
      return { status: "claimed", record: { ...claimed } };
    }

    const newRecord: GenerationChunkRecord = {
      id: params.id ?? randomUUID(),
      organizationId: params.organizationId,
      documentId: params.documentId,
      courseId: params.courseId ?? null,
      stage: params.stage,
      chunkIndex: params.chunkIndex,
      chunkKey: params.chunkKey,
      status: "running",
      attempts: 1,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.chunks.set(newRecord.id, newRecord);
    return { status: "claimed", record: { ...newRecord } };
  }

  async updateHeartbeat(
    documentId: DocumentId,
    chunkKey: string,
    organizationId: OrganizationId,
    heartbeatAt?: string,
  ): Promise<void> {
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === documentId &&
        c.chunkKey === chunkKey &&
        c.organizationId === organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        const now = heartbeatAt ?? new Date().toISOString();
        const leaseExpiresAt = new Date(Date.now() + 600_000).toISOString();
        this.chunks.set(id, {
          ...c,
          heartbeatAt: now,
          leaseExpiresAt,
          updatedAt: now,
        });
        break;
      }
    }
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === documentId &&
        c.organizationId === organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        this.chunks.set(id, {
          ...c,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  async deleteByDocumentAndStages(
    documentId: DocumentId,
    stages: GenerationChunkStage[],
    organizationId: OrganizationId,
  ): Promise<void> {
    const stageSet = new Set(stages);
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === documentId &&
        c.organizationId === organizationId &&
        stageSet.has(c.stage) &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        this.chunks.set(id, {
          ...c,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  async deleteByJob(
    generationJobId: GenerationJobId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, c] of this.chunks) {
      if (
        c.generationJobId === generationJobId &&
        c.organizationId === organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        this.chunks.set(id, {
          ...c,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  insert(record: GenerationChunkRecord): void {
    this.chunks.set(record.id, { ...record });
  }

  getAll(): GenerationChunkRecord[] {
    return Array.from(this.chunks.values()).map((c) => ({ ...c }));
  }

  clear(): void {
    this.chunks.clear();
  }
}

