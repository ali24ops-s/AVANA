/**
 * Document upload, extraction and management API calls.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  DocumentListResponse,
  DocumentGetResponse,
  DocumentDetailResponse,
  DocumentStatusResponse,
  DocumentStatsResponse,
  ConfirmUploadResponse,
  UploadIntentRequest,
  UploadIntentResponse,
  UpdateDocumentRequest,
  BulkOperationResponse,
  ErrorEnvelope,
  DocumentStatus,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";
import { ApiError } from "./errors.js";

export type DocumentListFilters = {
  search?: string;
  status?: DocumentStatus;
  type?: string;
  courseId?: string;
  used?: "used" | "unused";
  sort?: "newest" | "oldest" | "largest" | "smallest" | "name" | "updated";
  page?: number;
  limit?: number;
};

export function createDocumentsApi(client: ApiClient) {
  return {
    /**
     * POST /v1/organizations/:organizationId/documents/upload-intent
     */
    createUploadIntent(
      organizationId: string,
      data: UploadIntentRequest,
    ): Promise<UploadIntentResponse> {
      return client.post<UploadIntentResponse>(
        `/v1/organizations/${organizationId}/documents/upload-intent`,
        data,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/documents
     * Multipart file upload.
     */
    async uploadDocument(
      organizationId: string,
      file: File,
      courseId?: string,
    ): Promise<ConfirmUploadResponse> {
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (courseId) {
        formData.append("course_id", courseId);
      }

      const headers: Record<string, string> = {
        "x-request-id": crypto.randomUUID(),
      };

      const url = `/v1/organizations/${organizationId}/documents${
        courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""
      }`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        credentials: "include",
        body: formData,
      });

      let data: unknown;
      try {
        if (typeof response.text === "function") {
          const text = await response.text();
          data = text ? JSON.parse(text) : undefined;
        } else if (typeof response.json === "function") {
          data = await response.json();
        }
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          data.error &&
          typeof (data as { error: unknown }).error === "object"
        ) {
          throw new ApiError(data as ErrorEnvelope);
        }

        const requestId =
          response.headers.get("x-request-id") || crypto.randomUUID();
        const code = response.status === 413 ? "bad_request" : "internal_error";
        const message =
          response.status === 413
            ? "File exceeds maximum allowed size"
            : response.status >= 500
            ? "Upload failed due to a server error"
            : `Upload failed with status ${response.status}`;

        throw new ApiError({
          request_id: requestId,
          error: { code, message },
        });
      }

      return data as ConfirmUploadResponse;
    },

    /**
     * GET /v1/organizations/:organizationId/documents/stats
     */
    getDocumentStats(organizationId: string): Promise<DocumentStatsResponse> {
      return client.get<DocumentStatsResponse>(
        `/v1/organizations/${organizationId}/documents/stats`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/documents
     * Supports filters: search, status, type, course_id, used, sort, page, limit
     */
    listDocuments(
      organizationId: string,
      filters?: DocumentListFilters,
    ): Promise<DocumentListResponse> {
      const params = new URLSearchParams();
      if (filters?.search) params.set("search", filters.search);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.type) params.set("type", filters.type);
      if (filters?.courseId) params.set("course_id", filters.courseId);
      if (filters?.used) params.set("used", filters.used);
      if (filters?.sort) params.set("sort", filters.sort);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));

      const qs = params.toString();
      return client.get<DocumentListResponse>(
        `/v1/organizations/${organizationId}/documents${qs ? `?${qs}` : ""}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/documents/:documentId
     */
    getDocument(
      organizationId: string,
      documentId: string,
    ): Promise<DocumentDetailResponse> {
      return client.get<DocumentDetailResponse>(
        `/v1/organizations/${organizationId}/documents/${documentId}`,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/documents/:documentId
     */
    updateDocument(
      organizationId: string,
      documentId: string,
      data: UpdateDocumentRequest,
    ): Promise<DocumentGetResponse> {
      return client.patch<DocumentGetResponse>(
        `/v1/organizations/${organizationId}/documents/${documentId}`,
        data,
      );
    },

    /**
     * DELETE /v1/organizations/:organizationId/documents/:documentId
     */
    deleteDocument(
      organizationId: string,
      documentId: string,
    ): Promise<void> {
      return client.delete<void>(
        `/v1/organizations/${organizationId}/documents/${documentId}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/documents/:documentId/download
     * ?inline=1 for preview, default is download
     */
    getDownloadUrl(
      organizationId: string,
      documentId: string,
      inline = false,
    ): string {
      return `/v1/organizations/${organizationId}/documents/${documentId}/download${inline ? "?inline=1" : ""}`;
    },

    /**
     * POST /v1/organizations/:organizationId/documents/:documentId/extract
     */
    triggerExtraction(
      organizationId: string,
      documentId: string,
    ): Promise<DocumentStatusResponse> {
      return client.post<DocumentStatusResponse>(
        `/v1/organizations/${organizationId}/documents/${documentId}/extract`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/documents/:documentId/reprocess
     */
    reprocessDocument(
      organizationId: string,
      documentId: string,
    ): Promise<DocumentStatusResponse> {
      return client.post<DocumentStatusResponse>(
        `/v1/organizations/${organizationId}/documents/${documentId}/reprocess`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/documents/bulk-delete
     */
    bulkDeleteDocuments(
      organizationId: string,
      documentIds: string[],
    ): Promise<BulkOperationResponse> {
      return client.post<BulkOperationResponse>(
        `/v1/organizations/${organizationId}/documents/bulk-delete`,
        { document_ids: documentIds },
      );
    },

    /**
     * POST /v1/organizations/:organizationId/documents/bulk-reprocess
     */
    bulkReprocessDocuments(
      organizationId: string,
      documentIds: string[],
    ): Promise<BulkOperationResponse> {
      return client.post<BulkOperationResponse>(
        `/v1/organizations/${organizationId}/documents/bulk-reprocess`,
        { document_ids: documentIds },
      );
    },

    /**
     * POST /v1/organizations/:organizationId/documents/bulk-attach-course
     */
    bulkAttachCourse(
      organizationId: string,
      documentIds: string[],
      courseId: string | null,
    ): Promise<BulkOperationResponse> {
      return client.post<BulkOperationResponse>(
        `/v1/organizations/${organizationId}/documents/bulk-attach-course`,
        { document_ids: documentIds, course_id: courseId },
      );
    },

    /**
     * GET /v1/organizations/:organizationId/documents/:documentId/status
     */
    getDocumentStatus(
      organizationId: string,
      documentId: string,
    ): Promise<DocumentStatusResponse> {
      return client.get<DocumentStatusResponse>(
        `/v1/organizations/${organizationId}/documents/${documentId}/status`,
      );
    },
  };
}

export type DocumentsApi = ReturnType<typeof createDocumentsApi>;
