import { randomUUID } from "node:crypto";
import {
  type OrganizationId,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationReferenceAccessStatus,
  type PresentationReferenceId,
  type PresentationReferenceRecord,
  type CreatePresentationReferenceInput,
  type UpdatePresentationReferenceInput,
  asDocumentId,
  DomainError,
  isDuplicateReference,
  normalizeSourceIdentifier,
  normalizeTitle,
  validatePresentationReferenceInput,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationReferenceCriteria,
  PresentationReferenceStore,
} from "./presentation-store.js";

export class InMemoryPresentationReferenceStore
  implements PresentationReferenceStore
{
  private readonly references = new Map<string, PresentationReferenceRecord>();
  private readonly projectLocks = new Map<string, Promise<void>>();

  async create(
    input: CreatePresentationReferenceInput,
  ): Promise<PresentationReferenceRecord> {
    validatePresentationReferenceInput(input);

    // Concurrency queue per project to emulate PostgreSQL row locking
    const projectKey = input.projectId;
    const previousLock = this.projectLocks.get(projectKey) ?? Promise.resolve();

    let releaseLock: () => void = () => {};
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.projectLocks.set(projectKey, currentLock);

    await previousLock;

    try {
      // Check for duplicates in project
      for (const ref of this.references.values()) {
        if (ref.projectId === input.projectId) {
          if (
            isDuplicateReference(ref, {
              type: input.type,
              title: input.title,
              sourceIdentifier: input.sourceIdentifier,
              documentId: input.documentId,
            })
          ) {
            throw new DomainError(
              "conflict",
              "A duplicate reference already exists in this presentation project",
            );
          }
        }
      }

      const now = new Date().toISOString();
      const id = randomUUID() as PresentationReferenceId;

      const record: PresentationReferenceRecord = {
        id,
        projectId: input.projectId,
        documentId: input.documentId ? asDocumentId(input.documentId) : null,
        type: input.type,
        title: input.title.trim(),
        sourceIdentifier: input.sourceIdentifier
          ? input.sourceIdentifier.trim()
          : null,
        accessStatus: input.accessStatus ?? "pending",
        bibliographicMetadata: input.bibliographicMetadata ?? {},
        extractedContent: input.extractedContent ?? null,
        createdAt: now,
        updatedAt: now,
      };

      this.references.set(id, record);
      return record;
    } finally {
      releaseLock();
    }
  }

  async findById(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord | null> {
    const record = this.references.get(id);
    if (!record || record.projectId !== projectId) {
      return null;
    }
    return { ...record };
  }

  async findByProjectId(
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord[]> {
    const list: PresentationReferenceRecord[] = [];
    for (const ref of this.references.values()) {
      if (ref.projectId === projectId) {
        list.push({ ...ref });
      }
    }
    // Sort desc by createdAt
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findSimilarInProject(
    projectId: PresentationProjectId,
    criteria: PresentationReferenceCriteria,
  ): Promise<PresentationReferenceRecord | null> {
    for (const record of this.references.values()) {
      if (record.projectId !== projectId) continue;

      if (
        criteria.documentId &&
        record.documentId &&
        criteria.documentId === record.documentId
      ) {
        return { ...record };
      }

      if (criteria.sourceIdentifier && record.sourceIdentifier) {
        const normCriteria = normalizeSourceIdentifier(
          criteria.sourceIdentifier,
          criteria.type ?? record.type,
        );
        const normExisting = normalizeSourceIdentifier(
          record.sourceIdentifier,
          record.type,
        );
        if (normCriteria && normExisting && normCriteria === normExisting) {
          return { ...record };
        }
      }

      if (
        criteria.title &&
        criteria.type &&
        record.type === criteria.type &&
        normalizeTitle(record.title) === normalizeTitle(criteria.title)
      ) {
        return { ...record };
      }
    }

    return null;
  }

  async update(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
    input: UpdatePresentationReferenceInput,
  ): Promise<PresentationReferenceRecord> {
    validatePresentationReferenceInput(input);

    const projectKey = projectId;
    const previousLock = this.projectLocks.get(projectKey) ?? Promise.resolve();

    let releaseLock: () => void = () => {};
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.projectLocks.set(projectKey, currentLock);

    await previousLock;

    try {
      const existing = this.references.get(id);
      if (!existing || existing.projectId !== projectId) {
        throw new DomainError("not_found", "Presentation reference not found");
      }

      if (input.title !== undefined || input.sourceIdentifier !== undefined) {
        const candidateTitle = input.title ?? existing.title;
        const candidateSource =
          input.sourceIdentifier !== undefined
            ? input.sourceIdentifier
            : existing.sourceIdentifier;

        for (const other of this.references.values()) {
          if (other.id === id || other.projectId !== projectId) continue;
          if (
            isDuplicateReference(other, {
              type: existing.type,
              title: candidateTitle,
              sourceIdentifier: candidateSource,
              documentId: existing.documentId,
            })
          ) {
            throw new DomainError(
              "conflict",
              "Update would result in a duplicate reference in this project",
            );
          }
        }
      }

      const updated: PresentationReferenceRecord = {
        ...existing,
        title: input.title !== undefined ? input.title.trim() : existing.title,
        sourceIdentifier:
          input.sourceIdentifier !== undefined
            ? input.sourceIdentifier
              ? input.sourceIdentifier.trim()
              : null
            : existing.sourceIdentifier,
        accessStatus: input.accessStatus ?? existing.accessStatus,
        bibliographicMetadata:
          input.bibliographicMetadata ?? existing.bibliographicMetadata,
        extractedContent:
          input.extractedContent !== undefined
            ? input.extractedContent
            : existing.extractedContent,
        updatedAt: new Date().toISOString(),
      };

      this.references.set(id, updated);
      return { ...updated };
    } finally {
      releaseLock();
    }
  }

  async updateAccessStatus(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
    status: PresentationReferenceAccessStatus,
    errorSnippet?: string,
  ): Promise<PresentationReferenceRecord> {
    const existing = this.references.get(id);
    if (!existing || existing.projectId !== projectId) {
      throw new DomainError("not_found", "Presentation reference not found");
    }

    const currentMetadata = existing.bibliographicMetadata ?? {};
    const updatedMetadata = errorSnippet
      ? { ...currentMetadata, error: errorSnippet }
      : currentMetadata;

    const updated: PresentationReferenceRecord = {
      ...existing,
      accessStatus: status,
      bibliographicMetadata: updatedMetadata,
      updatedAt: new Date().toISOString(),
    };

    this.references.set(id, updated);
    return { ...updated };
  }

  async delete(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
  ): Promise<boolean> {
    const existing = this.references.get(id);
    if (!existing || existing.projectId !== projectId) {
      return false;
    }
    return this.references.delete(id);
  }

  async countByProjectId(
    projectId: PresentationProjectId,
  ): Promise<number> {
    let count = 0;
    for (const ref of this.references.values()) {
      if (ref.projectId === projectId) count++;
    }
    return count;
  }

  // Test helper: seed a record directly
  seed(record: PresentationReferenceRecord): void {
    this.references.set(record.id, record);
  }

  clear(): void {
    this.references.clear();
    this.projectLocks.clear();
  }
}

export class InMemoryPresentationProjectStore
  implements PresentationProjectStore
{
  private readonly projects = new Map<string, PresentationProjectRecord>();

  async findById(
    id: PresentationProjectId,
  ): Promise<PresentationProjectRecord | null> {
    const project = this.projects.get(id);
    if (!project || project.deletedAt) {
      return null;
    }
    return { ...project };
  }

  async findByIdForOrganization(
    id: PresentationProjectId,
    organizationId: OrganizationId,
  ): Promise<PresentationProjectRecord | null> {
    const project = this.projects.get(id);
    if (
      !project ||
      project.deletedAt ||
      project.organizationId !== organizationId
    ) {
      return null;
    }
    return { ...project };
  }

  seed(record: PresentationProjectRecord): void {
    this.projects.set(record.id, record);
  }

  clear(): void {
    this.projects.clear();
  }
}
