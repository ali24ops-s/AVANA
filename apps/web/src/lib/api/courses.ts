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
      },
    ): Promise<CourseResponse> {
      return client.patch<CourseResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}`,
        payload,
      );
    },
  };
}

export type CourseApi = ReturnType<typeof createCourseApi>;

