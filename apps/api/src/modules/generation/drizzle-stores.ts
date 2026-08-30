/**
 * Drizzle-backed implementations of GeneratedContentStore and
 * GeneratedContentCitationStore.
 *
 * These implement the store interfaces defined in generation-store.ts and
 * are wired at the production composition root (composeProduction.ts).
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings on
 * read to match the domain shape expected by in-memory stores.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  generatedContents,
  generatedContentCitations,
  generationJobs,
} from "@avana/database/schema";
import type {
  GeneratedContentRecord,
  GeneratedContentCitationRecord,
  GeneratedContentStore,
  GeneratedContentCitationStore,
} from "./generation-store.js";
import type {
  GenerationJobStore,
  GenerationJobRecord,
} from "./generation-jobs-store.js";
import type {
  CourseId,
  DocumentChunkId,
  DocumentId,
  GeneratedContentId,
  GenerationJobId,
  LessonId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import type {
  GeneratedContentType,
  GeneratedContentStatus,
  GeneratedContentPayload,
  GenerationJobStatus,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toGeneratedContentRecord(row: {
  id: string;
  organizationId: string;
  documentId: string | null;
  courseId: string;
  type: string;
  status: string;
  payload: unknown;
  promptVersion: string | null;
  model: string | null;
  tokenUsage: unknown;
  generationKey: string | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  editedBy: string | null;
  editedAt: Date | null;
  previousPayload: unknown;
  materializedLessonId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): GeneratedContentRecord {
  const tokenUsage = row.tokenUsage as {
    inputTokens: number;
    outputTokens: number;
  } | null;
  return {
    id: row.id as GeneratedContentId,
    organizationId: row.organizationId as OrganizationId,
    documentId: (row.documentId as DocumentId) ?? null,
    courseId: row.courseId as CourseId,
    type: row.type as GeneratedContentType,
    status: row.status as GeneratedContentStatus,
    payload: row.payload as GeneratedContentPayload,
    promptVersion: row.promptVersion,
    model: row.model,
    tokenUsage: tokenUsage ?? null,
    generationKey: row.generationKey,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy as UserId | null,
    reviewedBy: row.reviewedBy as UserId | null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewReason: row.reviewReason,
    editedBy: row.editedBy as UserId | null,
    editedAt: row.editedAt?.toISOString() ?? null,
    previousPayload: row.previousPayload as GeneratedContentPayload | null,
    materializedLessonId: row.materializedLessonId as LessonId | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toCitationRecord(row: {
  generatedContentId: string;
  documentChunkId: string;
}): GeneratedContentCitationRecord {
  return {
    generatedContentId: row.generatedContentId as GeneratedContentId,
    documentChunkId: row.documentChunkId as DocumentChunkId,
  };
}

// ---------------------------------------------------------------------------
// DrizzleGeneratedContentStore
// ---------------------------------------------------------------------------

export class DrizzleGeneratedContentStore implements GeneratedContentStore {
  constructor(private readonly db: DbClient) {}

  async findByIdForOrganization(
    id: GeneratedContentId,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord | undefined> {
    const row = await this.db
      .select()
      .from(generatedContents)
      .where(
        and(
          eq(generatedContents.id, id),
          eq(generatedContents.organizationId, organizationId),
          isNull(generatedContents.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toGeneratedContentRecord(row);
  }

  async listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord[]> {
    const rows = await this.db
      .select()
      .from(generatedContents)
      .where(
        and(
          eq(generatedContents.documentId, documentId),
          eq(generatedContents.organizationId, organizationId),
          isNull(generatedContents.deletedAt),
        ),
      )
      .orderBy(asc(generatedContents.createdAt));

    return rows.map(toGeneratedContentRecord);
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
    status?: GeneratedContentStatus,
  ): Promise<GeneratedContentRecord[]> {
    const conditions = [
      eq(generatedContents.courseId, courseId),
      eq(generatedContents.organizationId, organizationId),
      isNull(generatedContents.deletedAt),
    ];
    if (status) {
      conditions.push(eq(generatedContents.status, status));
    }

    const rows = await this.db
      .select()
      .from(generatedContents)
      .where(and(...conditions))
      .orderBy(asc(generatedContents.createdAt));

    return rows.map(toGeneratedContentRecord);
  }

  async findByGenerationKey(
    documentId: DocumentId,
    type: GeneratedContentType,
    generationKey: string,
    organizationId: OrganizationId,
  ): Promise<GeneratedContentRecord | undefined> {
    const row = await this.db
      .select()
      .from(generatedContents)
      .where(
        and(
          eq(generatedContents.documentId, documentId),
          eq(generatedContents.type, type),
          eq(generatedContents.generationKey, generationKey),
          eq(generatedContents.organizationId, organizationId),
          isNull(generatedContents.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toGeneratedContentRecord(row);
  }

  async create(
    record: GeneratedContentRecord,
  ): Promise<GeneratedContentRecord> {
    const [row] = await this.db
      .insert(generatedContents)
      .values({
        id: record.id,
        organizationId: record.organizationId,
        documentId: record.documentId,
        courseId: record.courseId,
        type: record.type,
        status: record.status,
        payload: record.payload,
        promptVersion: record.promptVersion,
        model: record.model,
        tokenUsage: record.tokenUsage,
        generationKey: record.generationKey,
        acceptedAt: record.acceptedAt ? new Date(record.acceptedAt) : null,
        acceptedBy: record.acceptedBy,
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
        reviewReason: record.reviewReason,
        editedBy: record.editedBy,
        editedAt: record.editedAt ? new Date(record.editedAt) : null,
        previousPayload: record.previousPayload,
        materializedLessonId: record.materializedLessonId,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      })
      .returning();

    return toGeneratedContentRecord(row);
  }

  async update(
    record: GeneratedContentRecord,
  ): Promise<GeneratedContentRecord> {
    const [row] = await this.db
      .update(generatedContents)
      .set({
        status: record.status,
        payload: record.payload,
        promptVersion: record.promptVersion,
        model: record.model,
        tokenUsage: record.tokenUsage,
        generationKey: record.generationKey,
        acceptedAt: record.acceptedAt ? new Date(record.acceptedAt) : null,
        acceptedBy: record.acceptedBy,
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
        reviewReason: record.reviewReason,
        editedBy: record.editedBy,
        editedAt: record.editedAt ? new Date(record.editedAt) : null,
        previousPayload: record.previousPayload,
        materializedLessonId: record.materializedLessonId,
        updatedAt: new Date(record.updatedAt),
        deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
      })
      .where(eq(generatedContents.id, record.id))
      .returning();

    return toGeneratedContentRecord(row);
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .update(generatedContents)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(generatedContents.documentId, documentId),
          eq(generatedContents.organizationId, organizationId),
          isNull(generatedContents.deletedAt),
        ),
      );
  }

  async deleteDraftsByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .update(generatedContents)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(generatedContents.documentId, documentId),
          eq(generatedContents.organizationId, organizationId),
          inArray(generatedContents.status, ["draft", "regenerating", "edited", "rejected"]),
          isNull(generatedContents.deletedAt),
        ),
      );
  }

  async deleteDraftsByDocumentAndType(
    documentId: DocumentId,
    type: GeneratedContentType,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .update(generatedContents)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(generatedContents.documentId, documentId),
          eq(generatedContents.type, type),
          eq(generatedContents.organizationId, organizationId),
          inArray(generatedContents.status, ["draft", "regenerating", "edited"]),
          isNull(generatedContents.deletedAt),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// DrizzleGeneratedContentCitationStore
// ---------------------------------------------------------------------------

export class DrizzleGeneratedContentCitationStore implements GeneratedContentCitationStore {
  constructor(private readonly db: DbClient) {}

  async createMany(
    citations: GeneratedContentCitationRecord[],
  ): Promise<GeneratedContentCitationRecord[]> {
    if (citations.length === 0) return [];

    const rows = await this.db
      .insert(generatedContentCitations)
      .values(
        citations.map((c) => ({
          generatedContentId: c.generatedContentId,
          documentChunkId: c.documentChunkId,
        })),
      )
      .returning();

    return rows.map(toCitationRecord);
  }

  async listByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<GeneratedContentCitationRecord[]> {
    const rows = await this.db
      .select()
      .from(generatedContentCitations)
      .where(
        eq(generatedContentCitations.generatedContentId, generatedContentId),
      );

    return rows.map(toCitationRecord);
  }

  async listByGeneratedContents(
    generatedContentIds: GeneratedContentId[],
  ): Promise<GeneratedContentCitationRecord[]> {
    if (generatedContentIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(generatedContentCitations)
      .where(
        inArray(
          generatedContentCitations.generatedContentId,
          generatedContentIds,
        ),
      );

    return rows.map(toCitationRecord);
  }
}

// ---------------------------------------------------------------------------
// DrizzleGenerationJobStore
// ---------------------------------------------------------------------------

function toGenerationJobRecord(row: {
  id: string;
  organizationId: string;
  documentId: string;
  courseId: string;
  type: string;
  status: string;
  generationKey: string | null;
  jobId: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
}): GenerationJobRecord {
  return {
    id: row.id as GenerationJobId,
    organizationId: row.organizationId as OrganizationId,
    documentId: row.documentId as DocumentId,
    courseId: row.courseId as CourseId,
    type: row.type,
    status: row.status as GenerationJobStatus,
    generationKey: row.generationKey,
    jobId: row.jobId,
    attempts: row.attempts,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export class DrizzleGenerationJobStore implements GenerationJobStore {
  constructor(private readonly db: DbClient) {}

  async findByIdForOrganization(
    id: GenerationJobId,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord | undefined> {
    const row = await this.db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.id, id),
          eq(generationJobs.organizationId, organizationId),
          isNull(generationJobs.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toGenerationJobRecord(row);
  }

  async listByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord[]> {
    const rows = await this.db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.documentId, documentId),
          eq(generationJobs.organizationId, organizationId),
          isNull(generationJobs.deletedAt),
        ),
      )
      .orderBy(asc(generationJobs.createdAt));

    return rows.map(toGenerationJobRecord);
  }

  async findByGenerationKey(
    documentId: DocumentId,
    type: string,
    generationKey: string,
    organizationId: OrganizationId,
  ): Promise<GenerationJobRecord | undefined> {
    const row = await this.db
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.documentId, documentId),
          eq(generationJobs.type, type),
          eq(generationJobs.generationKey, generationKey),
          eq(generationJobs.organizationId, organizationId),
          isNull(generationJobs.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toGenerationJobRecord(row);
  }

  async create(record: GenerationJobRecord): Promise<GenerationJobRecord> {
    const [row] = await this.db
      .insert(generationJobs)
      .values({
        id: record.id,
        organizationId: record.organizationId,
        documentId: record.documentId,
        courseId: record.courseId,
        type: record.type,
        status: record.status,
        generationKey: record.generationKey,
        jobId: record.jobId,
        attempts: record.attempts,
        errorCode: record.errorCode,
        errorMessage: record.errorMessage,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
        startedAt: record.startedAt ? new Date(record.startedAt) : null,
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
      })
      .returning();

    return toGenerationJobRecord(row);
  }

  async update(record: GenerationJobRecord): Promise<GenerationJobRecord> {
    const [row] = await this.db
      .update(generationJobs)
      .set({
        status: record.status,
        generationKey: record.generationKey,
        jobId: record.jobId,
        attempts: record.attempts,
        errorCode: record.errorCode,
        errorMessage: record.errorMessage,
        updatedAt: new Date(record.updatedAt),
        startedAt: record.startedAt ? new Date(record.startedAt) : null,
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
      })
      .where(eq(generationJobs.id, record.id))
      .returning();

    return toGenerationJobRecord(row);
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .update(generationJobs)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(generationJobs.documentId, documentId),
          eq(generationJobs.organizationId, organizationId),
          isNull(generationJobs.deletedAt),
        ),
      );
  }
}
