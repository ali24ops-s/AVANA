/**
 * Lesson Annotations & Content Reports Store abstractions and implementations.
 */

import { randomUUID } from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import type { LessonId, UserId, CourseId } from "@avana/domain";
import {
  lessonAnnotations,
  contentReports,
  lessons,
  modules,
  courses,
  users,
} from "@avana/database/schema";

export interface LessonAnnotationRecord {
  id: string;
  userId: UserId;
  lessonId: LessonId;
  type: "highlight" | "note";
  selectedText: string;
  prefix: string | null;
  suffix: string | null;
  startOffset: number | null;
  endOffset: number | null;
  color: string;
  noteText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentReportRecord {
  id: string;
  userId: UserId;
  lessonId: LessonId;
  courseId: CourseId | null;
  selectedText: string;
  category: string;
  comment: string | null;
  status: string;
  createdAt: string;
}

export interface ContentReportDetailRecord extends ContentReportRecord {
  courseName?: string | null;
  moduleTitle?: string | null;
  moduleId?: string | null;
  lessonTitle?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}

export interface ListContentReportsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
  courseId?: CourseId;
  lessonId?: LessonId;
}

export interface ListContentReportsResult {
  items: ContentReportDetailRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LessonAnnotationStore {
  listByLesson(userId: UserId, lessonId: LessonId): Promise<LessonAnnotationRecord[]>;
  findById(id: string): Promise<LessonAnnotationRecord | null>;
  create(
    data: Omit<LessonAnnotationRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<LessonAnnotationRecord>;
  update(
    id: string,
    userId: UserId,
    data: Partial<Pick<LessonAnnotationRecord, "noteText" | "color">>,
  ): Promise<LessonAnnotationRecord | null>;
  delete(id: string, userId: UserId): Promise<boolean>;
}

export interface ContentReportStore {
  create(
    data: Omit<ContentReportRecord, "id" | "createdAt" | "status">,
  ): Promise<ContentReportRecord>;
  findById(id: string): Promise<ContentReportDetailRecord | null>;
  list(params?: ListContentReportsParams): Promise<ListContentReportsResult>;
  updateStatus(id: string, status: string): Promise<ContentReportRecord | null>;
}

// ---------------------------------------------------------------------------
// In-Memory Implementations (for unit tests)
// ---------------------------------------------------------------------------

export class InMemoryLessonAnnotationStore implements LessonAnnotationStore {
  private items: LessonAnnotationRecord[] = [];

  async listByLesson(userId: UserId, lessonId: LessonId): Promise<LessonAnnotationRecord[]> {
    return this.items
      .filter((item) => item.userId === userId && item.lessonId === lessonId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async findById(id: string): Promise<LessonAnnotationRecord | null> {
    const found = this.items.find((item) => item.id === id);
    return found ? { ...found } : null;
  }

  async create(
    data: Omit<LessonAnnotationRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<LessonAnnotationRecord> {
    const now = new Date().toISOString();
    const newRecord: LessonAnnotationRecord = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(newRecord);
    return { ...newRecord };
  }

  async update(
    id: string,
    userId: UserId,
    data: Partial<Pick<LessonAnnotationRecord, "noteText" | "color">>,
  ): Promise<LessonAnnotationRecord | null> {
    const index = this.items.findIndex((item) => item.id === id && item.userId === userId);
    if (index === -1) return null;

    const existing = this.items[index];
    const updated: LessonAnnotationRecord = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.items[index] = updated;
    return { ...updated };
  }

  async delete(id: string, userId: UserId): Promise<boolean> {
    const index = this.items.findIndex((item) => item.id === id && item.userId === userId);
    if (index === -1) return false;
    this.items.splice(index, 1);
    return true;
  }
}

export class InMemoryContentReportStore implements ContentReportStore {
  private reports: Array<ContentReportRecord & Partial<ContentReportDetailRecord>> = [];

  async create(
    data: Omit<ContentReportRecord, "id" | "createdAt" | "status">,
  ): Promise<ContentReportRecord> {
    const now = new Date().toISOString();
    const newRecord: ContentReportRecord = {
      id: randomUUID(),
      ...data,
      status: "pending",
      createdAt: now,
    };
    this.reports.push(newRecord);
    return { ...newRecord };
  }

  async findById(id: string): Promise<ContentReportDetailRecord | null> {
    const found = this.reports.find((r) => r.id === id);
    if (!found) return null;
    return {
      ...found,
      courseName: found.courseName ?? null,
      moduleTitle: found.moduleTitle ?? null,
      moduleId: found.moduleId ?? null,
      lessonTitle: found.lessonTitle ?? null,
      userName: found.userName ?? null,
      userEmail: found.userEmail ?? null,
    };
  }

  async list(params: ListContentReportsParams = {}): Promise<ListContentReportsResult> {
    let filtered = [...this.reports];
    if (params.status) {
      filtered = filtered.filter((r) => r.status === params.status);
    }
    if (params.category) {
      filtered = filtered.filter((r) => r.category === params.category);
    }
    if (params.courseId) {
      filtered = filtered.filter((r) => r.courseId === params.courseId);
    }
    if (params.lessonId) {
      filtered = filtered.filter((r) => r.lessonId === params.lessonId);
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = filtered.length;
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = filtered.slice(offset, offset + pageSize);

    return {
      items: paginated.map((r) => ({
        ...r,
        courseName: r.courseName ?? null,
        moduleTitle: r.moduleTitle ?? null,
        moduleId: r.moduleId ?? null,
        lessonTitle: r.lessonTitle ?? null,
        userName: r.userName ?? null,
        userEmail: r.userEmail ?? null,
      })),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async updateStatus(id: string, status: string): Promise<ContentReportRecord | null> {
    const index = this.reports.findIndex((r) => r.id === id);
    if (index === -1) return null;
    this.reports[index] = {
      ...this.reports[index],
      status,
    };
    return { ...this.reports[index] };
  }
}

function toIsoStringSafe(val: Date | string | null | undefined): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return new Date(String(val)).toISOString();
}

// ---------------------------------------------------------------------------
// Drizzle Implementations
// ---------------------------------------------------------------------------

export class DrizzleLessonAnnotationStore implements LessonAnnotationStore {
  constructor(private readonly db: DbClient) {}

  async listByLesson(userId: UserId, lessonId: LessonId): Promise<LessonAnnotationRecord[]> {
    const rows = await this.db
      .select()
      .from(lessonAnnotations)
      .where(
        and(
          eq(lessonAnnotations.userId, userId),
          eq(lessonAnnotations.lessonId, lessonId),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId as UserId,
      lessonId: r.lessonId as LessonId,
      type: r.type as "highlight" | "note",
      selectedText: r.selectedText,
      prefix: r.prefix,
      suffix: r.suffix,
      startOffset: r.startOffset,
      endOffset: r.endOffset,
      color: r.color,
      noteText: r.noteText,
      createdAt: toIsoStringSafe(r.createdAt),
      updatedAt: toIsoStringSafe(r.updatedAt),
    }));
  }

  async findById(id: string): Promise<LessonAnnotationRecord | null> {
    const rows = await this.db
      .select()
      .from(lessonAnnotations)
      .where(eq(lessonAnnotations.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.userId as UserId,
      lessonId: r.lessonId as LessonId,
      type: r.type as "highlight" | "note",
      selectedText: r.selectedText,
      prefix: r.prefix,
      suffix: r.suffix,
      startOffset: r.startOffset,
      endOffset: r.endOffset,
      color: r.color,
      noteText: r.noteText,
      createdAt: toIsoStringSafe(r.createdAt),
      updatedAt: toIsoStringSafe(r.updatedAt),
    };
  }

  async create(
    data: Omit<LessonAnnotationRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<LessonAnnotationRecord> {
    const [inserted] = await this.db
      .insert(lessonAnnotations)
      .values({
        userId: data.userId,
        lessonId: data.lessonId,
        type: data.type,
        selectedText: data.selectedText,
        prefix: data.prefix ?? null,
        suffix: data.suffix ?? null,
        startOffset: data.startOffset ?? null,
        endOffset: data.endOffset ?? null,
        color: data.color || "default",
        noteText: data.noteText ?? null,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert lesson annotation");
    }

    return {
      id: inserted.id,
      userId: inserted.userId as UserId,
      lessonId: inserted.lessonId as LessonId,
      type: inserted.type as "highlight" | "note",
      selectedText: inserted.selectedText,
      prefix: inserted.prefix,
      suffix: inserted.suffix,
      startOffset: inserted.startOffset,
      endOffset: inserted.endOffset,
      color: inserted.color,
      noteText: inserted.noteText,
      createdAt: toIsoStringSafe(inserted.createdAt),
      updatedAt: toIsoStringSafe(inserted.updatedAt),
    };
  }

  async update(
    id: string,
    userId: UserId,
    data: Partial<Pick<LessonAnnotationRecord, "noteText" | "color">>,
  ): Promise<LessonAnnotationRecord | null> {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.noteText !== undefined) {
      updateValues.noteText = data.noteText;
    }
    if (data.color !== undefined) {
      updateValues.color = data.color;
    }

    const [updated] = await this.db
      .update(lessonAnnotations)
      .set(updateValues)
      .where(and(eq(lessonAnnotations.id, id), eq(lessonAnnotations.userId, userId)))
      .returning();

    if (!updated) return null;
    return {
      id: updated.id,
      userId: updated.userId as UserId,
      lessonId: updated.lessonId as LessonId,
      type: updated.type as "highlight" | "note",
      selectedText: updated.selectedText,
      prefix: updated.prefix,
      suffix: updated.suffix,
      startOffset: updated.startOffset,
      endOffset: updated.endOffset,
      color: updated.color,
      noteText: updated.noteText,
      createdAt: toIsoStringSafe(updated.createdAt),
      updatedAt: toIsoStringSafe(updated.updatedAt),
    };
  }

  async delete(id: string, userId: UserId): Promise<boolean> {
    const result = await this.db
      .delete(lessonAnnotations)
      .where(and(eq(lessonAnnotations.id, id), eq(lessonAnnotations.userId, userId)))
      .returning({ id: lessonAnnotations.id });

    return result.length > 0;
  }
}

export class DrizzleContentReportStore implements ContentReportStore {
  constructor(private readonly db: DbClient) {}

  async create(
    data: Omit<ContentReportRecord, "id" | "createdAt" | "status">,
  ): Promise<ContentReportRecord> {
    const [inserted] = await this.db
      .insert(contentReports)
      .values({
        userId: data.userId,
        lessonId: data.lessonId,
        courseId: data.courseId ?? null,
        selectedText: data.selectedText,
        category: data.category,
        comment: data.comment ?? null,
        status: "pending",
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert content report");
    }

    return {
      id: inserted.id,
      userId: inserted.userId as UserId,
      lessonId: inserted.lessonId as LessonId,
      courseId: inserted.courseId as CourseId | null,
      selectedText: inserted.selectedText,
      category: inserted.category,
      comment: inserted.comment,
      status: inserted.status,
      createdAt: toIsoStringSafe(inserted.createdAt),
    };
  }

  async findById(id: string): Promise<ContentReportDetailRecord | null> {
    const rows = await this.db
      .select({
        id: contentReports.id,
        userId: contentReports.userId,
        lessonId: contentReports.lessonId,
        courseId: contentReports.courseId,
        selectedText: contentReports.selectedText,
        category: contentReports.category,
        comment: contentReports.comment,
        status: contentReports.status,
        createdAt: contentReports.createdAt,
        lessonTitle: lessons.title,
        moduleId: modules.id,
        moduleTitle: modules.title,
        courseName: courses.name,
        userName: users.name,
        userEmail: users.email,
      })
      .from(contentReports)
      .leftJoin(lessons, eq(contentReports.lessonId, lessons.id))
      .leftJoin(modules, eq(lessons.moduleId, modules.id))
      .leftJoin(
        courses,
        sql`coalesce(${contentReports.courseId}, ${modules.courseId}) = ${courses.id}`,
      )
      .leftJoin(users, eq(contentReports.userId, users.id))
      .where(eq(contentReports.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.userId as UserId,
      lessonId: r.lessonId as LessonId,
      courseId: (r.courseId as CourseId) || null,
      selectedText: r.selectedText,
      category: r.category,
      comment: r.comment,
      status: r.status,
      createdAt: toIsoStringSafe(r.createdAt),
      lessonTitle: r.lessonTitle ?? null,
      moduleId: r.moduleId ?? null,
      moduleTitle: r.moduleTitle ?? null,
      courseName: r.courseName ?? null,
      userName: r.userName ?? null,
      userEmail: r.userEmail ?? null,
    };
  }

  async list(params: ListContentReportsParams = {}): Promise<ListContentReportsResult> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (params.status) {
      conditions.push(eq(contentReports.status, params.status));
    }
    if (params.category) {
      conditions.push(eq(contentReports.category, params.category));
    }
    if (params.courseId) {
      conditions.push(
        sql`coalesce(${contentReports.courseId}, ${modules.courseId}) = ${params.courseId}`,
      );
    }
    if (params.lessonId) {
      conditions.push(eq(contentReports.lessonId, params.lessonId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(contentReports)
      .leftJoin(lessons, eq(contentReports.lessonId, lessons.id))
      .leftJoin(modules, eq(lessons.moduleId, modules.id))
      .where(whereClause);

    const totalCount = countRow?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const rows = await this.db
      .select({
        id: contentReports.id,
        userId: contentReports.userId,
        lessonId: contentReports.lessonId,
        courseId: contentReports.courseId,
        selectedText: contentReports.selectedText,
        category: contentReports.category,
        comment: contentReports.comment,
        status: contentReports.status,
        createdAt: contentReports.createdAt,
        lessonTitle: lessons.title,
        moduleId: modules.id,
        moduleTitle: modules.title,
        courseName: courses.name,
        userName: users.name,
        userEmail: users.email,
      })
      .from(contentReports)
      .leftJoin(lessons, eq(contentReports.lessonId, lessons.id))
      .leftJoin(modules, eq(lessons.moduleId, modules.id))
      .leftJoin(
        courses,
        sql`coalesce(${contentReports.courseId}, ${modules.courseId}) = ${courses.id}`,
      )
      .leftJoin(users, eq(contentReports.userId, users.id))
      .where(whereClause)
      .orderBy(desc(contentReports.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items: ContentReportDetailRecord[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId as UserId,
      lessonId: r.lessonId as LessonId,
      courseId: (r.courseId as CourseId) || null,
      selectedText: r.selectedText,
      category: r.category,
      comment: r.comment,
      status: r.status,
      createdAt: toIsoStringSafe(r.createdAt),
      lessonTitle: r.lessonTitle ?? null,
      moduleId: r.moduleId ?? null,
      moduleTitle: r.moduleTitle ?? null,
      courseName: r.courseName ?? null,
      userName: r.userName ?? null,
      userEmail: r.userEmail ?? null,
    }));

    return {
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async updateStatus(id: string, status: string): Promise<ContentReportRecord | null> {
    const [updated] = await this.db
      .update(contentReports)
      .set({ status })
      .where(eq(contentReports.id, id))
      .returning();

    if (!updated) return null;
    return {
      id: updated.id,
      userId: updated.userId as UserId,
      lessonId: updated.lessonId as LessonId,
      courseId: updated.courseId as CourseId | null,
      selectedText: updated.selectedText,
      category: updated.category,
      comment: updated.comment,
      status: updated.status,
      createdAt: toIsoStringSafe(updated.createdAt),
    };
  }
}
