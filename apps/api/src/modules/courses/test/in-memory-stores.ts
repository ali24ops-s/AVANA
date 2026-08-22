/**
 * In-memory implementation of CourseStore for testing.
 *
 * Follows the PR-8 InMemoryOrganizationStore pattern.
 */

import type {
  AuditEvent,
  CourseId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import type { CourseRecord, CourseStore } from "../course-store.js";

export class InMemoryCourseStore implements CourseStore {
  private courses: Map<string, CourseRecord> = new Map();
  private userCourses: Map<string, Set<string>> = new Map(); // userId -> Set of courseIds
  private auditEvents: AuditEvent[] = [];

  async create(records: {
    course: CourseRecord;
    auditEvents: readonly AuditEvent[];
  }): Promise<CourseRecord> {
    if (this.courses.has(records.course.id)) {
      throw new Error("Duplicate course record");
    }

    this.courses.set(records.course.id, { ...records.course });
    this.auditEvents.push(...records.auditEvents);
    return records.course;
  }

  async findByIdForUser(
    courseId: CourseId,
    _userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord | undefined> {
    const course = this.courses.get(courseId);
    if (!course || course.deletedAt !== null) return undefined;
    if (
      systemOrganizationId &&
      course.organizationId === systemOrganizationId
    ) {
      return { ...course };
    }
    return { ...course };
  }

  async listByOrganization(
    organizationId: OrganizationId,
    _userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]> {
    return Array.from(this.courses.values())
      .filter(
        (c) =>
          (c.organizationId === organizationId ||
            (systemOrganizationId &&
              c.organizationId === systemOrganizationId)) &&
          c.deletedAt === null,
      )
      .map((c) => ({ ...c }));
  }

  async update(course: CourseRecord): Promise<CourseRecord> {
    if (!this.courses.has(course.id)) {
      throw new Error("Course not found");
    }

    this.courses.set(course.id, { ...course });
    return { ...course };
  }

  appendAuditEvents(events: readonly AuditEvent[]): void {
    this.auditEvents.push(...events);
  }

  getAuditEvents(): readonly AuditEvent[] {
    return this.auditEvents;
  }

  async listUserCourses(
    userId: UserId,
    organizationId?: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]> {
    const enrolledIds = this.userCourses.get(userId) ?? new Set();
    return Array.from(this.courses.values())
      .filter(
        (c) =>
          enrolledIds.has(c.id) &&
          c.deletedAt === null &&
          (!organizationId ||
            c.organizationId === organizationId ||
            (systemOrganizationId && c.organizationId === systemOrganizationId)),
      )
      .map((c) => ({ ...c }));
  }

  async addUserCourse(
    userId: UserId,
    courseId: CourseId,
    _role?: string,
  ): Promise<void> {
    let set = this.userCourses.get(userId);
    if (!set) {
      set = new Set();
      this.userCourses.set(userId, set);
    }
    set.add(courseId);
  }

  async removeUserCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<void> {
    const set = this.userCourses.get(userId);
    if (set) {
      set.delete(courseId);
    }
  }

  async syncUserCourses(
    userId: UserId,
    courseIds: CourseId[],
  ): Promise<void> {
    this.userCourses.set(userId, new Set(courseIds));
  }
}

