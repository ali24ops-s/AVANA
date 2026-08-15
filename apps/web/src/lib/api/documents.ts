/**
 * Document upload and extraction API calls using typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  DocumentListResponse,
  DocumentGetResponse,
  DocumentStatusResponse,
  ConfirmUploadResponse,
  UploadIntentRequest,
  UploadIntentResponse,
  ErrorEnvelope,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";
import { ApiError } from "./errors.js";

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
     * GET /v1/organizations/:organizationId/documents
     */
    listDocuments(organizationId: string): Promise<DocumentListResponse> {
      return client.get<DocumentListResponse>(
        `/v1/organizations/${organizationId}/documents`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/documents/:documentId
     */
    getDocument(
      organizationId: string,
      documentId: string,
    ): Promise<DocumentGetResponse> {
      return client.get<DocumentGetResponse>(
        `/v1/organizations/${organizationId}/documents/${documentId}`,
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
