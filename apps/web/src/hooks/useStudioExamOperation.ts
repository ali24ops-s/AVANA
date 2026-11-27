import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStudioApi,
  type CreateExamOperationInput,
  type CreatedExamOperationResponse,
  type ActiveExamOperationResponse,
  type FullExamOperationDetails,
  type ExamOperationProgressSummary,
  type StagingQuestionRecord,
  type StagingQuestionsFilterParams,
  type CancelExamOperationResponse,
  type StudioExamOperationStatus,
  type StagingQuestionReviewDecision,
  type ReviewExamQuestionsResponse,
  type TransferExamQuestionsResponse,
  type ExamOperationHistoryFilterParams,
  type ListQuizExamOperationsResponse,
} from "../lib/api/studio-api.js";

/**
 * Structured, isolated query key factory for Multi-Chapter Exam Operations.
 * Scoped by quizId and operationId to strictly prevent cross-quiz or cross-operation cache contamination.
 */
export const studioExamKeys = {
  all: ["studio", "exam-operations"] as const,
  byQuiz: (quizId: string | undefined) =>
    [...studioExamKeys.all, "quiz", quizId ?? ""] as const,
  active: (quizId: string | undefined) =>
    [...studioExamKeys.byQuiz(quizId), "active"] as const,
  list: (
    quizId: string | undefined,
    filters?: ExamOperationHistoryFilterParams,
  ) => [...studioExamKeys.byQuiz(quizId), "list", filters ?? {}] as const,
  byOperation: (operationId: string | undefined) =>
    [...studioExamKeys.all, "operation", operationId ?? ""] as const,
  details: (operationId: string | undefined) =>
    [...studioExamKeys.byOperation(operationId), "details"] as const,
  progress: (operationId: string | undefined) =>
    [...studioExamKeys.byOperation(operationId), "progress"] as const,
  questions: (
    operationId: string | undefined,
    filters?: StagingQuestionsFilterParams,
  ) =>
    [...studioExamKeys.byOperation(operationId), "questions", filters ?? {}] as const,
};

export interface UseStudioExamOperationOptions {
  api?: ReturnType<typeof getStudioApi>;
}

/**
 * 1. Hook to initiate a new multi-chapter exam generation operation for a quiz.
 * Automatically invalidates quiz-level active queries upon success and caches operation details.
 */
export function useCreateExamOperation(
  quizId: string | undefined,
  options?: UseStudioExamOperationOptions,
) {
  const queryClient = useQueryClient();
  const studioApi = options?.api ?? getStudioApi();

  return useMutation<CreatedExamOperationResponse, Error, CreateExamOperationInput>({
    mutationFn: async (input: CreateExamOperationInput) => {
      if (!quizId) {
        throw new Error("شناسه آزمون مشخص نشده است.");
      }
      return await studioApi.createExamOperation(quizId, input);
    },
    onSuccess: (data) => {
      if (!quizId) return;

      // Update active operation cache immediately
      queryClient.setQueryData<ActiveExamOperationResponse>(
        studioExamKeys.active(quizId),
        { operation: data.operation },
      );

      // Pre-seed full details cache for the new operation
      queryClient.setQueryData<FullExamOperationDetails>(
        studioExamKeys.details(data.operation.id),
        data,
      );

      // Invalidate quiz-level operations to trigger fresh background fetches
      void queryClient.invalidateQueries({ queryKey: studioExamKeys.byQuiz(quizId) });
    },
  });
}

/**
 * 2. Hook to retrieve any active (pending or processing) operation for a given quiz.
 * Essential for reconnecting after page refresh.
 */
export function useActiveExamOperation(
  quizId: string | undefined,
  options?: UseStudioExamOperationOptions & { enabled?: boolean },
) {
  const studioApi = options?.api ?? getStudioApi();

  return useQuery<ActiveExamOperationResponse, Error>({
    queryKey: studioExamKeys.active(quizId),
    queryFn: async () => {
      if (!quizId) {
        throw new Error("شناسه آزمون مشخص نشده است.");
      }
      return await studioApi.getActiveExamOperation(quizId);
    },
    enabled: Boolean(quizId) && (options?.enabled ?? true),
    staleTime: 5000,
  });
}

/**
 * 3. Hook to poll lightweight progress of an in-flight operation.
 * - Polls at ~2000ms intervals during active states (pending / processing).
 * - Stops polling immediately when terminal state is reached (completed / failed / cancelled).
 * - Does NOT poll in background when tab is hidden or minimized.
 */
