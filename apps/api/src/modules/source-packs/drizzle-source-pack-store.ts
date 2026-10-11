import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  type CourseId,
  type OrganizationId,
  type SourcePackId,
  type SourcePackRole,
  asCourseId,
  asDocumentId,
  asOrganizationId,
  asSourcePackDocumentId,
  asSourcePackId,
  canonicalizeSourceRole,
  DomainError,
} from "@avana/domain";
import {
  documents,
  sourcePackDocuments,
  sourcePacks,
} from "@avana/database/schema";
import type {
  CreateSourcePackInput,
  SourcePackStore,
  SourcePackWithDocumentsRecord,
  UpdateSourcePackInput,
} from "./source-pack-store.js";

function safeDateToIsoString(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DomainError("bad_request", "Invalid date value encountered in source pack");
    }
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new DomainError("bad_request", "Invalid date string encountered in source pack");
    }
    return parsed.toISOString();
  }
  throw new DomainError("bad_request", "Expected valid Date or ISO string in source pack");
}

function safeDateToIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return safeDateToIsoString(value);
}

export class DrizzleSourcePackStore implements SourcePackStore {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async create(input: CreateSourcePackInput): Promise<SourcePackWithDocumentsRecord> {
    return await this.db.transaction(async (tx) => {
      const [pack] = await tx
        .insert(sourcePacks)
        .values({
          organizationId: input.organizationId,
          courseId: input.courseId,
          title: input.title,
          status: "active",
        })
        .returning();

      const insertedDocs: SourcePackWithDocumentsRecord["documents"] = [];

      for (const doc of input.documents) {
        const [insertedDoc] = await tx
          .insert(sourcePackDocuments)
          .values({
            sourcePackId: pack.id,
            documentId: doc.documentId,
            role: doc.role,
            orderIndex: doc.orderIndex,
          })
          .returning();

        // Get document metadata if exists
        const [docMeta] = await tx
          .select({
            originalName: documents.originalName,
            status: documents.status,
            mimeType: documents.mimeType,
            sizeBytes: documents.sizeBytes,
          })
          .from(documents)
          .where(eq(documents.id, doc.documentId));

        insertedDocs.push({
          id: asSourcePackDocumentId(insertedDoc.id),
          sourcePackId: asSourcePackId(insertedDoc.sourcePackId),
          documentId: asDocumentId(insertedDoc.documentId),
          role: canonicalizeSourceRole(insertedDoc.role as SourcePackRole),
          orderIndex: insertedDoc.orderIndex,
          createdAt: safeDateToIsoString(insertedDoc.createdAt),
          originalName: docMeta?.originalName,
          status: docMeta?.status,
          mimeType: docMeta?.mimeType,
          sizeBytes: docMeta?.sizeBytes,
        });
      }

      return {
        id: asSourcePackId(pack.id),
        organizationId: asOrganizationId(pack.organizationId),
        courseId: asCourseId(pack.courseId),
        title: pack.title,
        status: pack.status,
        createdAt: safeDateToIsoString(pack.createdAt),
        updatedAt: safeDateToIsoString(pack.updatedAt),
        deletedAt: safeDateToIsoOrNull(pack.deletedAt),
        documents: insertedDocs,
      };
    });
  }

