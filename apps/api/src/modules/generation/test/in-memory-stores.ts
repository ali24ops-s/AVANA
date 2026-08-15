/**
 * In-memory implementations of generated-content stores for testing.
 *
 * Follows the existing in-memory store pattern (learning/test/in-memory-stores).
 * Supports pre-loading seed data for integration tests.
 */

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
          j.deletedAt === null,
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
        j.deletedAt === null
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
