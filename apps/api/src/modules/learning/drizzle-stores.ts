/**
 * Drizzle-backed implementations of ModuleStore, LessonStore, and ProgressStore.
 *
 * These implement the store interfaces defined in learning-store.ts.
 * They are wired at the production composition root (composeProduction.ts).
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  modules,
  lessons,
  lessonProgress,
  documents,
  documentChunks,
} from "@avana/database/schema";
import type {
  ModuleRecord,
  LessonRecord,
  LessonProgressRecord,
  ModuleStore,
  LessonStore,
  ProgressStore,
  DocumentRecord,
  DocumentChunkRecord,
  DocumentStore,
  DocumentChunkStore,
} from "./learning-store.js";
import type {
  CourseId,
  DocumentChunkId,
  DocumentId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toModuleRecord(row: {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): ModuleRecord {
  return {
    id: row.id as ModuleId,
    courseId: row.courseId as CourseId,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toLessonRecord(row: {
  id: string;
  moduleId: string;
  title: string;
  contentType: string;
  contentMarkdown: string;
  sortOrder: number;
  estimatedMinutes: number | null;
  publicationStatus: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): LessonRecord {
  return {
    id: row.id as LessonId,
    moduleId: row.moduleId as ModuleId,
    title: row.title,
    contentType: row.contentType,
    contentMarkdown: row.contentMarkdown,
    sortOrder: row.sortOrder,
    estimatedMinutes: row.estimatedMinutes,
    publicationStatus: row.publicationStatus as "draft" | "published",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toProgressRecord(row: {
  id: string;
  userId: string;
  lessonId: string;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LessonProgressRecord {
  return {
    id: row.id,
    userId: row.userId as UserId,
    lessonId: row.lessonId as LessonId,
    completed: row.completed,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AI Learning Engine helpers (PR6-1)
// ---------------------------------------------------------------------------

function toDocumentRecord(row: {
  id: string;
  organizationId: string;
  courseId: string | null;
  ownerUserId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  pageCount: number | null;
  status: string;
  errorCode: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): DocumentRecord {
  return {
    id: row.id as DocumentId,
    organizationId: row.organizationId as OrganizationId,
    courseId: (row.courseId as CourseId | null) ?? null,
    ownerUserId: row.ownerUserId as UserId,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    storageKey: row.storageKey,
    pageCount: row.pageCount,
    status: row.status as DocumentRecord["status"],
    errorCode: row.errorCode,
    retryCount: row.retryCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toDocumentChunkRecord(row: {
  id: string;
  documentId: string;
  organizationId: string;
  sequence: number;
  heading: string | null;
  content: string;
  startPage: number;
  endPage: number;
  tokenEstimate: number;
  contentHash: string;
  createdAt: Date;
}): DocumentChunkRecord {
  return {
    id: row.id as DocumentChunkId,
    documentId: row.documentId as DocumentId,
    organizationId: row.organizationId as OrganizationId,
    sequence: row.sequence,
    heading: row.heading,
    content: row.content,
    startPage: row.startPage,
    endPage: row.endPage,
    tokenEstimate: row.tokenEstimate,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DrizzleModuleStore
// ---------------------------------------------------------------------------

export class DrizzleModuleStore implements ModuleStore {
  constructor(private readonly db: DbClient) {}

  async listByCourse(courseId: CourseId): Promise<ModuleRecord[]> {
    const rows = await this.db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)))
      .orderBy(modules.sortOrder);

    return rows.map(toModuleRecord);
  }

  async findById(moduleId: ModuleId): Promise<ModuleRecord | undefined> {
    const row = await this.db
      .select()
      .from(modules)
      .where(eq(modules.id, moduleId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toModuleRecord(row);
  }

  async create(module: ModuleRecord): Promise<ModuleRecord> {
    const [row] = await this.db
      .insert(modules)
      .values({
        id: module.id,
        courseId: module.courseId,
        title: module.title,
        description: module.description,
        sortOrder: module.sortOrder,
        createdAt: new Date(module.createdAt),
        updatedAt: new Date(module.updatedAt),
      })
      .returning();

    return toModuleRecord(row);
  }

  async update(module: ModuleRecord): Promise<ModuleRecord> {
    const [row] = await this.db
      .update(modules)
      .set({
        title: module.title,
        description: module.description,
        sortOrder: module.sortOrder,
        updatedAt: new Date(module.updatedAt),
      })
      .where(eq(modules.id, module.id))
      .returning();

    return toModuleRecord(row);
  }

  async delete(moduleId: ModuleId): Promise<void> {
    await this.db
      .update(modules)
      .set({ deletedAt: new Date() })
      .where(eq(modules.id, moduleId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleLessonStore
// ---------------------------------------------------------------------------

export class DrizzleLessonStore implements LessonStore {
  constructor(private readonly db: DbClient) {}

  async listByModule(moduleId: ModuleId): Promise<LessonRecord[]> {
    const rows = await this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);

    return rows.map(toLessonRecord);
  }

  async listByModules(moduleIds: ModuleId[]): Promise<LessonRecord[]> {
    if (moduleIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(lessons)
      .where(
        and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)),
      )
      .orderBy(lessons.sortOrder);

    return rows.map(toLessonRecord);
  }

  async findById(lessonId: LessonId): Promise<LessonRecord | undefined> {
    const row = await this.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toLessonRecord(row);
  }

  async create(lesson: LessonRecord): Promise<LessonRecord> {
    const [row] = await this.db
      .insert(lessons)
      .values({
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        contentType: lesson.contentType,
        contentMarkdown: lesson.contentMarkdown,
        sortOrder: lesson.sortOrder,
        estimatedMinutes: lesson.estimatedMinutes,
        publicationStatus: lesson.publicationStatus,
        createdAt: new Date(lesson.createdAt),
        updatedAt: new Date(lesson.updatedAt),
      })
      .returning();

    return toLessonRecord(row);
  }

  async update(lesson: LessonRecord): Promise<LessonRecord> {
    const [row] = await this.db
      .update(lessons)
      .set({
        title: lesson.title,
        contentType: lesson.contentType,
        contentMarkdown: lesson.contentMarkdown,
        sortOrder: lesson.sortOrder,
        estimatedMinutes: lesson.estimatedMinutes,
        publicationStatus: lesson.publicationStatus,
        updatedAt: new Date(lesson.updatedAt),
      })
      .where(eq(lessons.id, lesson.id))
      .returning();

    return toLessonRecord(row);
  }

  async delete(lessonId: LessonId): Promise<void> {
    await this.db
      .update(lessons)
      .set({ deletedAt: new Date() })
      .where(eq(lessons.id, lessonId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleProgressStore
// ---------------------------------------------------------------------------

export class DrizzleProgressStore implements ProgressStore {
  constructor(private readonly db: DbClient) {}

  async listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<LessonProgressRecord[]> {
    const rows = await this.db
      .select({
        id: lessonProgress.id,
        userId: lessonProgress.userId,
        lessonId: lessonProgress.lessonId,
        completed: lessonProgress.completed,
        completedAt: lessonProgress.completedAt,
        createdAt: lessonProgress.createdAt,
        updatedAt: lessonProgress.updatedAt,
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(
        and(eq(lessonProgress.userId, userId), eq(modules.courseId, courseId)),
      );

    return rows.map(toProgressRecord);
  }

  async findByUserAndLesson(
    userId: UserId,
    lessonId: LessonId,
  ): Promise<LessonProgressRecord | undefined> {
    const row = await this.db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.lessonId, lessonId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toProgressRecord(row);
  }

  async upsert(record: LessonProgressRecord): Promise<LessonProgressRecord> {
    // Check for existing record by user+lesson pair
    const existing = await this.findByUserAndLesson(
      record.userId,
      record.lessonId,
    );

    if (existing) {
      const [row] = await this.db
        .update(lessonProgress)
        .set({
          completed: record.completed,
          completedAt: record.completedAt ? new Date(record.completedAt) : null,
          updatedAt: new Date(record.updatedAt),
        })
        .where(eq(lessonProgress.id, existing.id))
        .returning();

      return toProgressRecord(row);
    }

    const [row] = await this.db
      .insert(lessonProgress)
      .values({
        id: record.id,
        userId: record.userId,
        lessonId: record.lessonId,
        completed: record.completed,
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      })
      .returning();

    return toProgressRecord(row);
  }
}

// ---------------------------------------------------------------------------
// DrizzleDocumentStore
// ---------------------------------------------------------------------------

export class DrizzleDocumentStore implements DocumentStore {
  constructor(private readonly db: DbClient) {}

  async findByIdForOrganization(
    id: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentRecord | undefined> {
    const row = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.organizationId, organizationId),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toDocumentRecord(row);
  }

  async findByIdForOwner(
    id: DocumentId,
    organizationId: OrganizationId,
    ownerUserId: UserId,
  ): Promise<DocumentRecord | undefined> {
    const row = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.organizationId, organizationId),
          eq(documents.ownerUserId, ownerUserId),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toDocumentRecord(row);
  }

  async listByOrganization(
    organizationId: OrganizationId,
    courseId?: CourseId,
  ): Promise<DocumentRecord[]> {
    const conditions = [
      eq(documents.organizationId, organizationId),
      isNull(documents.deletedAt),
    ];
    if (courseId) {
      conditions.push(eq(documents.courseId, courseId));
    }

    const rows = await this.db
      .select()
      .from(documents)
      .where(and(...conditions))
      .orderBy(asc(documents.createdAt));

    return rows.map(toDocumentRecord);
  }

  async listByOwner(
    organizationId: OrganizationId,
    ownerUserId: UserId,
  ): Promise<DocumentRecord[]> {
    const rows = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          eq(documents.ownerUserId, ownerUserId),
          isNull(documents.deletedAt),
        ),
      )
      .orderBy(asc(documents.createdAt));

    return rows.map(toDocumentRecord);
  }

  async findByOrganizationAndSha256(
    organizationId: OrganizationId,
    sha256: string,
  ): Promise<DocumentRecord | undefined> {
    const row = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          eq(documents.sha256, sha256),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toDocumentRecord(row);
  }

  async create(document: DocumentRecord): Promise<DocumentRecord> {
    const existing = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, document.organizationId),
          eq(documents.sha256, document.sha256),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (existing && existing.deletedAt) {
      await this.db
        .delete(documents)
        .where(eq(documents.id, existing.id));
    }

    const [row] = await this.db
      .insert(documents)
      .values({
        id: document.id,
        organizationId: document.organizationId,
        courseId: document.courseId,
        ownerUserId: document.ownerUserId,
        originalName: document.originalName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        sha256: document.sha256,
        storageKey: document.storageKey,
        pageCount: document.pageCount,
        status: document.status,
        errorCode: document.errorCode,
        retryCount: document.retryCount,
        createdAt: new Date(document.createdAt),
        updatedAt: new Date(document.updatedAt),
        deletedAt: null,
      })
      .returning();

    return toDocumentRecord(row);
  }

  async update(document: DocumentRecord): Promise<DocumentRecord> {
    const [row] = await this.db
      .update(documents)
      .set({
        courseId: document.courseId,
        pageCount: document.pageCount,
        status: document.status,
        errorCode: document.errorCode,
        retryCount: document.retryCount,
        updatedAt: new Date(document.updatedAt),
      })
      .where(eq(documents.id, document.id))
      .returning();

    return toDocumentRecord(row);
  }

  async delete(documentId: DocumentId): Promise<void> {
    await this.db
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(eq(documents.id, documentId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleDocumentChunkStore
// ---------------------------------------------------------------------------

export class DrizzleDocumentChunkStore implements DocumentChunkStore {
  constructor(private readonly db: DbClient) {}

  async listByDocument(documentId: DocumentId): Promise<DocumentChunkRecord[]> {
    const rows = await this.db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(asc(documentChunks.sequence));

    return rows.map(toDocumentChunkRecord);
  }

  async findByIdForOrganization(
    id: DocumentChunkId,
    organizationId: OrganizationId,
  ): Promise<DocumentChunkRecord | undefined> {
    const row = await this.db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.id, id),
          eq(documentChunks.organizationId, organizationId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toDocumentChunkRecord(row);
  }

  async createMany(
    chunks: DocumentChunkRecord[],
  ): Promise<DocumentChunkRecord[]> {
    if (chunks.length === 0) return [];

    const rows = await this.db
      .insert(documentChunks)
      .values(
        chunks.map((chunk) => ({
          id: chunk.id,
          documentId: chunk.documentId,
          organizationId: chunk.organizationId,
          sequence: chunk.sequence,
          heading: chunk.heading ? chunk.heading.replace(/\0/g, "") : null,
          content: chunk.content.replace(/\0/g, ""),
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          tokenEstimate: chunk.tokenEstimate,
          contentHash: chunk.contentHash,
          createdAt: new Date(chunk.createdAt),
        })),
      )
      .returning();

    return rows.map(toDocumentChunkRecord);
  }

  async deleteByDocument(documentId: DocumentId): Promise<void> {
    await this.db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, documentId));
  }
}
