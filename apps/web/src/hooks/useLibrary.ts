/**
 * React Query hooks for Public Content Library & Content Packs.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createLibraryApi,
  type ListCoursePackagesParams,
  type ListLibraryResourcesParams,
  type ListPacksParams,
  type PublishContentPackRequest,
} from "../lib/api/library.js";

function getLibraryApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createLibraryApi(client);
}

/**
 * Fetch list of accessible library resources (courses and standalone contents) with search, filters, sort, and pagination.
 */
export function useLibraryResources(params: ListLibraryResourcesParams = {}) {
  const api = getLibraryApi();
  return useQuery({
    queryKey: [
      "library-resources",
      params.q ?? "",
      params.type ?? "all",
      params.subject ?? "all",
      params.sort ?? "popular",
      params.page ?? 1,
      params.limit ?? 20,
    ],
    queryFn: () => api.listResources(params),
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
  });
}

/**
 * Fetch list of published content packs with search, subject filter, sort, and pagination.
 */
export function useLibraryPacks(params: ListPacksParams = {}) {
  const api = getLibraryApi();
  return useQuery({
    queryKey: [
      "library-packs",
      params.q ?? "",
      params.page ?? 1,
      params.limit ?? 12,
    ],
    queryFn: () => api.listPacks(params),
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
  });
}

/**
 * Fetch list of courses with chapter educational packages with search, subject filter, course filter, sort, and pagination.
 */
export function useCoursePackages(params: ListCoursePackagesParams = {}) {
  const api = getLibraryApi();
  return useQuery({
    queryKey: [
      "library-course-packages",
      params.course_id ?? "",
      params.q ?? "",
      params.subject ?? "all",
      params.sort ?? "popular",
      params.page ?? 1,
      params.limit ?? 20,
    ],
    queryFn: () => api.listCoursePackages(params),
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
  });
}

/**
 * Fetch detailed preview of a single published content pack.
 */
export function useLibraryPack(packId: string | undefined | null) {
  const api = getLibraryApi();
  return useQuery({
    queryKey: ["library-pack", packId],
    queryFn: () => api.getPack(packId!),
    enabled: Boolean(packId && packId.trim().length > 0),
    staleTime: 30_000,
  });
}

/**
 * Mutation to add a content pack to a target course.
 */
export function useAddContentPack() {
  const queryClient = useQueryClient();
  const api = getLibraryApi();

  return useMutation({
    mutationFn: ({
      packId,
      courseId,
    }: {
      packId: string;
      courseId: string;
    }) => api.addPackToCourse(packId, { course_id: courseId }),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries for the target course and library usage
      void queryClient.invalidateQueries({
        queryKey: ["course-content", variables.courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-progress", variables.courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcards"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["exams"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["library-pack", variables.packId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["library-packs"],
      });
    },
  });
}

/**
 * Mutation to publish an approved 4-asset set as an immutable content pack.
 */
export function usePublishContentPack() {
  const queryClient = useQueryClient();
  const api = getLibraryApi();

  return useMutation({
    mutationFn: ({
      organizationId,
      documentId,
      data,
    }: {
      organizationId: string;
      documentId: string;
      data?: PublishContentPackRequest;
    }) => api.publishPack(organizationId, documentId, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", variables.organizationId, variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-status", variables.organizationId, variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-documents", variables.organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["library-packs"],
      });
    },
  });
}
