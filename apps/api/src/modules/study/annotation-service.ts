/**
 * Lesson Annotation & Content Report Service.
 *
 * Handles creation, retrieval, updates, and deletion of user highlights, notes,
 * and reporting content issues on lesson text selections.
 */

import {
  DomainError,
  type Actor,
  type CourseId,
  type LessonId,
  type OrganizationId,
  type AuthorizationPolicy,
  defaultPolicy,
} from "@avana/domain";
import type {
  LessonAnnotationResource,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  CreateContentReportRequest,
  ContentReportResponse,
} from "@avana/contracts";
import type {
  LessonAnnotationStore,
  ContentReportStore,
} from "./annotation-store.js";
import type { LessonStore, ModuleStore } from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";

export class AnnotationService {
  constructor(
    private readonly annotationStore: LessonAnnotationStore,
    private readonly reportStore: ContentReportStore,
    private readonly lessonStore: LessonStore,
    private readonly moduleStore: ModuleStore,
    private readonly courseStore: CourseStore,
    private readonly organizationStore: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly systemOrganizationId?: OrganizationId,
  ) {}

  /**
   * Verify student access to a lesson.
   */
  private async verifyLessonAccess(
    actor: Actor,
    lessonId: LessonId,
  ): Promise<{ courseId: CourseId; organizationId: OrganizationId }> {
    const lesson = await this.lessonStore.findById(lessonId);
    if (!lesson) {
      throw new DomainError("not_found", "Lesson not found");
    }

    const moduleRecord = await this.moduleStore.findById(lesson.moduleId);
    if (!moduleRecord) {
      throw new DomainError("not_found", "Module not found for lesson");
    }

    const course = await this.courseStore.findByIdForUser(
      moduleRecord.courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError(
        "forbidden",
        "You do not have access to this course or lesson",
      );
    }

    const isSystemOrg =
      this.systemOrganizationId &&
      this.systemOrganizationId === course.organizationId;

    if (!isSystemOrg) {
      const membership = await this.organizationStore.findMembership(
        course.organizationId,
        actor.userId,
      );
      if (!membership && actor.role !== "platform_admin") {
        throw new DomainError(
          "forbidden",
          "You do not have access to this course or organization",
        );
      }
    }

    this.policy.require("study:read", actor, {
      organizationId: course.organizationId,
      courseId: course.id,
    });

    return { courseId: course.id, organizationId: course.organizationId };
  }

  /**
   * List all annotations (highlights and notes) for the current user in a specific lesson.
   */
  async listAnnotations(
    actor: Actor,
    lessonId: LessonId,
  ): Promise<LessonAnnotationResource[]> {
    await this.verifyLessonAccess(actor, lessonId);
    const items = await this.annotationStore.listByLesson(actor.userId, lessonId);
    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      lessonId: item.lessonId,
      type: item.type,
      selectedText: item.selectedText,
      prefix: item.prefix,
      suffix: item.suffix,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      color: item.color,
      noteText: item.noteText,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  /**
   * Create a new highlight or note on a lesson.
   */
  async createAnnotation(
    actor: Actor,
    lessonId: LessonId,
    input: CreateAnnotationRequest,
  ): Promise<LessonAnnotationResource> {
    if (!input.selectedText || input.selectedText.trim().length === 0) {
      throw new DomainError("bad_request", "Selected text cannot be empty");
    }

    if (input.type !== "highlight" && input.type !== "note") {
      throw new DomainError("bad_request", "Invalid annotation type");
    }

    await this.verifyLessonAccess(actor, lessonId);

    const created = await this.annotationStore.create({
      userId: actor.userId,
      lessonId,
      type: input.type,
      selectedText: input.selectedText.trim(),
      prefix: input.prefix ?? null,
      suffix: input.suffix ?? null,
      startOffset: typeof input.startOffset === "number" ? input.startOffset : null,
      endOffset: typeof input.endOffset === "number" ? input.endOffset : null,
      color: input.color || "default",
      noteText: input.type === "note" ? input.noteText ?? "" : null,
    });

    return {
      id: created.id,
      userId: created.userId,
      lessonId: created.lessonId,
      type: created.type,
      selectedText: created.selectedText,
      prefix: created.prefix,
      suffix: created.suffix,
      startOffset: created.startOffset,
      endOffset: created.endOffset,
      color: created.color,
      noteText: created.noteText,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Update an existing note's text or color.
   */
  async updateAnnotation(
    actor: Actor,
    annotationId: string,
    input: UpdateAnnotationRequest,
  ): Promise<LessonAnnotationResource> {
    const existing = await this.annotationStore.findById(annotationId);
    if (!existing) {
      throw new DomainError("not_found", "Annotation not found");
    }

    if (existing.userId !== actor.userId) {
      throw new DomainError("forbidden", "Cannot update another user's annotation");
    }

    const updated = await this.annotationStore.update(annotationId, actor.userId, {
      noteText: input.noteText !== undefined ? input.noteText : undefined,
      color: input.color !== undefined ? input.color : undefined,
    });

    if (!updated) {
      throw new DomainError("not_found", "Annotation not found");
    }

    return {
      id: updated.id,
      userId: updated.userId,
      lessonId: updated.lessonId,
      type: updated.type,
      selectedText: updated.selectedText,
      prefix: updated.prefix,
      suffix: updated.suffix,
      startOffset: updated.startOffset,
      endOffset: updated.endOffset,
      color: updated.color,
      noteText: updated.noteText,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete an annotation.
   */
  async deleteAnnotation(actor: Actor, annotationId: string): Promise<boolean> {
    const existing = await this.annotationStore.findById(annotationId);
    if (!existing) {
      throw new DomainError("not_found", "Annotation not found");
    }

    if (existing.userId !== actor.userId) {
      throw new DomainError("forbidden", "Cannot delete another user's annotation");
    }

    return this.annotationStore.delete(annotationId, actor.userId);
  }

  /**
   * Submit an issue report for a lesson selection.
   */
  async createReport(
    actor: Actor,
    lessonId: LessonId,
    input: CreateContentReportRequest,
  ): Promise<ContentReportResponse> {
    if (!input.selectedText || input.selectedText.trim().length === 0) {
      throw new DomainError("bad_request", "Selected text cannot be empty");
    }

    const validCategories = [
      "scientific_error",
      "typo",
      "rendering_issue",
      "unclear_content",
      "other",
    ];

    if (!input.category || !validCategories.includes(input.category)) {
      throw new DomainError("bad_request", "Invalid report category");
    }

    const { courseId } = await this.verifyLessonAccess(actor, lessonId);

    const report = await this.reportStore.create({
      userId: actor.userId,
      lessonId,
      courseId: (input.courseId as CourseId) || courseId || null,
      selectedText: input.selectedText.trim(),
      category: input.category,
      comment: input.comment?.trim() || null,
    });

    return {
      id: report.id,
      lessonId,
      userId: actor.userId,
      status: report.status,
      message: "گزارش شما ثبت شد.",
      createdAt: report.createdAt,
    };
  }
}
