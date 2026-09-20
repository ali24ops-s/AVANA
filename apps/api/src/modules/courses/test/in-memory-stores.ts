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
  CoursePublicationRecord,
} from "@avana/domain";
import type {
  CourseRecord,
  CourseStore,
  CoursePublicationStore,
} from "../course-store.js";

export class InMemoryCourseStore implements CourseStore {
  private courses: Map<string, CourseRecord> = new Map();
  private userCourses: Map<string, Set<string>> = new Map(); // userId -> Set of courseIds
  private auditEvents: AuditEvent[] = [];

  constructor(
    private readonly orgStore?: {
      findMembership(
        organizationId: OrganizationId,
        userId: UserId,
      ): Promise<unknown>;
    },
  ) {}

  async create(records: {
    course: CourseRecord;
    auditEvents: readonly AuditEvent[];
  }): Promise<CourseRecord> {
    if (this.courses.has(records.course.id)) {
      throw new Error("Duplicate course record");
    }

    this.courses.set(records.course.id, { ...records.course });
    if (records.auditEvents) {
      this.auditEvents.push(...records.auditEvents);
    }
    return records.course;
  }

  async findById(courseId: CourseId): Promise<CourseRecord | undefined> {
    const course = this.courses.get(courseId);
    if (!course || course.deletedAt !== null) return undefined;
    return { ...course };
  }

  async findByIdForUser(
    courseId: CourseId,
    userId: UserId,
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
    const userCourses = this.userCourses.get(userId);
    if (userCourses && userCourses.has(courseId)) {
      return { ...course };
    }
    if (this.orgStore) {
      const membership = await this.orgStore.findMembership(
        course.organizationId,
        userId,
      );
      if (membership) return { ...course };
      return undefined;
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

  async delete(courseId: CourseId): Promise<void> {
    this.courses.delete(courseId);
  }

  getAll(): CourseRecord[] {
    return Array.from(this.courses.values()).map((c) => ({ ...c }));
  }
}

export class InMemoryCoursePublicationStore implements CoursePublicationStore {
  private publications: Map<string, CoursePublicationRecord> = new Map();
  private creatorProfiles: Map<string, { id: string; name: string }> = new Map();

  setCreatorProfile(userId: string, name: string) {
    this.creatorProfiles.set(userId, { id: userId, name });
  }

  async create(
    publication: CoursePublicationRecord,
  ): Promise<CoursePublicationRecord> {
    this.publications.set(publication.id, { ...publication });
    return { ...publication };
  }

  async findById(
    id: import("@avana/domain").CoursePublicationId,
  ): Promise<import("@avana/domain").CoursePublicationRecord | undefined> {
    const pub = this.publications.get(id);
    if (!pub || pub.deletedAt !== null) return undefined;
    return { ...pub };
  }

  async findLatestByCourse(
    courseId: import("@avana/domain").CourseId,
  ): Promise<import("@avana/domain").CoursePublicationRecord | undefined> {
    const pubs = Array.from(this.publications.values())
      .filter((p) => p.courseId === courseId && p.deletedAt === null)
      .sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    return pubs[0] ? { ...pubs[0] } : undefined;
  }

  async findPublishedByCourse(
    courseId: import("@avana/domain").CourseId,
  ): Promise<import("@avana/domain").CoursePublicationRecord | undefined> {
    const pubs = Array.from(this.publications.values())
      .filter((p) => p.courseId === courseId && p.status === "published" && p.deletedAt === null)
      .sort((a, b) => b.version - a.version);
    return pubs[0] ? { ...pubs[0] } : undefined;
  }

  async updateStatus(
    id: import("@avana/domain").CoursePublicationId,
    status: import("@avana/domain").CoursePublicationStatus,
    metadata: import("@avana/domain").CoursePublicationMetadata,
    publishedAt?: string | null,
  ): Promise<import("@avana/domain").CoursePublicationRecord> {
    const pub = this.publications.get(id);
    if (!pub) {
      throw new Error(`Course publication ${id} not found`);
    }
    const updated: import("@avana/domain").CoursePublicationRecord = {
      ...pub,
      status,
      metadata,
      publishedAt: publishedAt !== undefined ? publishedAt : pub.publishedAt,
      updatedAt: new Date().toISOString(),
    };
    this.publications.set(id, updated);
    return { ...updated };
  }

  async listAll(options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: import("@avana/domain").CoursePublicationRecord[];
    totalCount: number;
  }> {
    let pubs = Array.from(this.publications.values()).filter(
      (p) => p.deletedAt === null,
    );

    if (options.status && options.status !== "all") {
      pubs = pubs.filter((p) => p.status === options.status);
    }

    if (options.search && options.search.trim().length > 0) {
      const q = options.search.trim().toLowerCase();
      pubs = pubs.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.subject?.toLowerCase().includes(q),
      );
    }

    pubs.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, options.limit ?? 20);
    const start = (page - 1) * limit;

    return {
      items: pubs.slice(start, start + limit).map((p) => ({ ...p })),
      totalCount: pubs.length,
    };
  }

  async listPublished(options: {
    q?: string;
    subject?: string;
    sort?: "popular" | "newest";
    page?: number;
    limit?: number;
  }): Promise<{
    items: import("@avana/domain").CoursePublicationRecord[];
    totalCount: number;
  }> {
    let pubs = Array.from(this.publications.values()).filter(
      (p) => p.status === "published" && p.deletedAt === null,
    );

    if (options.subject && options.subject !== "all") {
      pubs = pubs.filter((p) => p.subject === options.subject);
    }

    if (options.q && options.q.trim().length > 0) {
      const q = options.q.trim().toLowerCase();
      pubs = pubs.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.subject?.toLowerCase().includes(q),
      );
    }

    if (options.sort === "newest") {
      pubs.sort(
        (a, b) =>
          new Date(b.publishedAt ?? b.createdAt).getTime() -
          new Date(a.publishedAt ?? a.createdAt).getTime(),
      );
    } else {
      pubs.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, options.limit ?? 20);
    const start = (page - 1) * limit;

    return {
      items: pubs.slice(start, start + limit).map((p) => ({ ...p })),
      totalCount: pubs.length,
    };
  }

  async getCreatorPublicInfo(
    creatorUserId: import("@avana/domain").UserId | null,
  ): Promise<{ id: string; name: string } | null> {
    if (!creatorUserId) return null;
    return this.creatorProfiles.get(creatorUserId) ?? { id: creatorUserId, name: "کاربر آوانا" };
  }
}
