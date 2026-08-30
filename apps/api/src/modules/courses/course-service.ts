/**
 * Course business logic.
 *
 * Separated from HTTP concerns so it can be tested independently.
 * Delegates authorization decisions to the domain policy layer.
 * Follows the PR-8 OrganizationService pattern.
 */

import { randomUUID } from "node:crypto";
import {
  auditCourseCreated,
  auditCourseUpdated,
  auditCourseArchived,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import type {
  Actor,
  AuthorizationPolicy,
  AuthContext,
  CourseId,
  OrganizationId,
} from "@avana/domain";
import type { CourseStore, CourseRecord } from "./course-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export type CourseUpdateInput = {
  title?: string;
  subject?: string | null;
  examAt?: string | null;
};

export const CANONICAL_COURSES = [
  "شیمی دارویی ۱",
  "شیمی دارویی ۲",
  "شیمی دارویی ۳",
  "فارماسیوتیکس ۱",
  "فارماسیوتیکس ۲",
  "فارماسیوتیکس ۳",
  "فارماسیوتیکس ۴",
  "فارماسیوتیکس ۵",
  "بافت شناسی",
  "بیولوژی",
  "سم شناسی",
] as const;

export class CourseService {
  constructor(
    private readonly store: CourseStore,
    private readonly requireOrgMembership: (
      actor: Actor,
      organizationId: OrganizationId,
    ) => Promise<{ role: string }>,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    // Retained for constructor signature compatibility with the composition
    // root. Aggregate audit events are persisted by the store transactionally
    // (PR5-B5); this service does not emit via AuditService itself.
    _auditService?: AuditService,
    private readonly systemOrganizationId?: OrganizationId,
  ) {}

