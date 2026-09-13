/**
 * React Query hook for managing lesson text annotations (highlights, notes) and reporting content issues.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createLessonAnnotationsApi } from "../lib/api/annotations.js";
import type {
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  CreateContentReportRequest,
  ListAnnotationsResponse,
} from "@avana/contracts";

export function useLessonAnnotations(lessonId: string | undefined) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const annotationsApi = createLessonAnnotationsApi(apiClient);

  const queryKey = ["lesson-annotations", lessonId];

  const query = useQuery({
    queryKey,
    queryFn: () => annotationsApi.listAnnotations(lessonId!),
    enabled: Boolean(lessonId),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (request: CreateAnnotationRequest) =>
      annotationsApi.createAnnotation(lessonId!, request),
    onSuccess: (newAnnotation) => {
      console.log("[annotation-cache]", { action: "create", newAnnotation });
      queryClient.setQueryData<ListAnnotationsResponse | undefined>(
        queryKey,
        (old) => {
          if (!old) {
            return { items: [newAnnotation] };
          }
          if (old.items.some((item) => item.id === newAnnotation.id)) {
            return old;
          }
          return {
            ...old,
            items: [...old.items, newAnnotation],
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      annotationId,
      request,
    }: {
      annotationId: string;
      request: UpdateAnnotationRequest;
    }) => annotationsApi.updateAnnotation(annotationId, request),
    onSuccess: (updatedAnnotation) => {
      queryClient.setQueryData<ListAnnotationsResponse | undefined>(
        queryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === updatedAnnotation.id ? updatedAnnotation : item,
            ),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (annotationId: string) =>
      annotationsApi.deleteAnnotation(annotationId),
    onSuccess: (_data, annotationId) => {
      queryClient.setQueryData<ListAnnotationsResponse | undefined>(
        queryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((item) => item.id !== annotationId),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const reportMutation = useMutation({
    mutationFn: (request: CreateContentReportRequest) =>
      annotationsApi.createReport(lessonId!, request),
  });

  const items = query.data?.items || [];
  const highlights = items.filter((item) => item.type === "highlight");
  const notes = items.filter((item) => item.type === "note");

  return {
    annotations: items,
    highlights,
    notes,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createAnnotation: createMutation.mutate,
    createAnnotationAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateAnnotation: updateMutation.mutate,
    updateAnnotationAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteAnnotation: deleteMutation.mutate,
    deleteAnnotationAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    createReport: reportMutation.mutate,
    createReportAsync: reportMutation.mutateAsync,
    isReporting: reportMutation.isPending,
  };
}
