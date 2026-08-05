/**
 * Learning API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  CourseLearnResponse,
  LessonProgressResponse,
  CourseProgressResponse,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createLearningApi(client: ApiClient) {
  return {
    /**
     * GET /v1/courses/:courseId/learn — Get full course learning structure
     * with modules, lessons, and user progress.
     */
    getCourseLearning(courseId: string): Promise<CourseLearnResponse> {
      return client.get<CourseLearnResponse>(`/v1/courses/${courseId}/learn`);
    },

    /**
     * POST /v1/courses/:courseId/lessons/:lessonId/progress — Mark lesson completed.
     */
    markLessonComplete(
      courseId: string,
      lessonId: string,
    ): Promise<LessonProgressResponse> {
      return client.post<LessonProgressResponse>(
        `/v1/courses/${courseId}/lessons/${lessonId}/progress`,
        { completed: true },
      );
    },

    /**
     * GET /v1/courses/:courseId/progress — Get course progress summary.
     */
    getCourseProgress(courseId: string): Promise<CourseProgressResponse> {
      return client.get<CourseProgressResponse>(
        `/v1/courses/${courseId}/progress`,
      );
    },
  };
}

export type LearningApi = ReturnType<typeof createLearningApi>;
