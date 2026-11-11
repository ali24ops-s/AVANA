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
  title?: string;
  description?: string | null;
  subject: string | null;
  targetAcademicFields?: string[] | null;
  status?: CourseStatus;
  isOfficial?: boolean;
  publisherName?: string | null;
  creatorUserId?: UserId | null;
  examDate: string | null;
  examScope?: ExamScope | null;
  officialExamDate?: string | null;
  officialExamScope?: ExamScope | null;
  version?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CreateCourseRecords = {
  course: CourseRecord;
  auditEvents: readonly AuditEvent[];
  creatorUserId?: UserId;
  initialExamSchedule?: {
    examDate: string | null;
    examScope?: ExamScope | null;
  };
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

  /** Find a personal (non-official) course belonging to a user in their organization by trimmed name. */
  findUserPersonalCourseByName(
    userId: UserId,
    organizationId: OrganizationId,
    name: string,
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

  /** Check whether a specific user is enrolled in a course. */
  isUserEnrolled?(
    userId: UserId,
    courseId: CourseId,
  ): Promise<boolean>;

  /** Get the creator user ID of a course, if known. */
  getCourseCreatorUserId?(courseId: CourseId): Promise<UserId | undefined>;

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

  /** Update or set personal exam schedule for a user on a course. */
  setUserExamSchedule(
    userId: UserId,
    courseId: CourseId,
    examDate: string | null,
    examScope?: ExamScope | null,
  ): Promise<CourseRecord>;

  /** Remove personal exam schedule for a user on a course. */
  deleteUserExamSchedule(
    userId: UserId,
    courseId: CourseId,
  ): Promise<CourseRecord>;

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

  /** Find the latest approved/live publication snapshot in history (published or previously unpublished with valid snapshot). */
  findLatestApprovedByCourse?(courseId: CourseId): Promise<import("@avana/domain").CoursePublicationRecord | undefined>;

  /** Execute atomic unpublish with transaction, row locking, and pending proposal superseding. */
  unpublishCourseAtomic?(params: {
    courseId: CourseId;
    actorUserId: UserId;
    now: string;
    unpublishReason: string;
    cancellationReason: string;
  }): Promise<{
    course: CourseRecord;
    publication: import("@avana/domain").CoursePublicationRecord;
    supersededPublications: import("@avana/domain").CoursePublicationRecord[];
  }>;

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
    courseId?: string;
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

