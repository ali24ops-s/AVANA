import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  type OrganizationId,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationReferenceAccessStatus,
  type PresentationReferenceId,
  type PresentationReferenceRecord,
  type CreatePresentationReferenceInput,
  type UpdatePresentationReferenceInput,
  asPresentationProjectId,
  asPresentationReferenceId,
  asDocumentId,
  asOrganizationId,
  asUserId,
  DomainError,
  isDuplicateReference,
  normalizeSourceIdentifier,
  normalizeTitle,
  validatePresentationReferenceInput,
} from "@avana/domain";
import {
  presentationProjects,
  presentationReferences,
  type PresentationProject,
  type PresentationReference,
} from "@avana/database/schema";
import type {
  PresentationProjectStore,
  PresentationReferenceCriteria,
  PresentationReferenceStore,
} from "./presentation-store.js";

function safeDateToIsoString(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DomainError(
        "bad_request",
        "Invalid date value encountered in presentation store",
      );
    }
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new DomainError(
        "bad_request",
        "Invalid date string encountered in presentation store",
      );
    }
    return parsed.toISOString();
  }
  throw new DomainError(
    "bad_request",
    "Expected valid Date or ISO string in presentation store",
  );
}

function safeDateToIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return safeDateToIsoString(value);
}

function mapReferenceRowToRecord(
  row: PresentationReference,
): PresentationReferenceRecord {
  return {
    id: asPresentationReferenceId(row.id),
    projectId: asPresentationProjectId(row.projectId),
    documentId: row.documentId ? asDocumentId(row.documentId) : null,
    type: row.type as PresentationReferenceRecord["type"],
    title: row.title,
    sourceIdentifier: row.sourceIdentifier ?? null,
    accessStatus: row.accessStatus as PresentationReferenceAccessStatus,
    bibliographicMetadata: row.bibliographicMetadata ?? {},
    extractedContent: row.extractedContent ?? null,
    createdAt: safeDateToIsoString(row.createdAt),
    updatedAt: safeDateToIsoString(row.updatedAt),
  };
}

function mapProjectRowToRecord(
  row: PresentationProject,
): PresentationProjectRecord {
  return {
    id: asPresentationProjectId(row.id),
    organizationId: asOrganizationId(row.organizationId),
    ownerUserId: asUserId(row.ownerUserId),
    title: row.title,
    pptxDocumentId: row.pptxDocumentId ? asDocumentId(row.pptxDocumentId) : null,
    targetDurationMinutes: row.targetDurationMinutes,
    academicLevel: row.academicLevel as PresentationProjectRecord["academicLevel"],
    tone: row.tone as PresentationProjectRecord["tone"],
    elaborationDepth: row.elaborationDepth as PresentationProjectRecord["elaborationDepth"],
    status: row.status as PresentationProjectRecord["status"],
    currentStage: row.currentStage ?? null,
    totalSlides: row.totalSlides,
    overallIntroduction: row.overallIntroduction ?? null,
    overallConclusion: row.overallConclusion ?? null,
    totalEstimatedSeconds: row.totalEstimatedSeconds,
    createdAt: safeDateToIsoString(row.createdAt),
    updatedAt: safeDateToIsoString(row.updatedAt),
    deletedAt: safeDateToIsoOrNull(row.deletedAt),
  };
}

