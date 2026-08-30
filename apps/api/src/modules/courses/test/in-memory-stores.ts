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

  async findById(courseId: CourseId): Promise<CourseRecord | undefined> {
    const course = this.courses.get(courseId);
    if (!course || course.deletedAt !== null) return undefined;
    return { ...course };
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

  private courseMetrics: Map<
    string,
    { activeUsers: number; completedUsers: number }
  > = new Map();

  setCourseMetrics(
    courseId: string,
    metrics: { activeUsers: number; completedUsers: number },
  ): void {
    this.courseMetrics.set(courseId, metrics);
  }

  async syncUserCourses(
    userId: UserId,
    courseIds: CourseId[],
  ): Promise<void> {
    this.userCourses.set(userId, new Set(courseIds));
  }

  async listPopular(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
    limit: number = 8,
  ): Promise<CourseRecord[]> {
    const candidateCourses = Array.from(this.courses.values()).filter(
      (c) =>
        c.deletedAt === null &&
        (!organizationId ||
          c.organizationId === organizationId ||
          (systemOrganizationId && c.organizationId === systemOrganizationId)),
    );

    const scoredCourses = candidateCourses.map((c) => {
      let addedUsers = 0;
      for (const [, courseSet] of this.userCourses.entries()) {
        if (courseSet.has(c.id)) {
          addedUsers++;
        }
      }

      const extra = this.courseMetrics.get(c.id) ?? {
        activeUsers: 0,
        completedUsers: 0,
      };

      const score =
        addedUsers * 5 + extra.activeUsers * 3 + extra.completedUsers * 2;

      return {
        course: { ...c },
        score,
      };
    });

    scoredCourses.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const timeA = new Date(a.course.createdAt).getTime();
      const timeB = new Date(b.course.createdAt).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      if (a.course.name !== b.course.name) {
        return a.course.name.localeCompare(b.course.name);
      }
      return a.course.id.localeCompare(b.course.id);
    });

    return scoredCourses.slice(0, limit).map((sc) => sc.course);
  }
}


