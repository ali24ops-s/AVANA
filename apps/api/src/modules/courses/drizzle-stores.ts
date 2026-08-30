/**
 * Drizzle-backed implementation of CourseStore.
 *
 * Implements the CourseStore interface defined in course-store.ts.
 * Uses db.transaction() for atomic multi-table writes (course + audit).
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  auditLogs,
  organizationMemberships,
  courseMemberships,
} from "@avana/database/schema";
import type {
  CourseRecord,
  CreateCourseRecords,
  CourseStore,
} from "./course-store.js";
import type {
  AuditEvent,
  CourseId,
  OrganizationId,
  UserId,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CourseRowInput = {
  id: string;
  organizationId: string;
  name: string;
  subject: string | null;
  examDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
};

function toCourseRecord(row: CourseRowInput): CourseRecord {
  return {
    id: row.id as CourseId,
    organizationId: row.organizationId as OrganizationId,
    name: row.name,
    subject: row.subject,
    examDate:
      row.examDate instanceof Date
        ? row.examDate.toISOString()
        : row.examDate ?? null,
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
          subject: records.course.subject,
          examDate: records.course.examDate
            ? new Date(records.course.examDate)
            : null,
          createdAt: new Date(records.course.createdAt),
          updatedAt: new Date(records.course.updatedAt),
        })
        .returning();

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

      return toCourseRecord(row);
    });

    return result;
  }

  async findById(courseId: CourseId): Promise<CourseRecord | undefined> {
    const row = await this.db
      .select()
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
    const accessFilter =
      systemOrganizationId
        ? or(
            eq(organizationMemberships.userId, userId),
            eq(courses.organizationId, systemOrganizationId),
          )
        : eq(organizationMemberships.userId, userId);

    const row = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        subject: courses.subject,
        examDate: courses.examDate,
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
    const orgFilter =
      systemOrganizationId && systemOrganizationId !== organizationId
        ? or(
            eq(courses.organizationId, organizationId),
            eq(courses.organizationId, systemOrganizationId),
          )
        : eq(courses.organizationId, organizationId);

    const rows = await this.db
      .select({
        id: courses.id,
        organizationId: courses.organizationId,
        name: courses.name,
        subject: courses.subject,
        examDate: courses.examDate,
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
        subject: course.subject,
        examDate: course.examDate ? new Date(course.examDate) : null,
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
    const orgFilter =
      organizationId && systemOrganizationId && systemOrganizationId !== organizationId
        ? or(
            eq(courses.organizationId, organizationId),
            eq(courses.organizationId, systemOrganizationId),
          )
        : organizationId
          ? eq(courses.organizationId, organizationId)
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
        subject: courses.subject,
        examDate: courses.examDate,
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

  async syncUserCourses(
    userId: UserId,
    courseIds: CourseId[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(courseMemberships)
        .where(eq(courseMemberships.userId, userId));

      if (courseIds.length > 0) {
        const now = new Date();
        const uniqueIds = Array.from(new Set(courseIds));
        for (const cId of uniqueIds) {
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
        c.subject,
        c.exam_date AS "examDate",
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
}


