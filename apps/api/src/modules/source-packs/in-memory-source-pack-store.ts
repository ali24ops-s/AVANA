import { randomUUID } from "node:crypto";
import {
  type CourseId,
  type DocumentId,
  type OrganizationId,
  type SourcePackDocumentId,
  type SourcePackId,
  type SourcePackRole,
  asSourcePackDocumentId,
  asSourcePackId,
  canonicalizeSourceRole,
} from "@avana/domain";
import type { DocumentStore } from "../learning/learning-store.js";
import type {
  CreateSourcePackInput,
  SourcePackRecord,
  SourcePackStore,
  SourcePackWithDocumentsRecord,
  UpdateSourcePackInput,
} from "./source-pack-store.js";

export class InMemorySourcePackStore implements SourcePackStore {
  private packs = new Map<string, SourcePackRecord>();
  private packDocs = new Map<
    string,
    Array<{
      id: SourcePackDocumentId;
      sourcePackId: SourcePackId;
      documentId: DocumentId;
      role: SourcePackRole;
      orderIndex: number;
      createdAt: string;
    }>
  >();

  constructor(private readonly documentStore?: DocumentStore) {}

  async create(input: CreateSourcePackInput): Promise<SourcePackWithDocumentsRecord> {
    const id = asSourcePackId(randomUUID());
    const now = new Date().toISOString();

    const record: SourcePackRecord = {
      id,
      organizationId: input.organizationId,
      courseId: input.courseId,
      title: input.title,
      status: "active",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.packs.set(id, record);

    const docs = input.documents.map((d) => ({
      id: asSourcePackDocumentId(randomUUID()),
      sourcePackId: id,
      documentId: d.documentId,
      role: canonicalizeSourceRole(d.role),
      orderIndex: d.orderIndex,
      createdAt: now,
    }));
    this.packDocs.set(id, docs);

    return this.enrich(record, docs);
  }

  async findById(
    id: SourcePackId,
    organizationId: OrganizationId,
  ): Promise<SourcePackWithDocumentsRecord | undefined> {
    const pack = this.packs.get(id);
    if (!pack || pack.organizationId !== organizationId || pack.deletedAt !== null) {
      return undefined;
    }
    const docs = this.packDocs.get(id) ?? [];
    return this.enrich(pack, docs);
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<SourcePackWithDocumentsRecord[]> {
    const results: SourcePackWithDocumentsRecord[] = [];
    for (const pack of this.packs.values()) {
      if (
        pack.courseId === courseId &&
        pack.organizationId === organizationId &&
        pack.deletedAt === null
      ) {
        const docs = this.packDocs.get(pack.id) ?? [];
        results.push(await this.enrich(pack, docs));
      }
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async update(
    id: SourcePackId,
    organizationId: OrganizationId,
    input: UpdateSourcePackInput,
  ): Promise<SourcePackWithDocumentsRecord> {
    const pack = this.packs.get(id);
    if (!pack || pack.organizationId !== organizationId || pack.deletedAt !== null) {
      throw new Error("Source pack not found");
    }

    const now = new Date().toISOString();
    if (input.title !== undefined) {
      pack.title = input.title;
    }
    pack.updatedAt = now;

    if (input.documents !== undefined) {
      const docs = input.documents.map((d) => ({
        id: asSourcePackDocumentId(randomUUID()),
        sourcePackId: id,
        documentId: d.documentId,
        role: canonicalizeSourceRole(d.role),
        orderIndex: d.orderIndex,
        createdAt: now,
      }));
      this.packDocs.set(id, docs);
    }

    const currentDocs = this.packDocs.get(id) ?? [];
    return this.enrich(pack, currentDocs);
  }

  async delete(id: SourcePackId, organizationId: OrganizationId): Promise<void> {
    const pack = this.packs.get(id);
    if (pack && pack.organizationId === organizationId && pack.deletedAt === null) {
      pack.deletedAt = new Date().toISOString();
      pack.updatedAt = new Date().toISOString();
    }
  }

  private async enrich(
    pack: SourcePackRecord,
    docs: Array<{
      id: SourcePackDocumentId;
      sourcePackId: SourcePackId;
      documentId: DocumentId;
      role: SourcePackRole;
      orderIndex: number;
      createdAt: string;
    }>,
  ): Promise<SourcePackWithDocumentsRecord> {
    const sortedDocs = [...docs].sort((a, b) => a.orderIndex - b.orderIndex);
    const enrichedDocs = await Promise.all(
      sortedDocs.map(async (d) => {
        let meta: {
          originalName?: string;
          status?: string;
          mimeType?: string;
          sizeBytes?: number;
        } = {};
        if (this.documentStore) {
          const doc = await this.documentStore.findByIdForOrganization(
            d.documentId,
            pack.organizationId,
          );
          if (doc) {
            meta = {
              originalName: doc.originalName,
              status: doc.status,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes,
            };
          }
        }
        return {
          ...d,
          ...meta,
        };
      }),
    );

    return {
      ...pack,
      documents: enrichedDocs,
    };
  }
}
