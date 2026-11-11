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
  computePublicationDiff,
  validateCoursePublicationEligibility,
  type Actor,
  type AuthorizationPolicy,
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
  type DocumentId,
  type ExamScope,
  type ResourceContext,
  type ResourceType,
  type AuthAction,
  type UserId,
  buildActor,
  scoreCourseRelevance,
  normalizeAcademicFields,
} from "@avana/domain";
import type { CourseStore, CourseRecord, CoursePublicationStore } from "./course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { SubCourseGroupStore, ModuleStore, LessonStore, DocumentStore } from "../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { QuizStore, FlashcardStore } from "../study/study-store.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { UserStore } from "../identity/user-store.js";
import type { SourcePackStore } from "../source-packs/source-pack-store.js";
import { assertDocumentAssociatedWithCourse } from "../documents/document-course-association.js";

export type CourseUpdateInput = {
  title?: string;
  description?: string | null;
  subject?: string | null;
  targetAcademicFields?: string[] | null;
  examAt?: string | null;
  examScope?: ExamScope | null;
};

export type RegisterExamInput = {
  courseId?: CourseId;
  title?: string;
  subject?: string | null;
  examAt: string | null;
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
    private readonly requireOrgMembership?: (
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
    private readonly organizationStore?: OrganizationStore,
    private readonly userStore?: UserStore,
    private sourcePackStore?: SourcePackStore,
  ) {}

  setSourcePackStore(sourcePackStore: SourcePackStore): void {
    this.sourcePackStore = sourcePackStore;
  }

  private async resolveActorAndAuthorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: AuthAction,
    resource?: {
      resourceType?: ResourceType;
      resourceId?: string;
      courseId?: CourseId;
      isPublicPublication?: boolean;
      isPublicResource?: boolean;
      isEnrolledMember?: boolean;
    },
  ): Promise<Actor> {
    const isSystemResource =
      !!this.systemOrganizationId &&
      organizationId === this.systemOrganizationId;

    let memberships = this.organizationStore
      ? await this.organizationStore.listMembershipsByUserId(actor.userId)
      : actor.memberships;

    if (!memberships && this.requireOrgMembership) {
      try {
        const m = await this.requireOrgMembership(actor, organizationId);
        if (m) {
          memberships = [
            {
              organizationId,
              role: m.role as import("@avana/domain").Role,
            },
          ];
        }
      } catch {
        // if requireOrgMembership throws, let policy evaluate without membership
      }
    }

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    const resourceContext: ResourceContext = {
      organizationId,
      resourceType: resource?.resourceType ?? "course",
      resourceId: resource?.resourceId,
      courseId: resource?.courseId,
      isSystemResource,
      isPublicPublication: resource?.isPublicPublication,
      isPublicResource: resource?.isPublicResource,
    };

    if (!this.policy.can(fullActor, action, resourceContext)) {
      const targetMembership = memberships?.find(
        (m) => m.organizationId === organizationId,
      );
      if (targetMembership) {
        throw new DomainError(
          "forbidden",
          `Role does not permit ${action} in this context`,
        );
      }
      throw new DomainError("not_found", "Course not found");
    }

    return fullActor;
  }

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
    targetAcademicFields?: string[] | null,
  ): Promise<CourseRecord> {
    await this.resolveActorAndAuthorize(actor, organizationId, "course:create", {
      resourceType: "course",
    });

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
      targetAcademicFields: normalizeAcademicFields(targetAcademicFields),
      examDate: examAt ?? null,
      examScope: examScope ?? null,
      officialExamDate: examAt ?? null,
      officialExamScope: examScope ?? null,
      status: "draft",
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
      creatorUserId: actor.userId,
      initialExamSchedule: {
        examDate: examAt ?? null,
        examScope: examScope ?? null,
      },
    });
  }

  /**
   * List active courses for an organization scoped to the actor's membership.
   * Only returns courses where the actor has organization membership or shared system courses.
   * Courses are sorted according to academic field relevance, with CANONICAL_COURSES priority order as tie-breaker.
   */
  async listCourses(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<CourseRecord[]> {
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
    });

    const courses = await this.store.listByOrganization(
      organizationId,
      actor.userId,
      this.systemOrganizationId,
    );

    // Official courses are only visible in public catalog when 'published'.
    // Non-official / user courses in the caller's organization are governed by standard membership.
    // Cross-tenant public courses must also be 'published'.
    const visibleCourses = courses.filter((c) => {
      const isOfficial =
        c.isOfficial ??
        (Boolean(this.systemOrganizationId) && c.organizationId === this.systemOrganizationId);
      if (isOfficial) {
        return (c.status ?? "published") === "published";
      }
      if (
        c.organizationId !== organizationId &&
        (!this.systemOrganizationId || c.organizationId !== this.systemOrganizationId)
      ) {
        return (c.status ?? "published") === "published";
      }
      return true;
    });

    let userMajor: string | null = null;
    if (this.userStore && actor.userId) {
      try {
        const user = await this.userStore.findById(actor.userId);
        if (user?.major) {
          userMajor = user.major;
        }
      } catch {
        // Gracefully continue without user personalization if lookup fails
      }
    }

    const canonicalOrder: readonly string[] = CANONICAL_COURSES;
    return visibleCourses.slice().sort((a, b) => {
      const scoreA = scoreCourseRelevance(a.targetAcademicFields, userMajor).score;
      const scoreB = scoreCourseRelevance(b.targetAcademicFields, userMajor).score;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
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
   * Courses are sorted according to academic field relevance, with CANONICAL_COURSES priority order as tie-breaker.
   */
  async listMyCourses(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<CourseRecord[]> {
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
    });

    const courses = await this.store.listUserCourses(
      actor.userId,
      organizationId,
      this.systemOrganizationId,
    );

    let userMajor: string | null = null;
    if (this.userStore && actor.userId) {
      try {
        const user = await this.userStore.findById(actor.userId);
        if (user?.major) {
          userMajor = user.major;
        }
      } catch {
        // Gracefully continue without user personalization if lookup fails
      }
    }

    const canonicalOrder: readonly string[] = CANONICAL_COURSES;
    return courses.slice().sort((a, b) => {
      const scoreA = scoreCourseRelevance(a.targetAcademicFields, userMajor).score;
      const scoreB = scoreCourseRelevance(b.targetAcademicFields, userMajor).score;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
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
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
    });

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
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
      courseId,
    });

    // Verify the course exists and is accessible
    const course = await this.getCourse(actor, organizationId, courseId);

    const isOfficial =
      course.isOfficial ||
      (Boolean(this.systemOrganizationId) && course.organizationId === this.systemOrganizationId);

    const isOwnOrgCourse = course.organizationId === organizationId;

    if (!isOfficial && !isOwnOrgCourse && course.status !== "published") {
      throw new DomainError(
        "bad_request",
        "این دوره در حال حاضر برای ثبت‌نام در دسترس نیست.",
      );
    }

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
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
      courseId,
    });

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
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
    });

    // Verify all specified courses exist and are accessible
    for (const cId of courseIds) {
      await this.getCourse(actor, organizationId, cId);
    }

    await this.store.syncUserCourses(actor.userId, courseIds);
    return this.listMyCourses(actor, organizationId);
  }

  /**
   * Authoritatively resolve ownership, edit, and enrollment permissions for a course.
   * - Platform admins always have edit access.
   * - Official courses are editable only by official course editors/admins.
   * - Community / user courses are strictly editable ONLY by the original creator (creatorUserId).
   *   Recipient organization admins NEVER acquire edit rights on another user's course.
   */
  async resolveCoursePermissions(
    actor: Actor,
    course: CourseRecord,
    publication?: CoursePublicationRecord | null,
  ): Promise<{
    isOwner: boolean;
    canEdit: boolean;
    isEnrolled: boolean;
    creatorUserId: UserId | null;
  }> {
    const isOfficialCourse =
      course.isOfficial === true ||
      (!!this.systemOrganizationId &&
        course.organizationId === this.systemOrganizationId);

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin";

    const isEnrolled = this.store.isUserEnrolled
      ? await this.store.isUserEnrolled(actor.userId, course.id)
      : false;

    if (isOfficialCourse) {
      const systemOrgMembership = actor.memberships?.find(
        (m) => !!this.systemOrganizationId && m.organizationId === this.systemOrganizationId,
      );
      const effectiveSystemRole = systemOrgMembership?.role ?? null;
      const isOfficialEditor =
        isPlatformAdmin ||
        actor.globalRole === "course_editor" ||
        actor.role === "course_editor" ||
        (actor.globalRole === "content_worker" && !!this.systemOrganizationId && course.organizationId === this.systemOrganizationId) ||
        effectiveSystemRole === "organization_admin" ||
        effectiveSystemRole === "content_worker" ||
        effectiveSystemRole === "course_editor";

      return {
        isOwner: false,
        canEdit: isOfficialEditor,
        isEnrolled,
        creatorUserId: null,
      };
    }

    let creatorUserId: UserId | null = publication?.creatorUserId ?? null;
    if (!creatorUserId && this.coursePublicationStore) {
      const latest = await this.coursePublicationStore.findLatestByCourse(course.id);
      if (latest?.creatorUserId) {
        creatorUserId = latest.creatorUserId;
      }
    }
    if (!creatorUserId && this.store.getCourseCreatorUserId) {
      creatorUserId = (await this.store.getCourseCreatorUserId(course.id)) ?? null;
    }

    const isOwner = Boolean(creatorUserId && actor.userId === creatorUserId);

    let hasAuthoritativeOrgAdmin = false;
    if (!creatorUserId) {
      const orgMembership = actor.memberships?.find(
        (m) => m.organizationId === course.organizationId,
      );
      if (orgMembership && (orgMembership.role === "organization_admin" || orgMembership.role === "course_editor")) {
        hasAuthoritativeOrgAdmin = true;
      }
    }

    const canEdit = isPlatformAdmin || isOwner || (!creatorUserId && hasAuthoritativeOrgAdmin);

    return {
      isOwner,
      canEdit,
      isEnrolled,
      creatorUserId,
    };
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
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin";

    const course = isPlatformAdmin
      ? await this.store.findById(courseId)
      : await this.store.findByIdForUser(
          courseId,
          actor.userId,
          this.systemOrganizationId,
        );
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    const isEnrolled = this.store.isUserEnrolled
      ? await this.store.isUserEnrolled(actor.userId, courseId)
      : false;

    // Load course publication if available to determine public publication status
    const publishedPub = this.coursePublicationStore
      ? await this.coursePublicationStore.findPublishedByCourse(courseId)
      : undefined;

    const isPublicPublication =
      Boolean(publishedPub) &&
      course.status === "published" &&
      publishedPub?.status === "published";

    // Ensure the course belongs to the requesting organization or system organization (cross-tenant isolation),
    // unless it is official, an approved public publication, the user is already enrolled, or actor is platform admin
    if (
      !isPlatformAdmin &&
      course.organizationId !== organizationId &&
      (!this.systemOrganizationId ||
        course.organizationId !== this.systemOrganizationId) &&
      !course.isOfficial &&
      !isPublicPublication &&
      !isEnrolled
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    const fullActor = await this.resolveActorAndAuthorize(
      actor,
      course.organizationId as OrganizationId,
      "course:read",
      {
        resourceType: "course",
        resourceId: course.id,
        courseId: course.id,
        isPublicPublication,
        isEnrolledMember: isEnrolled,
        isPublicResource:
          isPublicPublication ||
          isEnrolled ||
          Boolean(course.isOfficial) ||
          (!!this.systemOrganizationId &&
            course.organizationId === this.systemOrganizationId),
      },
    );

    // Unpublished official courses must not be accessible to students or unrelated organization admins
    const systemOrgMembership = fullActor.memberships?.find(
      (m) => !!this.systemOrganizationId && m.organizationId === this.systemOrganizationId,
    );
    const effectiveSystemRole = systemOrgMembership?.role ?? null;

    const isPrivilegedAdmin =
      fullActor.globalRole === "platform_admin" ||
      fullActor.role === "platform_admin" ||
      fullActor.globalRole === "course_editor" ||
      fullActor.role === "course_editor" ||
      (fullActor.globalRole === "content_worker" && !!this.systemOrganizationId && course.organizationId === this.systemOrganizationId) ||
      effectiveSystemRole === "organization_admin" ||
      effectiveSystemRole === "content_worker" ||
      effectiveSystemRole === "course_editor";

    if (
      course.isOfficial === true &&
      course.status !== "published" &&
      !isPrivilegedAdmin
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    // Community course: if unpublished, allow access only to enrolled students, the creator, or platform admin
    if (
      course.isOfficial !== true &&
      course.status === "unpublished" &&
      !isEnrolled
    ) {
      const permissions = await this.resolveCoursePermissions(actor, course, publishedPub);
      if (!permissions.canEdit) {
        throw new DomainError("not_found", "Course not found");
      }
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

    const permissions = await this.resolveCoursePermissions(actor, course);
    let hasUpdatePermission = permissions.canEdit;

    if (hasUpdatePermission) {
      try {
        await this.resolveActorAndAuthorize(
          actor,
          course.organizationId as OrganizationId,
          "course:update",
          {
            resourceType: "course",
            resourceId: course.id,
            courseId: course.id,
          },
        );
      } catch {
        if (!permissions.isOwner && actor.globalRole !== "platform_admin" && actor.role !== "platform_admin") {
          hasUpdatePermission = false;
        }
      }
    }

    const isOnlyExamSettings =
      (input.examAt !== undefined || input.examScope !== undefined) &&
      input.title === undefined &&
      input.subject === undefined &&
      input.targetAcademicFields === undefined;

    // For personal courses without an official exam date, or for users without course:update,
    // exam settings belong to user membership (personal schedule).
    const isPersonalCourseWithoutOfficialExam =
      !course.isOfficial &&
      (course.officialExamDate === null || course.officialExamDate === undefined);

    if (!hasUpdatePermission || isPersonalCourseWithoutOfficialExam) {
      if (isOnlyExamSettings) {
        if (!hasUpdatePermission) {
          await this.resolveActorAndAuthorize(
            actor,
            course.organizationId as OrganizationId,
            "course:read",
            {
              resourceType: "course",
              resourceId: course.id,
              courseId: course.id,
              isEnrolledMember: permissions.isEnrolled,
            },
          );
        }

        if (course.deletedAt) {
          throw new DomainError("bad_request", "Cannot update an archived course");
        }

        return this.store.setUserExamSchedule(
          actor.userId,
          courseId,
          input.examAt ?? null,
          input.examScope ?? null,
        );
      }

      if (!hasUpdatePermission) {
        // If non-creator attempts to update course metadata, trigger forbidden error
        throw new DomainError(
          "forbidden",
          "Role does not permit course:update in this context",
        );
      }
    }

    // Authorized manager/editor: can update course metadata and official course exam settings
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

    if (input.targetAcademicFields !== undefined) {
      const normalized = normalizeAcademicFields(input.targetAcademicFields);
      course.targetAcademicFields = normalized;
      changes.target_academic_fields = normalized as never;
    }

    if (input.examAt !== undefined) {
      if (input.examAt !== null) {
        const parsed = new Date(input.examAt);
        if (isNaN(parsed.getTime())) {
          throw new DomainError("bad_request", "Invalid exam date");
        }
      }
      course.examDate = input.examAt;
      course.officialExamDate = input.examAt;
      changes.exam_at = input.examAt;
    }

    if (input.examScope !== undefined) {
      course.examScope = input.examScope;
      course.officialExamScope = input.examScope;
      changes.exam_scope = input.examScope as never;
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
   * Set personal exam schedule for the authenticated user.
   */
  async setPersonalExamSchedule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    examAt: string | null,
    examScope?: ExamScope | null,
  ): Promise<CourseRecord> {
    const course = await this.store.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    if (
      course.organizationId !== organizationId &&
      (!this.systemOrganizationId ||
        course.organizationId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    await this.resolveActorAndAuthorize(
      actor,
      course.organizationId as OrganizationId,
      "course:read",
      {
        resourceType: "course",
        resourceId: course.id,
        courseId: course.id,
      },
    );

    if (course.deletedAt) {
      throw new DomainError("bad_request", "Cannot update an archived course");
    }

    if (examAt !== null) {
      const parsed = new Date(examAt);
      if (isNaN(parsed.getTime())) {
        throw new DomainError("bad_request", "Invalid exam date");
      }
    }

    if (examScope !== null && examScope !== undefined && typeof examScope !== "object") {
      throw new DomainError("bad_request", "Invalid exam scope");
    }

    return this.store.setUserExamSchedule(
      actor.userId,
      courseId,
      examAt,
      examScope,
    );
  }

  /**
   * Delete personal exam schedule for the authenticated user.
   */
  async deletePersonalExamSchedule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<CourseRecord> {
    const course = await this.store.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }

    if (
      course.organizationId !== organizationId &&
      (!this.systemOrganizationId ||
        course.organizationId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    await this.resolveActorAndAuthorize(
      actor,
      course.organizationId as OrganizationId,
      "course:read",
      {
        resourceType: "course",
        resourceId: course.id,
        courseId: course.id,
      },
    );

    return this.store.deleteUserExamSchedule(actor.userId, courseId);
  }

  /**
   * Unified exam registration:
   * 1. If courseId is provided: updates personal exam schedule on course_memberships (existing course).
   * 2. If title is provided:
   *    - Reuses existing personal course if one exists in user's organization scope.
   *    - Otherwise atomically creates new personal course and sets exam on membership.
   */
  async registerExam(
    actor: Actor,
    organizationId: OrganizationId,
    input: RegisterExamInput,
  ): Promise<CourseRecord> {
    await this.resolveActorAndAuthorize(actor, organizationId, "course:read", {
      resourceType: "course",
    });

    if (input.courseId) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.courseId,
        )
      ) {
        throw new DomainError("bad_request", "Invalid course ID");
      }
      if (input.examAt === null) {
        return this.deletePersonalExamSchedule(actor, organizationId, input.courseId);
      }
      return this.setPersonalExamSchedule(
        actor,
        organizationId,
        input.courseId,
        input.examAt,
        input.examScope,
      );
    }

    if (input.title !== undefined) {
      if (this.systemOrganizationId && organizationId === this.systemOrganizationId) {
        throw new DomainError(
          "bad_request",
          "Cannot create personal courses in the system organization",
        );
      }

      const trimmedTitle = input.title.trim();
      if (!trimmedTitle) {
        throw new DomainError("bad_request", "Course title is required");
      }
      if (trimmedTitle.length > 200) {
        throw new DomainError(
          "bad_request",
          "Course title must not exceed 200 characters",
        );
      }

      // Check if user already has an existing personal course with this title
      const existingPersonal = await this.store.findUserPersonalCourseByName(
        actor.userId,
        organizationId,
        trimmedTitle,
      );

      if (existingPersonal) {
        if (input.examAt === null) {
          return this.deletePersonalExamSchedule(
            actor,
            organizationId,
            existingPersonal.id,
          );
        }
        return this.setPersonalExamSchedule(
          actor,
          organizationId,
          existingPersonal.id,
          input.examAt,
          input.examScope,
        );
      }

      if (input.examAt === null) {
        throw new DomainError(
          "bad_request",
          "Exam date is required when registering exam for a new course",
        );
      }

      const parsed = new Date(input.examAt);
      if (isNaN(parsed.getTime())) {
        throw new DomainError("bad_request", "Invalid exam date");
      }

      if (
        input.examScope !== null &&
        input.examScope !== undefined &&
        typeof input.examScope !== "object"
      ) {
        throw new DomainError("bad_request", "Invalid exam scope");
      }

      const courseId = randomUUID() as CourseId;
      const now = new Date().toISOString();

      const newCourse: CourseRecord = {
        id: courseId,
        organizationId,
        name: trimmedTitle,
        subject: input.subject ?? null,
        targetAcademicFields: [],
        status: "draft",
        isOfficial: false,
        examDate: null,
        examScope: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      const auditEvents = [
        auditCourseCreated(
          actor.userId,
          organizationId,
          courseId,
          trimmedTitle,
          input.subject ?? null,
          null,
        ),
      ] as const;

      return this.store.create({
        course: newCourse,
        auditEvents,
        creatorUserId: actor.userId,
        initialExamSchedule: {
          examDate: input.examAt,
          examScope: input.examScope,
        },
      });
    }

    throw new DomainError(
      "bad_request",
      "Either course_id or title must be provided to register an exam",
    );
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

    await this.resolveActorAndAuthorize(
      actor,
      course.organizationId as OrganizationId,
      "course:archive",
      {
        resourceType: "course",
        resourceId: course.id,
        courseId: course.id,
      },
    );

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
    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError("forbidden", "فقط سازنده اصلی دوره یا مدیر سیستم امکان ویرایش سرفصل‌ها را دارد.");
    }

    await this.resolveActorAndAuthorize(actor, course.organizationId as OrganizationId, "course:update", {
      resourceType: "course",
      courseId,
    });

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
    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError("forbidden", "فقط سازنده اصلی دوره یا مدیر سیستم امکان ویرایش سرفصل‌ها را دارد.");
    }

    await this.resolveActorAndAuthorize(actor, course.organizationId as OrganizationId, "course:update", {
      resourceType: "course",
      courseId,
    });

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
    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError("forbidden", "فقط سازنده اصلی دوره یا مدیر سیستم امکان حذف سرفصل را دارد.");
    }

    await this.resolveActorAndAuthorize(actor, course.organizationId as OrganizationId, "course:update", {
      resourceType: "course",
      courseId,
    });

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
    if (!this.subCourseGroupStore) {
      throw new DomainError("internal_error", "SubCourseGroupStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError("forbidden", "فقط سازنده اصلی دوره یا مدیر سیستم امکان تغییر ترتیب سرفصل‌ها را دارد.");
    }

    await this.resolveActorAndAuthorize(actor, course.organizationId as OrganizationId, "course:update", {
      resourceType: "course",
      courseId,
    });

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
    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError("forbidden", "فقط سازنده اصلی دوره یا مدیر سیستم امکان ایجاد درس را دارد.");
    }

    await this.resolveActorAndAuthorize(actor, course.organizationId as OrganizationId, "course:update", {
      resourceType: "course",
      courseId,
    });

    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    await this.getCourse(actor, organizationId, courseId);

    if (!input.title || input.title.trim().length === 0) {
      throw new DomainError("bad_request", "Module title is required");
    }

    if (input.documentId && this.documentStore) {
      await assertDocumentAssociatedWithCourse(
        {
          documentStore: this.documentStore,
          sourcePackStore: this.sourcePackStore,
        },
        input.documentId,
        courseId,
        organizationId,
      );
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
      documentId?: import("@avana/domain").DocumentId | null;
    },
  ) {
    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    if (input.documentId && this.documentStore) {
      await assertDocumentAssociatedWithCourse(
        {
          documentStore: this.documentStore,
          sourcePackStore: this.sourcePackStore,
        },
        input.documentId,
        courseId,
        organizationId,
      );
    }

    // 1. Authoritative Module Lookup
    const existing = await this.moduleStore.findById(moduleId);
    if (
      !existing ||
      existing.deletedAt !== null ||
      existing.courseId !== courseId
    ) {
      throw new DomainError("not_found", "Module not found in this course");
    }

    // 2. Authoritative Course Lookup
    const course = await this.store.findById(courseId);
    if (!course || course.deletedAt !== null) {
      throw new DomainError("not_found", "Course not found");
    }

    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError(
        "forbidden",
        "Role does not permit course updates",
      );
    }

    // 3. Anti-spoofing Organization Match
    const authoritativeOrgId = course.organizationId as OrganizationId;
    if (
      authoritativeOrgId !== organizationId &&
      (!this.systemOrganizationId ||
        authoritativeOrgId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    const isSystemResource =
      !!this.systemOrganizationId &&
      authoritativeOrgId === this.systemOrganizationId;

    // 4. Load all memberships and build full Actor
    const memberships = this.organizationStore
      ? await this.organizationStore.listMembershipsByUserId(actor.userId)
      : (actor.memberships ?? []);

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    // 5. Build ResourceContext
    const resourceContext: ResourceContext = {
      organizationId: authoritativeOrgId,
      resourceType: "module",
      resourceId: existing.id,
      courseId: course.id,
      isSystemResource,
    };

    // 6. Policy Check (Action: "course:update")
    if (!this.policy.can(fullActor, "course:update", resourceContext)) {
      const targetMembership = memberships.find(
        (m) => m.organizationId === authoritativeOrgId,
      );
      if (targetMembership) {
        throw new DomainError(
          "forbidden",
          "Role does not permit course updates",
        );
      }
      throw new DomainError("not_found", "Course not found");
    }

    // 7. Perform Mutation
    const updated = await this.moduleStore.update({
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description:
        input.description !== undefined
          ? input.description
          : existing.description,
      subCourseGroupId:
        input.subCourseGroupId !== undefined
          ? input.subCourseGroupId
          : existing.subCourseGroupId,
      sortOrder:
        input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
      documentId:
        input.documentId !== undefined
          ? input.documentId
          : existing.documentId,
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
    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    // 1. Authoritative Module Lookup
    const existing = await this.moduleStore.findById(moduleId);
    if (
      !existing ||
      existing.deletedAt !== null ||
      existing.courseId !== courseId
    ) {
      throw new DomainError("not_found", "Module not found in this course");
    }

    // 2. Authoritative Course Lookup
    const course = await this.store.findById(courseId);
    if (!course || course.deletedAt !== null) {
      throw new DomainError("not_found", "Course not found");
    }

    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError(
        "forbidden",
        "Role does not permit course updates",
      );
    }

    // 3. Anti-spoofing Organization Match
    const authoritativeOrgId = course.organizationId as OrganizationId;
    if (
      authoritativeOrgId !== organizationId &&
      (!this.systemOrganizationId ||
        authoritativeOrgId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    const isSystemResource =
      !!this.systemOrganizationId &&
      authoritativeOrgId === this.systemOrganizationId;

    // 4. Load all memberships and build full Actor
    const memberships = this.organizationStore
      ? await this.organizationStore.listMembershipsByUserId(actor.userId)
      : (actor.memberships ?? []);

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    // 5. Build ResourceContext
    const resourceContext: ResourceContext = {
      organizationId: authoritativeOrgId,
      resourceType: "module",
      resourceId: existing.id,
      courseId: course.id,
      isSystemResource,
    };

    // 6. Policy Check (Action: "course:update")
    if (!this.policy.can(fullActor, "course:update", resourceContext)) {
      const targetMembership = memberships.find(
        (m) => m.organizationId === authoritativeOrgId,
      );
      if (targetMembership) {
        throw new DomainError(
          "forbidden",
          "Role does not permit course updates",
        );
      }
      throw new DomainError("not_found", "Course not found");
    }

    // 7. Perform Deletion
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
    if (!this.moduleStore) {
      throw new DomainError("internal_error", "ModuleStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError(
        "forbidden",
        "Role does not permit course updates",
      );
    }

    await this.resolveActorAndAuthorize(
      actor,
      course.organizationId as OrganizationId,
      "course:update",
      {
        resourceType: "course",
        courseId,
      },
    );

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
    // 1. Authoritative course lookup
    const course = await this.store.findById(courseId);
    if (!course || course.deletedAt !== null) {
      throw new DomainError("not_found", "Course not found");
    }

    const authoritativeOrgId = course.organizationId as OrganizationId;
    if (
      authoritativeOrgId !== organizationId &&
      (!this.systemOrganizationId ||
        authoritativeOrgId !== this.systemOrganizationId)
    ) {
      throw new DomainError("not_found", "Course not found");
    }

    const isSystemResource =
      !!this.systemOrganizationId &&
      authoritativeOrgId === this.systemOrganizationId;

    // 2. Load all user memberships and build full actor
    const memberships = this.organizationStore
      ? await this.organizationStore.listMembershipsByUserId(actor.userId)
      : (actor.memberships ?? []);

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    const resourceContext: ResourceContext = {
      organizationId: authoritativeOrgId,
      resourceType: "course",
      resourceId: course.id,
      courseId: course.id,
      isSystemResource,
    };

    if (!this.policy.can(fullActor, "course:read", resourceContext)) {
      throw new DomainError("not_found", "Course not found");
    }

    // Unpublished official courses must not be accessible to students or unrelated organization admins
    const systemOrgMembership = fullActor.memberships?.find(
      (m) => !!this.systemOrganizationId && m.organizationId === this.systemOrganizationId,
    );
    const effectiveSystemRole = systemOrgMembership?.role ?? null;

    const isPrivilegedAdmin =
      fullActor.globalRole === "platform_admin" ||
      fullActor.role === "platform_admin" ||
      fullActor.globalRole === "course_editor" ||
      fullActor.role === "course_editor" ||
      (fullActor.globalRole === "content_worker" && !!this.systemOrganizationId && course.organizationId === this.systemOrganizationId) ||
      effectiveSystemRole === "organization_admin" ||
      effectiveSystemRole === "content_worker" ||
      effectiveSystemRole === "course_editor";

    if (
      course.isOfficial === true &&
      course.status !== "published" &&
      !isPrivilegedAdmin
    ) {
      throw new DomainError("not_found", "Course not found");
    }

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

    const permissions = await this.resolveCoursePermissions(actor, course, latestPublication);

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
        canEdit: permissions.canEdit,
        can_edit: permissions.canEdit,
        isOwner: permissions.isOwner,
        is_owner: permissions.isOwner,
        isEnrolled: permissions.isEnrolled,
        is_enrolled: permissions.isEnrolled,
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
      permissions: {
        canEdit: permissions.canEdit,
        isOwner: permissions.isOwner,
        isEnrolled: permissions.isEnrolled,
      },
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

    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError(
        "forbidden",
        "فقط سازنده اصلی دوره می‌تواند درخواست انتشار ثبت کند.",
      );
    }

    await this.resolveActorAndAuthorize(
      actor,
      course.organizationId as OrganizationId,
      "course:update",
      {
        resourceType: "course",
        courseId,
      },
    );

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
                estimatedMinutes: (p as { estimatedMinutes?: number; estimated_minutes?: number }).estimatedMinutes || (p as { estimatedMinutes?: number; estimated_minutes?: number }).estimated_minutes || 10,
              });
            }
          }

          // Accepted flashcards
          const acceptedFlashcard = active.find((c) => c.type === "flashcard" && c.status === "accepted");
          if (acceptedFlashcard) {
            const p = acceptedFlashcard.payload as FlashcardPayload;
            if (p.cards && Array.isArray(p.cards)) {
              for (const card of p.cards) {
                const cardObj = card as { front?: string; question?: string; back?: string; answer?: string };
                chapterFlashcards.push({
                  front: cardObj.front ?? cardObj.question ?? "",
                  back: cardObj.back ?? cardObj.answer ?? "",
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
                questions: p.questions.map((q) => ({
                  question: q.question,
                  choices: q.choices || [],
                  correctAnswer: String(q.correctAnswer ?? (q as { correct_answer?: unknown }).correct_answer ?? (q.choices && q.choices[0]) ?? ""),
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
              summary: (p as { summary?: string }).summary ?? p.overview ?? "",
              estimatedReadingMinutes: p.estimatedReadingMinutes || 8,
              sections: p.sections?.map((s) => ({
                title: s.title,
                keyPoints: s.keyPoints || [],
              })),
            };
          }
        }
      }

      const chapterDocId = (ch as { documentId?: DocumentId | null }).documentId ?? chModules.find((m) => m.documentId)?.documentId ?? null;
      chapterSnapshots.push({
        id: ch.id,
        title: ch.title,
        description: null,
        documentId: chapterDocId,
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
                estimatedMinutes: (p as { estimatedMinutes?: number; estimated_minutes?: number }).estimatedMinutes || (p as { estimatedMinutes?: number; estimated_minutes?: number }).estimated_minutes || 10,
              });
            }
          }

          const acceptedFlashcard = active.find((c) => c.type === "flashcard" && c.status === "accepted");
          if (acceptedFlashcard) {
            const p = acceptedFlashcard.payload as FlashcardPayload;
            if (p.cards && Array.isArray(p.cards)) {
              for (const card of p.cards) {
                const cardObj = card as { front?: string; question?: string; back?: string; answer?: string };
                fallbackFlashcards.push({
                  front: cardObj.front ?? cardObj.question ?? "",
                  back: cardObj.back ?? cardObj.answer ?? "",
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
                questions: p.questions.map((q) => ({
                  question: q.question,
                  choices: q.choices || [],
                  correctAnswer: String(q.correctAnswer ?? (q as { correct_answer?: unknown }).correct_answer ?? (q.choices && q.choices[0]) ?? ""),
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
              summary: (p as { summary?: string }).summary ?? p.overview ?? "",
              estimatedReadingMinutes: p.estimatedReadingMinutes || 8,
              sections: p.sections?.map((s) => ({
                title: s.title,
                keyPoints: s.keyPoints || [],
              })),
            };
          }
        }
      }

      const fallbackDocId = modules.find((m) => m.documentId)?.documentId ?? null;
      chapterSnapshots.push({
        id: `chapter-main`,
        title: "سرفصل اصلی",
        description: null,
        documentId: fallbackDocId,
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

    const publishedPub = await this.coursePublicationStore.findPublishedByCourse(courseId);
    const latestPub = await this.coursePublicationStore.findLatestByCourse(courseId);
    const isUpdate = Boolean(publishedPub || course.status === "unpublished" || (course.version && course.version > 0));
    const baseVersion = publishedPub ? publishedPub.version : (course.version && course.version > 0 ? course.version : undefined);
    const basePublicationId = publishedPub ? publishedPub.id : undefined;

    const now = new Date().toISOString();
    const version =
      Math.max(
        course.version ?? 0,
        latestPub?.version ?? 0,
        publishedPub?.version ?? 0,
      ) + 1;
    const pubId = asCoursePublicationId(randomUUID() as unknown as import("@avana/domain").UUID);
    const creatorUserId = latestPub?.creatorUserId ?? actor.userId;

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

    const diffSummary = (publishedPub ?? latestPub)
      ? computePublicationDiff((publishedPub ?? latestPub)!.snapshot, snapshot)
      : computePublicationDiff(null, snapshot);

    const publicationRecord: CoursePublicationRecord = {
      id: pubId,
      courseId,
      creatorUserId,
      organizationId,
      title,
      description,
      subject,
      version,
      status: "pending_review",
      publishedAt: null,
      metadata: {
        stats,
        accessType: (publishedPub ?? latestPub)?.metadata?.accessType ?? "paid",
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
        isUpdate,
        baseVersion,
        basePublicationId,
        diffSummary,
        requestType: isUpdate ? "update" : "initial",
      },
      snapshot,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    if (existingPending && existingPending.status === "changes_requested") {
      await this.coursePublicationStore.updateStatus(
        existingPending.id,
        "superseded",
        {
          ...existingPending.metadata,
          supersededAt: now,
          supersededByUserId: actor.userId,
          cancellationReason: "جایگزین شده با ارسال نسخه بازبینی‌شده جدید",
        },
      );
    }

    const created = await this.coursePublicationStore.create(publicationRecord);

    // Invariant: If course is already published (update request), DO NOT set course.status to pending_review!
    // The live published course MUST remain accessible to enrolled students without interruption.
    // If course was previously unpublished, transition back to pending_review.
    if (!publishedPub || course.status === "unpublished") {
      course.status = "pending_review";
      course.updatedAt = now;
      await this.store.update(course);
    }

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
            isUpdate,
            baseVersion,
            chapterCount: stats.chapterCount,
            lessonCount: stats.lessonCount,
          },
        },
      ]);
    }

    return { publication: created };
  }

  /**
   * Unpublish a previously published community course.
   * Only the course creator or platform admin can unpublish a course.
   * Preserves all version history and snapshots without destruction.
   */
  async unpublishCourse(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<{ course: CourseRecord; publication: CoursePublicationRecord }> {
    if (!this.coursePublicationStore) {
      throw new DomainError("internal_error", "CoursePublicationStore not configured");
    }

    const course = await this.getCourse(actor, organizationId, courseId);
    const permissions = await this.resolveCoursePermissions(actor, course);
    if (!permissions.canEdit) {
      throw new DomainError(
        "forbidden",
        "فقط سازنده اصلی دوره یا مدیر سیستم امکان خارج کردن دوره از انتشار را دارد.",
      );
    }

    const isOfficialCourse =
      course.isOfficial === true ||
      (!!this.systemOrganizationId &&
        course.organizationId === this.systemOrganizationId);

    if (isOfficialCourse) {
      throw new DomainError(
        "bad_request",
        "دوره‌های رسمی از طریق پنل مدیریت آوانا مدیریت می‌شوند.",
      );
    }

    const publishedPub = await this.coursePublicationStore.findPublishedByCourse(courseId);
    if (!publishedPub && course.status !== "published") {
      throw new DomainError(
        "bad_request",
        "این دوره در حال حاضر منتشر نشده است.",
      );
    }

    const now = new Date().toISOString();
    const unpublishReason = "خروج دوره از حالت انتشار توسط سازنده";
    const cancellationReason = "لغو خودکار به دلیل خروج دوره از حالت انتشار (Unpublish)";

    let updatedCourse: CourseRecord;
    let updatedPublication: CoursePublicationRecord;
    let supersededPublications: CoursePublicationRecord[] = [];

    if (this.coursePublicationStore.unpublishCourseAtomic) {
      const result = await this.coursePublicationStore.unpublishCourseAtomic({
        courseId,
        actorUserId: actor.userId,
        now,
        unpublishReason,
        cancellationReason,
      });
      updatedCourse = result.course;
      updatedPublication = result.publication;
      supersededPublications = result.supersededPublications;
    } else {
      let currentPub = publishedPub;
      // 1. Identify all publications for this course
      const allCoursePubs = await this.coursePublicationStore.listAll({
        courseId,
        limit: 100,
      });

      // 2. Invalidate / supersede any pending review or changes requested submissions
      const pendingPubs = allCoursePubs.items.filter(
        (p) => p.status === "pending_review" || p.status === "changes_requested",
      );
      for (const pendingPub of pendingPubs) {
        const superseded = await this.coursePublicationStore.updateStatus(
          pendingPub.id,
          "superseded",
          {
            ...pendingPub.metadata,
            supersededAt: now,
            cancellationReason,
            supersededByUserId: actor.userId,
          },
        );
        supersededPublications.push(superseded);
      }

      // 3. Mark active published publication as unpublished
      if (publishedPub) {
        currentPub = await this.coursePublicationStore.updateStatus(
          publishedPub.id,
          "unpublished",
          {
            ...publishedPub.metadata,
            unpublishedAt: now,
            unpublishedByUserId: actor.userId,
            unpublishReason,
          },
        );
      }

      const candidatePublication = currentPub ?? publishedPub ?? pendingPubs[0];
      if (!candidatePublication) {
        throw new DomainError(
          "bad_request",
          "دوره در وضعیت انتشار عمومی قرار ندارد و هیچ رکورد انتشار معتبری برای آن یافت نشد.",
        );
      }

      // 4. Update live course status
      course.status = "unpublished";
      course.updatedAt = now;
      updatedCourse = await this.store.update(course);
      updatedPublication = candidatePublication;
    }

    // 5. Emit audit trail for superseded publications and course unpublish only after successful commit
    if (this.auditService) {
      try {
        for (const pendingPub of supersededPublications) {
          await this.auditService.emit([
            {
              actorId: actor.userId,
              organizationId,
              action: "course_publication.superseded",
              entityType: "course_publication",
              entityId: pendingPub.id,
              createdAt: now,
              details: {
                courseId,
                version: pendingPub.version,
                previousStatus: pendingPub.status,
                reason: "superseded_by_unpublish",
              },
            },
          ]);
        }

        await this.auditService.emit([
          {
            actorId: actor.userId,
            organizationId,
            action: "course.unpublished",
            entityType: "course",
            entityId: courseId,
            createdAt: now,
            details: {
              publicationId: updatedPublication?.id ?? null,
              version: updatedPublication?.version ?? null,
              supersededPendingCount: supersededPublications.length,
            },
          },
        ]);
      } catch (auditErr) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Failed to emit audit log after course unpublish; live state change succeeded",
            courseId,
            error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          }),
        );
      }
    }

    return { course: updatedCourse, publication: updatedPublication };
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
      return {
        publication: null,
        publishedPublication: null,
        isOfficial: true,
        isOwner: false,
        canEdit: false,
        isEnrolled: false,
      };
    }

    if (!this.coursePublicationStore) {
      return {
        publication: null,
        publishedPublication: null,
        isOfficial: false,
        isOwner: false,
        canEdit: false,
        isEnrolled: false,
      };
    }

    const latest = await this.coursePublicationStore.findLatestByCourse(courseId);
    const published = await this.coursePublicationStore.findPublishedByCourse(courseId);
    const permissions = await this.resolveCoursePermissions(actor, course, latest);

    return {
      publication: latest ?? null,
      publishedPublication: published ?? null,
      isOfficial: false,
      isOwner: permissions.isOwner,
      canEdit: permissions.canEdit,
      isEnrolled: permissions.isEnrolled,
    };
  }
}
