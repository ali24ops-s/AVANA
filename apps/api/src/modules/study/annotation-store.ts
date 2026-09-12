/**
 * Lesson Annotations & Content Reports Store abstractions and implementations.
 */

import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import type { LessonId, UserId, CourseId } from "@avana/domain";
import { lessonAnnotations, contentReports } from "@avana/database/schema";

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
  findById(id: string): Promise<ContentReportRecord | null>;
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
  private reports: ContentReportRecord[] = [];

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

  async findById(id: string): Promise<ContentReportRecord | null> {
    const found = this.reports.find((r) => r.id === id);
    return found ? { ...found } : null;
  }
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
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
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
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
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
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
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
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
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

    return {
      id: inserted.id,
      userId: inserted.userId as UserId,
      lessonId: inserted.lessonId as LessonId,
      courseId: inserted.courseId as CourseId | null,
      selectedText: inserted.selectedText,
      category: inserted.category,
      comment: inserted.comment,
      status: inserted.status,
      createdAt: inserted.createdAt.toISOString(),
    };
  }

  async findById(id: string): Promise<ContentReportRecord | null> {
    const rows = await this.db
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.userId as UserId,
      lessonId: r.lessonId as LessonId,
      courseId: r.courseId as CourseId | null,
      selectedText: r.selectedText,
      category: r.category,
      comment: r.comment,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
