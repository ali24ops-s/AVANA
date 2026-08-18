import { randomUUID, createHash } from "node:crypto";
import {
  type Actor,
  type AuthAction,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type UserId,
  defaultPolicy,
  DomainError,
  auditModuleCreated,
  auditModuleUpdated,
  auditModuleDeleted,
  auditLessonCreated,
  auditLessonUpdated,
  auditLessonPublished,
  auditLessonDeleted,
} from "@avana/domain";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type {
  ModuleStore,
  LessonStore,
  LessonRecord,
  ModuleRecord,
} from "./learning-store.js";
import type { AuditService } from "../../observability/audit-service.js";

type ContentMetadata = { length: number; hash: string };

function computeContentMetadata(markdown: string): ContentMetadata {
  const hash = createHash("sha256").update(markdown, "utf8").digest("hex");
  return { length: markdown.length, hash };
}

function metadataEquals(a: ContentMetadata, b: ContentMetadata): boolean {
  return a.length === b.length && a.hash === b.hash;
}

export type ContentLessonRecord = {
  id: string;
  module_id: string;
  title: string;
  content_type: "markdown";
  content_markdown: string;
  sort_order: number;
  estimated_minutes: number | null;
  publication_status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

export type ContentModuleRecord = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: ContentLessonRecord[];
};

export type CourseContentResponse = {
  request_id: string;
  course: { id: string; title: string; subject: string | null };
  modules: ContentModuleRecord[];
};

export type ContentLessonResponse = {
  request_id: string;
  lesson: ContentLessonRecord;
};

export type ContentModuleResponse = {
  request_id: string;
  module: {
    id: string;
    course_id: string;
    title: string;
    description: string | null;
    sort_order: number;
  };
};

export class ContentService {
  constructor(
    private readonly courseStore: CourseStore,
    private readonly organizationStore: OrganizationStore,
    private readonly moduleStore: ModuleStore,
    private readonly lessonStore: LessonStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly auditService?: AuditService,
  ) {}

