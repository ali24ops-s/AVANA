/**
 * Human review and acceptance API calls (PR6-6) using typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  ReviewQueueResponse,
  GeneratedContentReviewResponse,
  AcceptContentResponse,
  RejectContentRequest,
  RejectContentResponse,
  EditGeneratedContentRequest,
  RegenerateContentResponse,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createReviewApi(client: ApiClient) {
  return {
    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/generated/review-queue
     * Lists generated content pending review for a course.
     */
    getReviewQueue(
      organizationId: string,
      courseId: string,
    ): Promise<ReviewQueueResponse> {
      return client.get<ReviewQueueResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/generated/:contentId
     * Gets a single generated content with citations, source chunks, and generation metadata.
     */
    getContentForReview(
      organizationId: string,
      courseId: string,
      contentId: string,
    ): Promise<GeneratedContentReviewResponse> {
      return client.get<GeneratedContentReviewResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/accept
     * Accepts a generated draft and materializes it into the course curriculum / study models.
     */
    acceptContent(
      organizationId: string,
      courseId: string,
      contentId: string,
    ): Promise<AcceptContentResponse> {
      return client.post<AcceptContentResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/accept`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/reject
     * Rejects a generated draft with a mandatory reason.
     */
    rejectContent(
      organizationId: string,
      courseId: string,
      contentId: string,
      data: RejectContentRequest,
    ): Promise<RejectContentResponse> {
      return client.post<RejectContentResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/reject`,
        data,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/courses/:courseId/generated/:contentId
     * Edits a generated content payload before acceptance.
     */
    editContent(
      organizationId: string,
      courseId: string,
      contentId: string,
      data: EditGeneratedContentRequest,
    ): Promise<GeneratedContentReviewResponse> {
      return client.patch<GeneratedContentReviewResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}`,
        data,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/regenerate
     * Triggers asynchronous regeneration via the generation queue (returns 202 with job_id).
     */
    regenerateContent(
      organizationId: string,
      courseId: string,
      contentId: string,
    ): Promise<RegenerateContentResponse> {
      return client.post<RegenerateContentResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/generated/${contentId}/regenerate`,
      );
    },
  };
}

export type ReviewApi = ReturnType<typeof createReviewApi>;
