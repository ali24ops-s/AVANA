import { randomUUID } from "node:crypto";
import {
  auditCourseCreated,
  auditCourseUpdated,
  auditCourseArchived,
  defaultPolicy,
  DomainError,
  asCoursePublicationId,
  asSubCourseGroupId,
  asModuleId,
  computeCoursePublicationStats,
  validateCoursePublicationEligibility,
  type Actor,
  type AuthorizationPolicy,
  type AuthContext,
  type CourseId,
  type CoursePublicationRecord,
  type CoursePublicationSnapshot,
  type CoursePublicationChapterSnapshot,
  type CoursePublicationLessonSnapshot,
  type CoursePublicationFlashcardSnapshot,
  type CoursePublicationQuizSnapshot,
  type CoursePublicationSummarySnapshot,
  type LessonPayload,
  type FlashcardPayload,
  type QuizPayload,
  type ReviewSummaryPayload,
  type OrganizationId,
  type SubCourseGroupId,
  type ModuleId,
  type ExamScope,
} from "@avana/domain";
import type { CourseStore, CourseRecord, CoursePublicationStore } from "./course-store.js";
import type { SubCourseGroupStore, ModuleStore, LessonStore, DocumentStore } from "../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { QuizStore, FlashcardStore } from "../study/study-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export type CourseUpdateInput = {
  title?: string;
  description?: string | null;
  subject?: string | null;
  examAt?: string | null;
  examScope?: ExamScope | null;
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
    private readonly auditService?: AuditService,
    private readonly systemOrganizationId?: OrganizationId,
    private readonly subCourseGroupStore?: SubCourseGroupStore,
    private readonly moduleStore?: ModuleStore,
    private readonly lessonStore?: LessonStore,
    private readonly documentStore?: DocumentStore,
    private readonly generatedContentStore?: GeneratedContentStore,
    private readonly coursePublicationStore?: CoursePublicationStore,
    _quizStore?: QuizStore,
    _flashcardStore?: FlashcardStore,
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
    examScope?: ExamScope | null,
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
      examScope: examScope ?? null,
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

    // Official courses are only visible in public catalog when 'published'.
    // Non-official / user courses are governed by standard membership.
    const visibleCourses = courses.filter((c) => {
      if (c.isOfficial === true) {
        return c.status === "published";
      }
      return true;
    });

    const canonicalOrder: readonly string[] = CANONICAL_COURSES;
    return visibleCourses.slice().sort((a, b) => {
      const idxA = canonicalOrder.indexOf(a.name);
      const idxB = canonicalOrder.indexOf(b.name);
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

    const canonicalOrder: readonly string[] = CANONICAL_COURSES;
    return courses.slice().sort((a, b) => {
      const idxA = canonicalOrder.indexOf(a.name);
      const idxB = canonicalOrder.indexOf(b.name);
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

    // Unpublished official courses must not be accessible to students
    if (
      course.isOfficial === true &&
      course.status !== "published" &&
      scopedActor.role !== "platform_admin" &&
      scopedActor.role !== "organization_admin"
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

    const isOnlyExamSettings =
      (input.examAt !== undefined || input.examScope !== undefined) &&
      input.title === undefined &&
      input.subject === undefined;

    if (isOnlyExamSettings) {
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

    if (input.examScope !== undefined) {
      course.examScope = input.examScope;
      changes.exam_scope = input.examScope as any;
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

  // ---------------------------------------------------------------------------
  // Chapter (SubCourseGroup) Management
  // ---------------------------------------------------------------------------

  async createChapter(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    title: string,
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    if (!title || title.trim().length === 0) {
      throw new DomainError("bad_request", "Chapter title is required");
    }

    const existingGroups = await this.subCourseGroupStore.listByCourse(courseId);
    const now = new Date().toISOString();
    const newGroup = await this.subCourseGroupStore.create({
      id: asSubCourseGroupId(randomUUID() as unknown as import("@avana/domain").UUID),
      courseId,
      title: title.trim(),
      sortOrder: existingGroups.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return newGroup;
  }

  async updateChapter(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    chapterId: SubCourseGroupId,
    input: { title?: string; sortOrder?: number },
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    const existing = await this.subCourseGroupStore.findById(chapterId);
    if (!existing || existing.courseId !== courseId) {
      throw new DomainError("not_found", "Chapter not found in this course");
    }

    const updated = await this.subCourseGroupStore.update({
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteChapter(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    chapterId: SubCourseGroupId,
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    const existing = await this.subCourseGroupStore.findById(chapterId);
    if (!existing || existing.courseId !== courseId) {
      throw new DomainError("not_found", "Chapter not found in this course");
    }

    await this.subCourseGroupStore.delete(chapterId);
  }

  async reorderChapters(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    chapterIds: SubCourseGroupId[],
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    const existing = await this.subCourseGroupStore.listByCourse(courseId);
    const map = new Map(existing.map((g) => [g.id, g]));

    for (const id of chapterIds) {
      if (!map.has(id)) {
        throw new DomainError("bad_request", `Chapter ${id} does not belong to this course`);
      }
    }

    await this.subCourseGroupStore.reorder(courseId, chapterIds);
  }

  // ---------------------------------------------------------------------------
  // Module Management
  // ---------------------------------------------------------------------------

  async createModule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    input: {
      title: string;
      description?: string | null;
      subCourseGroupId?: SubCourseGroupId | null;
      documentId?: import("@avana/domain").DocumentId | null;
    },
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    if (!input.title || input.title.trim().length === 0) {
      throw new DomainError("bad_request", "Module title is required");
    }

    const existing = await this.moduleStore.listByCourse(courseId);
    const now = new Date().toISOString();
    const newModule = await this.moduleStore.create({
      id: asModuleId(randomUUID() as unknown as import("@avana/domain").UUID),
      courseId,
      subCourseGroupId: input.subCourseGroupId ?? null,
      documentId: input.documentId ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      sortOrder: existing.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return newModule;
  }

  async updateModule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
    input: {
      title?: string;
      description?: string | null;
      subCourseGroupId?: SubCourseGroupId | null;
      sortOrder?: number;
    },
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    const existing = await this.moduleStore.findById(moduleId);
    if (!existing || existing.courseId !== courseId) {
      throw new DomainError("not_found", "Module not found in this course");
    }

    const updated = await this.moduleStore.update({
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      subCourseGroupId: input.subCourseGroupId !== undefined ? input.subCourseGroupId : existing.subCourseGroupId,
      sortOrder: input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteModule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    const existing = await this.moduleStore.findById(moduleId);
    if (!existing || existing.courseId !== courseId) {
      throw new DomainError("not_found", "Module not found in this course");
    }

    await this.moduleStore.delete(moduleId);
  }

  async reorderModules(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    items: Array<{
      id: ModuleId;
      sortOrder: number;
      subCourseGroupId?: SubCourseGroupId | null;
    }>,
  ) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    if (this.moduleStore.reorder) {
      await this.moduleStore.reorder(courseId, items);
    } else {
      for (const item of items) {
        const existing = await this.moduleStore.findById(item.id);
        if (existing && existing.courseId === courseId) {
          await this.moduleStore.update({
            ...existing,
            sortOrder: item.sortOrder,
            subCourseGroupId: item.subCourseGroupId !== undefined ? item.subCourseGroupId : existing.subCourseGroupId,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Full Course Workspace Structure
  // ---------------------------------------------------------------------------

  async getCourseStructure(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ) {
    const course = await this.getCourse(actor, organizationId, courseId);

    const chapters = this.subCourseGroupStore
      ? await this.subCourseGroupStore.listByCourse(courseId)
      : [];

    const modules = this.moduleStore
      ? await this.moduleStore.listByCourse(courseId)
      : [];

    const moduleIds = modules.map((m) => m.id);
    const lessons = this.lessonStore && moduleIds.length > 0
      ? await this.lessonStore.listByModules(moduleIds)
      : [];

    // Map lessons by moduleId
    const lessonsByModule = new Map<string, typeof lessons>();
    for (const l of lessons) {
      const arr = lessonsByModule.get(l.moduleId) ?? [];
      arr.push(l);
      lessonsByModule.set(l.moduleId, arr);
    }

    // Attach documents and generated contents if stores available
    const enrichedModules = await Promise.all(
      modules.map(async (mod) => {
        const modLessons = lessonsByModule.get(mod.id) ?? [];
        let document = null;
        let generatedContents = null;

        if (mod.documentId && this.documentStore) {
          const doc = await this.documentStore.findByIdForOrganization(
            mod.documentId,
            organizationId,
          );
          if (doc) {
            document = {
              id: doc.id,
              originalName: doc.originalName,
              sizeBytes: doc.sizeBytes,
              mimeType: doc.mimeType,
              status: doc.status,
              createdAt: doc.createdAt,
            };

            if (this.generatedContentStore) {
              const contents = await this.generatedContentStore.listByDocument(
                doc.id,
                organizationId,
              );
              const active = contents.filter((c) => c.deletedAt === null);
              generatedContents = {
                lesson: active.find((c) => c.type === "lesson")
                  ? { status: active.find((c) => c.type === "lesson")!.status }
                  : null,
                flashcard: active.find((c) => c.type === "flashcard")
                  ? { status: active.find((c) => c.type === "flashcard")!.status }
                  : null,
                quiz: active.find((c) => c.type === "quiz")
                  ? { status: active.find((c) => c.type === "quiz")!.status }
                  : null,
                reviewSummary: active.find((c) => c.type === "review_summary")
                  ? { status: active.find((c) => c.type === "review_summary")!.status }
                  : null,
              };
            }
          }
        }

        return {
          id: mod.id,
          title: mod.title,
          description: mod.description,
          sortOrder: mod.sortOrder,
          subCourseGroupId: mod.subCourseGroupId,
          documentId: mod.documentId,
          document,
          generatedContents,
          lessons: modLessons.map((l) => ({
            id: l.id,
            title: l.title,
            sortOrder: l.sortOrder,
            estimatedMinutes: l.estimatedMinutes,
            publicationStatus: l.publicationStatus,
            contentMarkdown: l.contentMarkdown,
          })),
        };
      }),
    );

    // Group modules by chapter
    const modulesByChapter = new Map<string, typeof enrichedModules>();
    const unassignedModules: typeof enrichedModules = [];

    for (const m of enrichedModules) {
      if (m.subCourseGroupId) {
        const arr = modulesByChapter.get(m.subCourseGroupId) ?? [];
        arr.push(m);
        modulesByChapter.set(m.subCourseGroupId, arr);
      } else {
        unassignedModules.push(m);
      }
    }

    const structuredChapters = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      sortOrder: ch.sortOrder,
      modules: (modulesByChapter.get(ch.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    const isOfficialCourse =
      course.isOfficial === true ||
      (!!this.systemOrganizationId &&
        course.organizationId === this.systemOrganizationId);

    // Latest publication status for community courses
    let latestPublication: CoursePublicationRecord | null = null;
    if (!isOfficialCourse && this.coursePublicationStore) {
      latestPublication = (await this.coursePublicationStore.findLatestByCourse(courseId)) ?? null;
    }

    return {
      course: {
        id: course.id,
        title: course.name,
        description: course.description,
        subject: course.subject,
        status: course.status ?? "draft",
        isOfficial: isOfficialCourse,
        examDate: course.examDate,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      },
      chapters: structuredChapters,
      unassignedModules,
      publication: latestPublication
        ? {
            id: latestPublication.id,
            version: latestPublication.version,
            status: latestPublication.status,
            publishedAt: latestPublication.publishedAt,
            rejectionReason: latestPublication.metadata.rejectionReason ?? null,
            reviewedAt: latestPublication.metadata.reviewedAt ?? null,
            accessType: latestPublication.metadata.accessType ?? null,
            stats: latestPublication.metadata.stats ?? null,
            createdAt: latestPublication.createdAt,
          }
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Course-Level Publication Submission
  // ---------------------------------------------------------------------------

  async publishCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    input?: { title?: string; description?: string | null; subject?: string | null },
  ): Promise<{ publication: CoursePublicationRecord; request_id?: string }> {
    const membership = await this.requireOrgMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("course:update", scopedActor, context);

    if (!this.coursePublicationStore) {
      throw new DomainError("internal_error", "CoursePublicationStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);

    const isOfficialCourse =
      course.isOfficial === true ||
      (!!this.systemOrganizationId &&
        course.organizationId === this.systemOrganizationId);

    if (isOfficialCourse) {
      throw new DomainError(
        "bad_request",
        "دوره‌های رسمی آوانا از طریق پنل مدیریت منتشر می‌شوند و امکان ثبت درخواست انتشار کاربری برای آنها وجود ندارد.",
      );
    }

    // Prevent duplicate pending submissions
    const existingPending = await this.coursePublicationStore.findLatestByCourse(courseId);
    if (existingPending && existingPending.status === "pending_review") {
      throw new DomainError(
        "conflict",
        "این دوره در حال حاضر در انتظار بررسی ادمین قرار دارد.",
      );
    }

    // Build the chapter snapshots
    const chapters = this.subCourseGroupStore
      ? await this.subCourseGroupStore.listByCourse(courseId)
      : [];

    const modules = this.moduleStore
      ? await this.moduleStore.listByCourse(courseId)
      : [];

    const moduleIds = modules.map((m) => m.id);
    const lessons = this.lessonStore && moduleIds.length > 0
      ? await this.lessonStore.listByModules(moduleIds)
      : [];

    const lessonsByModule = new Map<string, typeof lessons>();
    for (const l of lessons) {
      const arr = lessonsByModule.get(l.moduleId) ?? [];
      arr.push(l);
      lessonsByModule.set(l.moduleId, arr);
    }

    const chapterSnapshots: CoursePublicationChapterSnapshot[] = [];

    // Process chapters
    for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
      const ch = chapters[cIdx];
      const chModules = modules.filter((m) => m.subCourseGroupId === ch.id);
      const chapterLessons: CoursePublicationLessonSnapshot[] = [];
      const chapterFlashcards: CoursePublicationFlashcardSnapshot[] = [];
      let chapterQuiz: CoursePublicationQuizSnapshot | null = null;
      let chapterSummary: CoursePublicationSummarySnapshot | null = null;

      for (const mod of chModules) {
        // Lessons from materialized lessons
        const modLessons = lessonsByModule.get(mod.id) ?? [];
        for (const l of modLessons) {
          chapterLessons.push({
            id: l.id,
            title: l.title,
            contentMarkdown: l.contentMarkdown,
            sortOrder: l.sortOrder,
            estimatedMinutes: l.estimatedMinutes,
          });
        }

        // If module has documentId, collect accepted generated contents
        if (mod.documentId && this.generatedContentStore) {
          const contents = await this.generatedContentStore.listByDocument(
            mod.documentId,
            organizationId,
          );
          const active = contents.filter((c) => c.deletedAt === null);

          // Lesson fallback if not already materialized
          const acceptedLesson = active.find((c) => c.type === "lesson" && c.status === "accepted");
          if (acceptedLesson && modLessons.length === 0) {
            const p = acceptedLesson.payload as LessonPayload;
            if (p.sessions && Array.isArray(p.sessions)) {
              p.sessions.forEach((s, sIdx) => {
                chapterLessons.push({
                  id: `${mod.id}-session-${sIdx}`,
                  title: s.title || `جلسه ${sIdx + 1}`,
                  contentMarkdown: s.contentMarkdown || "",
                  sortOrder: sIdx,
                  estimatedMinutes: s.estimatedMinutes || 10,
                });
              });
            } else if (p.contentMarkdown) {
              chapterLessons.push({
                id: `${mod.id}-lesson`,
                title: p.title || mod.title,
                contentMarkdown: p.contentMarkdown,
                sortOrder: 0,
                estimatedMinutes: (p as any).estimatedMinutes || (p as any).estimated_minutes || 10,
              });
            }
          }

          // Accepted flashcards
          const acceptedFlashcard = active.find((c) => c.type === "flashcard" && c.status === "accepted");
          if (acceptedFlashcard) {
            const p = acceptedFlashcard.payload as FlashcardPayload;
            if (p.cards && Array.isArray(p.cards)) {
              for (const card of p.cards) {
                chapterFlashcards.push({
                  front: (card as any).front ?? (card as any).question ?? "",
                  back: (card as any).back ?? (card as any).answer ?? "",
                  explanation: card.explanation ?? null,
                  difficulty: card.difficulty,
                });
              }
            }
          }

          // Accepted quiz
          const acceptedQuiz = active.find((c) => c.type === "quiz" && c.status === "accepted");
          if (acceptedQuiz && !chapterQuiz) {
            const p = acceptedQuiz.payload as QuizPayload;
            if (p.questions && Array.isArray(p.questions)) {
              chapterQuiz = {
                title: p.title || `آزمون ${mod.title}`,
                questions: p.questions.map((q: any) => ({
                  question: q.question,
                  choices: q.choices || [],
                  correctAnswer: String(q.correctAnswer ?? q.correct_answer ?? (q.choices && q.choices[0]) ?? ""),
                  explanation: q.explanation ?? null,
                  difficulty: q.difficulty,
                  category: q.category,
                })),
              };
            }
          }

          // Accepted summary
          const acceptedSummary = active.find((c) => c.type === "review_summary" && c.status === "accepted");
          if (acceptedSummary && !chapterSummary) {
            const p = acceptedSummary.payload as ReviewSummaryPayload;
            chapterSummary = {
              title: p.title || `مرور جامع ${mod.title}`,
              overview: p.overview,
              summary: (p as any).summary ?? p.overview ?? "",
              estimatedReadingMinutes: p.estimatedReadingMinutes || 8,
              sections: p.sections?.map((s) => ({
                title: s.title,
                keyPoints: s.keyPoints || [],
              })),
            };
          }
        }
      }

      chapterSnapshots.push({
        id: ch.id,
        title: ch.title,
        description: null,
        sortOrder: ch.sortOrder ?? cIdx,
        lessons: chapterLessons,
        flashcards: chapterFlashcards.length > 0 ? chapterFlashcards : undefined,
        quiz: chapterQuiz,
        reviewSummary: chapterSummary,
      });
    }

    // If no chapters were defined but modules exist, group unassigned modules into a single chapter
    if (chapterSnapshots.length === 0 && modules.length > 0) {
      const fallbackLessons: CoursePublicationLessonSnapshot[] = [];
      const fallbackFlashcards: CoursePublicationFlashcardSnapshot[] = [];
      let fallbackQuiz: CoursePublicationQuizSnapshot | null = null;
      let fallbackSummary: CoursePublicationSummarySnapshot | null = null;

      for (const mod of modules) {
        const modLessons = lessonsByModule.get(mod.id) ?? [];
        for (const l of modLessons) {
          fallbackLessons.push({
            id: l.id,
            title: l.title,
            contentMarkdown: l.contentMarkdown,
            sortOrder: l.sortOrder,
            estimatedMinutes: l.estimatedMinutes,
          });
        }

        // If module has documentId, collect accepted generated contents
        if (mod.documentId && this.generatedContentStore) {
          const contents = await this.generatedContentStore.listByDocument(
            mod.documentId,
            organizationId,
          );
          const active = contents.filter((c) => c.deletedAt === null);

          const acceptedLesson = active.find((c) => c.type === "lesson" && c.status === "accepted");
          if (acceptedLesson && modLessons.length === 0) {
            const p = acceptedLesson.payload as LessonPayload;
            if (p.sessions && Array.isArray(p.sessions)) {
              p.sessions.forEach((s, sIdx) => {
                fallbackLessons.push({
                  id: `${mod.id}-session-${sIdx}`,
                  title: s.title || `جلسه ${sIdx + 1}`,
                  contentMarkdown: s.contentMarkdown || "",
                  sortOrder: sIdx,
                  estimatedMinutes: s.estimatedMinutes || 10,
                });
              });
            } else if (p.contentMarkdown) {
              fallbackLessons.push({
                id: `${mod.id}-lesson`,
                title: p.title || mod.title,
                contentMarkdown: p.contentMarkdown,
                sortOrder: 0,
                estimatedMinutes: (p as any).estimatedMinutes || (p as any).estimated_minutes || 10,
              });
            }
          }

          const acceptedFlashcard = active.find((c) => c.type === "flashcard" && c.status === "accepted");
          if (acceptedFlashcard) {
            const p = acceptedFlashcard.payload as FlashcardPayload;
            if (p.cards && Array.isArray(p.cards)) {
              for (const card of p.cards) {
                fallbackFlashcards.push({
                  front: (card as any).front ?? (card as any).question ?? "",
                  back: (card as any).back ?? (card as any).answer ?? "",
                  explanation: card.explanation ?? null,
                  difficulty: card.difficulty,
                });
              }
            }
          }

          const acceptedQuiz = active.find((c) => c.type === "quiz" && c.status === "accepted");
          if (acceptedQuiz && !fallbackQuiz) {
            const p = acceptedQuiz.payload as QuizPayload;
            if (p.questions && Array.isArray(p.questions)) {
              fallbackQuiz = {
                title: p.title || `آزمون ${mod.title}`,
                questions: p.questions.map((q: any) => ({
                  question: q.question,
                  choices: q.choices || [],
                  correctAnswer: String(q.correctAnswer ?? q.correct_answer ?? (q.choices && q.choices[0]) ?? ""),
                  explanation: q.explanation ?? null,
                  difficulty: q.difficulty,
                  category: q.category,
                })),
              };
            }
          }

          const acceptedSummary = active.find((c) => c.type === "review_summary" && c.status === "accepted");
          if (acceptedSummary && !fallbackSummary) {
            const p = acceptedSummary.payload as ReviewSummaryPayload;
            fallbackSummary = {
              title: p.title || `مرور جامع ${mod.title}`,
              overview: p.overview,
              summary: (p as any).summary ?? p.overview ?? "",
              estimatedReadingMinutes: p.estimatedReadingMinutes || 8,
              sections: p.sections?.map((s) => ({
                title: s.title,
                keyPoints: s.keyPoints || [],
              })),
            };
          }
        }
      }

      chapterSnapshots.push({
        id: `chapter-main`,
        title: "سرفصل اصلی",
        description: null,
        sortOrder: 0,
        lessons: fallbackLessons,
        flashcards: fallbackFlashcards.length > 0 ? fallbackFlashcards : undefined,
        quiz: fallbackQuiz,
        reviewSummary: fallbackSummary,
      });
    }

    // Eligibility check
    const eligibility = validateCoursePublicationEligibility(chapterSnapshots);
    if (!eligibility.eligible) {
      throw new DomainError(
        "bad_request",
        eligibility.reason || "این دوره هنوز شرایط لازم برای انتشار در کتابخانه را ندارد.",
      );
    }

    // Compute stats
    const stats = computeCoursePublicationStats(chapterSnapshots);

    const now = new Date().toISOString();
    const version = (existingPending?.version ?? 0) + 1;
    const pubId = asCoursePublicationId(randomUUID() as unknown as import("@avana/domain").UUID);

    const title = input?.title?.trim() || course.name;
    const description = (input?.description !== undefined ? input.description : course.description) ?? null;
    const subject = (input?.subject !== undefined ? input.subject : course.subject) ?? null;

    const snapshot: CoursePublicationSnapshot = {
      courseId,
      title,
      description,
      subject,
      chapters: chapterSnapshots,
      stats,
    };

    const publicationRecord: CoursePublicationRecord = {
      id: pubId,
      courseId,
      creatorUserId: actor.userId,
      organizationId,
      title,
      description,
      subject,
      version,
      status: "pending_review",
      publishedAt: null,
      metadata: {
        stats,
        accessType: "paid",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
      snapshot,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const created = await this.coursePublicationStore.create(publicationRecord);

    // Update course status to pending_review
    course.status = "pending_review";
    course.updatedAt = now;
    await this.store.update(course);

    if (this.auditService) {
      await this.auditService.emit([
        {
          actorId: actor.userId,
          organizationId,
          action: "course.submitted_for_publication",
          entityType: "course",
          entityId: courseId,
          createdAt: now,
          details: {
            publicationId: pubId,
            version,
            chapterCount: stats.chapterCount,
            lessonCount: stats.lessonCount,
          },
        },
      ]);
    }

    return { publication: created };
  }

  async getCoursePublicationStatus(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ) {
    const course = await this.getCourse(actor, organizationId, courseId);

    const isOfficialCourse =
      course.isOfficial === true ||
      (!!this.systemOrganizationId &&
        course.organizationId === this.systemOrganizationId);

    if (isOfficialCourse) {
      return { publication: null, isOfficial: true };
    }

    if (!this.coursePublicationStore) {
      return { publication: null, isOfficial: false };
    }

    const latest = await this.coursePublicationStore.findLatestByCourse(courseId);
    return { publication: latest ?? null, isOfficial: false };
  }
}