  /**
   * Create a course inside an organization.
   * Requires the actor to be a member of the organization.
   * Authorization: course:create
   */
  async createCourse(
    actor: Actor,
    organizationId: OrganizationId,
    title: string,
    subject: string | null,
    examAt: string | null,
  ): Promise<CourseRecord> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId };
    this.policy.require("course:create", scopedActor, context);

    if (!title || title.trim().length === 0) {
      throw new DomainError("bad_request", "Course title is required");
    }
    if (title.trim().length > 200) {
      throw new DomainError(
        "bad_request",
        "Course title must not exceed 200 characters",
      );
    }

    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();

    const course: CourseRecord = {
      id: courseId,
      organizationId,
      name: title.trim(),
      subject: subject ?? null,
      examDate: examAt ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const auditEvents = [
      auditCourseCreated(
        actor.userId,
        organizationId,
        courseId,
        title.trim(),
        subject ?? null,
        examAt ?? null,
      ),
    ] as const;

    // The store is the single source of audit persistence for aggregate
    // events: store.create persists the course and these audit events
    // atomically in one transaction. Do NOT emit via AuditService here, or
    // the same events would be written twice (PR5-B5).
    return this.store.create({
      course,
      auditEvents,
    });
  }

  /**
   * List active courses for an organization scoped to the actor's membership.
   * Only returns courses where the actor has organization membership or shared system courses.
   * Courses are sorted according to CANONICAL_COURSES priority order.
   */
  async listCourses(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<CourseRecord[]> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId };
    this.policy.require("course:read", scopedActor, context);

    const courses = await this.store.listByOrganization(
      organizationId,
      actor.userId,
      this.systemOrganizationId,
    );

    return courses.slice().sort((a, b) => {
      const idxA = CANONICAL_COURSES.indexOf(a.name as any);
      const idxB = CANONICAL_COURSES.indexOf(b.name as any);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }

  /**
   * List courses enrolled/selected by the authenticated user in the given organization.
   * Courses are sorted according to CANONICAL_COURSES priority order.
   */
  async listMyCourses(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<CourseRecord[]> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId };
    this.policy.require("course:read", scopedActor, context);

    const courses = await this.store.listUserCourses(
      actor.userId,
      organizationId,
      this.systemOrganizationId,
    );

    return courses.slice().sort((a, b) => {
      const idxA = CANONICAL_COURSES.indexOf(a.name as any);
      const idxB = CANONICAL_COURSES.indexOf(b.name as any);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }

  /**
   * List most popular courses in the system/organization scope.
   * Returns up to `limit` (default: 8) courses ranked by real user adoption and learning signals.
   * Excludes archived/deleted courses and maintains tenant isolation.
   */
  async listPopularCourses(
    actor: Actor,
    organizationId: OrganizationId,
    limit = 8,
  ): Promise<CourseRecord[]> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId };
    this.policy.require("course:read", scopedActor, context);

    return this.store.listPopular(
      organizationId,
      this.systemOrganizationId,
      limit,
    );
  }

  /**
   * Add a course to the user's enrolled / personal courses.
   */
  async addMyCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<void> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:read", scopedActor, context);

    // Verify the course exists and is accessible
    await this.getCourse(actor, organizationId, courseId);

    await this.store.addUserCourse(actor.userId, courseId);
  }

  /**
   * Remove a course from the user's enrolled / personal courses.
   * Does NOT delete or modify the main course in the database.
   */
  async removeMyCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<void> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:read", scopedActor, context);

    await this.store.removeUserCourse(actor.userId, courseId);
  }

  /**
   * Atomically synchronize the user's selected courses.
   */
  async syncMyCourses(
    actor: Actor,
    organizationId: OrganizationId,
    courseIds: CourseId[],
  ): Promise<CourseRecord[]> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId };
    this.policy.require("course:read", scopedActor, context);

    // Verify all specified courses exist and are accessible
    for (const cId of courseIds) {
      await this.getCourse(actor, organizationId, cId);
    }

    await this.store.syncUserCourses(actor.userId, courseIds);
    return this.listMyCourses(actor, organizationId);
  }


  /**
   * Get a single course by ID, scoped to the actor's organization membership or system organization.
   * No course lookup by ID alone — always requires membership context.
   */
  async getCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<CourseRecord> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:read", scopedActor, context);

    const course = await this.store.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    // Ensure the course belongs to the requesting organization or system organization (cross-tenant isolation)
    if (
      course.organizationId !== organizationId &&
      (!this.systemOrganizationId ||
        course.organizationId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    return course;
  }

  /**
   * Update a course where permitted.
   * Authorization: course:update
   */
  async updateCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    input: CourseUpdateInput,
  ): Promise<CourseRecord> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };

    const isOnlyExamDate =
      input.examAt !== undefined &&
      input.title === undefined &&
      input.subject === undefined;

    if (isOnlyExamDate) {
      this.policy.require("course:read", scopedActor, context);
    } else {
      this.policy.require("course:update", scopedActor, context);
    }

    const course = await this.store.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    // Ensure the course belongs to the requesting organization or system organization (cross-tenant isolation)
    if (
      course.organizationId !== organizationId &&
      (!this.systemOrganizationId ||
        course.organizationId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    if (course.deletedAt) {
      throw new DomainError("bad_request", "Cannot update an archived course");
    }

    const changes: Record<
      string,
      string | number | boolean | null | undefined
    > = {};

    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (trimmed.length === 0) {
        throw new DomainError("bad_request", "Course title cannot be empty");
      }
      if (trimmed.length > 200) {
        throw new DomainError(
          "bad_request",
          "Course title must not exceed 200 characters",
        );
      }
      course.name = trimmed;
      changes.title = trimmed;
    }

    if (input.subject !== undefined) {
      course.subject = input.subject;
      changes.subject = input.subject;
    }

    if (input.examAt !== undefined) {
      course.examDate = input.examAt;
      changes.exam_at = input.examAt;
    }

    course.updatedAt = new Date().toISOString();

    const updated = await this.store.update(course);

    if (Object.keys(changes).length > 0) {
      const courseAuditEvents = [
        auditCourseUpdated(actor.userId, organizationId, courseId, changes),
      ] as const;

      // The store is the single source of audit persistence for aggregate
      // events (PR5-B5): appendAuditEvents persists the update event here.
      // Do NOT emit via AuditService as well, or it would be written twice.
      this.store.appendAuditEvents(courseAuditEvents);
    }

    return updated;
  }

  /**
   * Archive a course (soft delete).
   * Authorization: course:archive
   */
  async archiveCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<void> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:archive", scopedActor, context);

    const course = await this.store.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    // Ensure the course belongs to the requesting organization or system organization (cross-tenant isolation)
    if (
      course.organizationId !== organizationId &&
      (!this.systemOrganizationId ||
        course.organizationId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    if (course.deletedAt) {
      throw new DomainError("bad_request", "Course is already archived");
    }

    course.deletedAt = new Date().toISOString();
    course.updatedAt = course.deletedAt;

    await this.store.update(course);

    const archiveAuditEvents = [
      auditCourseArchived(actor.userId, organizationId, courseId),
    ] as const;

    // The store is the single source of audit persistence for aggregate
    // events (PR5-B5): appendAuditEvents persists the archive event here.
    // Do NOT emit via AuditService as well, or it would be written twice.
    this.store.appendAuditEvents(archiveAuditEvents);
  }
}
