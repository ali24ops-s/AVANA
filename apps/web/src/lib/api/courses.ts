/**
 * Course API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type { CourseListResponse, CourseResponse } from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createCourseApi(client: ApiClient) {
  return {
    /**
     * GET /v1/organizations/:organizationId/courses — List courses.
     */
    listCourses(organizationId: string): Promise<CourseListResponse> {
      return client.get<CourseListResponse>(
        `/v1/organizations/${organizationId}/courses`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/popular — List popular courses across Avana.
     */
    listPopularCourses(organizationId: string): Promise<CourseListResponse> {
      return client.get<CourseListResponse>(
        `/v1/organizations/${organizationId}/courses/popular`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/my — List user's selected courses.
     */
    listMyCourses(organizationId: string): Promise<CourseListResponse> {
      return client.get<CourseListResponse>(
        `/v1/organizations/${organizationId}/courses/my`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/my — Add course to user's list.
     */
    addMyCourse(
      organizationId: string,
      courseId: string,
    ): Promise<{ request_id: string; success: boolean }> {
      return client.post<{ request_id: string; success: boolean }>(
        `/v1/organizations/${organizationId}/courses/my`,
        { course_id: courseId },
      );
    },

    /**
     * PUT /v1/organizations/:organizationId/courses/my — Sync full list of user's courses.
     */
    syncMyCourses(
      organizationId: string,
      courseIds: string[],
    ): Promise<CourseListResponse> {
      return client.put<CourseListResponse>(
        `/v1/organizations/${organizationId}/courses/my`,
        { course_ids: courseIds },
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/my/:courseId — Remove course from user's list.
     */
    removeMyCourse(
      organizationId: string,
      courseId: string,
    ): Promise<void> {
      return client.delete<void>(
        `/v1/organizations/${organizationId}/courses/my/${courseId}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId — Get a course.
     */
    getCourse(
      organizationId: string,
      courseId: string,
    ): Promise<CourseResponse> {
      return client.get<CourseResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}`,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/courses/:courseId — Update a course.
     */
    updateCourse(
      organizationId: string,
      courseId: string,
      payload: {
        title?: string;
        subject?: string | null;
        exam_at?: string | null;
        exam_scope?: {
          moduleIds?: string[];
          lessonIds?: string[];
        } | null;
      },
    ): Promise<CourseResponse> {
      return client.patch<CourseResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}`,
        payload,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses — Create a new personal course.
     */
    createCourse(
      organizationId: string,
      payload: {
        title: string;
        description?: string | null;
        subject?: string | null;
        exam_at?: string | null;
        exam_scope?: {
          moduleIds?: string[];
          lessonIds?: string[];
        } | null;
      },
    ): Promise<CourseResponse> {
      return client.post<CourseResponse>(
        `/v1/organizations/${organizationId}/courses`,
        payload,
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/:courseId — Delete a course.
     */
    deleteCourse(
      organizationId: string,
      courseId: string,
    ): Promise<{ request_id: string; success: boolean }> {
      return client.delete<{ request_id: string; success: boolean }>(
        `/v1/organizations/${organizationId}/courses/${courseId}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/structure — Get full structure with chapters, modules, documents, and publication status.
     */
    getCourseStructure(
      organizationId: string,
      courseId: string,
    ): Promise<{
      course: {
        id: string;
        title: string;
        description: string | null;
        subject: string | null;
        status: string;
        isOfficial: boolean;
        examDate?: string | null;
        createdAt: string;
        updatedAt: string;
      };
      chapters: Array<{
        id: string;
        title: string;
        sortOrder: number;
        modules: Array<{
          id: string;
          title: string;
          description: string | null;
          sortOrder: number;
          subCourseGroupId: string | null;
          documentId: string | null;
          document?: {
            id: string;
            originalName: string;
            sizeBytes: number;
            mimeType: string;
            status: string;
            createdAt: string;
          } | null;
          generatedContents?: {
            lesson: { status: string } | null;
            flashcard: { status: string } | null;
            quiz: { status: string } | null;
            reviewSummary: { status: string } | null;
          } | null;
          lessons: Array<{
            id: string;
            title: string;
            sortOrder: number;
            estimatedMinutes: number | null;
            publicationStatus: string;
            contentMarkdown: string;
          }>;
        }>;
      }>;
      unassignedModules: Array<{
        id: string;
        title: string;
        description: string | null;
        sortOrder: number;
        subCourseGroupId: string | null;
        documentId: string | null;
        document?: any;
        generatedContents?: any;
        lessons: any[];
      }>;
      publication?: {
        id: string;
        version: number;
        status: "draft" | "pending_review" | "approved" | "published" | "rejected" | "archived";
        publishedAt: string | null;
        rejectionReason: string | null;
        reviewedAt: string | null;
        accessType: "free" | "paid" | null;
        stats: any;
        createdAt: string;
      } | null;
    }> {
      return client.get(
        `/v1/organizations/${organizationId}/courses/${courseId}/structure`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/chapters — Create a chapter.
     */
    createChapter(
      organizationId: string,
      courseId: string,
      payload: { title: string },
    ): Promise<{ chapter: { id: string; courseId: string; title: string; sortOrder: number } }> {
      return client.post(
        `/v1/organizations/${organizationId}/courses/${courseId}/chapters`,
        payload,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/courses/:courseId/chapters/:chapterId — Update a chapter.
     */
    updateChapter(
      organizationId: string,
      courseId: string,
      chapterId: string,
      payload: { title?: string; sortOrder?: number },
    ): Promise<{ chapter: { id: string; courseId: string; title: string; sortOrder: number } }> {
      return client.patch(
        `/v1/organizations/${organizationId}/courses/${courseId}/chapters/${chapterId}`,
        payload,
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/:courseId/chapters/:chapterId — Delete a chapter.
     */
    deleteChapter(
      organizationId: string,
      courseId: string,
      chapterId: string,
    ): Promise<{ request_id: string; success: boolean }> {
      return client.delete(
        `/v1/organizations/${organizationId}/courses/${courseId}/chapters/${chapterId}`,
      );
    },

    /**
     * PUT /v1/organizations/:organizationId/courses/:courseId/chapters/reorder — Reorder chapters.
     */
    reorderChapters(
      organizationId: string,
      courseId: string,
      chapterIds: string[],
    ): Promise<{ request_id: string; success: boolean }> {
      return client.put(
        `/v1/organizations/${organizationId}/courses/${courseId}/chapters/reorder`,
        { chapterIds },
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/modules — Create a module.
     */
    createModule(
      organizationId: string,
      courseId: string,
      payload: {
        title: string;
        description?: string | null;
        subCourseGroupId?: string | null;
        documentId?: string | null;
      },
    ): Promise<{ module: any }> {
      return client.post(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules`,
        payload,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId — Update a module.
     */
    updateModule(
      organizationId: string,
      courseId: string,
      moduleId: string,
      payload: {
        title?: string;
        description?: string | null;
        subCourseGroupId?: string | null;
        sortOrder?: number;
      },
    ): Promise<{ module: any }> {
      return client.patch(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}`,
        payload,
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId — Delete a module.
     */
    deleteModule(
      organizationId: string,
      courseId: string,
      moduleId: string,
    ): Promise<{ request_id: string; success: boolean }> {
      return client.delete(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}`,
      );
    },

    /**
     * PUT /v1/organizations/:organizationId/courses/:courseId/modules/reorder — Reorder modules.
     */
    reorderModules(
      organizationId: string,
      courseId: string,
      items: Array<{ id: string; sortOrder: number; subCourseGroupId?: string | null }>,
    ): Promise<{ request_id: string; success: boolean }> {
      return client.put(
        `/v1/organizations/${organizationId}/courses/${courseId}/modules/reorder`,
        { items },
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/publish — Submit full course for Library publication.
     */
    publishCourse(
      organizationId: string,
      courseId: string,
      payload?: {
        title?: string;
        description?: string | null;
        subject?: string | null;
      },
    ): Promise<{
      request_id: string;
      publication: {
        id: string;
        courseId: string;
        version: number;
        status: string;
        stats: any;
        submittedAt: string;
      };
    }> {
      return client.post(
        `/v1/organizations/${organizationId}/courses/${courseId}/publish`,
        payload || {},
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/publication-status — Get publication status.
     */
    getCoursePublicationStatus(
      organizationId: string,
      courseId: string,
    ): Promise<{
      publication: {
        id: string;
        version: number;
        status: string;
        publishedAt: string | null;
        rejectionReason: string | null;
        reviewedAt: string | null;
        accessType: string | null;
        stats: any;
      } | null;
      isOfficial?: boolean;
      history?: any[];
    }> {
      return client.get(
        `/v1/organizations/${organizationId}/courses/${courseId}/publication-status`,
      );
    },
  };
}

export type CourseApi = ReturnType<typeof createCourseApi>;

