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
import { DomainError } from "@avana/domain";
import type {
  CourseRecord,
  CourseStore,
  CoursePublicationStore,
  CreateCourseRecords,
} from "../course-store.js";

export class InMemoryCourseStore implements CourseStore {
  private courses: Map<string, CourseRecord> = new Map();
  private userCourses: Map<string, Set<string>> = new Map(); // userId -> Set of courseIds
  private userExamSchedules: Map<
    string,
    { examDate: string | null; examScope?: import("@avana/domain").ExamScope | null }
  > = new Map(); // `${userId}:${courseId}` -> exam schedule
  private creatorUserIds: Map<CourseId, UserId> = new Map();
  private auditEvents: AuditEvent[] = [];

  constructor(
    private readonly orgStore?: {
      findMembership(
        organizationId: OrganizationId,
        userId: UserId,
      ): Promise<unknown>;
    },
    private publicationStore?: CoursePublicationStore,
  ) {}

  setPublicationStore(publicationStore: CoursePublicationStore): void {
    this.publicationStore = publicationStore;
  }

  async create(records: CreateCourseRecords): Promise<CourseRecord> {
    if (this.courses.has(records.course.id)) {
      throw new Error("Duplicate course record");
    }

    const courseRecord: CourseRecord = {
      status: records.course.status ?? "published",
      ...records.course,
      officialExamDate: records.course.officialExamDate ?? records.course.examDate ?? null,
      officialExamScope: records.course.officialExamScope ?? records.course.examScope ?? null,
      examDate: records.course.officialExamDate ?? records.course.examDate ?? null,
      examScope: records.course.officialExamScope ?? records.course.examScope ?? null,
    };
    this.courses.set(records.course.id, courseRecord);
    const creatorId = records.creatorUserId || (records.auditEvents?.[0]?.actorId as UserId | undefined);
    if (creatorId) {
      this.creatorUserIds.set(records.course.id, creatorId);
    }
    if (records.creatorUserId) {
      let set = this.userCourses.get(records.creatorUserId);
      if (!set) {
        set = new Set();
        this.userCourses.set(records.creatorUserId, set);
      }
      set.add(records.course.id);
      const initialDate =
        records.initialExamSchedule?.examDate ?? (records.course.examDate ?? null);
      const initialScope =
        records.initialExamSchedule?.examScope ?? (records.course.examScope ?? null);
      if (initialDate !== null) {
        this.userExamSchedules.set(
          `${records.creatorUserId}:${records.course.id}`,
          {
            examDate: initialDate,
            examScope: initialScope,
          },
        );
      }
    }
    if (records.auditEvents) {
      this.auditEvents.push(...records.auditEvents);
    }
    const resultRecord = { ...records.course };
    if (records.initialExamSchedule) {
      resultRecord.examDate = records.initialExamSchedule.examDate ?? null;
      resultRecord.examScope = records.initialExamSchedule.examScope ?? null;
    }
    return resultRecord;
  }

  async findUserPersonalCourseByName(
    userId: UserId,
    organizationId: OrganizationId,
    name: string,
  ): Promise<CourseRecord | undefined> {
    const trimmed = name.trim().toLowerCase();
    const enrolled = this.userCourses.get(userId);
    if (!enrolled) return undefined;
    for (const courseId of enrolled) {
      const c = this.courses.get(courseId);
      if (
        c &&
        c.organizationId === organizationId &&
        !c.isOfficial &&
        c.deletedAt === null &&
        c.name.trim().toLowerCase() === trimmed
      ) {
        return this.enrichWithUserExam(c, userId);
      }
    }
    return undefined;
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
    let accessibleCourse: CourseRecord | undefined;
    if (
      systemOrganizationId &&
      course.organizationId === systemOrganizationId
    ) {
      accessibleCourse = { ...course };
    } else if (course.isOfficial && course.status === "published") {
      accessibleCourse = { ...course };
    } else if (course.status === "published" && this.publicationStore) {
      const activePub = await this.publicationStore.findPublishedByCourse(courseId);
      if (activePub && activePub.status === "published" && activePub.deletedAt === null) {
        accessibleCourse = { ...course };
      }
    }
    if (!accessibleCourse) {
      const userCourses = this.userCourses.get(userId);
      if (userCourses && userCourses.has(courseId)) {
        accessibleCourse = { ...course };
      } else if (this.orgStore) {
        const membership = await this.orgStore.findMembership(
          course.organizationId,
          userId,
        );
        if (membership) accessibleCourse = { ...course };
      } else {
        accessibleCourse = { ...course };
      }
    }
    if (!accessibleCourse) return undefined;
    return this.enrichWithUserExam(accessibleCourse, userId);
  }

  private enrichWithUserExam(course: CourseRecord, userId: UserId): CourseRecord {
    const sched = this.userExamSchedules.get(`${userId}:${course.id}`);
    if (sched !== undefined) {
      return {
        ...course,
        officialExamDate: course.examDate,
        officialExamScope: course.examScope,
        examDate: sched.examDate,
        examScope: sched.examScope ?? null,
      };
    }
    return {
      ...course,
      officialExamDate: course.examDate,
      officialExamScope: course.examScope,
      examDate: null,
      examScope: null,
    };
  }

