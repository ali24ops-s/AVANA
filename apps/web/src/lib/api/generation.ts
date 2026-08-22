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
};

export type DocumentContentStatusResponse = {
  request_id: string;
  document_id: string;
  course_id: string | null;
  lesson: DocumentContentStatus;
  flashcards: DocumentContentStatus;
  exam: DocumentContentStatus;
  can_generate: boolean;
  all_generated: boolean;
};

export type GenerateContentOptions = GenerateContentRequest & {
  lesson?: boolean;
  flashcards?: boolean;
  exam?: boolean;
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
     * Returns true DB status for lesson, flashcards, and exam.
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
     * Lists generated content drafts for a document.
     */
    listGeneratedContent(
      organizationId: string,
      courseId: string,
      documentId: string,
    ): Promise<GeneratedContentListResponse> {
      return client.get<GeneratedContentListResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/documents/${documentId}/generated`,
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
  };
}

export type GenerationApi = ReturnType<typeof createGenerationApi>;