  async findById(
    id: SourcePackId,
    organizationId: OrganizationId,
  ): Promise<SourcePackWithDocumentsRecord | undefined> {
    const [pack] = await this.db
      .select()
      .from(sourcePacks)
      .where(
        and(
          eq(sourcePacks.id, id),
          eq(sourcePacks.organizationId, organizationId),
          isNull(sourcePacks.deletedAt),
        ),
      );

    if (!pack) {
      return undefined;
    }

    const docs = await this.db
      .select({
        id: sourcePackDocuments.id,
        sourcePackId: sourcePackDocuments.sourcePackId,
        documentId: sourcePackDocuments.documentId,
        role: sourcePackDocuments.role,
        orderIndex: sourcePackDocuments.orderIndex,
        createdAt: sourcePackDocuments.createdAt,
        originalName: documents.originalName,
        status: documents.status,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
      })
      .from(sourcePackDocuments)
      .leftJoin(documents, eq(sourcePackDocuments.documentId, documents.id))
      .where(eq(sourcePackDocuments.sourcePackId, pack.id))
      .orderBy(sourcePackDocuments.orderIndex);

    return {
      id: asSourcePackId(pack.id),
      organizationId: asOrganizationId(pack.organizationId),
      courseId: asCourseId(pack.courseId),
      title: pack.title,
      status: pack.status,
      createdAt: safeDateToIsoString(pack.createdAt),
      updatedAt: safeDateToIsoString(pack.updatedAt),
      deletedAt: safeDateToIsoOrNull(pack.deletedAt),
      documents: docs.map((d) => ({
        id: asSourcePackDocumentId(d.id),
        sourcePackId: asSourcePackId(d.sourcePackId),
        documentId: asDocumentId(d.documentId),
        role: canonicalizeSourceRole(d.role as SourcePackRole),
        orderIndex: d.orderIndex,
        createdAt: safeDateToIsoString(d.createdAt),
        originalName: d.originalName ?? undefined,
        status: d.status ?? undefined,
        mimeType: d.mimeType ?? undefined,
        sizeBytes: d.sizeBytes ?? undefined,
      })),
    };
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<SourcePackWithDocumentsRecord[]> {
    const packs = await this.db
      .select()
      .from(sourcePacks)
      .where(
        and(
          eq(sourcePacks.courseId, courseId),
          eq(sourcePacks.organizationId, organizationId),
          isNull(sourcePacks.deletedAt),
        ),
      )
      .orderBy(desc(sourcePacks.createdAt));

    const results: SourcePackWithDocumentsRecord[] = [];
    for (const pack of packs) {
      const docs = await this.db
        .select({
          id: sourcePackDocuments.id,
          sourcePackId: sourcePackDocuments.sourcePackId,
          documentId: sourcePackDocuments.documentId,
          role: sourcePackDocuments.role,
          orderIndex: sourcePackDocuments.orderIndex,
          createdAt: sourcePackDocuments.createdAt,
          originalName: documents.originalName,
          status: documents.status,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
        })
        .from(sourcePackDocuments)
        .leftJoin(documents, eq(sourcePackDocuments.documentId, documents.id))
        .where(eq(sourcePackDocuments.sourcePackId, pack.id))
        .orderBy(sourcePackDocuments.orderIndex);

      results.push({
        id: asSourcePackId(pack.id),
        organizationId: asOrganizationId(pack.organizationId),
        courseId: asCourseId(pack.courseId),
        title: pack.title,
        status: pack.status,
        createdAt: safeDateToIsoString(pack.createdAt),
        updatedAt: safeDateToIsoString(pack.updatedAt),
        deletedAt: safeDateToIsoOrNull(pack.deletedAt),
        documents: docs.map((d) => ({
          id: asSourcePackDocumentId(d.id),
          sourcePackId: asSourcePackId(d.sourcePackId),
          documentId: asDocumentId(d.documentId),
          role: canonicalizeSourceRole(d.role as SourcePackRole),
          orderIndex: d.orderIndex,
          createdAt: safeDateToIsoString(d.createdAt),
          originalName: d.originalName ?? undefined,
          status: d.status ?? undefined,
          mimeType: d.mimeType ?? undefined,
          sizeBytes: d.sizeBytes ?? undefined,
        })),
      });
    }

    return results;
  }

  async update(
    id: SourcePackId,
    organizationId: OrganizationId,
    input: UpdateSourcePackInput,
  ): Promise<SourcePackWithDocumentsRecord> {
    return await this.db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) {
        updateData.title = input.title;
      }

      const [updatedPack] = await tx
        .update(sourcePacks)
        .set(updateData)
        .where(
          and(
            eq(sourcePacks.id, id),
            eq(sourcePacks.organizationId, organizationId),
            isNull(sourcePacks.deletedAt),
          ),
        )
        .returning();

      if (!updatedPack) {
        throw new DomainError("not_found", "Source pack not found");
      }

      if (input.documents !== undefined) {
        // Remove existing associations and re-insert normalized list
        await tx
          .delete(sourcePackDocuments)
          .where(eq(sourcePackDocuments.sourcePackId, id));

        for (const doc of input.documents) {
          await tx.insert(sourcePackDocuments).values({
            sourcePackId: id,
            documentId: doc.documentId,
            role: doc.role,
            orderIndex: doc.orderIndex,
          });
        }
      }

      const docs = await tx
        .select({
          id: sourcePackDocuments.id,
          sourcePackId: sourcePackDocuments.sourcePackId,
          documentId: sourcePackDocuments.documentId,
          role: sourcePackDocuments.role,
          orderIndex: sourcePackDocuments.orderIndex,
          createdAt: sourcePackDocuments.createdAt,
          originalName: documents.originalName,
          status: documents.status,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
        })
        .from(sourcePackDocuments)
        .leftJoin(documents, eq(sourcePackDocuments.documentId, documents.id))
        .where(eq(sourcePackDocuments.sourcePackId, updatedPack.id))
        .orderBy(sourcePackDocuments.orderIndex);

      return {
        id: asSourcePackId(updatedPack.id),
        organizationId: asOrganizationId(updatedPack.organizationId),
        courseId: asCourseId(updatedPack.courseId),
        title: updatedPack.title,
        status: updatedPack.status,
        createdAt: safeDateToIsoString(updatedPack.createdAt),
        updatedAt: safeDateToIsoString(updatedPack.updatedAt),
        deletedAt: safeDateToIsoOrNull(updatedPack.deletedAt),
        documents: docs.map((d) => ({
          id: asSourcePackDocumentId(d.id),
          sourcePackId: asSourcePackId(d.sourcePackId),
          documentId: asDocumentId(d.documentId),
          role: canonicalizeSourceRole(d.role as SourcePackRole),
          orderIndex: d.orderIndex,
          createdAt: safeDateToIsoString(d.createdAt),
          originalName: d.originalName ?? undefined,
          status: d.status ?? undefined,
          mimeType: d.mimeType ?? undefined,
          sizeBytes: d.sizeBytes ?? undefined,
        })),
      };
    });
  }

  async delete(id: SourcePackId, organizationId: OrganizationId): Promise<void> {
    await this.db
      .update(sourcePacks)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sourcePacks.id, id),
          eq(sourcePacks.organizationId, organizationId),
          isNull(sourcePacks.deletedAt),
        ),
      );
  }
}
