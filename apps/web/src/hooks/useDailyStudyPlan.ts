/**
 * React Query hooks for AVANA Daily Study Planner (Phase 4).
 *
 * Provides queries and mutations to connect UI components directly to
 * Daily Study Planner Phase 3 API endpoints (/v1/study/daily-plan).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudyApi } from "../lib/api/study.js";
import type {
  DailyStudyPlanResponse,
  RegenerateDailyPlanRequest,
  StudyTaskStatus,
} from "@avana/contracts";

function getStudyApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createStudyApi(client);
}

/**
 * Fetch today's daily study plan from GET /v1/study/daily-plan
 */
export function useDailyStudyPlan(options?: {
  timezone?: string;
  targetMinutes?: number;
}) {
  const api = getStudyApi();
  const tz = options?.timezone ?? "";
  const tm = options?.targetMinutes ?? 0;

  return useQuery<DailyStudyPlanResponse>({
    queryKey: ["daily-study-plan", tz, tm],
    queryFn: () => api.getDailyStudyPlan(options),
    staleTime: 30_000,
  });
}

/**
 * Mutation to regenerate uncompleted tasks in today's daily study plan
 */
export function useRegenerateDailyPlan() {
  const queryClient = useQueryClient();
  const api = getStudyApi();

  return useMutation({
    mutationFn: (data?: RegenerateDailyPlanRequest) =>
      api.regenerateDailyPlan(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["daily-study-plan"],
      });
    },
  });
}

/**
 * Mutation to update an individual task status in today's daily study plan
 */
export function useUpdateStudyTaskStatus() {
  const queryClient = useQueryClient();
  const api = getStudyApi();

  return useMutation({
    mutationFn: ({
      taskId,
      status,
    }: {
      taskId: string;
      status: StudyTaskStatus;
    }) => api.updateStudyTaskStatus(taskId, { status }),
    onSuccess: () => {
      // Invalidate daily study plan query
      void queryClient.invalidateQueries({
        queryKey: ["daily-study-plan"],
      });
    },
  });
}
