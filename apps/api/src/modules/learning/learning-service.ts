/**
 * Learning business logic.
 *
 * Assembles the full course learning structure (course → modules → lessons)
 * with the current user's lesson completion status.
 *
 * Follows the PR-8/PR-9 service pattern:
 * - Thin layer that coordinates stores
 * - Authorization delegated to domain policy layer
 * - No HTTP concerns
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  defaultPolicy,
  DomainError,
  auditLessonCompleted,
} from "@avana/domain";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
  LessonRecord,
  LessonProgressRecord,
} from "./learning-store.js";
import type { AuditService } from "../../observability/audit-service.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

/**
 * Public response types for the learning read API.
 *
 * CourseLearnResource is the top-level response returned by
 * GET /v1/courses/:courseId/learn.
 */
export type CourseLearnResponse = {
  request_id: string;
  course: {
    id: string;
    title: string;
    subject: string | null;
    exam_at: string | null;
  };
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    sort_order: number;
    lessons: Array<{
      id: string;
      module_id: string;
      title: string;
      content_type: string;
      content_markdown: string;
      sort_order: number;
      estimated_minutes: number | null;
      completed: boolean;
      completed_at: string | null;
    }>;
  }>;
  progress: {
    total_lessons: number;
    completed_lessons: number;
    progress_percent: number;
  };
};

/**
 * Response type for the lesson progress POST endpoint.
 */
export type LessonProgressResponse = {
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
};

/**
 * Response type for the course progress GET endpoint.
 */
export type CourseProgressResponse = {
  course_id: string;
  total_lessons: number;
  completed_lessons: number;
  percentage: number;
};

export class LearningService {
  constructor(
    private readonly courseStore: CourseStore,
    private readonly organizationStore: OrganizationStore,
    private readonly moduleStore: ModuleStore,
    private readonly lessonStore: LessonStore,
    private readonly progressStore: ProgressStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly auditService?: AuditService,
    private readonly systemOrganizationId?: OrganizationId,
  ) {}

