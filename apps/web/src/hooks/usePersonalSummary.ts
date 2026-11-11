/**
 * React Query hook for Personal Summary management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createPersonalSummaryApi } from "../lib/api/personal-summary.js";
import type {
  GetPersonalSummaryResponse,
  GeneratePersonalSummaryResponse,
} from "@avana/contracts";

export function usePersonalSummary(
  moduleId: string | undefined | null,
  courseId?: string | null,
) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const api = createPersonalSummaryApi(apiClient);

  const queryKey = ["personal-summary", moduleId, courseId];

  const query = useQuery<GetPersonalSummaryResponse>({
    queryKey,
    queryFn: () => api.getPersonalSummary(moduleId!, courseId),
    enabled: Boolean(moduleId),
    staleTime: 15_000,
  });

  const generateMutation = useMutation<GeneratePersonalSummaryResponse, Error>({
    mutationFn: () => api.generatePersonalSummary(moduleId!, courseId),
    onSuccess: (data) => {
      // Update personal summary cache
      queryClient.setQueryData<GetPersonalSummaryResponse | undefined>(
        queryKey,
        (old) => {
          if (!old) {
            return {
              has_personal_summary: true,
              summary: data.summary,
              current_annotations: {
                highlights_count: data.summary.highlightsCount,
                notes_count: data.summary.notesCount,
                total_count: data.summary.highlightsCount + data.summary.notesCount,
                has_new_annotations: false,
              },
              cost_toman: 3000,
            };
          }
          return {
            ...old,
            has_personal_summary: true,
            summary: data.summary,
            current_annotations: {
              ...old.current_annotations,
              has_new_annotations: false,
            },
          };
        },
      );

      // Invalidate relevant queries so balances and views refresh immediately
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["wallet-me"] });
      void queryClient.invalidateQueries({ queryKey: ["my-wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  return {
    personalSummary: query.data?.summary ?? null,
    hasPersonalSummary: Boolean(query.data?.has_personal_summary),
    currentAnnotations: query.data?.current_annotations ?? {
      highlights_count: 0,
      notes_count: 0,
      total_count: 0,
      has_new_annotations: false,
    },
    costToman: query.data?.cost_toman ?? 3000,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    generateMutation,
    isGenerating: generateMutation.isPending,
  };
}
