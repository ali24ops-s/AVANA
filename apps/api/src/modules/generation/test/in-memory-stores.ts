/**
 * In-memory implementations of generated-content stores for testing.
 *
 * Follows the existing in-memory store pattern (learning/test/in-memory-stores).
 * Supports pre-loading seed data for integration tests.
 */

import { randomUUID } from "node:crypto";
import type {
  CourseId,
  DocumentId,
  GeneratedContentId,
  GenerationJobId,
  OrganizationId,
} from "@avana/domain";
import type {
  GeneratedContentType,
  GeneratedContentStatus,
} from "@avana/domain";
import type {
  GeneratedContentRecord,
  GeneratedContentCitationRecord,
  GeneratedContentStore,
  GeneratedContentCitationStore,
} from "../generation-store.js";
import type {
  GenerationJobStore,
  GenerationJobRecord,
} from "../generation-jobs-store.js";
import type {
  GenerationChunkStore,
  GenerationChunkRecord,
  GenerationChunkStage,
  ClaimChunkResult,
} from "../generation-chunk-store.js";


export class InMemoryGeneratedContentStore implements GeneratedContentStore {
  private contents: Map<string, GeneratedContentRecord> = new Map();

  async findByIdForOrganization(
    id: GeneratedContentId,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord | undefined> {
    const record = this.contents.get(id);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.deletedAt
    ) {
      return undefined;
    }
    return { ...record };
  }

  async listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord[]> {
    return Array.from(this.contents.values())
      .filter(
        (c) =>
          c.documentId === documentId &&
          c.organizationId === organizationId &&
          c.deletedAt === null,
      )
      .map((c) => ({ ...c }));
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
    status?: GeneratedContentStatus,
  ): Promise<GeneratedContentRecord[]> {
    return Array.from(this.contents.values())
      .filter(
        (c) =>
          c.courseId === courseId &&
          c.organizationId === organizationId &&
          c.deletedAt === null &&
          (status === undefined || c.status === status),
      )
      .map((c) => ({ ...c }));
  }

