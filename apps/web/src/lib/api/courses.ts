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
  };
}

export type CourseApi = ReturnType<typeof createCourseApi>;
