/**
 * Typed API calls for Avana Public Content Packs & Library.
 *
 * Endpoints:
 * - GET  /v1/library/packs
 * - GET  /v1/library/packs/:packId
 * - POST /v1/library/packs/:packId/add-to-course
 * - POST /v1/organizations/:organizationId/documents/:documentId/content-pack/publish
 */

import type {
  PublicContentPackItemSummary,
  PublicContentPackDetailResource,
} from "@avana/domain";
import type { ApiClient } from "./client.js";

export interface ListPacksParams {
  q?: string;
  subject?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
}

export interface PublicLibraryListResponse {
  request_id: string;
  items: PublicContentPackItemSummary[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
  };
}

export interface PublicLibraryDetailResponse {
  request_id: string;
  pack: PublicContentPackDetailResource;
}

export interface AddPackToCourseRequest {
  course_id: string;
}

export interface AddPackToCourseResponse {
  request_id: string;
  success: boolean;
  already_installed: boolean;
  materialized: {
    module_id: string | null;
    module_title?: string;
    lessons_created: number;
    flashcards_created: number;
    quiz_questions_created: number;
    review_summary_created?: boolean;
  };
}

export interface PublishContentPackRequest {
  title?: string;
  description?: string;
  subject?: string;
}

export interface PublishContentPackResponse {
  request_id: string;
  pack: {
    id: string;
    title: string;
    description: string | null;
    subject: string | null;
    status: "published";
    usage_count: number;
    stats: {
      session_count: number;
      flashcard_count: number;
      quiz_question_count: number;
      estimated_reading_minutes: number;
    };
    published_at: string;
    items_count: number;
  };
}

export function createLibraryApi(client: ApiClient) {
  return {
    /**
     * GET /v1/library/packs — Search & list published content packs.
     */
    listPacks(params: ListPacksParams = {}): Promise<PublicLibraryListResponse> {
      const searchParams = new URLSearchParams();
      if (params.q && params.q.trim().length > 0) {
        searchParams.set("q", params.q.trim());
      }
      if (params.subject && params.subject.trim().length > 0 && params.subject !== "all") {
        searchParams.set("subject", params.subject.trim());
      }
      if (params.sort) {
        searchParams.set("sort", params.sort);
      }
      if (params.page !== undefined) {
        searchParams.set("page", String(params.page));
      }
      if (params.limit !== undefined) {
        searchParams.set("limit", String(params.limit));
      }

      const qs = searchParams.toString();
      return client.get<PublicLibraryListResponse>(
        `/v1/library/packs${qs ? `?${qs}` : ""}`,
      );
    },

    /**
     * GET /v1/library/packs/:packId — Get full detail preview of a published pack.
     */
    getPack(packId: string): Promise<PublicLibraryDetailResponse> {
      return client.get<PublicLibraryDetailResponse>(
        `/v1/library/packs/${encodeURIComponent(packId)}`,
      );
    },

    /**
     * POST /v1/library/packs/:packId/add-to-course — Materialize a pack into user's course.
     */
    addPackToCourse(
      packId: string,
      data: AddPackToCourseRequest,
    ): Promise<AddPackToCourseResponse> {
      return client.post<AddPackToCourseResponse>(
        `/v1/library/packs/${encodeURIComponent(packId)}/add-to-course`,
        data,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/documents/:documentId/content-pack/publish
     * Publish approved 4-asset set as an immutable content pack.
     */
    publishPack(
      organizationId: string,
      documentId: string,
      data: PublishContentPackRequest = {},
    ): Promise<PublishContentPackResponse> {
      return client.post<PublishContentPackResponse>(
        `/v1/organizations/${encodeURIComponent(organizationId)}/documents/${encodeURIComponent(documentId)}/content-pack/publish`,
        data,
      );
    },
  };
}

export type LibraryApi = ReturnType<typeof createLibraryApi>;