  /**
   * Get the full course learning structure with user progress.
   *
   * Authorization flow:
   * 1. Look up the course (including shared system courses if systemOrganizationId is provided).
   * 2. Verify authorization:
   *    - For system courses: allow access to authenticated users without requiring membership in system org.
   *    - For private courses: verify membership in owning organization.
   * 3. Check the policy allows "learning:read".
   * 4. Assemble and return the learning structure.
   */
  async getCourseLearning(
    actor: Actor,
    courseId: CourseId,
    requestId: string,
  ): Promise<CourseLearnResponse> {
    // 1. Look up the course
    const course = await this.courseStore.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "Course not found");
    }

    const organizationId = course.organizationId as OrganizationId;
    const isSystemCourse =
      !!this.systemOrganizationId &&
      organizationId === this.systemOrganizationId;

    let role: Actor["role"] = "student";

    if (!isSystemCourse) {
      // 2. Verify the actor has a membership in the owning organization for private courses
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Course not found");
      }
      role = membership.role as Actor["role"];
    }

    // 3. Check the policy allows "learning:read"
    const scopedActor = { ...actor, role };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("learning:read", scopedActor, context);

    // 4. Load modules (ordered by sort_order)
    const modules = await this.moduleStore.listByCourse(courseId);
    const activeModules = modules.filter((m) => m.deletedAt === null);

    // 5. Load lessons for all modules (batch) — exclude drafts for learners
    const moduleIds = activeModules.map((m) => m.id);
    const allLessons = await this.lessonStore.listByModules(moduleIds);
    const activeLessons = allLessons.filter(
      (l) => l.deletedAt === null && l.publicationStatus === "published",
    );

    // 6. Load user's lesson progress for this course
    const progressRecords = await this.progressStore.listByUserAndCourse(
      actor.userId,
      courseId,
    );
    const progressByLessonId = new Map<string, LessonProgressRecord>();
    for (const pr of progressRecords) {
      progressByLessonId.set(pr.lessonId, pr);
    }

    // 7. Build a map of moduleId → ordered lessons
    const lessonsByModuleId = new Map<string, LessonRecord[]>();
    for (const lesson of activeLessons) {
      const existing = lessonsByModuleId.get(lesson.moduleId) ?? [];
      existing.push(lesson);
      lessonsByModuleId.set(lesson.moduleId, existing);
    }

    // Sort lessons within each module
    for (const [, lessons] of lessonsByModuleId) {
      lessons.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // 8. Assemble response
    const totalLessons = activeLessons.length;
    const completedLessons = activeLessons.filter((l) => {
      const p = progressByLessonId.get(l.id);
      return p?.completed === true;
    }).length;

    const orderedModules = activeModules.sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    const moduleResources = orderedModules.map((mod) => {
      const moduleLessons = lessonsByModuleId.get(mod.id) ?? [];
      const lessonResources = moduleLessons.map((lesson) => {
        const progress = progressByLessonId.get(lesson.id);
        return {
          id: lesson.id,
          module_id: lesson.moduleId,
          title: lesson.title,
          content_type: lesson.contentType,
          content_markdown: lesson.contentMarkdown,
          sort_order: lesson.sortOrder,
          estimated_minutes: lesson.estimatedMinutes,
          completed: progress?.completed ?? false,
          completed_at: progress?.completedAt ?? null,
        };
      });

      return {
        id: mod.id,
        title: mod.title,
        description: mod.description,
        sort_order: mod.sortOrder,
        lessons: lessonResources,
      };
    });

    return {
      request_id: requestId,
      course: {
        id: course.id,
        title: course.name,
        subject: course.subject,
        exam_at: course.examDate,
      },
      modules: moduleResources,
      progress: {
        total_lessons: totalLessons,
        completed_lessons: completedLessons,
        progress_percent:
          totalLessons > 0
            ? Math.round((completedLessons / totalLessons) * 100)
            : 0,
      },
    };
  }

  /**
   * Mark a lesson as completed for the current user.
   *
   * Authorization flow:
   * 1. Validate the lesson exists.
   * 2. Look up the lesson module to get the course ID.
   * 3. Look up the course to determine its organization.
   * 4. Verify the actor has a membership in that organization.
   * 5. Check the policy allows "progress:write".
   * 6. Upsert the progress record.
   * 7. Emit audit events.
   */
  async markLessonComplete(
    actor: Actor,
    courseId: CourseId,
    lessonId: LessonId,
  ): Promise<LessonProgressResponse> {
    // 1. Look up the lesson
    const lesson = await this.lessonStore.findById(lessonId);
    if (!lesson || lesson.deletedAt) {
      throw new DomainError("not_found", "Lesson not found");
    }
    if (lesson.publicationStatus !== "published") {
      throw new DomainError("not_found", "Lesson not found");
    }

    // 2. Look up the module to get the course ID
    const moduleId = lesson.moduleId as ModuleId;
    const mod = await this.moduleStore.findById(moduleId);
    if (!mod || mod.deletedAt) {
      throw new DomainError("not_found", "Lesson not found");
    }

    const lessonCourseId = mod.courseId as CourseId;
    if (lessonCourseId !== courseId) {
      throw new DomainError("not_found", "Lesson not found");
    }

    // 3. Look up the course to determine its organization
    const course = await this.courseStore.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "Lesson not found");
    }

    const organizationId = course.organizationId as OrganizationId;
    const isSystemCourse =
      !!this.systemOrganizationId &&
      organizationId === this.systemOrganizationId;

    let role: Actor["role"] = "student";

    if (!isSystemCourse) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Lesson not found");
      }
      role = membership.role as Actor["role"];
    }

    // 5. Check the policy allows "progress:write"
    const scopedActor = { ...actor, role };
    const context: AuthContext = { organizationId, courseId, lessonId };
    this.policy.require("progress:write", scopedActor, context);

    // 6. Keep completion idempotent so repeated requests do not change the
    // timestamp or emit duplicate audit events.
    const existing = await this.progressStore.findByUserAndLesson(
      actor.userId,
      lessonId,
    );
    if (existing?.completed) {
      return {
        lesson_id: lessonId,
        completed: true,
        completed_at: existing.completedAt,
      };
    }

    const now = new Date().toISOString();
    const record: LessonProgressRecord = {
      id: randomUUID(),
      userId: actor.userId,
      lessonId,
      completed: true,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.progressStore.upsert(record);

    // 7. Emit audit events
    if (this.auditService) {
      const auditEvents = [
        auditLessonCompleted(actor.userId, organizationId, lessonId, courseId),
      ] as const;
      await this.auditService.emit(auditEvents);
    }

    return {
      lesson_id: lessonId,
      completed: true,
      completed_at: now,
    };
  }

  /**
   * Get course progress summary for the current user.
   *
   * Authorization flow:
   * 1. Look up the course to determine its organization.
   * 2. Verify the actor has a membership in that organization (or system course).
   * 3. Check the policy allows "progress:read".
   * 4. Count total and completed lessons.
   */
  async getCourseProgress(
    actor: Actor,
    courseId: CourseId,
  ): Promise<CourseProgressResponse> {
    // 1. Look up the course
    const course = await this.courseStore.findByIdForUser(
      courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "Course not found");
    }

    const organizationId = course.organizationId as OrganizationId;
    const isSystemCourse =
      !!this.systemOrganizationId &&
      organizationId === this.systemOrganizationId;

    let role: Actor["role"] = "student";

    if (!isSystemCourse) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Course not found");
      }
      role = membership.role as Actor["role"];
    }

    // 3. Check the policy allows "progress:read"
    const scopedActor = { ...actor, role };
    const context: AuthContext = { organizationId, courseId };
    this.policy.require("progress:read", scopedActor, context);

    // 4. Load modules and count lessons
    const modules = await this.moduleStore.listByCourse(courseId);
    const activeModules = modules.filter((m) => m.deletedAt === null);
    const moduleIds = activeModules.map((m) => m.id);
    const allLessons = await this.lessonStore.listByModules(moduleIds);
    const activeLessons = allLessons.filter(
      (l) => l.deletedAt === null && l.publicationStatus === "published",
    );
    const totalLessons = activeLessons.length;

    // 5. Count completed lessons
    const progressRecords = await this.progressStore.listByUserAndCourse(
      actor.userId,
      courseId,
    );
    const activeLessonIds = new Set(activeLessons.map((lesson) => lesson.id));
    const completedLessons = progressRecords.filter(
      (progress) =>
        progress.completed === true && activeLessonIds.has(progress.lessonId),
    ).length;

    const percentage =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    return {
      course_id: courseId,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      percentage,
    };
  }
}
