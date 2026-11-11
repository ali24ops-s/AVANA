/**
 * Drizzle-backed implementation of CourseStore.
 *
 * Implements the CourseStore interface defined in course-store.ts.
 * Uses db.transaction() for atomic multi-table writes (course + audit).
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  auditLogs,
  organizationMemberships,
  courseMemberships,
  coursePublications,
  users,
} from "@avana/database/schema";
import type {
  CourseRecord,
  CreateCourseRecords,
  CourseStore,
  CoursePublicationStore,
} from "./course-store.js";
import type {
  AuditEvent,
  CourseId,
  CoursePublicationId,
  CoursePublicationMetadata,
  CoursePublicationRecord,
  CoursePublicationSnapshot,
  CoursePublicationStatus,
  ExamScope,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { DomainError } from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CourseRowInput = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  subject?: string | null;
  targetAcademicFields?: unknown;
  status?: string | null;
  isOfficial?: boolean | null;
  examDate: Date | string | null;
  examScope?: unknown;
  officialExamDate?: Date | string | null;
  officialExamScope?: unknown;
  version?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
};

function toCourseRecord(row: CourseRowInput): CourseRecord {
  return {
    id: row.id as CourseId,
    organizationId: row.organizationId as OrganizationId,
    name: row.name,
    description: row.description ?? null,
    subject: row.subject ?? null,
    targetAcademicFields: Array.isArray(row.targetAcademicFields)
      ? (row.targetAcademicFields as string[])
      : [],
    status: (row.status as CourseRecord["status"]) ?? "published",
    isOfficial: Boolean(row.isOfficial),
    examDate:
      row.examDate instanceof Date
        ? row.examDate.toISOString()
        : row.examDate ?? null,
    examScope: (row.examScope as ExamScope | null) ?? null,
    officialExamDate:
      row.officialExamDate instanceof Date
        ? row.officialExamDate.toISOString()
        : row.officialExamDate ?? null,
    officialExamScope: (row.officialExamScope as ExamScope | null) ?? null,
    version: row.version ?? 1,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString(),
    deletedAt:
      row.deletedAt instanceof Date
        ? row.deletedAt.toISOString()
        : (row.deletedAt ? new Date(row.deletedAt).toISOString() : null),
  };
}

// ---------------------------------------------------------------------------
// DrizzleCourseStore
// ---------------------------------------------------------------------------

export class DrizzleCourseStore implements CourseStore {
  constructor(private readonly db: DbClient) {}

  async create(records: CreateCourseRecords): Promise<CourseRecord> {
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(courses)
        .values({
          id: records.course.id,
          organizationId: records.course.organizationId,
          name: records.course.name,
          description: records.course.description ?? null,
          subject: records.course.subject,
          targetAcademicFields: records.course.targetAcademicFields ?? [],
          status: records.course.status ?? "published",
          isOfficial: records.course.isOfficial ?? false,
          examDate: records.course.officialExamDate
            ? new Date(records.course.officialExamDate)
            : null,
          examScope: records.course.officialExamScope ?? null,
          createdAt: new Date(records.course.createdAt),
          updatedAt: new Date(records.course.updatedAt),
        })
        .returning();

      if (records.creatorUserId) {
        const initialExamDate = records.initialExamSchedule?.examDate
          ? new Date(records.initialExamSchedule.examDate)
          : null;
        const initialExamScope =
          records.initialExamSchedule?.examScope !== undefined
            ? records.initialExamSchedule.examScope
            : null;

        await tx
          .insert(courseMemberships)
          .values({
            courseId: records.course.id,
            userId: records.creatorUserId,
            role: "student",
            examDate: initialExamDate,
            examScope: initialExamScope,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
      }

      for (const event of records.auditEvents) {
        await tx.insert(auditLogs).values({
          actorId: event.actorId,
          organizationId: event.organizationId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          details: event.details as Record<string, unknown> | null,
        });
      }

      const createdRecord = toCourseRecord(row);
      if (records.initialExamSchedule) {
        createdRecord.examDate = records.initialExamSchedule.examDate ?? null;
        createdRecord.examScope = records.initialExamSchedule.examScope ?? null;
      }
      return createdRecord;
    });

    return result;
  }

  async findUserPersonalCourseByName(
    userId: UserId,
    organizationId: OrganizationId,
    name: string,
  ): Promise<CourseRecord | undefined> {
    const trimmed = name.trim().toLowerCase();
    const rows = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        description: courses.description,
        subject: courses.subject,
        targetAcademicFields: courses.targetAcademicFields,
        status: courses.status,
        isOfficial: courses.isOfficial,
        examDate: courseMemberships.examDate,
        examScope: courseMemberships.examScope,
        officialExamDate: courses.examDate,
        officialExamScope: courses.examScope,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        deletedAt: courses.deletedAt,
      })
      .from(courses)
      .innerJoin(
        courseMemberships,
        and(
          eq(courseMemberships.courseId, courses.id),
          eq(courseMemberships.userId, userId),
        ),
      )
      .where(
        and(
          eq(courses.organizationId, organizationId),
          eq(courses.isOfficial, false),
          isNull(courses.deletedAt),
          sql`lower(trim(${courses.name})) = ${trimmed}`,
        ),
      )
      .limit(1);

    if (rows.length === 0) return undefined;
    return toCourseRecord(rows[0]);
  }

  async findById(courseId: CourseId): Promise<CourseRecord | undefined> {
    const row = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        description: courses.description,
        subject: courses.subject,
        targetAcademicFields: courses.targetAcademicFields,
        status: courses.status,
        isOfficial: courses.isOfficial,
        examDate: sql<Date | string | null>`NULL`,
        examScope: sql<unknown>`NULL`,
        officialExamDate: courses.examDate,
        officialExamScope: courses.examScope,
        version: courses.version,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        deletedAt: courses.deletedAt,
      })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toCourseRecord(row);
  }

  async findByIdForUser(
    courseId: CourseId,
    userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord | undefined> {
    const isPublicApproved = and(
      eq(courses.status, "published"),
      or(
        eq(courses.isOfficial, true),
        sql`EXISTS (SELECT 1 FROM ${coursePublications} cp WHERE cp.course_id = ${courses.id} AND cp.status = 'published' AND cp.deleted_at IS NULL)`,
      ),
    );

    const isEnrolledInCourse = eq(courseMemberships.userId, userId);

    const accessConditions = [
      eq(organizationMemberships.userId, userId),
      isPublicApproved,
      isEnrolledInCourse,
    ];

    if (systemOrganizationId) {
      accessConditions.push(eq(courses.organizationId, systemOrganizationId));
    }

    const accessFilter = or(...accessConditions);

    const row = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        description: courses.description,
        subject: courses.subject,
        targetAcademicFields: courses.targetAcademicFields,
        status: courses.status,
        isOfficial: courses.isOfficial,
        examDate: courseMemberships.examDate,
        examScope: courseMemberships.examScope,
        officialExamDate: courses.examDate,
        officialExamScope: courses.examScope,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        deletedAt: courses.deletedAt,
      })
      .from(courses)
      .leftJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.organizationId, courses.organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      )
      .leftJoin(
        courseMemberships,
        and(
          eq(courseMemberships.courseId, courses.id),
          eq(courseMemberships.userId, userId),
        ),
      )
      .where(
        and(
          eq(courses.id, courseId),
          accessFilter,
          isNull(courses.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toCourseRecord(row);
  }

  async listByOrganization(
    organizationId: OrganizationId,
    _userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]> {
    const isPublicApproved = and(
      eq(courses.status, "published"),
      or(
        eq(courses.isOfficial, true),
        sql`EXISTS (SELECT 1 FROM ${coursePublications} cp WHERE cp.course_id = ${courses.id} AND cp.status = 'published' AND cp.deleted_at IS NULL)`,
      ),
    );

    const orgFilter =
      systemOrganizationId && systemOrganizationId !== organizationId
        ? or(
            eq(courses.organizationId, organizationId),
            eq(courses.organizationId, systemOrganizationId),
            isPublicApproved,
          )
        : or(eq(courses.organizationId, organizationId), isPublicApproved);

    const rows = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        description: courses.description,
        subject: courses.subject,
        targetAcademicFields: courses.targetAcademicFields,
        status: courses.status,
        isOfficial: courses.isOfficial,
        examDate: sql<Date | string | null>`NULL`,
        examScope: sql<unknown>`NULL`,
        officialExamDate: courses.examDate,
        officialExamScope: courses.examScope,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        deletedAt: courses.deletedAt,
      })
      .from(courses)
      .where(and(orgFilter, isNull(courses.deletedAt)));

    return rows.map(toCourseRecord);
  }

  async update(course: CourseRecord): Promise<CourseRecord> {
    const [row] = await this.db
      .update(courses)
      .set({
        name: course.name,
        description: course.description ?? null,
        subject: course.subject,
        targetAcademicFields:
          course.targetAcademicFields !== undefined
            ? course.targetAcademicFields
            : [],
        status: course.status ?? "published",
        isOfficial: course.isOfficial ?? false,
        version: course.version !== undefined ? course.version : undefined,
        examDate: course.officialExamDate ? new Date(course.officialExamDate) : null,
        examScope: course.officialExamScope !== undefined ? course.officialExamScope : null,
        updatedAt: new Date(course.updatedAt),
      })
      .where(eq(courses.id, course.id))
      .returning();

    return toCourseRecord(row);
  }

  async appendAuditEvents(events: readonly AuditEvent[]): Promise<void> {
    for (const event of events) {
      await this.db.insert(auditLogs).values({
        actorId: event.actorId,
        organizationId: event.organizationId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        details: event.details as Record<string, unknown> | null,
      });
    }
  }

  async listUserCourses(
    userId: UserId,
    organizationId?: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]> {
    const isPublicApproved = and(
      eq(courses.status, "published"),
      or(
        eq(courses.isOfficial, true),
        sql`EXISTS (SELECT 1 FROM ${coursePublications} cp WHERE cp.course_id = ${courses.id} AND cp.status = 'published' AND cp.deleted_at IS NULL)`,
      ),
    );

    const orgFilter =
      organizationId && systemOrganizationId && systemOrganizationId !== organizationId
        ? or(
            eq(courses.organizationId, organizationId),
            eq(courses.organizationId, systemOrganizationId),
            isPublicApproved,
          )
        : organizationId
          ? or(eq(courses.organizationId, organizationId), isPublicApproved)
          : undefined;

    const whereClause = orgFilter
      ? and(
          eq(courseMemberships.userId, userId),
          isNull(courses.deletedAt),
          orgFilter,
        )
      : and(
          eq(courseMemberships.userId, userId),
          isNull(courses.deletedAt),
        );

    const rows = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        description: courses.description,
        subject: courses.subject,
        targetAcademicFields: courses.targetAcademicFields,
        status: courses.status,
        isOfficial: courses.isOfficial,
        examDate: courseMemberships.examDate,
        examScope: courseMemberships.examScope,
        officialExamDate: courses.examDate,
        officialExamScope: courses.examScope,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        deletedAt: courses.deletedAt,
      })
      .from(courseMemberships)
      .innerJoin(courses, eq(courses.id, courseMemberships.courseId))
      .where(whereClause);

    return rows.map(toCourseRecord);
  }

  async addUserCourse(
    userId: UserId,
    courseId: CourseId,
    role: string = "student",
  ): Promise<void> {
    const existing = await this.db
      .select({ id: courseMemberships.id })
      .from(courseMemberships)
      .where(
        and(
          eq(courseMemberships.userId, userId),
          eq(courseMemberships.courseId, courseId),
        ),
      )
      .limit(1);

    if (existing.length > 0) return;

    await this.db.insert(courseMemberships).values({
      userId,
      courseId,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async isUserEnrolled(
    userId: UserId,
    courseId: CourseId,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: courseMemberships.id })
      .from(courseMemberships)
      .where(
        and(
          eq(courseMemberships.userId, userId),
          eq(courseMemberships.courseId, courseId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async getCourseCreatorUserId(courseId: CourseId): Promise<UserId | undefined> {
    const [pub] = await this.db
      .select({ creatorUserId: coursePublications.creatorUserId })
      .from(coursePublications)
      .where(and(eq(coursePublications.courseId, courseId), isNull(coursePublications.deletedAt)))
      .orderBy(asc(coursePublications.createdAt))
      .limit(1);

    if (pub?.creatorUserId) {
      return pub.creatorUserId as UserId;
    }

    const [audit] = await this.db
      .select({ actorId: auditLogs.actorId })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, "course"),
          eq(auditLogs.entityId, courseId),
          eq(auditLogs.action, "course.created"),
        ),
      )
      .orderBy(asc(auditLogs.createdAt))
      .limit(1);

    return audit?.actorId ? (audit.actorId as UserId) : undefined;
  }

  async removeUserCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<void> {
    await this.db
      .delete(courseMemberships)
      .where(
        and(
          eq(courseMemberships.userId, userId),
          eq(courseMemberships.courseId, courseId),
        ),
      );
  }

  async setUserExamSchedule(
    userId: UserId,
    courseId: CourseId,
    examDate: string | null,
    examScope?: ExamScope | null,
  ): Promise<CourseRecord> {
    const parsedExamDate = examDate ? new Date(examDate) : null;
    const sanitizedScope = examScope !== undefined ? examScope : null;

    const existing = await this.db
      .select({ id: courseMemberships.id })
      .from(courseMemberships)
      .where(
        and(
          eq(courseMemberships.userId, userId),
          eq(courseMemberships.courseId, courseId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(courseMemberships)
        .set({
          examDate: parsedExamDate,
          examScope: sanitizedScope,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(courseMemberships.userId, userId),
            eq(courseMemberships.courseId, courseId),
          ),
        );
    } else {
      await this.db.insert(courseMemberships).values({
        userId,
        courseId,
        role: "student",
        examDate: parsedExamDate,
        examScope: sanitizedScope,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const course = await this.findByIdForUser(courseId, userId);
    if (!course) {
      throw new Error("Course not found after setting exam schedule");
    }
    return course;
  }

  async deleteUserExamSchedule(
    userId: UserId,
    courseId: CourseId,
  ): Promise<CourseRecord> {
    await this.db
      .update(courseMemberships)
      .set({
        examDate: null,
        examScope: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courseMemberships.userId, userId),
          eq(courseMemberships.courseId, courseId),
        ),
      );

    const course = await this.findByIdForUser(courseId, userId);
    if (!course) {
      throw new Error("Course not found after deleting exam schedule");
    }
    return course;
  }

  async syncUserCourses(
    userId: UserId,
    courseIds: CourseId[],
  ): Promise<void> {
    const targetIds = Array.from(new Set(courseIds));

    await this.db.transaction(async (tx) => {
      const current = await tx
        .select({ courseId: courseMemberships.courseId })
        .from(courseMemberships)
        .where(eq(courseMemberships.userId, userId));

      const currentIds = new Set(current.map((r) => r.courseId));
      const targetIdSet = new Set(targetIds);

      // 1. Delete memberships that are no longer in target list
      const toRemove = current.filter((r) => !targetIdSet.has(r.courseId as CourseId));
      if (toRemove.length > 0) {
        const removeCourseIds = toRemove.map((r) => r.courseId);
        await tx
          .delete(courseMemberships)
          .where(
            and(
              eq(courseMemberships.userId, userId),
              inArray(courseMemberships.courseId, removeCourseIds),
            ),
          );
      }

      // 2. Insert newly selected courses; retained courses keep their existing examDate & examScope
      const toAdd = targetIds.filter((id) => !currentIds.has(id));
      if (toAdd.length > 0) {
        const now = new Date();
        for (const cId of toAdd) {
          await tx.insert(courseMemberships).values({
            userId,
            courseId: cId,
            role: "student",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    });
  }

  async listPopular(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
    limit: number = 8,
  ): Promise<CourseRecord[]> {
    const orgFilter =
      systemOrganizationId && systemOrganizationId !== organizationId
        ? sql`(c.organization_id = ${organizationId} OR c.organization_id = ${systemOrganizationId})`
        : sql`c.organization_id = ${organizationId}`;

    const queryResult = await this.db.execute(sql`
      SELECT 
        c.id,
        c.organization_id AS "organizationId",
        c.name,
        c.description,
        c.subject,
        c.target_academic_fields AS "targetAcademicFields",
        c.status,
        c.is_official AS "isOfficial",
        NULL AS "examDate",
        NULL AS "examScope",
        c.exam_date AS "officialExamDate",
        c.exam_scope AS "officialExamScope",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        c.deleted_at AS "deletedAt"
      FROM courses c
      LEFT JOIN (
        SELECT course_id, COUNT(DISTINCT user_id) AS added_users
        FROM course_memberships
        GROUP BY course_id
      ) m_stat ON m_stat.course_id = c.id
      LEFT JOIN (
        SELECT 
          m.course_id,
          COUNT(DISTINCT lp.user_id) AS active_users,
          COUNT(DISTINCT CASE WHEN lp.completed = true THEN lp.user_id END) AS completed_users
        FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id AND l.deleted_at IS NULL
        JOIN modules m ON m.id = l.module_id AND m.deleted_at IS NULL
        GROUP BY m.course_id
      ) p_stat ON p_stat.course_id = c.id
      WHERE ${orgFilter}
        AND c.deleted_at IS NULL
        AND c.status = 'published'
      ORDER BY 
        (
          COALESCE(m_stat.added_users, 0) * 5 +
          COALESCE(p_stat.active_users, 0) * 3 +
          COALESCE(p_stat.completed_users, 0) * 2
        ) DESC,
        c.created_at DESC,
        c.name ASC,
        c.id ASC
      LIMIT ${limit}
    `);

    const resultRows: CourseRowInput[] = Array.isArray(queryResult)
      ? (queryResult as unknown as CourseRowInput[])
      : (((queryResult as { rows?: unknown[] })?.rows ?? []) as unknown as CourseRowInput[]);

    return resultRows.map(toCourseRecord);
  }

  async delete(courseId: CourseId): Promise<void> {
    await this.db.delete(courses).where(eq(courses.id, courseId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleCoursePublicationStore
// ---------------------------------------------------------------------------

function toCoursePublicationRecord(row: typeof coursePublications.$inferSelect): CoursePublicationRecord {
  return {
    id: row.id as CoursePublicationId,
    courseId: row.courseId as CourseId,
    creatorUserId: (row.creatorUserId as UserId) ?? null,
    organizationId: (row.organizationId as OrganizationId) ?? null,
    title: row.title,
    description: row.description,
    subject: row.subject,
    version: row.version,
    status: row.status as CoursePublicationStatus,
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : (row.publishedAt ?? null),
    metadata: (row.metadata as CoursePublicationMetadata) ?? {},
    snapshot: (row.snapshot as CoursePublicationSnapshot) ?? { chapters: [], stats: {} },
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
    deletedAt: row.deletedAt instanceof Date ? row.deletedAt.toISOString() : (row.deletedAt ?? null),
  };
}

export class DrizzleCoursePublicationStore implements CoursePublicationStore {
  constructor(private readonly db: DbClient) {}

  async create(publication: CoursePublicationRecord): Promise<CoursePublicationRecord> {
    try {
      const [row] = await this.db
        .insert(coursePublications)
        .values({
          id: publication.id,
          courseId: publication.courseId,
          creatorUserId: publication.creatorUserId,
          organizationId: publication.organizationId,
          title: publication.title,
          description: publication.description,
          subject: publication.subject,
          version: publication.version,
          status: publication.status,
          publishedAt: publication.publishedAt ? new Date(publication.publishedAt) : null,
          metadata: publication.metadata,
          snapshot: publication.snapshot,
          createdAt: new Date(publication.createdAt),
          updatedAt: new Date(publication.updatedAt),
          deletedAt: publication.deletedAt ? new Date(publication.deletedAt) : null,
        })
        .returning();

      return toCoursePublicationRecord(row);
    } catch (err: unknown) {
      const errorMsg = String((err as { message?: string })?.message || "");
      const errorCode = (err as { code?: string })?.code;
      if (errorCode === "23505" || errorMsg.includes("idx_course_publications_course_version")) {
        throw new DomainError(
          "conflict",
          `یک درخواست انتشار با نسخه ${publication.version} قبلاً ثبت شده است. لطفاً مجدداً تلاش کنید.`,
        );
      }
      throw err;
    }
  }

  async findById(id: CoursePublicationId): Promise<CoursePublicationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(coursePublications)
      .where(and(eq(coursePublications.id, id), isNull(coursePublications.deletedAt)));

    return row ? toCoursePublicationRecord(row) : undefined;
  }

  async findLatestByCourse(courseId: CourseId): Promise<CoursePublicationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(coursePublications)
      .where(and(eq(coursePublications.courseId, courseId), isNull(coursePublications.deletedAt)))
      .orderBy(sql`${coursePublications.version} DESC, ${coursePublications.createdAt} DESC`)
      .limit(1);

    return row ? toCoursePublicationRecord(row) : undefined;
  }

  async findPublishedByCourse(courseId: CourseId): Promise<CoursePublicationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(coursePublications)
      .where(
        and(
          eq(coursePublications.courseId, courseId),
          eq(coursePublications.status, "published"),
          isNull(coursePublications.deletedAt),
        ),
      )
      .orderBy(sql`${coursePublications.version} DESC`)
      .limit(1);

    return row ? toCoursePublicationRecord(row) : undefined;
  }

  async findLatestApprovedByCourse(courseId: CourseId): Promise<CoursePublicationRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(coursePublications)
      .where(
        and(
          eq(coursePublications.courseId, courseId),
          or(
            eq(coursePublications.status, "published"),
            eq(coursePublications.status, "unpublished"),
          ),
          sql`${coursePublications.publishedAt} IS NOT NULL`,
          isNull(coursePublications.deletedAt),
        ),
      )
      .orderBy(sql`${coursePublications.version} DESC, ${coursePublications.publishedAt} DESC`)
      .limit(1);

    return row ? toCoursePublicationRecord(row) : undefined;
  }

  async unpublishCourseAtomic(params: {
    courseId: CourseId;
    actorUserId: UserId;
    now: string;
    unpublishReason: string;
    cancellationReason: string;
  }): Promise<{
    course: CourseRecord;
    publication: CoursePublicationRecord;
    supersededPublications: CoursePublicationRecord[];
  }> {
    return await this.db.transaction(async (tx) => {
      // 1. Lock and fetch course row
      const [courseRow] = await tx
        .select()
        .from(courses)
        .where(and(eq(courses.id, params.courseId), isNull(courses.deletedAt)))
        .for("update");

      if (!courseRow) {
        throw new DomainError("not_found", "Course not found");
      }

      // 2. Fetch published publication if exists
      const [publishedRow] = await tx
        .select()
        .from(coursePublications)
        .where(
          and(
            eq(coursePublications.courseId, params.courseId),
            eq(coursePublications.status, "published"),
            isNull(coursePublications.deletedAt),
          ),
        )
        .orderBy(sql`${coursePublications.version} DESC`)
        .limit(1)
        .for("update");

      if (!publishedRow && courseRow.status !== "published") {
        throw new DomainError("bad_request", "این دوره در حال حاضر منتشر نشده است.");
      }

      // 3. Find and supersede pending review or changes requested submissions
      const pendingRows = await tx
        .select()
        .from(coursePublications)
        .where(
          and(
            eq(coursePublications.courseId, params.courseId),
            or(
              eq(coursePublications.status, "pending_review"),
              eq(coursePublications.status, "changes_requested"),
            ),
            isNull(coursePublications.deletedAt),
          ),
        )
        .for("update");

      const supersededPublications: CoursePublicationRecord[] = [];
      for (const pRow of pendingRows) {
        const [updatedPending] = await tx
          .update(coursePublications)
          .set({
            status: "superseded",
            metadata: {
              ...((pRow.metadata as any) ?? {}),
              supersededAt: params.now,
              cancellationReason: params.cancellationReason,
              supersededByUserId: params.actorUserId,
            },
            updatedAt: new Date(params.now),
          })
          .where(eq(coursePublications.id, pRow.id))
          .returning();
        if (updatedPending) {
          supersededPublications.push(toCoursePublicationRecord(updatedPending));
        }
      }

      // 4. Mark active published publication as unpublished
      let finalPublishedPub: CoursePublicationRecord;
      if (publishedRow) {
        const [updatedPub] = await tx
          .update(coursePublications)
          .set({
            status: "unpublished",
            metadata: {
              ...((publishedRow.metadata as any) ?? {}),
              unpublishedAt: params.now,
              unpublishedByUserId: params.actorUserId,
              unpublishReason: params.unpublishReason,
            },
            updatedAt: new Date(params.now),
          })
          .where(eq(coursePublications.id, publishedRow.id))
          .returning();
        finalPublishedPub = toCoursePublicationRecord(updatedPub);
      } else {
        const candidateRow = pendingRows[0] ?? publishedRow;
        if (!candidateRow) {
          throw new DomainError(
            "bad_request",
            "دوره در وضعیت انتشار عمومی قرار ندارد و هیچ رکورد انتشار معتبری برای آن یافت نشد.",
          );
        }
        finalPublishedPub = toCoursePublicationRecord(candidateRow);
      }

      // 5. Update course row status to unpublished
      const [updatedCourseRow] = await tx
        .update(courses)
        .set({
          status: "unpublished",
          updatedAt: new Date(params.now),
        })
        .where(eq(courses.id, params.courseId))
        .returning();

      return {
        course: toCourseRecord(updatedCourseRow),
        publication: finalPublishedPub,
        supersededPublications,
      };
    });
  }

  async updateStatus(
    id: CoursePublicationId,
    status: CoursePublicationStatus,
    metadata: CoursePublicationMetadata,
    publishedAt?: string | null,
  ): Promise<CoursePublicationRecord> {
    const updateValues: Record<string, unknown> = {
      status,
      metadata,
      updatedAt: new Date(),
    };
    if (publishedAt !== undefined) {
      updateValues.publishedAt = publishedAt ? new Date(publishedAt) : null;
    }

    const [row] = await this.db
      .update(coursePublications)
      .set(updateValues)
      .where(eq(coursePublications.id, id))
      .returning();

    if (!row) {
      throw new Error(`Course publication ${id} not found`);
    }

    return toCoursePublicationRecord(row);
  }

  async listAll(options: {
    status?: string;
    search?: string;
    courseId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: CoursePublicationRecord[]; totalCount: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [isNull(coursePublications.deletedAt)];

    if (options.courseId) {
      conditions.push(eq(coursePublications.courseId, options.courseId));
    }

    if (options.status && options.status !== "all") {
      conditions.push(eq(coursePublications.status, options.status));
    }

    if (options.search && options.search.trim().length > 0) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          sql`${coursePublications.title} ILIKE ${term}`,
          sql`${coursePublications.description} ILIKE ${term}`,
          sql`${coursePublications.subject} ILIKE ${term}`,
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(coursePublications)
      .where(whereClause);

    const rows = await this.db
      .select()
      .from(coursePublications)
      .where(whereClause)
      .orderBy(sql`${coursePublications.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(toCoursePublicationRecord),
      totalCount: countResult?.count ?? 0,
    };
  }

  async listPublished(options: {
    q?: string;
    subject?: string;
    sort?: "popular" | "newest";
    page?: number;
    limit?: number;
  }): Promise<{ items: CoursePublicationRecord[]; totalCount: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(coursePublications.status, "published"),
      isNull(coursePublications.deletedAt),
    ];

    if (options.subject && options.subject !== "all") {
      conditions.push(eq(coursePublications.subject, options.subject));
    }

    if (options.q && options.q.trim().length > 0) {
      const term = `%${options.q.trim()}%`;
      conditions.push(
        or(
          sql`${coursePublications.title} ILIKE ${term}`,
          sql`${coursePublications.description} ILIKE ${term}`,
          sql`${coursePublications.subject} ILIKE ${term}`,
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(coursePublications)
      .where(whereClause);

    const orderBy =
      options.sort === "newest"
        ? sql`${coursePublications.publishedAt} DESC NULLS LAST, ${coursePublications.createdAt} DESC`
        : sql`${coursePublications.createdAt} DESC`;

    const rows = await this.db
      .select()
      .from(coursePublications)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(toCoursePublicationRecord),
      totalCount: countResult?.count ?? 0,
    };
  }

  async getCreatorPublicInfo(
    creatorUserId: UserId | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!creatorUserId) return null;
    const [user] = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, creatorUserId));
    if (!user) return null;
    return { id: user.id, name: user.name };
  }
}