export class DrizzlePresentationReferenceStore
  implements PresentationReferenceStore
{
  constructor(
    private readonly db: NodePgDatabase<Record<string, unknown>>,
  ) {}

  async create(
    input: CreatePresentationReferenceInput,
  ): Promise<PresentationReferenceRecord> {
    validatePresentationReferenceInput(input);

    return await this.db.transaction(async (tx) => {
      // 1. Acquire row lock on parent project to strictly serialize concurrent inserts within this project
      const [lockedProject] = await tx
        .select({ id: presentationProjects.id })
        .from(presentationProjects)
        .where(
          and(
            eq(presentationProjects.id, input.projectId),
            isNull(presentationProjects.deletedAt),
          ),
        )
        .for("update");

      if (!lockedProject) {
        throw new DomainError("not_found", "Presentation project not found");
      }

      // 2. Atomic duplicate check inside the locked project transaction
      const existingRows = await tx
        .select()
        .from(presentationReferences)
        .where(eq(presentationReferences.projectId, input.projectId));

      for (const row of existingRows) {
        const record = mapReferenceRowToRecord(row);
        if (
          isDuplicateReference(record, {
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

      // 3. Insert reference
      const [inserted] = await tx
        .insert(presentationReferences)
        .values({
          projectId: input.projectId,
          documentId: input.documentId ?? null,
          type: input.type,
          title: input.title.trim(),
          sourceIdentifier: input.sourceIdentifier
            ? input.sourceIdentifier.trim()
            : null,
          accessStatus: input.accessStatus ?? "pending",
          bibliographicMetadata: input.bibliographicMetadata ?? {},
          extractedContent: input.extractedContent ?? null,
        })
        .returning();

      return mapReferenceRowToRecord(inserted);
    });
  }

  async findById(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationReferences)
      .where(
        and(
          eq(presentationReferences.id, id),
          eq(presentationReferences.projectId, projectId),
        ),
      );

    return row ? mapReferenceRowToRecord(row) : null;
  }

  async findByProjectId(
    projectId: PresentationProjectId,
  ): Promise<PresentationReferenceRecord[]> {
    const rows = await this.db
      .select()
      .from(presentationReferences)
      .where(eq(presentationReferences.projectId, projectId))
      .orderBy(desc(presentationReferences.createdAt));

    return rows.map(mapReferenceRowToRecord);
  }

  async findSimilarInProject(
    projectId: PresentationProjectId,
    criteria: PresentationReferenceCriteria,
  ): Promise<PresentationReferenceRecord | null> {
    const rows = await this.db
      .select()
      .from(presentationReferences)
      .where(eq(presentationReferences.projectId, projectId));

    for (const row of rows) {
      const record = mapReferenceRowToRecord(row);
      // Check documentId match
      if (
        criteria.documentId &&
        record.documentId &&
        criteria.documentId === record.documentId
      ) {
        return record;
      }

      // Check normalized sourceIdentifier
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
          return record;
        }
      }

      // Check type + normalized title
      if (
        criteria.title &&
        criteria.type &&
        record.type === criteria.type &&
        normalizeTitle(record.title) === normalizeTitle(criteria.title)
      ) {
        return record;
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

    return await this.db.transaction(async (tx) => {
      // 1. Acquire row lock on parent project to strictly serialize concurrent mutations within this project
      const [lockedProject] = await tx
        .select({ id: presentationProjects.id })
        .from(presentationProjects)
        .where(
          and(
            eq(presentationProjects.id, projectId),
            isNull(presentationProjects.deletedAt),
          ),
        )
        .for("update");

      if (!lockedProject) {
        throw new DomainError("not_found", "Presentation project not found");
      }

      // 2. Fetch target reference row in this locked transaction
      const [existing] = await tx
        .select()
        .from(presentationReferences)
        .where(
          and(
            eq(presentationReferences.id, id),
            eq(presentationReferences.projectId, projectId),
          ),
        )
        .for("update");

      if (!existing) {
        throw new DomainError("not_found", "Presentation reference not found");
      }

      // If title or sourceIdentifier is being updated, check that it doesn't collide with another reference
      if (input.title !== undefined || input.sourceIdentifier !== undefined) {
        const candidateTitle = input.title ?? existing.title;
        const candidateSource =
          input.sourceIdentifier !== undefined
            ? input.sourceIdentifier
            : existing.sourceIdentifier;

        const otherRows = await tx
          .select()
          .from(presentationReferences)
          .where(
            and(
              eq(presentationReferences.projectId, projectId),
              // exclude current reference
            ),
          );

        for (const other of otherRows) {
          if (other.id === id) continue;
          const otherRecord = mapReferenceRowToRecord(other);
          if (
            isDuplicateReference(otherRecord, {
              type: existing.type as PresentationReferenceRecord["type"],
              title: candidateTitle,
              sourceIdentifier: candidateSource,
              documentId: existing.documentId
                ? asDocumentId(existing.documentId)
                : null,
            })
          ) {
            throw new DomainError(
              "conflict",
              "Update would result in a duplicate reference in this project",
            );
          }
        }
      }

      const updateValues: Partial<typeof presentationReferences.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.title !== undefined) {
        updateValues.title = input.title.trim();
      }
      if (input.sourceIdentifier !== undefined) {
        updateValues.sourceIdentifier = input.sourceIdentifier
          ? input.sourceIdentifier.trim()
          : null;
      }
      if (input.accessStatus !== undefined) {
        updateValues.accessStatus = input.accessStatus;
      }
      if (input.bibliographicMetadata !== undefined) {
        updateValues.bibliographicMetadata = input.bibliographicMetadata;
      }
      if (input.extractedContent !== undefined) {
        updateValues.extractedContent = input.extractedContent;
      }

      const [updated] = await tx
        .update(presentationReferences)
        .set(updateValues)
        .where(
          and(
            eq(presentationReferences.id, id),
            eq(presentationReferences.projectId, projectId),
          ),
        )
        .returning();

      return mapReferenceRowToRecord(updated);
    });
  }

  async updateAccessStatus(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
    status: PresentationReferenceAccessStatus,
    errorSnippet?: string,
  ): Promise<PresentationReferenceRecord> {
    const [existing] = await this.db
      .select()
      .from(presentationReferences)
      .where(
        and(
          eq(presentationReferences.id, id),
          eq(presentationReferences.projectId, projectId),
        ),
      );

    if (!existing) {
      throw new DomainError("not_found", "Presentation reference not found");
    }

    const currentMetadata = existing.bibliographicMetadata ?? {};
    const updatedMetadata = errorSnippet
      ? { ...currentMetadata, error: errorSnippet }
      : currentMetadata;

    const [updated] = await this.db
      .update(presentationReferences)
      .set({
        accessStatus: status,
        bibliographicMetadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(presentationReferences.id, id),
          eq(presentationReferences.projectId, projectId),
        ),
      )
      .returning();

    return mapReferenceRowToRecord(updated);
  }

  async delete(
    id: PresentationReferenceId,
    projectId: PresentationProjectId,
  ): Promise<boolean> {
    const deleted = await this.db
      .delete(presentationReferences)
      .where(
        and(
          eq(presentationReferences.id, id),
          eq(presentationReferences.projectId, projectId),
        ),
      )
      .returning({ id: presentationReferences.id });

    return deleted.length > 0;
  }

  async countByProjectId(
    projectId: PresentationProjectId,
  ): Promise<number> {
    const rows = await this.db
      .select({ id: presentationReferences.id })
      .from(presentationReferences)
      .where(eq(presentationReferences.projectId, projectId));

    return rows.length;
  }
}

export class DrizzlePresentationProjectStore
  implements PresentationProjectStore
{
  constructor(
    private readonly db: NodePgDatabase<Record<string, unknown>>,
  ) {}

  async findById(
    id: PresentationProjectId,
  ): Promise<PresentationProjectRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationProjects)
      .where(
        and(
          eq(presentationProjects.id, id),
          isNull(presentationProjects.deletedAt),
        ),
      );

    return row ? mapProjectRowToRecord(row) : null;
  }

  async findByIdForOrganization(
    id: PresentationProjectId,
    organizationId: OrganizationId,
  ): Promise<PresentationProjectRecord | null> {
    const [row] = await this.db
      .select()
      .from(presentationProjects)
      .where(
        and(
          eq(presentationProjects.id, id),
          eq(presentationProjects.organizationId, organizationId),
          isNull(presentationProjects.deletedAt),
        ),
      );

    return row ? mapProjectRowToRecord(row) : null;
  }
}