export function useExamOperationProgress(
  operationId: string | undefined,
  options?: UseStudioExamOperationOptions & {
    enabled?: boolean;
    onCompleted?: (progress: ExamOperationProgressSummary) => void;
    onPartial?: (progress: ExamOperationProgressSummary) => void;
    onFailed?: (progress: ExamOperationProgressSummary) => void;
  },
) {
  const queryClient = useQueryClient();
  const studioApi = options?.api ?? getStudioApi();

  return useQuery<ExamOperationProgressSummary, Error>({
    queryKey: studioExamKeys.progress(operationId),
    queryFn: async () => {
      if (!operationId) {
        throw new Error("شناسه عملیات مشخص نشده است.");
      }
      const progress = await studioApi.getExamOperationProgress(operationId);

      // Trigger cache updates when terminal states reached
      if (progress.status === "completed") {
        options?.onCompleted?.(progress);
        void queryClient.invalidateQueries({ queryKey: studioExamKeys.details(operationId) });
        void queryClient.invalidateQueries({
          queryKey: [...studioExamKeys.byOperation(operationId), "questions"],
        });
        if (progress.quizId) {
          void queryClient.invalidateQueries({ queryKey: studioExamKeys.active(progress.quizId) });
          void queryClient.invalidateQueries({
            queryKey: [...studioExamKeys.byQuiz(progress.quizId), "list"],
          });
        }
      } else if (progress.status === "partial") {
        options?.onPartial?.(progress);
        void queryClient.invalidateQueries({ queryKey: studioExamKeys.details(operationId) });
        void queryClient.invalidateQueries({
          queryKey: [...studioExamKeys.byOperation(operationId), "questions"],
        });
        if (progress.quizId) {
          void queryClient.invalidateQueries({ queryKey: studioExamKeys.active(progress.quizId) });
          void queryClient.invalidateQueries({
            queryKey: [...studioExamKeys.byQuiz(progress.quizId), "list"],
          });
        }
      } else if (progress.status === "failed" || progress.status === "cancelled") {
        if (progress.status === "failed") {
          options?.onFailed?.(progress);
        }
        void queryClient.invalidateQueries({ queryKey: studioExamKeys.details(operationId) });
        if (progress.quizId) {
          void queryClient.invalidateQueries({ queryKey: studioExamKeys.active(progress.quizId) });
          void queryClient.invalidateQueries({
            queryKey: [...studioExamKeys.byQuiz(progress.quizId), "list"],
          });
        }
      }

      return progress;
    },
    enabled: Boolean(operationId) && (options?.enabled ?? true),
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      const status: StudioExamOperationStatus = data.status;
      if (status === "pending" || status === "processing") {
        return 2000;
      }
      // Stop polling on terminal states
      return false;
    },
  });
}

/**
 * 4. Hook to retrieve full details of an operation including tasks and batches with sanitized errors.
 */
export function useExamOperationDetails(
  operationId: string | undefined,
  options?: UseStudioExamOperationOptions & { enabled?: boolean },
) {
  const studioApi = options?.api ?? getStudioApi();

  return useQuery<FullExamOperationDetails, Error>({
    queryKey: studioExamKeys.details(operationId),
    queryFn: async () => {
      if (!operationId) {
        throw new Error("شناسه عملیات مشخص نشده است.");
      }
      return await studioApi.getExamOperationDetails(operationId);
    },
    enabled: Boolean(operationId) && (options?.enabled ?? true),
    staleTime: 10000,
  });
}

/**
 * 5. Hook to retrieve staging questions generated by an operation with optional filtering and pagination.
 */
export function useExamStagingQuestions(
  operationId: string | undefined,
  filters?: StagingQuestionsFilterParams,
  options?: UseStudioExamOperationOptions & { enabled?: boolean },
) {
  const studioApi = options?.api ?? getStudioApi();

  return useQuery<{ questions: StagingQuestionRecord[] }, Error>({
    queryKey: studioExamKeys.questions(operationId, filters),
    queryFn: async () => {
      if (!operationId) {
        throw new Error("شناسه عملیات مشخص نشده است.");
      }
      return await studioApi.getExamOperationQuestions(operationId, filters);
    },
    enabled: Boolean(operationId) && (options?.enabled ?? true),
    staleTime: 5000,
  });
}

/**
 * 6. Hook to cancel an in-flight operation.
 * Invalidates active operation queries and progress upon cancellation.
 */
