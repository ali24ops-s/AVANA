import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { createApiClient } from "../lib/api/client.js";
import {
  createStudioApi,
  type CreateExamOperationInput,
  type CreatedExamOperationResponse,
  type ActiveExamOperationResponse,
  type ExamOperationProgressSummary,
  type FullExamOperationDetails,
  type StagingQuestionRecord,
  type CancelExamOperationResponse,
} from "../lib/api/studio-api.js";
import {
  studioExamKeys,
  useCreateExamOperation,
  useActiveExamOperation,
  useExamOperationProgress,
  useExamOperationDetails,
  useExamStagingQuestions,
  useCancelExamOperation,
  useReviewExamOperationQuestions,
  useTransferExamOperationQuestions,
  useQuizExamOperations,
} from "../hooks/useStudioExamOperation.js";

function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headerMap = new Map<string, string>(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    text: () => Promise.resolve(body !== undefined ? JSON.stringify(body) : ""),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function createTestWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("Studio Exam Operations — Data Layer & Query Hooks (Phase 1)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  });

  describe("1. studioExamKeys Factory", () => {
    it("generates structured, hierarchical query keys", () => {
      expect(studioExamKeys.all).toEqual(["studio", "exam-operations"]);
      expect(studioExamKeys.byQuiz("quiz-123")).toEqual([
        "studio",
        "exam-operations",
        "quiz",
        "quiz-123",
      ]);
      expect(studioExamKeys.active("quiz-123")).toEqual([
        "studio",
        "exam-operations",
        "quiz",
        "quiz-123",
        "active",
      ]);
      expect(studioExamKeys.byOperation("op-456")).toEqual([
        "studio",
        "exam-operations",
        "operation",
        "op-456",
      ]);
      expect(studioExamKeys.details("op-456")).toEqual([
        "studio",
        "exam-operations",
        "operation",
        "op-456",
        "details",
      ]);
      expect(studioExamKeys.progress("op-456")).toEqual([
        "studio",
        "exam-operations",
        "operation",
        "op-456",
        "progress",
      ]);
      expect(studioExamKeys.questions("op-456", { isAccepted: false, limit: 10 })).toEqual([
        "studio",
        "exam-operations",
        "operation",
        "op-456",
        "questions",
        { isAccepted: false, limit: 10 },
      ]);
    });

    it("isolates caches across different quizzes and operations", () => {
      const q1 = studioExamKeys.active("quiz-1");
      const q2 = studioExamKeys.active("quiz-2");
      expect(q1).not.toEqual(q2);

      const op1 = studioExamKeys.details("op-1");
      const op2 = studioExamKeys.details("op-2");
      expect(op1).not.toEqual(op2);

      const filterAll = studioExamKeys.questions("op-1", undefined);
      const filterUnaccepted = studioExamKeys.questions("op-1", { isAccepted: false });
      expect(filterAll).not.toEqual(filterUnaccepted);
    });

    it("handles undefined parameters safely without crashing", () => {
      expect(studioExamKeys.byQuiz(undefined)).toEqual([
        "studio",
        "exam-operations",
        "quiz",
        "",
      ]);
      expect(studioExamKeys.byOperation(undefined)).toEqual([
        "studio",
        "exam-operations",
        "operation",
        "",
      ]);
      expect(studioExamKeys.questions(undefined, undefined)).toEqual([
        "studio",
        "exam-operations",
        "operation",
        "",
        "questions",
        {},
      ]);
    });
  });

  describe("2. Studio API Client Methods", () => {
    it("createExamOperation issues POST with payload", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockResponse: CreatedExamOperationResponse = {
        operation: {
          id: "op-1",
          quizId: "quiz-1",
          status: "pending",
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:00:00Z",
          totalRequestedQuestions: 15,
          totalGeneratedQuestions: 0,
          progressPercentage: 0,
          allocations: [{ chapterId: "chap-1", chapterTitle: "فصل ۱", questionCount: 15 }],
          cancelledAt: null,
          cancelReason: null,
        },
        tasks: [],
        batches: [],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return Promise.resolve(mockFetchResponse(201, mockResponse));
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);

      const input: CreateExamOperationInput = {
        allocations: [{ chapterId: "chap-1", chapterTitle: "فصل ۱", questionCount: 15 }],
        difficulty: "hard",
        bloomLevel: "apply",
        generationMode: "exam_oriented",
      };

      const result = await api.createExamOperation("quiz-1", input);

      expect(capturedUrl).toBe("/v1/studio/quizzes/quiz-1/exam-operations");
      expect(capturedInit?.method).toBe("POST");
      expect(JSON.parse(String(capturedInit?.body))).toEqual(input);
      expect(result.operation.id).toBe("op-1");
    });

    it("getActiveExamOperation issues GET and handles active or null", async () => {
      let capturedUrl = "";
      const mockActive: ActiveExamOperationResponse = {
        operation: {
          id: "op-1",
          quizId: "quiz-1",
          status: "processing",
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:01:00Z",
        },
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        capturedUrl = String(url);
        return Promise.resolve(mockFetchResponse(200, mockActive));
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);

      const result = await api.getActiveExamOperation("quiz-1");
      expect(capturedUrl).toBe("/v1/studio/quizzes/quiz-1/exam-operations/active");
      expect(result.operation?.id).toBe("op-1");
    });

    it("getExamOperationProgress issues GET and returns summary", async () => {
      let capturedUrl = "";
      const mockProgress: ExamOperationProgressSummary = {
        operationId: "op-1",
        quizId: "quiz-1",
        status: "processing",
        totalRequestedQuestions: 20,
        totalGeneratedQuestions: 10,
        progressPercentage: 50,
        updatedAt: "2026-11-25T12:02:00Z",
        tasks: [],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        capturedUrl = String(url);
        return Promise.resolve(mockFetchResponse(200, mockProgress));
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);

      const result = await api.getExamOperationProgress("op-1");
      expect(capturedUrl).toBe("/v1/studio/exam-operations/op-1/progress");
      expect(result.progressPercentage).toBe(50);
    });

    it("getExamOperationQuestions serializes filter query params correctly", async () => {
      let capturedUrl = "";
      const mockQuestions: { questions: StagingQuestionRecord[] } = {
        questions: [],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        capturedUrl = String(url);
        return Promise.resolve(mockFetchResponse(200, mockQuestions));
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);

      await api.getExamOperationQuestions("op-1", {
        taskId: "task-10",
        batchId: "batch-20",
        isAccepted: false,
        limit: 25,
        offset: 50,
      });

      expect(capturedUrl).toContain("/v1/studio/exam-operations/op-1/questions?");
      expect(capturedUrl).toContain("taskId=task-10");
      expect(capturedUrl).toContain("batchId=batch-20");
      expect(capturedUrl).toContain("isAccepted=false");
      expect(capturedUrl).toContain("limit=25");
      expect(capturedUrl).toContain("offset=50");
    });

    it("cancelExamOperation issues POST with optional reason", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const mockCancel: CancelExamOperationResponse = {
        cancelled: true,
        reason: "لغو توسط کاربر",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return Promise.resolve(mockFetchResponse(200, mockCancel));
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);

      const result = await api.cancelExamOperation("op-1", "لغو توسط کاربر");
      expect(capturedUrl).toBe("/v1/studio/exam-operations/op-1/cancel");
      expect(capturedInit?.method).toBe("POST");
      expect(JSON.parse(String(capturedInit?.body))).toEqual({ reason: "لغو توسط کاربر" });
      expect(result.cancelled).toBe(true);
    });
  });

  describe("3. useCreateExamOperation Hook", () => {
    it("submits operation, pre-seeds active & details cache, and invalidates quiz queries", async () => {
      const mockCreated: CreatedExamOperationResponse = {
        operation: {
          id: "op-create-1",
          quizId: "quiz-create-1",
          status: "pending",
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:00:00Z",
          totalRequestedQuestions: 10,
          totalGeneratedQuestions: 0,
          progressPercentage: 0,
          allocations: [],
          cancelledAt: null,
          cancelReason: null,
        },
        tasks: [],
        batches: [],
      };

      const mockApi = {
        createExamOperation: vi.fn().mockResolvedValue(mockCreated),
      } as unknown as ReturnType<typeof createStudioApi>;

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () => useCreateExamOperation("quiz-create-1", { api: mockApi }),
        { wrapper },
      );

      await result.current.mutateAsync({
        allocations: [{ chapterId: "c1", chapterTitle: "فصل ۱", questionCount: 10 }],
      });

      expect(mockApi.createExamOperation).toHaveBeenCalledWith("quiz-create-1", {
        allocations: [{ chapterId: "c1", chapterTitle: "فصل ۱", questionCount: 10 }],
      });

      // Cache seeded for active query
      const cachedActive = queryClient.getQueryData<ActiveExamOperationResponse>(
        studioExamKeys.active("quiz-create-1"),
      );
      expect(cachedActive?.operation?.id).toBe("op-create-1");

      // Cache seeded for details query
      const cachedDetails = queryClient.getQueryData<FullExamOperationDetails>(
        studioExamKeys.details("op-create-1"),
      );
      expect(cachedDetails?.operation.id).toBe("op-create-1");

      // Invalidates quiz queries
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.byQuiz("quiz-create-1"),
      });
    });

    it("throws error when quizId is undefined", async () => {
      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(
        () => useCreateExamOperation(undefined),
        { wrapper },
      );

      await expect(
        result.current.mutateAsync({
          allocations: [{ chapterId: "c1", chapterTitle: "فصل ۱", questionCount: 10 }],
        }),
      ).rejects.toThrow("شناسه آزمون مشخص نشده است.");
    });
  });

  describe("4. useActiveExamOperation Hook", () => {
    it("fetches active operation when enabled", async () => {
      const mockActiveData: ActiveExamOperationResponse = {
        operation: {
          id: "op-active-1",
          quizId: "quiz-1",
          status: "processing",
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:01:00Z",
        },
      };

      const mockApi = {
        getActiveExamOperation: vi.fn().mockResolvedValue(mockActiveData),
      } as unknown as ReturnType<typeof createStudioApi>;

      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(
        () => useActiveExamOperation("quiz-1", { api: mockApi }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.operation?.id).toBe("op-active-1");
      expect(mockApi.getActiveExamOperation).toHaveBeenCalledWith("quiz-1");
    });

    it("does not trigger request when quizId is undefined", () => {
      const mockApi = {
        getActiveExamOperation: vi.fn(),
      } as unknown as ReturnType<typeof createStudioApi>;

      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(
        () => useActiveExamOperation(undefined, { api: mockApi }),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(mockApi.getActiveExamOperation).not.toHaveBeenCalled();
    });
  });

  describe("5. useExamOperationProgress Hook & Polling Lifecycle", () => {
    it("fetches progress successfully and invokes onCompleted at terminal success", async () => {
      const completedProgress: ExamOperationProgressSummary = {
        operationId: "op-completed-1",
        quizId: "quiz-comp-1",
        status: "completed",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 10,
        progressPercentage: 100,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(completedProgress),
      } as unknown as ReturnType<typeof createStudioApi>;

      const onCompleted = vi.fn();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () =>
          useExamOperationProgress("op-completed-1", {
            api: mockApi,
            onCompleted,
          }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.status).toBe("completed");
      expect(onCompleted).toHaveBeenCalledWith(completedProgress);

      // Invalidation verification on complete
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.details("op-completed-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...studioExamKeys.byOperation("op-completed-1"), "questions"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.active("quiz-comp-1"),
      });
    });

    it("invokes onFailed when status is failed", async () => {
      const failedProgress: ExamOperationProgressSummary = {
        operationId: "op-failed-1",
        quizId: "quiz-fail-1",
        status: "failed",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 2,
        progressPercentage: 20,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(failedProgress),
      } as unknown as ReturnType<typeof createStudioApi>;

      const onFailed = vi.fn();
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () =>
          useExamOperationProgress("op-failed-1", {
            api: mockApi,
            onFailed,
          }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(onFailed).toHaveBeenCalledWith(failedProgress);
    });

    it("configures refetchInterval dynamically based on status", () => {
      // Testing the refetchInterval function logic directly
      const activeState = {
        state: {
          data: { status: "processing" },
        },
      };
      const pendingState = {
        state: {
          data: { status: "pending" },
        },
      };
      const completedState = {
        state: {
          data: { status: "completed" },
        },
      };
      const partialState = {
        state: {
          data: { status: "partial" },
        },
      };
      const failedState = {
        state: {
          data: { status: "failed" },
        },
      };
      const cancelledState = {
        state: {
          data: { status: "cancelled" },
        },
      };
      const noDataState = {
        state: {
          data: undefined,
        },
      };

      // Extract the hook's refetchInterval option by mounting
      let intervalFn: ((query: { state: { data?: { status?: string } } }) => number | false) | undefined;
      const mockApi = {
        getExamOperationProgress: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as ReturnType<typeof createStudioApi>;

      const wrapper = createTestWrapper(queryClient);
      renderHook(
        () => {
          const hookResult = useExamOperationProgress("op-test", { api: mockApi });
          // Read query options from query cache
          const query = queryClient.getQueryCache().find({ queryKey: studioExamKeys.progress("op-test") });
          intervalFn = query?.options?.refetchInterval as
            | ((query: { state: { data?: { status?: string } } }) => number | false)
            | undefined;
          return hookResult;
        },
        { wrapper },
      );

      expect(typeof intervalFn).toBe("function");
      expect(intervalFn(noDataState)).toBe(2000);
      expect(intervalFn(pendingState)).toBe(2000);
      expect(intervalFn(activeState)).toBe(2000);
      expect(intervalFn(completedState)).toBe(false);
      expect(intervalFn(partialState)).toBe(false);
      expect(intervalFn(failedState)).toBe(false);
      expect(intervalFn(cancelledState)).toBe(false);
    });

    it("invokes onPartial and invalidates details, questions, and active caches when status is partial", async () => {
      const partialProgress: ExamOperationProgressSummary = {
        operationId: "op-partial-1",
        quizId: "quiz-part-1",
        status: "partial",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 5,
        progressPercentage: 50,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(partialProgress),
      } as unknown as ReturnType<typeof createStudioApi>;

      const onPartial = vi.fn();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () =>
          useExamOperationProgress("op-partial-1", {
            api: mockApi,
            onPartial,
          }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.status).toBe("partial");
      expect(onPartial).toHaveBeenCalledWith(partialProgress);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.details("op-partial-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...studioExamKeys.byOperation("op-partial-1"), "questions"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.active("quiz-part-1"),
      });
    });
  });

  describe("6. useExamOperationDetails Hook", () => {
    it("fetches full operation details with tasks and batches", async () => {
      const fullDetails: FullExamOperationDetails = {
        operation: {
          id: "op-detail-1",
          quizId: "quiz-detail-1",
          status: "completed",
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:05:00Z",
          totalRequestedQuestions: 10,
          totalGeneratedQuestions: 10,
          progressPercentage: 100,
          allocations: [],
          cancelledAt: null,
          cancelReason: null,
        },
        tasks: [
          {
            id: "task-1",
            operationId: "op-detail-1",
            chapterId: "chap-1",
            chapterTitle: "فصل ۱",
            questionCount: 10,
            difficulty: "medium",
            status: "completed",
            failureReason: null,
            generatedCount: 10,
            createdAt: "2026-11-25T12:00:00Z",
            updatedAt: "2026-11-25T12:05:00Z",
          },
        ],
        batches: [],
      };

      const mockApi = {
        getExamOperationDetails: vi.fn().mockResolvedValue(fullDetails),
      } as unknown as ReturnType<typeof createStudioApi>;

      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(
        () => useExamOperationDetails("op-detail-1", { api: mockApi }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.operation.id).toBe("op-detail-1");
      expect(result.current.data?.tasks.length).toBe(1);
    });
  });

  describe("7. useExamStagingQuestions Hook", () => {
    it("fetches staging questions with filter params", async () => {
      const mockQuestions: StagingQuestionRecord[] = [
        {
          id: "q-101",
          operationId: "op-stg-1",
          taskId: "task-1",
          batchId: "batch-1",
          questionText: "کدام گزینه صحیح است؟",
          options: ["الف", "ب", "ج", "د"],
          correctAnswer: 1,
          explanation: "توضیح پاسخ",
          difficulty: "hard",
          taxonomies: { chapter: "chap-1" },
          isAccepted: false,
          createdAt: "2026-11-25T12:00:00Z",
        },
      ];

      const mockApi = {
        getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: mockQuestions }),
      } as unknown as ReturnType<typeof createStudioApi>;

      const wrapper = createTestWrapper(queryClient);
      const filters = { isAccepted: false, limit: 10 };
      const { result } = renderHook(
        () => useExamStagingQuestions("op-stg-1", filters, { api: mockApi }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.questions.length).toBe(1);
      expect(result.current.data?.questions[0].id).toBe("q-101");
      expect(mockApi.getExamOperationQuestions).toHaveBeenCalledWith("op-stg-1", filters);
    });
  });

  describe("8. useCancelExamOperation Hook", () => {
    it("cancels operation and invalidates progress, details, and quiz caches", async () => {
      const cancelResponse: CancelExamOperationResponse = {
        cancelled: true,
        reason: "لغو داوطلبانه",
      };

      const mockApi = {
        cancelExamOperation: vi.fn().mockResolvedValue(cancelResponse),
      } as unknown as ReturnType<typeof createStudioApi>;

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () => useCancelExamOperation("quiz-cancel-1", { api: mockApi }),
        { wrapper },
      );

      await result.current.mutateAsync({
        operationId: "op-to-cancel",
        reason: "لغو داوطلبانه",
      });

      expect(mockApi.cancelExamOperation).toHaveBeenCalledWith("op-to-cancel", "لغو داوطلبانه");

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.progress("op-to-cancel"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.details("op-to-cancel"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.active("quiz-cancel-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.byQuiz("quiz-cancel-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.all,
      });
    });
  });

  describe("9. Review & Transfer API Methods and Hooks (Phase 2.3)", () => {
    it("reviewExamOperationQuestions sends POST without manual CSRF and invalidates caches", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return Promise.resolve(
          mockFetchResponse(200, {
            updatedCount: 2,
            skippedTransferredIds: [],
            questions: [],
          }),
        );
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () => useReviewExamOperationQuestions("op-rev-1", { api }),
        { wrapper },
      );

      await result.current.mutateAsync({
        questionIds: ["q1", "q2"],
        decision: "accepted",
      });

      expect(capturedUrl).toBe("/v1/studio/exam-operations/op-rev-1/questions/review");
      expect(capturedInit?.method).toBe("POST");
      expect(JSON.parse(String(capturedInit?.body))).toEqual({
        questionIds: ["q1", "q2"],
        decision: "accepted",
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...studioExamKeys.byOperation("op-rev-1"), "questions"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.progress("op-rev-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.details("op-rev-1"),
      });
    });

    it("transferExamOperationQuestions sends POST without quizId and invalidates caches", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return Promise.resolve(
          mockFetchResponse(200, {
            transferredCount: 1,
            alreadyTransferredIds: [],
            existingTransferredQuestionIds: [],
            createdQuestions: [],
          }),
        );
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () => useTransferExamOperationQuestions("op-tr-1", "quiz-tr-1", { api }),
        { wrapper },
      );

      await result.current.mutateAsync({
        questionIds: ["q1"],
      });

      expect(capturedUrl).toBe("/v1/studio/exam-operations/op-tr-1/questions/transfer");
      expect(capturedInit?.method).toBe("POST");
      const parsedBody = JSON.parse(String(capturedInit?.body));
      expect(parsedBody).toEqual({ questionIds: ["q1"] });
      expect(parsedBody.quizId).toBeUndefined();

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...studioExamKeys.byOperation("op-tr-1"), "questions"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.progress("op-tr-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.details("op-tr-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: studioExamKeys.byQuiz("quiz-tr-1"),
      });
    });
  });

  describe("10. useQuizExamOperations History Hook & Query Key (Phase 2.7)", () => {
    it("generates isolated list query keys and fetches paginated quiz history", async () => {
      expect(studioExamKeys.list("quiz-1", { status: "partial", limit: 20, offset: 0 })).toEqual([
        "studio",
        "exam-operations",
        "quiz",
        "quiz-1",
        "list",
        { status: "partial", limit: 20, offset: 0 },
      ]);

      let capturedUrl = "";
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        capturedUrl = String(url);
        return Promise.resolve(
          mockFetchResponse(200, {
            operations: [
              {
                id: "op-hist-1",
                quizId: "quiz-1",
                status: "partial",
                totalRequestedQuestions: 10,
                totalGeneratedQuestions: 5,
                progressPercentage: 50,
                stagingStats: {
                  totalCount: 5,
                  pendingReviewCount: 2,
                  acceptedCount: 1,
                  rejectedCount: 1,
                  transferredCount: 1,
                },
                createdAt: "2026-11-25T10:00:00Z",
                updatedAt: "2026-11-25T10:05:00Z",
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          }),
        );
      });

      const client = createApiClient({ baseUrl: "" });
      const api = createStudioApi(client);
      const wrapper = createTestWrapper(queryClient);

      const { result } = renderHook(
        () => useQuizExamOperations("quiz-1", { status: "partial", limit: 20, offset: 0 }, { api }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(capturedUrl).toContain("/v1/studio/quizzes/quiz-1/exam-operations?");
      expect(capturedUrl).toContain("status=partial");
      expect(result.current.data?.total).toBe(1);
      expect(result.current.data?.operations[0].stagingStats.transferredCount).toBe(1);
    });

    it("does not execute query when quizId is undefined", () => {
      const mockApi = {
        listQuizExamOperations: vi.fn(),
      } as unknown as ReturnType<typeof createStudioApi>;

      const wrapper = createTestWrapper(queryClient);
      const { result } = renderHook(
        () => useQuizExamOperations(undefined, undefined, { api: mockApi }),
        { wrapper },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(mockApi.listQuizExamOperations).not.toHaveBeenCalled();
    });
  });
});
