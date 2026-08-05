/**
 * Course store abstraction.
 *
 * Decouples course data access from the database.
 * A Drizzle-backed implementation would be wired at composition root.
 *
 * Follows the PR-8 organization-store pattern:
 * - All lookups are scoped to organization membership.
 * - No course may be retrieved by course ID alone.
 */

import type {
  AuditEvent,
  CourseId,
  OrganizationId,
  UserId,
} from "@avana/domain";

export type CourseRecord = {
  id: CourseId;
  organizationId: OrganizationId;
  name: string;
  subject: string | null;
  examDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CreateCourseRecords = {
  course: CourseRecord;
  auditEvents: readonly AuditEvent[];
};

export interface CourseStore {
  /** Atomically insert a course and its audit events. */
  create(records: CreateCourseRecords): Promise<CourseRecord>;

  /** Find a course only through the requesting user's organization membership. */
  findByIdForUser(
    courseId: CourseId,
    userId: UserId,
  ): Promise<CourseRecord | undefined>;

  /** List active (non-deleted) courses for an organization, visible through membership. */
  listByOrganization(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<CourseRecord[]>;

  /** Update a course record. */
  update(course: CourseRecord): Promise<CourseRecord>;

  /** Persist audit events (used by service layer). */
  appendAuditEvents(events: readonly AuditEvent[]): void;
}
