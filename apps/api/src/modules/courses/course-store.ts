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

  /** Find a course by ID directly without user scoping (used for internal existence/ownership validation). */
  findById(courseId: CourseId): Promise<CourseRecord | undefined>;

  /** Find a course through the requesting user's organization membership or system organization. */
  findByIdForUser(
    courseId: CourseId,
    userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord | undefined>;

  /** List active (non-deleted) courses for an organization, plus shared system courses if provided. */
  listByOrganization(
    organizationId: OrganizationId,
    userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]>;

  /** Update a course record. */
  update(course: CourseRecord): Promise<CourseRecord>;

  /** Persist audit events (used by service layer). */
  appendAuditEvents(events: readonly AuditEvent[]): void;

  /** List courses enrolled/selected by a specific user. */
  listUserCourses(
    userId: UserId,
    organizationId?: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]>;

  /** Add a course to a user's enrolled courses. Idempotent. */
  addUserCourse(
    userId: UserId,
    courseId: CourseId,
    role?: string,
  ): Promise<void>;

  /** Remove a course from a user's enrolled courses. */
  removeUserCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<void>;

  /** Atomically sync the full list of enrolled course IDs for a user. */
  syncUserCourses(
    userId: UserId,
    courseIds: CourseId[],
  ): Promise<void>;

  /** List most popular courses within accessible scope (organization + system) sorted by popularity metric. */
  listPopular(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
    limit?: number,
  ): Promise<CourseRecord[]>;
}

