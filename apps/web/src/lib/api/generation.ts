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

export type GenerationProgress = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  status: "queued" | "running" | "partial" | "succeeded" | "failed";
  currentStage?: "planning" | "lesson" | "flashcard" | "quiz" | "review_summary";
  currentChunkKey?: string;
};

export type DocumentGenerationProgressResource = {
  status: "idle" | "queued" | "planning" | "generating" | "reviewing" | "stopping" | "stopped" | "deleting" | "completed" | "failed";
  stage: "analysis" | "planning" | "lesson" | "flashcard" | "quiz" | "summary" | "review" | "publishing" | null;
  stageLabel: string | null;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  stageStartedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
};

export type ActiveGenerationItem = {
  documentId: string;
  documentName: string;
  courseId: string | null;
  organizationId?: string;
  status: "idle" | "queued" | "planning" | "generating" | "reviewing" | "stopping" | "stopped" | "deleting" | "completed" | "failed";
  stage: "analysis" | "planning" | "lesson" | "flashcard" | "quiz" | "summary" | "review" | "publishing" | null;
  stageLabel: string | null;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  stageStartedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
  updatedAt: string;
};

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
  progress?: GenerationProgress;
  generationProgress?: DocumentGenerationProgressResource;
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
  progress?: GenerationProgress;
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

    /**
     * GET /v1/organizations/:organizationId/generation/active
     * Returns all active generation progress items for the authenticated user/org.
     */
    getActiveGenerations(
      organizationId: string,
      courseId?: string | null,
    ): Promise<{ request_id: string; items: ActiveGenerationItem[] }> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/generation/active`
        : `/v1/organizations/${organizationId}/generation/active`;
      return client.get<{ request_id: string; items: ActiveGenerationItem[] }>(url);
    },

    /**
     * GET /v1/organizations/:organizationId/documents/:documentId/progress
     * Returns canonical generation progress for a single document.
     */
    getDocumentGenerationProgress(
      organizationId: string,
      documentId: string,
      courseId?: string | null,
    ): Promise<{
      request_id: string;
      document_id: string;
      document_name: string;
      course_id: string | null;
      generationProgress: DocumentGenerationProgressResource;
    }> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/progress`
        : `/v1/organizations/${organizationId}/documents/${documentId}/progress`;
      return client.get<{
        request_id: string;
        document_id: string;
        document_name: string;
        course_id: string | null;
        generationProgress: DocumentGenerationProgressResource;
      }>(url);
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generation/stop
     * POST /v1/organizations/:organizationId/documents/:documentId/generation/stop
     * Stops running or queued generation for a document.
     */
    stopGeneration(
      organizationId: string,
      documentId: string,
      courseId?: string | null,
    ): Promise<{
      request_id: string;
      status: "stopped" | "stopping";
      previous_status?: string;
      job_id?: string;
    }> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generation/stop`
        : `/v1/organizations/${organizationId}/documents/${documentId}/generation/stop`;
      return client.post(url, {});
    },

    /**
     * POST /v1/organizations/:organizationId/generation/:jobId/stop
     * Stops a specific generation job.
     */
    stopGenerationJob(
      organizationId: string,
      jobId: string,
    ): Promise<{
      request_id: string;
      status: "stopped" | "stopping";
      previous_status?: string;
      job_id?: string;
    }> {
      return client.post(`/v1/organizations/${organizationId}/generation/${jobId}/stop`, {});
    },

    /**
     * DELETE /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generation
     * DELETE /v1/organizations/:organizationId/documents/:documentId/generation
     * Safely deletes generation process and unaccepted drafts for a document.
     */
    deleteGeneration(
      organizationId: string,
      documentId: string,
      courseId?: string | null,
    ): Promise<{
      request_id: string;
      status: "deleted";
    }> {
      const url = courseId
        ? `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generation`
        : `/v1/organizations/${organizationId}/documents/${documentId}/generation`;
      return client.delete(url);
    },

    /**
     * DELETE /v1/organizations/:organizationId/generation/:jobId
     * Safely deletes a specific generation job and cleans up transient chunks.
     */
    deleteGenerationJob(
      organizationId: string,
      jobId: string,
    ): Promise<{
      request_id: string;
      status: "deleted";
      previous_status?: string;
      job_id?: string;
    }> {
      return client.delete(`/v1/organizations/${organizationId}/generation/${jobId}`);
    },
  };
}

export type GenerationApi = ReturnType<typeof createGenerationApi>;

