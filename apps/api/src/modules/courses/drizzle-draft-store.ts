import { and, eq, inArray, desc, asc } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courseDraftSessions,
  courseDraftChanges,
  courseReleases,
} from "@avana/database/schema";
import type {
  CourseId,
  CourseDraftSessionId,
  CourseDraftChangeId,
  CourseReleaseId,
  CourseDraftSessionRecord,
  CourseDraftChangeRecord,
  CourseReleaseRecord,
  DraftSessionStatus,
  DraftEntityType,
  DraftAction,
  DraftChangePayload,
  ReleaseManifest,
} from "@avana/domain";
import {
  asCourseDraftSessionId,
  asCourseDraftChangeId,
  asCourseReleaseId,
  asCourseId,
  asUserId,
} from "@avana/domain";
import type {
  CourseDraftSessionStore,
  CourseDraftChangeStore,
  CourseReleaseStore,
} from "./course-draft-store.js";

function toSessionRecord(row: {
  id: string;
  courseId: string;
  baseCourseVersion: number;
  source: string;
  status: string;
  title: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CourseDraftSessionRecord {
  return {
    id: asCourseDraftSessionId(row.id as any),
    courseId: asCourseId(row.courseId as any),
    baseCourseVersion: row.baseCourseVersion,
    source: row.source as any,
    status: row.status as DraftSessionStatus,
    title: row.title,
    createdBy: row.createdBy ? asUserId(row.createdBy as any) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toChangeRecord(row: {
  id: string;
  draftSessionId: string;
  courseId: string;
  entityType: string;
  entityId: string;
  action: string;
  parentId: string | null;
  sortOrder: number | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): CourseDraftChangeRecord {
  return {
    id: asCourseDraftChangeId(row.id as any),
    draftSessionId: asCourseDraftSessionId(row.draftSessionId as any),
    courseId: asCourseId(row.courseId as any),
    entityType: row.entityType as DraftEntityType,
    entityId: row.entityId,
    action: row.action as DraftAction,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    payload: row.payload as DraftChangePayload,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReleaseRecord(row: {
  id: string;
  courseId: string;
  versionNumber: number;
  baseVersion: number;
  draftSessionId: string | null;
  changesSummary: unknown;
  manifest: unknown;
  publishedBy: string;
  publishedAt: Date;
}): CourseReleaseRecord {
  return {
    id: asCourseReleaseId(row.id as any),
    courseId: asCourseId(row.courseId as any),
    versionNumber: row.versionNumber,
    baseVersion: row.baseVersion,
    draftSessionId: row.draftSessionId ? asCourseDraftSessionId(row.draftSessionId as any) : null,
    changesSummary: row.changesSummary as any,
    manifest: row.manifest as ReleaseManifest,
    publishedBy: asUserId(row.publishedBy as any),
    publishedAt: row.publishedAt.toISOString(),
  };
}

export class DrizzleCourseDraftSessionStore implements CourseDraftSessionStore {
  constructor(private readonly db: DbClient) {}

  async create(
    record: Omit<CourseDraftSessionRecord, "createdAt" | "updatedAt">,
  ): Promise<CourseDraftSessionRecord> {
    const [row] = await this.db
      .insert(courseDraftSessions)
      .values({
        id: record.id,
        courseId: record.courseId,
        baseCourseVersion: record.baseCourseVersion,
        source: record.source,
        status: record.status,
        title: record.title,
        createdBy: record.createdBy,
      })
      .returning();

    return toSessionRecord(row);
  }

  async findById(id: CourseDraftSessionId): Promise<CourseDraftSessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(courseDraftSessions)
      .where(eq(courseDraftSessions.id, id))
      .limit(1);

    return row ? toSessionRecord(row) : undefined;
  }

  async findActiveByCourse(courseId: CourseId): Promise<CourseDraftSessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(courseDraftSessions)
      .where(
        and(
          eq(courseDraftSessions.courseId, courseId),
          inArray(courseDraftSessions.status, ["draft", "validating", "ready", "publishing"]),
        ),
      )
      .orderBy(desc(courseDraftSessions.createdAt))
      .limit(1);

    return row ? toSessionRecord(row) : undefined;
  }

  async listByCourse(courseId: CourseId): Promise<CourseDraftSessionRecord[]> {
    const rows = await this.db
      .select()
      .from(courseDraftSessions)
      .where(eq(courseDraftSessions.courseId, courseId))
      .orderBy(desc(courseDraftSessions.createdAt));

    return rows.map(toSessionRecord);
  }

  async updateStatus(id: CourseDraftSessionId, status: DraftSessionStatus): Promise<void> {
    await this.db
      .update(courseDraftSessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(courseDraftSessions.id, id));
  }

  async update(record: CourseDraftSessionRecord): Promise<void> {
    await this.db
      .update(courseDraftSessions)
      .set({
        status: record.status,
        title: record.title,
        baseCourseVersion: record.baseCourseVersion,
        updatedAt: new Date(),
      })
      .where(eq(courseDraftSessions.id, record.id));
  }
}

export class DrizzleCourseDraftChangeStore implements CourseDraftChangeStore {
  constructor(private readonly db: DbClient) {}

  async upsert(
    record: Omit<CourseDraftChangeRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<CourseDraftChangeRecord> {
    const [row] = await this.db
      .insert(courseDraftChanges)
      .values({
        draftSessionId: record.draftSessionId,
        courseId: record.courseId,
        entityType: record.entityType,
        entityId: record.entityId,
        action: record.action,
        parentId: record.parentId,
        sortOrder: record.sortOrder,
        payload: record.payload,
      })
      .onConflictDoUpdate({
        target: [
          courseDraftChanges.draftSessionId,
          courseDraftChanges.entityType,
          courseDraftChanges.entityId,
        ],
        set: {
          action: record.action,
          parentId: record.parentId,
          sortOrder: record.sortOrder,
          payload: record.payload,
          updatedAt: new Date(),
        },
      })
      .returning();

    return toChangeRecord(row);
  }

  async delete(id: CourseDraftChangeId): Promise<void> {
    await this.db
      .delete(courseDraftChanges)
      .where(eq(courseDraftChanges.id, id));
  }

  async deleteBySessionAndEntity(
    sessionId: CourseDraftSessionId,
    entityType: DraftEntityType,
    entityId: string,
  ): Promise<void> {
    await this.db
      .delete(courseDraftChanges)
      .where(
        and(
          eq(courseDraftChanges.draftSessionId, sessionId),
          eq(courseDraftChanges.entityType, entityType),
          eq(courseDraftChanges.entityId, entityId),
        ),
      );
  }

  async findBySessionAndEntity(
    sessionId: CourseDraftSessionId,
    entityType: DraftEntityType,
    entityId: string,
  ): Promise<CourseDraftChangeRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(courseDraftChanges)
      .where(
        and(
          eq(courseDraftChanges.draftSessionId, sessionId),
          eq(courseDraftChanges.entityType, entityType),
          eq(courseDraftChanges.entityId, entityId),
        ),
      )
      .limit(1);

    return row ? toChangeRecord(row) : undefined;
  }

  async listBySession(sessionId: CourseDraftSessionId): Promise<CourseDraftChangeRecord[]> {
    const rows = await this.db
      .select()
      .from(courseDraftChanges)
      .where(eq(courseDraftChanges.draftSessionId, sessionId))
      .orderBy(asc(courseDraftChanges.sortOrder));

    return rows.map(toChangeRecord);
  }

  async deleteBySession(sessionId: CourseDraftSessionId): Promise<void> {
    await this.db
      .delete(courseDraftChanges)
      .where(eq(courseDraftChanges.draftSessionId, sessionId));
  }
}

export class DrizzleCourseReleaseStore implements CourseReleaseStore {
  constructor(private readonly db: DbClient) {}

  async create(
    record: Omit<CourseReleaseRecord, "publishedAt">,
  ): Promise<CourseReleaseRecord> {
    const [row] = await this.db
      .insert(courseReleases)
      .values({
        id: record.id,
        courseId: record.courseId,
        versionNumber: record.versionNumber,
        baseVersion: record.baseVersion,
        draftSessionId: record.draftSessionId,
        changesSummary: record.changesSummary,
        manifest: record.manifest,
        publishedBy: record.publishedBy,
      })
      .returning();

    return toReleaseRecord(row);
  }

  async findById(id: CourseReleaseId): Promise<CourseReleaseRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(courseReleases)
      .where(eq(courseReleases.id, id))
      .limit(1);

    return row ? toReleaseRecord(row) : undefined;
  }

  async findByCourseAndVersion(
    courseId: CourseId,
    versionNumber: number,
  ): Promise<CourseReleaseRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(courseReleases)
      .where(
        and(
          eq(courseReleases.courseId, courseId),
          eq(courseReleases.versionNumber, versionNumber),
        ),
      )
      .limit(1);

    return row ? toReleaseRecord(row) : undefined;
  }

  async listByCourse(courseId: CourseId): Promise<CourseReleaseRecord[]> {
    const rows = await this.db
      .select()
      .from(courseReleases)
      .where(eq(courseReleases.courseId, courseId))
      .orderBy(desc(courseReleases.versionNumber));

    return rows.map(toReleaseRecord);
  }

  async findLatestByCourse(courseId: CourseId): Promise<CourseReleaseRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(courseReleases)
      .where(eq(courseReleases.courseId, courseId))
      .orderBy(desc(courseReleases.versionNumber))
      .limit(1);

    return row ? toReleaseRecord(row) : undefined;
  }
}