  private async isCoursePublicApproved(c: CourseRecord): Promise<boolean> {
    if (c.status !== "published") return false;
    if (c.isOfficial) return true;
    if (this.publicationStore) {
      const activePub = await this.publicationStore.findPublishedByCourse(c.id);
      if (activePub && activePub.status === "published" && activePub.deletedAt === null) {
        return true;
      }
    }
    return false;
  }

  async listByOrganization(
    organizationId: OrganizationId,
    _userId: UserId,
    systemOrganizationId?: OrganizationId,
  ): Promise<CourseRecord[]> {
    const list: CourseRecord[] = [];
    for (const c of this.courses.values()) {
      if (c.deletedAt !== null) continue;
      const isPublic = await this.isCoursePublicApproved(c);
      const isMatch =
        c.organizationId === organizationId ||
        (systemOrganizationId && c.organizationId === systemOrganizationId) ||
        isPublic;
      if (isMatch) {
        list.push({ ...c });
      }
    }
    return list;
  }

  async update(course: CourseRecord): Promise<CourseRecord> {
    const existing = this.courses.get(course.id);
    if (!existing) {
      throw new Error("Course not found");
    }

    const updatedBase: CourseRecord = {
      ...existing,
      name: course.name,
      description: course.description ?? null,
      subject: course.subject,
      targetAcademicFields: course.targetAcademicFields ?? [],
      status: course.status ?? existing.status,
      isOfficial: course.isOfficial ?? existing.isOfficial,
      version: course.version !== undefined ? course.version : existing.version,
      officialExamDate:
        course.officialExamDate !== undefined
          ? course.officialExamDate
          : (course.examDate !== undefined ? course.examDate : existing.officialExamDate),
      officialExamScope:
        course.officialExamScope !== undefined
          ? course.officialExamScope
          : (course.examScope !== undefined ? course.examScope : existing.officialExamScope),
      updatedAt: course.updatedAt,
      deletedAt: course.deletedAt !== undefined ? course.deletedAt : existing.deletedAt,
      examDate:
        course.officialExamDate !== undefined
          ? course.officialExamDate
          : (course.examDate !== undefined ? course.examDate : existing.examDate),
      examScope:
        course.officialExamScope !== undefined
          ? course.officialExamScope
          : (course.examScope !== undefined ? course.examScope : existing.examScope),
    };
    this.courses.set(course.id, updatedBase);
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
    const list: CourseRecord[] = [];
    for (const c of this.courses.values()) {
      if (!enrolledIds.has(c.id) || c.deletedAt !== null) continue;
      const isPublic = await this.isCoursePublicApproved(c);
      const isMatch =
        !organizationId ||
        c.organizationId === organizationId ||
        (systemOrganizationId && c.organizationId === systemOrganizationId) ||
        isPublic;
      if (isMatch) {
        list.push(this.enrichWithUserExam(c, userId));
      }
    }
    return list;
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

  async isUserEnrolled(
    userId: UserId,
    courseId: CourseId,
  ): Promise<boolean> {
    const set = this.userCourses.get(userId);
    return set ? set.has(courseId) : false;
  }

  async getCourseCreatorUserId(courseId: CourseId): Promise<UserId | undefined> {
    if (this.creatorUserIds.has(courseId)) {
      return this.creatorUserIds.get(courseId);
    }
    const audit = this.auditEvents.find(
      (e) => e.entityType === "course" && e.entityId === courseId && e.action === "course.created",
    );
    if (audit?.actorId) {
      return audit.actorId as UserId;
    }
    return undefined;
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

  async setUserExamSchedule(
    userId: UserId,
    courseId: CourseId,
    examDate: string | null,
    examScope?: import("@avana/domain").ExamScope | null,
  ): Promise<CourseRecord> {
    this.userExamSchedules.set(`${userId}:${courseId}`, {
      examDate,
      examScope: examScope ?? null,
    });
    await this.addUserCourse(userId, courseId);
    const course = await this.findByIdForUser(courseId, userId);
    if (!course) throw new Error("Course not found");
    return course;
  }

  async deleteUserExamSchedule(
    userId: UserId,
    courseId: CourseId,
  ): Promise<CourseRecord> {
    this.userExamSchedules.set(`${userId}:${courseId}`, {
      examDate: null,
      examScope: null,
    });
    const course = await this.findByIdForUser(courseId, userId);
    if (!course) throw new Error("Course not found");
    return course;
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
    const targetSet = new Set(courseIds);
    this.userCourses.set(userId, targetSet);

    // Clean up exam schedules for removed courses only; retained courses keep their exam schedules
    for (const key of Array.from(this.userExamSchedules.keys())) {
      if (key.startsWith(`${userId}:`)) {
        const cId = key.slice(userId.length + 1);
        if (!targetSet.has(cId as CourseId)) {
          this.userExamSchedules.delete(key);
        }
      }
    }
  }

  async listPopular(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
    limit: number = 8,
  ): Promise<CourseRecord[]> {
    const candidateCourses = Array.from(this.courses.values()).filter(
      (c) =>
        c.deletedAt === null &&
        (c.status ?? "published") === "published" &&
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

    return scoredCourses.slice(0, limit).map((sc) => ({
      ...sc.course,
      examDate: null,
      examScope: null,
      officialExamDate: sc.course.examDate ?? sc.course.officialExamDate ?? null,
      officialExamScope: sc.course.examScope ?? sc.course.officialExamScope ?? null,
    }));
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
  private courseStore?: CourseStore;

  setCourseStore(store: CourseStore) {
    this.courseStore = store;
  }

  setCreatorProfile(userId: string, name: string) {
    this.creatorProfiles.set(userId, { id: userId, name });
  }

  async create(
    publication: CoursePublicationRecord,
  ): Promise<CoursePublicationRecord> {
    const duplicate = Array.from(this.publications.values()).find(
      (p) =>
        p.courseId === publication.courseId &&
        p.version === publication.version &&
        p.deletedAt === null,
    );
    if (duplicate) {
      throw new DomainError(
        "conflict",
        `یک درخواست انتشار با نسخه ${publication.version} قبلاً ثبت شده است. لطفاً مجدداً تلاش کنید.`,
      );
    }
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

  async findLatestApprovedByCourse(
    courseId: import("@avana/domain").CourseId,
  ): Promise<import("@avana/domain").CoursePublicationRecord | undefined> {
    const pubs = Array.from(this.publications.values())
      .filter(
        (p) =>
          p.courseId === courseId &&
          (p.status === "published" || p.status === "unpublished") &&
          p.publishedAt !== null &&
          p.publishedAt !== undefined &&
          p.deletedAt === null,
      )
      .sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        return bTime - aTime;
      });
    return pubs[0] ? { ...pubs[0] } : undefined;
  }

  async unpublishCourseAtomic(params: {
    courseId: import("@avana/domain").CourseId;
    actorUserId: import("@avana/domain").UserId;
    now: string;
    unpublishReason: string;
    cancellationReason: string;
  }): Promise<{
    course: CourseRecord;
    publication: import("@avana/domain").CoursePublicationRecord;
    supersededPublications: import("@avana/domain").CoursePublicationRecord[];
  }> {
    if (!this.courseStore) {
      throw new Error("Course store not configured in InMemoryCoursePublicationStore");
    }
    const course = await this.courseStore.findById(params.courseId);
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    const publishedPub = await this.findPublishedByCourse(params.courseId);
    if (!publishedPub && course.status !== "published") {
      throw new DomainError(
        "bad_request",
        "این دوره در حال حاضر منتشر نشده است.",
      );
    }

    // Invalidate/supersede any pending or changes_requested submissions
    const pendingPubs = Array.from(this.publications.values()).filter(
      (p) =>
        p.courseId === params.courseId &&
        (p.status === "pending_review" || p.status === "changes_requested") &&
        p.deletedAt === null,
    );

    const supersededPublications: import("@avana/domain").CoursePublicationRecord[] = [];
    for (const pending of pendingPubs) {
      const updatedPending: import("@avana/domain").CoursePublicationRecord = {
        ...pending,
        status: "superseded",
        metadata: {
          ...pending.metadata,
          supersededAt: params.now,
          supersededByUserId: params.actorUserId,
          cancellationReason: params.cancellationReason,
        },
        updatedAt: params.now,
      };
      this.publications.set(pending.id, updatedPending);
      supersededPublications.push({ ...updatedPending });
    }

    // Unpublish active published publication
    let updatedPub = publishedPub;
    if (publishedPub) {
      updatedPub = {
        ...publishedPub,
        status: "unpublished",
        metadata: {
          ...publishedPub.metadata,
          unpublishedAt: params.now,
          unpublishedByUserId: params.actorUserId,
          unpublishReason: params.unpublishReason,
        },
        updatedAt: params.now,
      };
      this.publications.set(publishedPub.id, updatedPub);
    }

    const candidatePub = updatedPub ?? publishedPub ?? supersededPublications[0];
    if (!candidatePub) {
      throw new DomainError(
        "bad_request",
        "دوره در وضعیت انتشار عمومی قرار ندارد و هیچ رکورد انتشار معتبری برای آن یافت نشد.",
      );
    }

    // Update course status
    const updatedCourse: CourseRecord = {
      ...course,
      status: "unpublished",
      updatedAt: params.now,
    };
    await this.courseStore.update(updatedCourse);

    return {
      course: updatedCourse,
      publication: candidatePub,
      supersededPublications,
    };
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
    courseId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: import("@avana/domain").CoursePublicationRecord[];
    totalCount: number;
  }> {
    let pubs = Array.from(this.publications.values()).filter(
      (p) => p.deletedAt === null,
    );

    if (options.courseId) {
      pubs = pubs.filter((p) => p.courseId === options.courseId);
    }

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
