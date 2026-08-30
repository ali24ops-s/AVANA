/**
 * AI Content Generation API calls using typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  GeneratedContentListResponse,
  GeneratedContentResponse,
  GenerateContentRequest,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export type DocumentContentStatus = {
  generated: boolean;
  count: number;
  accepted?: boolean;
};

export type DocumentContentStatusResponse = {
  request_id: string;
  document_id: string;
  course_id: string | null;
  lesson: DocumentContentStatus;
  flashcards: DocumentContentStatus;
  exam: DocumentContentStatus;
  review_summary?: DocumentContentStatus;
  can_generate: boolean;
  all_generated: boolean;
  has_publishable_content?: boolean;
};

export type GenerateContentOptions = GenerateContentRequest & {
  lesson?: boolean;
  flashcards?: boolean;
  exam?: boolean;
  review_summary?: boolean;
};

export type GenerationJobResource = {
  id: string;
  organization_id: string;
  document_id: string;
  course_id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type GenerationJobResponse = {
  request_id: string;
  job: GenerationJobResource;
};

export type TriggerGenerationResponse = {
  request_id: string;
  job_id: string;
  status: string;
};

export function createGenerationApi(client: ApiClient) {
  return {
    /**
     * GET /v1/organizations/:organizationId/documents/:documentId/content-status
     * Returns true DB status for lesson, flashcards, exam, and review summary.
     */
    getDocumentContentStatus(
      organizationId: string,
      documentId: string,
      courseId?: string | null,
    ): Promise<DocumentContentStatusResponse> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/content-status`
        : `/v1/organizations/${organizationId}/documents/${documentId}/content-status`;
      return client.get<DocumentContentStatusResponse>(url);
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate
     * Starts async content generation job (returns 202 with job_id).
     */
    triggerGeneration(
      organizationId: string,
      courseId: string,
      documentId: string,
      data?: GenerateContentOptions,
    ): Promise<TriggerGenerationResponse> {
      return client.post<TriggerGenerationResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generate`,
        data ?? {},
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate/jobs/:jobId
     * Polls status of a generation job.
     */
    getGenerationJob(
      organizationId: string,
      courseId: string,
      documentId: string,
      jobId: string,
    ): Promise<GenerationJobResponse> {
      return client.get<GenerationJobResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generate/jobs/${jobId}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated
     * Lists generated content drafts for a document with optional pagination and filters.
     */
    listGeneratedContent(
      organizationId: string,
      courseId: string,
      documentId: string,
      options?: { page?: number; limit?: number; type?: string },
    ): Promise<GeneratedContentListResponse> {
      const params = new URLSearchParams();
      if (options?.page) params.set("page", String(options.page));
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.type) params.set("type", options.type);
      const qs = params.toString();
      return client.get<GeneratedContentListResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated${qs ? `?${qs}` : ""}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId
     * Gets a single generated content with citations.
     */
    getGeneratedContent(
      organizationId: string,
      courseId: string,
      documentId: string,
      contentId: string,
    ): Promise<GeneratedContentResponse> {
      return client.get<GeneratedContentResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated/${contentId}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/review-summary
     * Gets the generated Review Summary for a document.
     */
    getReviewSummary(
      organizationId: string,
      documentId: string,
      courseId?: string | null,
    ): Promise<{ request_id: string; content: GeneratedContentResponse["content"] | null }> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/review-summary`
        : `/v1/organizations/${organizationId}/documents/${documentId}/review-summary`;
      return client.get<{ request_id: string; content: GeneratedContentResponse["content"] | null }>(url);
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/review-summary
     * Generates or fetches the Review Summary for a document.
     */
    triggerReviewSummary(
      organizationId: string,
      documentId: string,
      courseId?: string | null,
      options?: { prompt_version?: string; force?: boolean },
    ): Promise<{ request_id: string; content: GeneratedContentResponse["content"] }> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/review-summary`
        : `/v1/organizations/${organizationId}/documents/${documentId}/review-summary`;
      return client.post<{ request_id: string; content: GeneratedContentResponse["content"] }>(
        url,
        options ?? {},
      );
    },
  };
}

export type GenerationApi = ReturnType<typeof createGenerationApi>;
