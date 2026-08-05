/**
 * Drizzle-backed implementation of CourseStore.
 *
 * Implements the CourseStore interface defined in course-store.ts.
 * Uses db.transaction() for atomic multi-table writes (course + audit).
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  auditLogs,
  organizationMemberships,
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

function toCourseRecord(row: {
  id: string;
  organizationId: string;
  name: string;
  subject: string | null;
  examDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): CourseRecord {
  return {
    id: row.id as CourseId,
    organizationId: row.organizationId as OrganizationId,
    name: row.name,
    subject: row.subject,
    examDate: row.examDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
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

  async findByIdForUser(
    courseId: CourseId,
    userId: UserId,
  ): Promise<CourseRecord | undefined> {
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
      .innerJoin(
        organizationMemberships,
        eq(organizationMemberships.organizationId, courses.organizationId),
      )
      .where(
        and(
          eq(courses.id, courseId),
          eq(organizationMemberships.userId, userId),
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
    userId: UserId,
  ): Promise<CourseRecord[]> {
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
      .innerJoin(
        organizationMemberships,
        eq(organizationMemberships.organizationId, courses.organizationId),
      )
      .where(
        and(
          eq(courses.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
          isNull(courses.deletedAt),
        ),
      );

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
}
