import type {
  CourseId,
  DocumentId,
  OrganizationId,
  SourcePackDocumentId,
  SourcePackId,
  SourcePackRole,
} from "@avana/domain";

export type SourcePackRecord = {
  id: SourcePackId;
  organizationId: OrganizationId;
  courseId: CourseId;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SourcePackDocumentRecord = {
  id: SourcePackDocumentId;
  sourcePackId: SourcePackId;
  documentId: DocumentId;
  role: SourcePackRole;
  orderIndex: number;
  createdAt: string;
};

export type SourcePackWithDocumentsRecord = SourcePackRecord & {
  documents: Array<
    SourcePackDocumentRecord & {
      originalName?: string;
      status?: string;
      mimeType?: string;
      sizeBytes?: number;
    }
  >;
};

export interface CreateSourcePackInput {
  organizationId: OrganizationId;
  courseId: CourseId;
  title: string;
  documents: Array<{
    documentId: DocumentId;
    role: SourcePackRole;
    orderIndex: number;
  }>;
}

export interface UpdateSourcePackInput {
  title?: string;
  documents?: Array<{
    documentId: DocumentId;
    role: SourcePackRole;
    orderIndex: number;
  }>;
}

export interface SourcePackStore {
  create(input: CreateSourcePackInput): Promise<SourcePackWithDocumentsRecord>;
  findById(
    id: SourcePackId,
    organizationId: OrganizationId,
  ): Promise<SourcePackWithDocumentsRecord | undefined>;
  listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<SourcePackWithDocumentsRecord[]>;
  update(
    id: SourcePackId,
    organizationId: OrganizationId,
    input: UpdateSourcePackInput,
  ): Promise<SourcePackWithDocumentsRecord>;
  delete(id: SourcePackId, organizationId: OrganizationId): Promise<void>;
}
