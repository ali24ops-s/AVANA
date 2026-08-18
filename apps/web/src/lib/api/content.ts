/**
 * Content management API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  CourseContentResponse,
  ContentLessonResponse,
  ContentModuleResponse,
  CreateContentLessonRequest,
  CreateContentModuleRequest,
  UpdateContentLessonRequest,
  UpdateContentModuleRequest,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createContentApi(client: ApiClient) {
  return {
    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/content
     * — Get full course content tree with modules, lessons, and publication status.
     */
    getCourseContent(
      organizationId: string,
      courseId: string,
    ): Promise<CourseContentResponse> {
      return client.get<CourseContentResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/content`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/modules
     * — Create a new module in the specified course.
     */
    createModule(
      organizationId: string,
      courseId: string,
      data: CreateContentModuleRequest,
    ): Promise<ContentModuleResponse> {
      return client.post<ContentModuleResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules`,
        data,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId
     * — Update a module title and/or description.
     */
    updateModule(
      organizationId: string,
      courseId: string,
      moduleId: string,
      data: UpdateContentModuleRequest,
    ): Promise<ContentModuleResponse> {
      return client.patch<ContentModuleResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}`,
        data,
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId
     * — Soft-delete (archive) a module.
     */
    deleteModule(
      organizationId: string,
      courseId: string,
      moduleId: string,
    ): Promise<void> {
      return client.delete<void>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons
     * — Create a new lesson in the specified module. New lessons start as draft.
     */
    createLesson(
      organizationId: string,
      courseId: string,
      moduleId: string,
      data: CreateContentLessonRequest,
    ): Promise<ContentLessonResponse> {
      return client.post<ContentLessonResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons`,
        data,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId
     * — Update lesson title, content_markdown, and/or estimated_minutes.
     */
    updateLesson(
      organizationId: string,
      courseId: string,
      moduleId: string,
      lessonId: string,
      data: UpdateContentLessonRequest,
    ): Promise<ContentLessonResponse> {
      return client.patch<ContentLessonResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`,
        data,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId/publish
     * — Publish a lesson (idempotent).
     */
    publishLesson(
      organizationId: string,
      courseId: string,
      moduleId: string,
      lessonId: string,
    ): Promise<ContentLessonResponse> {
      return client.post<ContentLessonResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/publish`,
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId
     * — Soft-delete (archive) a lesson.
     */
    deleteLesson(
      organizationId: string,
      courseId: string,
      moduleId: string,
      lessonId: string,
    ): Promise<void> {
      return client.delete<void>(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`,
      );
    },
  };
}

export type ContentApi = ReturnType<typeof createContentApi>;