export function useCancelExamOperation(
  quizId?: string,
  options?: UseStudioExamOperationOptions,
) {
  const queryClient = useQueryClient();
  const studioApi = options?.api ?? getStudioApi();

  return useMutation<
    CancelExamOperationResponse,
    Error,
    { operationId: string; reason?: string }
  >({
    mutationFn: async ({ operationId, reason }) => {
      return await studioApi.cancelExamOperation(operationId, reason);
    },
    onSuccess: (_data, variables) => {
      // Invalidate operation progress and details
      void queryClient.invalidateQueries({
        queryKey: studioExamKeys.progress(variables.operationId),
      });
      void queryClient.invalidateQueries({
        queryKey: studioExamKeys.details(variables.operationId),
      });

      // Invalidate quiz active queries
      if (quizId) {
        void queryClient.invalidateQueries({
          queryKey: studioExamKeys.active(quizId),
        });
        void queryClient.invalidateQueries({
          queryKey: studioExamKeys.byQuiz(quizId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: studioExamKeys.all });
    },
  });
}

/**
 * 7. Hook to batch-review staged questions (accept, reject, or reset to pending_review).
 * Automatically invalidates staging questions, progress, and details caches upon success.
 */
export function useReviewExamOperationQuestions(
  operationId: string | undefined,
  options?: UseStudioExamOperationOptions & { quizId?: string },
) {
  const queryClient = useQueryClient();
  const studioApi = options?.api ?? getStudioApi();

  return useMutation<
    ReviewExamQuestionsResponse,
    Error,
    { questionIds: string[]; decision: StagingQuestionReviewDecision }
  >({
    mutationFn: async ({ questionIds, decision }) => {
      if (!operationId) {
        throw new Error("شناسه عملیات مشخص نشده است.");
      }
      if (!questionIds.length) {
        throw new Error("حداقل یک سؤال باید انتخاب شود.");
      }
      return await studioApi.reviewExamOperationQuestions(
        operationId,
        questionIds,
        decision,
      );
    },
    onSuccess: () => {
      if (!operationId) return;
      void queryClient.invalidateQueries({
        queryKey: [...studioExamKeys.byOperation(operationId), "questions"],
      });
      void queryClient.invalidateQueries({
        queryKey: studioExamKeys.progress(operationId),
      });
      void queryClient.invalidateQueries({
        queryKey: studioExamKeys.details(operationId),
      });
      if (options?.quizId) {
        void queryClient.invalidateQueries({
          queryKey: [...studioExamKeys.byQuiz(options.quizId), "list"],
        });
      }
    },
  });
}

/**
 * 9. Hook to retrieve persistent quiz-scoped exam generation operation history from Backend.
 */
export function useQuizExamOperations(
  quizId: string | undefined,
  filters?: ExamOperationHistoryFilterParams,
  options?: UseStudioExamOperationOptions & { enabled?: boolean },
) {
  const studioApi = options?.api ?? getStudioApi();

  return useQuery<ListQuizExamOperationsResponse, Error>({
    queryKey: studioExamKeys.list(quizId, filters),
    queryFn: async () => {
      if (!quizId) {
        throw new Error("شناسه آزمون مشخص نشده است.");
      }
      return await studioApi.listQuizExamOperations(quizId, filters);
    },
    enabled: Boolean(quizId) && (options?.enabled ?? true),
    staleTime: 5000,
  });
}

/**
 * 8. Hook to atomically transfer accepted staged questions into the authoritative quiz.
 * Automatically invalidates staging questions, operation progress/details, and quiz caches.
 */
export function useTransferExamOperationQuestions(
  operationId: string | undefined,
  quizId?: string,
  options?: UseStudioExamOperationOptions,
) {
  const queryClient = useQueryClient();
  const studioApi = options?.api ?? getStudioApi();

  return useMutation<
    TransferExamQuestionsResponse,
    Error,
    { questionIds: string[] }
  >({
    mutationFn: async ({ questionIds }) => {
      if (!operationId) {
        throw new Error("شناسه عملیات مشخص نشده است.");
      }
      if (!questionIds.length) {
        throw new Error("حداقل یک سؤال باید برای انتقال انتخاب شود.");
      }
      return await studioApi.transferExamOperationQuestions(operationId, questionIds);
    },
    onSuccess: () => {
      if (!operationId) return;
      void queryClient.invalidateQueries({
        queryKey: [...studioExamKeys.byOperation(operationId), "questions"],
      });
      void queryClient.invalidateQueries({
        queryKey: studioExamKeys.progress(operationId),
      });
      void queryClient.invalidateQueries({
        queryKey: studioExamKeys.details(operationId),
      });
      if (quizId) {
        void queryClient.invalidateQueries({
          queryKey: studioExamKeys.byQuiz(quizId),
        });
      }
    },
  });
}