  private async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: AuthAction,
    context: Partial<AuthContext> = {},
  ): Promise<void> {
    const membership = await this.organizationStore.findMembership(
      organizationId,
      actor.userId,
    );
    if (!membership)
      throw new DomainError("not_found", "Organization not found");
    const scopedActor = { ...actor, role: membership.role as Actor["role"] };
    this.policy.require(action, scopedActor, {
      organizationId,
      ...context,
    } as AuthContext);
  }

  private async resolveCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
    actorUserId: UserId,
  ) {
    const course = await this.courseStore.findByIdForUser(
      courseId,
      actorUserId,
    );
    if (!course || course.deletedAt || course.organizationId !== organizationId)
      throw new DomainError("not_found", "Course not found");
    return course;
  }

  private async resolveModule(moduleId: ModuleId, courseId: CourseId) {
    const mod = await this.moduleStore.findById(moduleId);
    if (!mod || mod.deletedAt || mod.courseId !== courseId)
      throw new DomainError("not_found", "Module not found");
    return mod;
  }

  private async resolveLesson(lessonId: LessonId, moduleId: ModuleId) {
    const lesson = await this.lessonStore.findById(lessonId);
    if (!lesson || lesson.deletedAt || lesson.moduleId !== moduleId)
      throw new DomainError("not_found", "Lesson not found");
    return lesson;
  }

  private toContentLesson(lesson: LessonRecord): ContentLessonRecord {
    return {
      id: lesson.id,
      module_id: lesson.moduleId,
      title: lesson.title,
      content_type: "markdown",
      content_markdown: lesson.contentMarkdown,
      sort_order: lesson.sortOrder,
      estimated_minutes: lesson.estimatedMinutes,
      publication_status: lesson.publicationStatus,
      created_at: lesson.createdAt,
      updated_at: lesson.updatedAt,
    };
  }

  async getCourseContent(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    requestId: string,
  ): Promise<CourseContentResponse> {
    await this.authorize(actor, organizationId, "content:write", { courseId });
    const course = await this.resolveCourse(
      courseId,
      organizationId,
      actor.userId,
    );
    const modules = await this.moduleStore.listByCourse(courseId);
    const activeModules = modules
      .filter((m) => m.deletedAt === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const moduleIds = activeModules.map((m) => m.id) as ModuleId[];
    const allLessons = await this.lessonStore.listByModules(moduleIds);
    const activeLessons = allLessons.filter((l) => l.deletedAt === null);
    const lessonsByModuleId = new Map<string, LessonRecord[]>();
    for (const lesson of activeLessons) {
      const existing = lessonsByModuleId.get(lesson.moduleId) ?? [];
      existing.push(lesson);
      lessonsByModuleId.set(lesson.moduleId, existing);
    }
    for (const [, lessons] of lessonsByModuleId)
      lessons.sort((a, b) => a.sortOrder - b.sortOrder);
    const moduleResources: ContentModuleRecord[] = activeModules.map((mod) => ({
      id: mod.id,
      course_id: mod.courseId,
      title: mod.title,
      description: mod.description,
      sort_order: mod.sortOrder,
      lessons: (lessonsByModuleId.get(mod.id) ?? []).map((l) =>
        this.toContentLesson(l),
      ),
    }));
    return {
      request_id: requestId,
      course: { id: course.id, title: course.name, subject: course.subject },
      modules: moduleResources,
    };
  }

  async createModule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    title: string,
    description: string | null | undefined,
  ): Promise<ContentModuleResponse> {
    await this.authorize(actor, organizationId, "content:write", { courseId });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    if (!title || title.trim().length === 0)
      throw new DomainError("bad_request", "Module title is required");
    if (title.trim().length > 255)
      throw new DomainError(
        "bad_request",
        "Module title must not exceed 255 characters",
      );
    const existingModules = await this.moduleStore.listByCourse(courseId);
    const activeExisting = existingModules.filter((m) => m.deletedAt === null);
    const nextSortOrder =
      activeExisting.length > 0
        ? Math.max(...activeExisting.map((m) => m.sortOrder)) + 1
        : 0;
    const now = new Date().toISOString();
    const moduleId = randomUUID() as ModuleId;
    const moduleRecord: ModuleRecord = {
      id: moduleId,
      courseId,
      title: title.trim(),
      description: description ?? null,
      sortOrder: nextSortOrder,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.moduleStore.create(moduleRecord);
    if (this.auditService) {
      await this.auditService.emit([
        auditModuleCreated(
          actor.userId,
          organizationId,
          courseId,
          moduleId,
          title.trim(),
          description ?? null,
        ),
      ]);
    }
    return {
      request_id: "",
      module: {
        id: moduleRecord.id,
        course_id: moduleRecord.courseId,
        title: moduleRecord.title,
        description: moduleRecord.description,
        sort_order: moduleRecord.sortOrder,
      },
    };
  }

  async updateModule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
    updates: { title?: string; description?: string | null },
  ): Promise<ContentModuleResponse> {
    await this.authorize(actor, organizationId, "content:write", { courseId });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    const mod = await this.resolveModule(moduleId, courseId);
    const changes: Record<
      string,
      string | number | boolean | null | undefined
    > = {};
    if (updates.title !== undefined) {
      const trimmed = updates.title.trim();
      if (trimmed.length === 0)
        throw new DomainError("bad_request", "Module title cannot be empty");
      if (trimmed.length > 255)
        throw new DomainError(
          "bad_request",
          "Module title must not exceed 255 characters",
        );
      mod.title = trimmed;
      changes.title = trimmed;
    }
    if (updates.description !== undefined) {
      mod.description = updates.description;
      changes.description = updates.description;
    }
    if (Object.keys(changes).length === 0)
      return {
        request_id: "",
        module: {
          id: mod.id,
          course_id: mod.courseId,
          title: mod.title,
          description: mod.description,
          sort_order: mod.sortOrder,
        },
      };
    mod.updatedAt = new Date().toISOString();
    await this.moduleStore.update(mod);
    if (this.auditService) {
      await this.auditService.emit([
        auditModuleUpdated(
          actor.userId,
          organizationId,
          courseId,
          moduleId,
          changes,
        ),
      ]);
    }
    return {
      request_id: "",
      module: {
        id: mod.id,
        course_id: mod.courseId,
        title: mod.title,
        description: mod.description,
        sort_order: mod.sortOrder,
      },
    };
  }

  async deleteModule(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
  ): Promise<void> {
    await this.authorize(actor, organizationId, "content:write", { courseId });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    const mod = await this.resolveModule(moduleId, courseId);
    mod.deletedAt = new Date().toISOString();
    mod.updatedAt = mod.deletedAt;
    await this.moduleStore.update(mod);
    if (this.auditService) {
      await this.auditService.emit([
        auditModuleDeleted(actor.userId, organizationId, courseId, moduleId),
      ]);
    }
  }

  async createLesson(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
    title: string,
    contentMarkdown: string | undefined,
    estimatedMinutes: number | null | undefined,
  ): Promise<ContentLessonResponse> {
    await this.authorize(actor, organizationId, "content:write", {
      courseId,
      moduleId,
    });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    await this.resolveModule(moduleId, courseId);
    if (!title || title.trim().length === 0)
      throw new DomainError("bad_request", "Lesson title is required");
    if (title.trim().length > 255)
      throw new DomainError(
        "bad_request",
        "Lesson title must not exceed 255 characters",
      );
    const existingLessons = await this.lessonStore.listByModule(moduleId);
    const activeExisting = existingLessons.filter((l) => l.deletedAt === null);
    const nextSortOrder =
      activeExisting.length > 0
        ? Math.max(...activeExisting.map((l) => l.sortOrder)) + 1
        : 0;
    const now = new Date().toISOString();
    const lessonId = randomUUID() as LessonId;
    const lessonRecord: LessonRecord = {
      id: lessonId,
      moduleId,
      title: title.trim(),
      contentType: "markdown",
      contentMarkdown: contentMarkdown ?? "",
      sortOrder: nextSortOrder,
      estimatedMinutes: estimatedMinutes ?? null,
      publicationStatus: "draft",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.lessonStore.create(lessonRecord);
    if (this.auditService) {
      await this.auditService.emit([
        auditLessonCreated(
          actor.userId,
          organizationId,
          courseId,
          moduleId,
          lessonId,
          title.trim(),
        ),
      ]);
    }
    return { request_id: "", lesson: this.toContentLesson(lessonRecord) };
  }

  async updateLesson(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
    lessonId: LessonId,
    updates: {
      title?: string;
      contentMarkdown?: string;
      estimatedMinutes?: number | null;
    },
  ): Promise<ContentLessonResponse> {
    await this.authorize(actor, organizationId, "content:write", {
      courseId,
      moduleId,
      lessonId,
    });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    await this.resolveModule(moduleId, courseId);
    const lesson = await this.resolveLesson(lessonId, moduleId);
    const changedFields: string[] = [];
    let contentMetadata: { length: number; hash: string } | undefined;
    if (updates.title !== undefined) {
      const trimmed = updates.title.trim();
      if (trimmed.length === 0)
        throw new DomainError("bad_request", "Lesson title cannot be empty");
      if (trimmed.length > 255)
        throw new DomainError(
          "bad_request",
          "Lesson title must not exceed 255 characters",
        );
      lesson.title = trimmed;
      changedFields.push("title");
    }
    if (updates.contentMarkdown !== undefined) {
      const newMd = computeContentMetadata(updates.contentMarkdown);
      const oldMd = computeContentMetadata(lesson.contentMarkdown);
      lesson.contentMarkdown = updates.contentMarkdown;
      changedFields.push("content_markdown");
      if (!metadataEquals(newMd, oldMd)) contentMetadata = newMd;
    }
    if (updates.estimatedMinutes !== undefined) {
      lesson.estimatedMinutes = updates.estimatedMinutes;
      changedFields.push("estimated_minutes");
    }
    if (changedFields.length === 0)
      return { request_id: "", lesson: this.toContentLesson(lesson) };
    lesson.updatedAt = new Date().toISOString();
    await this.lessonStore.update(lesson);
    if (this.auditService) {
      await this.auditService.emit([
        auditLessonUpdated(
          actor.userId,
          organizationId,
          courseId,
          moduleId,
          lessonId,
          changedFields,
          contentMetadata,
        ),
      ]);
    }
    return { request_id: "", lesson: this.toContentLesson(lesson) };
  }

  async publishLesson(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
    lessonId: LessonId,
  ): Promise<ContentLessonResponse> {
    await this.authorize(actor, organizationId, "content:publish", {
      courseId,
      moduleId,
      lessonId,
    });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    await this.resolveModule(moduleId, courseId);
    const lesson = await this.resolveLesson(lessonId, moduleId);
    if (!lesson.title || lesson.title.trim().length === 0)
      throw new DomainError(
        "bad_request",
        "Cannot publish a lesson without a title",
      );
    if (!lesson.contentMarkdown || lesson.contentMarkdown.trim().length === 0)
      throw new DomainError(
        "bad_request",
        "Cannot publish a lesson without content",
      );
    if (lesson.publicationStatus === "published")
      return { request_id: "", lesson: this.toContentLesson(lesson) };
    lesson.publicationStatus = "published";
    lesson.updatedAt = new Date().toISOString();
    await this.lessonStore.update(lesson);
    if (this.auditService) {
      await this.auditService.emit([
        auditLessonPublished(
          actor.userId,
          organizationId,
          courseId,
          moduleId,
          lessonId,
        ),
      ]);
    }
    return { request_id: "", lesson: this.toContentLesson(lesson) };
  }

  async deleteLesson(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    moduleId: ModuleId,
    lessonId: LessonId,
  ): Promise<void> {
    await this.authorize(actor, organizationId, "content:write", {
      courseId,
      moduleId,
      lessonId,
    });
    await this.resolveCourse(courseId, organizationId, actor.userId);
    await this.resolveModule(moduleId, courseId);
    const lesson = await this.resolveLesson(lessonId, moduleId);
    lesson.deletedAt = new Date().toISOString();
    lesson.updatedAt = lesson.deletedAt;
    await this.lessonStore.update(lesson);
    if (this.auditService) {
      await this.auditService.emit([
        auditLessonDeleted(
          actor.userId,
          organizationId,
          courseId,
          moduleId,
          lessonId,
        ),
      ]);
    }
  }
}