  async findByGenerationKey(
    documentId: DocumentId,
    type: GeneratedContentType,
    generationKey: string,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord | undefined> {
    for (const c of this.contents.values()) {
      if (
        c.documentId === documentId &&
        c.type === type &&
        c.generationKey === generationKey &&
        c.organizationId === organizationId &&
        c.deletedAt === null
      ) {
        return { ...c };
      }
    }
    return undefined;
  }

  /** Directly insert a record (used for seeding). */
  insert(record: GeneratedContentRecord): void {
    this.contents.set(record.id, { ...record });
  }

  /** Get all stored records (for test assertions). */
  getAll(): GeneratedContentRecord[] {
    return Array.from(this.contents.values()).map((c) => ({ ...c }));
  }

  async create(
    record: GeneratedContentRecord,
  ): Promise<GeneratedContentRecord> {
    this.contents.set(record.id, { ...record });
    return { ...record };
  }

  async update(
    record: GeneratedContentRecord,
  ): Promise<GeneratedContentRecord> {
    this.contents.set(record.id, { ...record });
    return { ...record };
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, c] of this.contents) {
      if (
        c.documentId === documentId &&
        c.organizationId === organizationId &&
        c.deletedAt === null
      ) {
        this.contents.set(id, {
          ...c,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  async deleteDraftsByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, c] of this.contents) {
      if (
        c.documentId === documentId &&
        c.organizationId === organizationId &&
        (c.status === "draft" ||
          c.status === "regenerating" ||
          c.status === "edited" ||
          c.status === "rejected") &&
        c.deletedAt === null
      ) {
        this.contents.set(id, {
          ...c,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  async deleteDraftsByDocumentAndType(
    documentId: DocumentId,
    type: GeneratedContentType,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, c] of this.contents) {
      if (
        c.documentId === documentId &&
        c.type === type &&
        c.organizationId === organizationId &&
        (c.status === "draft" || c.status === "regenerating" || c.status === "edited") &&
        c.deletedAt === null
      ) {
        this.contents.set(id, {
          ...c,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }
}

export class InMemoryGeneratedContentCitationStore implements GeneratedContentCitationStore {
  private citations: GeneratedContentCitationRecord[] = [];

  async createMany(
    citations: GeneratedContentCitationRecord[],
  ): Promise<GeneratedContentCitationRecord[]> {
    for (const citation of citations) {
      this.citations.push({ ...citation });
    }
    return citations.map((c) => ({ ...c }));
  }

  async listByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<GeneratedContentCitationRecord[]> {
    return this.citations
      .filter((c) => c.generatedContentId === generatedContentId)
      .map((c) => ({ ...c }));
  }

  async listByGeneratedContents(
    generatedContentIds: GeneratedContentId[],
  ): Promise<GeneratedContentCitationRecord[]> {
    const idSet = new Set(generatedContentIds);
    return this.citations
      .filter((c) => idSet.has(c.generatedContentId))
      .map((c) => ({ ...c }));
  }

  /** Directly insert a citation (used for seeding). */
  insert(citation: GeneratedContentCitationRecord): void {
    this.citations.push({ ...citation });
  }

  /** Get all stored citations (for test assertions). */
  getAll(): GeneratedContentCitationRecord[] {
    return this.citations.map((c) => ({ ...c }));
  }

  /** Clear all citations (for test isolation). */
  clear(): void {
    this.citations = [];
  }
}

export class InMemoryGenerationJobStore implements GenerationJobStore {
  private jobs: Map<string, GenerationJobRecord> = new Map();

  async findByIdForOrganization(
    id: GenerationJobId,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord | undefined> {
    const record = this.jobs.get(id);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.deletedAt
    ) {
      return undefined;
    }
    return { ...record };
  }

  async listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord[]> {
    return Array.from(this.jobs.values())
      .filter(
        (j) =>
          j.documentId === documentId &&
          j.organizationId === organizationId &&
          !j.deletedAt,
      )
      .map((j) => ({ ...j }));
  }

  async findByGenerationKey(
    documentId: DocumentId,
    type: string,
    generationKey: string,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord | undefined> {
    for (const j of this.jobs.values()) {
      if (
        j.documentId === documentId &&
        j.type === type &&
        j.generationKey === generationKey &&
        j.organizationId === organizationId &&
        !j.deletedAt
      ) {
        return { ...j };
      }
    }
    return undefined;
  }

  async create(record: GenerationJobRecord): Promise<GenerationJobRecord> {
    this.jobs.set(record.id, { ...record });
    return { ...record };
  }

  async update(record: GenerationJobRecord): Promise<GenerationJobRecord> {
    this.jobs.set(record.id, { ...record });
    return { ...record };
  }

  async updateHeartbeat(
    id: GenerationJobId,
    _organizationId: OrganizationId,
    heartbeatAt?: string,
    leaseExpiresAt?: string,
  ): Promise<void> {
    const existing = this.jobs.get(id);
    if (existing) {
      const now = heartbeatAt ?? new Date().toISOString();
      const leaseExp = leaseExpiresAt ?? new Date(Date.now() + 600_000).toISOString();
      this.jobs.set(id, {
        ...existing,
        heartbeatAt: now,
        leaseExpiresAt: leaseExp,
        updatedAt: now,
      });
    }
  }

  async reconcileStaleJobs(
    params?: { maxAgeMs?: number; organizationId?: OrganizationId } | OrganizationId,
    maxAgeMsFallback?: number,
  ): Promise<{ reconciledCount: number; jobIds: string[] }> {
    const maxAge =
      typeof params === "object" && params !== null
        ? params.maxAgeMs ?? 600_000
        : typeof maxAgeMsFallback === "number"
        ? maxAgeMsFallback
        : 600_000;
    const orgId =
      typeof params === "object" && params !== null
        ? params.organizationId
        : typeof params === "string"
        ? params
        : undefined;

    const staleThreshold = Date.now() - maxAge;
    const nowTime = Date.now();
    const now = new Date().toISOString();
    const reconciledJobIds: string[] = [];

    for (const [id, j] of this.jobs) {
      if (
        (j.status === "queued" || j.status === "running") &&
        (!orgId || j.organizationId === orgId) &&
        !j.deletedAt
      ) {
        const isExpiredLease = j.leaseExpiresAt ? new Date(j.leaseExpiresAt).getTime() < nowTime : false;
        const lastActivity = j.heartbeatAt
          ? new Date(j.heartbeatAt).getTime()
          : new Date(j.updatedAt).getTime();
        if (isExpiredLease || lastActivity < staleThreshold) {
          this.jobs.set(id, {
            ...j,
            status: "failed",
            errorCode: "STALE_LEASE_EXPIRED",
            errorMessage: "Job lease expired with no active worker heartbeat. Safely recovered.",
            completedAt: now,
            updatedAt: now,
          });
          reconciledJobIds.push(id);
        }
      }
    }

    return {
      reconciledCount: reconciledJobIds.length,
      jobIds: reconciledJobIds,
    };
  }

  async delete(
    id: GenerationJobId,
    organizationId: OrganizationId,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (job && job.organizationId === organizationId && !job.deletedAt) {
      this.jobs.set(id, {
        ...job,
        status: "deleted",
        leaseExpiresAt: null,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, j] of this.jobs) {
      if (
        j.documentId === documentId &&
        j.organizationId === organizationId &&
        j.deletedAt === null
      ) {
        this.jobs.set(id, {
          ...j,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  /** Directly insert a job (used for seeding). */
  insert(record: GenerationJobRecord): void {
    this.jobs.set(record.id, { ...record });
  }

  /** Get all stored jobs (for test assertions). */
  getAll(): GenerationJobRecord[] {
    return Array.from(this.jobs.values()).map((j) => ({ ...j }));
  }
}

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
      .sort((a, b) => a.chunkIndex - b.chunkIndex || a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c }));
  }

  async upsert(record: GenerationChunkRecord): Promise<GenerationChunkRecord> {
    let existingKey: string | undefined;
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === record.documentId &&
        c.chunkKey === record.chunkKey &&
        c.organizationId === record.organizationId &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
        existingKey = id;
        break;
      }
    }

    const now = new Date().toISOString();
    const existing = existingKey ? this.chunks.get(existingKey) : undefined;
    const updatedRecord: GenerationChunkRecord = {
      ...(existing ?? {}),
      ...record,
      id: existingKey ?? record.id,
      deletedAt: record.deletedAt ?? existing?.deletedAt ?? null,
      updatedAt: now,
      completedAt:
        record.completedAt ??
        (record.status === "completed" ? existing?.completedAt ?? now : null),
    };

    this.chunks.set(updatedRecord.id, updatedRecord);
    return { ...updatedRecord };
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
    const lockTimeout = params.lockTimeoutMs ?? 600_000;
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - lockTimeout);
    const leaseExpiresAt = new Date(now.getTime() + lockTimeout).toISOString();

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

    if (existingKey) {
      const existing = this.chunks.get(existingKey)!;
      if (existing.status === "completed" && existing.payload) {
        return { status: "completed", record: { ...existing } };
      }

      if (existing.status === "running") {
        const lastHeartbeat = existing.heartbeatAt
          ? new Date(existing.heartbeatAt)
          : new Date(existing.updatedAt);
        const hasActiveLease = existing.leaseExpiresAt
          ? new Date(existing.leaseExpiresAt) > now
          : false;

        if (lastHeartbeat > staleThreshold || hasActiveLease) {
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
    arg1: string,
    arg2?: string | number,
    arg3?: OrganizationId,
    heartbeatAt?: string,
  ): Promise<void> {
    const now =
      (typeof arg2 === "string" && arg2.includes("-") ? arg2 : heartbeatAt) ??
      new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + 600_000).toISOString();

    // Check if arg1 is chunk ID
    if (this.chunks.has(arg1)) {
      const c = this.chunks.get(arg1)!;
      this.chunks.set(arg1, {
        ...c,
        heartbeatAt: now,
        leaseExpiresAt,
        updatedAt: now,
      });
      return;
    }

    // Otherwise lookup by documentId + chunkKey + organizationId
    for (const [id, c] of this.chunks) {
      if (
        c.documentId === arg1 &&
        c.chunkKey === arg2 &&
        (!arg3 || c.organizationId === arg3) &&
        (c.deletedAt === null || c.deletedAt === undefined)
      ) {
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

  /** Directly insert a chunk (used for seeding/tests). */
  insert(record: GenerationChunkRecord): void {
    this.chunks.set(record.id, { ...record });
  }

  /** Get all stored chunks (for test assertions). */
  getAll(): GenerationChunkRecord[] {
    return Array.from(this.chunks.values()).map((c) => ({ ...c }));
  }

  /** Clear all chunks. */
  clear(): void {
    this.chunks.clear();
  }
}

