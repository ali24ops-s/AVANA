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
  CourseStatus,
  ExamScope,
  OrganizationId,
  UserId,
} from "@avana/domain";

export type CourseRecord = {
  id: CourseId;
  organizationId: OrganizationId;
  name: string;
  description?: string | null;
  subject: string | null;
  status?: CourseStatus;
  isOfficial?: boolean;
  examDate: string | null;
  examScope?: ExamScope | null;
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

  /** Permanently delete a course record by ID. */
  delete?(courseId: CourseId): Promise<void>;
}

export interface CoursePublicationStore {
  /** Create a new course publication snapshot record. */
  create(publication: import("@avana/domain").CoursePublicationRecord): Promise<import("@avana/domain").CoursePublicationRecord>;

  /** Find a publication record by ID. */
  findById(id: import("@avana/domain").CoursePublicationId): Promise<import("@avana/domain").CoursePublicationRecord | undefined>;

  /** Find the latest publication record for a course. */
  findLatestByCourse(courseId: CourseId): Promise<import("@avana/domain").CoursePublicationRecord | undefined>;

  /** Find the currently published version for a course. */
  findPublishedByCourse(courseId: CourseId): Promise<import("@avana/domain").CoursePublicationRecord | undefined>;

  /** Update publication status and metadata. */
  updateStatus(
    id: import("@avana/domain").CoursePublicationId,
    status: import("@avana/domain").CoursePublicationStatus,
    metadata: import("@avana/domain").CoursePublicationMetadata,
    publishedAt?: string | null,
  ): Promise<import("@avana/domain").CoursePublicationRecord>;

  /** List all course publications for admin review. */
  listAll(options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: import("@avana/domain").CoursePublicationRecord[];
    totalCount: number;
  }>;

  /** List published course publications for the public library. */
  listPublished(options: {
    q?: string;
    subject?: string;
    sort?: "popular" | "newest";
    page?: number;
    limit?: number;
  }): Promise<{
    items: import("@avana/domain").CoursePublicationRecord[];
    totalCount: number;
  }>;

  /** Fetch creator public information (name only, no email/private info). */
  getCreatorPublicInfo(
    creatorUserId: UserId | null,
  ): Promise<{ id: string; name: string } | null>;
}

