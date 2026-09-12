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
  ResourceAccessSummary,
  ResourcePurchaseSummary,
  CoursePackagesResponse,
} from "@avana/domain";
import type { ApiClient } from "./client.js";

export interface ListCoursePackagesParams {
  course_id?: string;
  q?: string;
  subject?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
}

export interface ListPacksParams {
  q?: string;
  subject?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
}

export interface ListLibraryResourcesParams {
  q?: string;
  type?: "all" | "courses" | "contents" | "special_exams";
  subject?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
}

export interface LibraryCourseItem {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  module_count: number;
  content_count: number;
  progress?: {
    completed_lessons: number;
    total_lessons: number;
    percent: number;
  };
  access?: ResourceAccessSummary;
  purchase?: ResourcePurchaseSummary;
  preview?: import("@avana/domain").ContentPreviewMetadata;
  href: string;
  created_at: string;
  updated_at: string;
}

export interface LibrarySpecialExamItem {
  id: string;
  productId: string;
  code: string;
  title: string;
  description: string | null;
  question_count: number;
  difficulty: string | null;
  scope?: {
    courseId?: string;
    moduleId?: string;
    lessonId?: string;
    topics?: string[];
  } | null;
  blueprint?: Array<{
    name: string;
    topic?: string;
    moduleId?: string;
    lessonId?: string;
    difficulty?: string;
    count: number;
  }>;
  price: number;
  currency: string;
  access?: ResourceAccessSummary;
  purchase?: ResourcePurchaseSummary;
  created_at: string;
  updated_at: string;
}

export interface LibraryContentItem {
  id: string;
  title: string;
  type: "lesson" | "document" | "quiz" | "flashcard" | "review_summary";
  course_id: string;
  course_title: string;
  module_id?: string | null;
  module_title?: string | null;
  lesson_id?: string | null;
  estimated_minutes?: number | null;
  completed?: boolean;
  completed_at?: string | null;
  is_preview?: boolean;
  access?: ResourceAccessSummary;
  purchase?: ResourcePurchaseSummary;
  href: string;
  created_at: string;
  updated_at: string;
}

export interface LibraryResourcesResponse {
  request_id: string;
  courses: LibraryCourseItem[];
  contents: LibraryContentItem[];
  special_exams?: LibrarySpecialExamItem[];
  pagination: {
    page: number;
    limit: number;
    total_courses: number;
    total_contents: number;
    total_special_exams?: number;
  };
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
     * GET /v1/library/course-packages — List courses with chapter educational packages.
     */
    listCoursePackages(
      params: ListCoursePackagesParams = {},
    ): Promise<CoursePackagesResponse> {
      const searchParams = new URLSearchParams();
      if (params.course_id && params.course_id.trim().length > 0) {
        searchParams.set("course_id", params.course_id.trim());
      }
      if (params.q && params.q.trim().length > 0) {
        searchParams.set("q", params.q.trim());
      }
      if (
        params.subject &&
        params.subject.trim().length > 0 &&
        params.subject !== "all"
      ) {
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
      return client.get<CoursePackagesResponse>(
        `/v1/library/course-packages${qs ? `?${qs}` : ""}`,
      );
    },

    /**
     * GET /v1/library/resources — Search & list accessible courses and standalone contents.
     */
    listResources(
      params: ListLibraryResourcesParams = {},
    ): Promise<LibraryResourcesResponse> {
      const searchParams = new URLSearchParams();
      if (params.q && params.q.trim().length > 0) {
        searchParams.set("q", params.q.trim());
      }
      if (params.type && params.type !== "all") {
        searchParams.set("type", params.type);
      }
      if (
        params.subject &&
        params.subject.trim().length > 0 &&
        params.subject !== "all"
      ) {
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
      return client.get<LibraryResourcesResponse>(
        `/v1/library/resources${qs ? `?${qs}` : ""}`,
      );
    },

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
