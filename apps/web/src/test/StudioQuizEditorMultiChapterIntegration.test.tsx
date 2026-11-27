import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { StudioMultiChapterExamSection } from "../components/studio/exam-generation/index.js";
import { StudioQuizEditorPage } from "../pages/studio/StudioQuizEditorPage.js";
import {
  type createStudioApi,
  type QuestionBankSourcesResponse,
  type StagingQuestionRecord,
} from "../lib/api/studio-api.js";

type MockStudioApi = ReturnType<typeof createStudioApi>;

const mockUseAuth = vi.fn();
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => mockUseAuth(),
}));

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/studio/quizzes/quiz-1"]}>
        <Routes>
          <Route path="/studio/quizzes/:quizId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const mockSources: QuestionBankSourcesResponse = {
  courses: [
    {
      id: "course-1",
      title: "فارماکولوژی بالینی",
      modules: [
        { id: "mod-1", title: "فصل ۱: آنتی‌بیوتیک‌ها", lessons: [] },
      ],
    },
  ],
  questionTypes: [{ id: "multiple_choice", label: "چهارگزینه‌ای" }],
  topics: [],
};

const mockStagingQuestion: StagingQuestionRecord = {
  id: "stg-q-1",
  operationId: "op-1",
  taskId: "task-1",
  batchId: "batch-1",
  courseId: "course-1",
  moduleId: "mod-1",
  questionIndex: 1,
  question: "مکانیسم اثر پنی‌سیلین چیست؟",
  choices: [
    { id: "a", text: "مهار سنتز دیواره سلولی" },
    { id: "b", text: "مهار سنتز پروتئین" },
  ],
  correctAnswer: { choiceId: "a" },
  explanation: "پنی‌سیلین به PBP متصل می‌شود.",
  difficulty: "medium",
  topic: "فارماکولوژی",
  questionType: "multiple_choice",
  isAccepted: true,
  reviewStatus: "accepted",
  transferredQuestionId: null,
  transferredAt: null,
  createdAt: "2026-11-25T12:00:00Z",
};

describe("Phase 2.4 & 2.7 — StudioQuizEditorPage Persistent History Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    mockUseAuth.mockReturnValue({
      user: { userId: "admin-1", role: "organization_admin", email: "admin@avana.ir" },
      isAuthenticated: true,
    });
  });

  it("1. hides generation entry and history from unauthorized student role", () => {
    mockUseAuth.mockReturnValue({
      user: { userId: "stu-1", role: "student", email: "s@avana.ir" },
      isAuthenticated: true,
    });

    const mockApi = {
      getActiveExamOperation: vi.fn(),
      listQuizExamOperations: vi.fn(),
    } as unknown as MockStudioApi;

    const { wrapper } = createTestHarness();
    const { container } = render(
      <StudioMultiChapterExamSection quizId="quiz-1" studioApi={mockApi} />,
      { wrapper },
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockApi.getActiveExamOperation).not.toHaveBeenCalled();
    expect(mockApi.listQuizExamOperations).not.toHaveBeenCalled();
  });

  it("2. opens modal from quiz, creates operation, renders progress card, opens review drawer, and refreshes quiz on transfer", async () => {
    const mockApi = {
      getActiveExamOperation: vi.fn().mockResolvedValue({ operation: null }),
      listQuizExamOperations: vi.fn().mockResolvedValue({
        operations: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
      getQuestionBankSources: vi.fn().mockResolvedValue(mockSources),
      createExamOperation: vi.fn().mockResolvedValue({
        operation: {
          id: "op-new-1",
          quizId: "quiz-1",
          status: "completed",
          totalRequestedQuestions: 10,
          totalGeneratedQuestions: 10,
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:00:00Z",
        },
        tasks: [],
        batches: [],
      }),
      getExamOperationProgress: vi.fn().mockResolvedValue({
        operationId: "op-new-1",
        quizId: "quiz-1",
        status: "completed",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 10,
        progressPercentage: 100,
        updatedAt: "2026-11-25T12:01:00Z",
        tasks: [],
      }),
      getExamOperationQuestions: vi.fn().mockResolvedValue({
        questions: [{ ...mockStagingQuestion, operationId: "op-new-1" }],
      }),
      transferExamOperationQuestions: vi.fn().mockResolvedValue({
        transferredCount: 1,
        alreadyTransferredIds: [],
        existingTransferredQuestionIds: [],
        createdQuestions: [],
      }),
    } as unknown as MockStudioApi;

    const onQuestionsTransferred = vi.fn();
    const { wrapper } = createTestHarness();

    render(
      <StudioMultiChapterExamSection
        quizId="quiz-1"
        quizTitle="آزمون جامع داروسازی"
        onQuestionsTransferred={onQuestionsTransferred}
        studioApi={mockApi}
      />,
      { wrapper },
    );

    const openBtn = screen.getByRole("button", { name: /تولید آزمون چندفصلی/ });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText("فصل ۱: آنتی‌بیوتیک‌ها")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("فصل ۱: آنتی‌بیوتیک‌ها"));

    fireEvent.click(screen.getByRole("button", { name: /شروع تولید هوشمند/ }));
    await waitFor(() => {
      expect(mockApi.createExamOperation).toHaveBeenCalledWith(
        "quiz-1",
        expect.objectContaining({
          totalQuestions: 10,
          moduleIds: ["mod-1"],
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("تکمیل شد")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /بررسی و افزودن سؤالات/ }));

    await waitFor(() => {
      expect(screen.getByText("مکانیسم اثر پنی‌سیلین چیست؟")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /انتخاب سؤال ۱/ }));
    fireEvent.click(screen.getByRole("button", { name: /انتقال به آزمون/ }));
    fireEvent.click(screen.getByRole("button", { name: "تأیید و انتقال نهایی" }));

    await waitFor(() => {
      expect(mockApi.transferExamOperationQuestions).toHaveBeenCalledWith("op-new-1", ["stg-q-1"]);
    });
    expect(onQuestionsTransferred).toHaveBeenCalled();
  });

  it("3. loads persistent DB history with empty sessionStorage, avoids duplicating active op, and hides review button when totalCount is 0", async () => {
    const mockApi = {
      getActiveExamOperation: vi.fn().mockResolvedValue({
        operation: {
          id: "op-active-1",
          quizId: "quiz-1",
          status: "processing",
          totalRequestedQuestions: 10,
          totalGeneratedQuestions: 3,
          createdAt: "2026-11-25T13:00:00Z",
          updatedAt: "2026-11-25T13:01:00Z",
        },
      }),
      getExamOperationProgress: vi.fn().mockResolvedValue({
        operationId: "op-active-1",
        quizId: "quiz-1",
        status: "processing",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 3,
        progressPercentage: 30,
        updatedAt: "2026-11-25T13:01:00Z",
        tasks: [],
      }),
      listQuizExamOperations: vi.fn().mockResolvedValue({
        operations: [
          {
            id: "op-active-1",
            quizId: "quiz-1",
            status: "processing",
            totalRequestedQuestions: 10,
            totalGeneratedQuestions: 3,
            progressPercentage: 30,
            stagingStats: {
              totalCount: 3,
              pendingReviewCount: 3,
              acceptedCount: 0,
              rejectedCount: 0,
              transferredCount: 0,
            },
            createdAt: "2026-11-25T13:00:00Z",
            updatedAt: "2026-11-25T13:01:00Z",
          },
          {
            id: "op-old-partial",
            quizId: "quiz-1",
            status: "partial",
            totalRequestedQuestions: 8,
            totalGeneratedQuestions: 4,
            progressPercentage: 50,
            stagingStats: {
              totalCount: 4,
              pendingReviewCount: 2,
              acceptedCount: 1,
              rejectedCount: 0,
              transferredCount: 1,
            },
            createdAt: "2026-11-25T11:00:00Z",
            updatedAt: "2026-11-25T11:05:00Z",
          },
          {
            id: "op-old-failed-empty",
            quizId: "quiz-1",
            status: "failed",
            totalRequestedQuestions: 5,
            totalGeneratedQuestions: 0,
            progressPercentage: 0,
            stagingStats: {
              totalCount: 0,
              pendingReviewCount: 0,
              acceptedCount: 0,
              rejectedCount: 0,
              transferredCount: 0,
            },
            createdAt: "2026-11-25T10:00:00Z",
            updatedAt: "2026-11-25T10:01:00Z",
          },
          {
            id: "op-other-quiz-should-filter",
            quizId: "quiz-other",
            status: "completed",
            totalRequestedQuestions: 5,
            totalGeneratedQuestions: 5,
            progressPercentage: 100,
            stagingStats: {
              totalCount: 5,
              pendingReviewCount: 5,
              acceptedCount: 0,
              rejectedCount: 0,
              transferredCount: 0,
            },
            createdAt: "2026-11-25T09:00:00Z",
            updatedAt: "2026-11-25T09:05:00Z",
          },
        ],
        total: 3,
        limit: 20,
        offset: 0,
      }),
      getExamOperationQuestions: vi.fn().mockResolvedValue({
        questions: [
          {
            ...mockStagingQuestion,
            id: "stg-transferred",
            operationId: "op-old-partial",
            reviewStatus: "transferred",
            transferredQuestionId: "quiz-q-99",
          },
        ],
      }),
    } as unknown as MockStudioApi;

    const { wrapper } = createTestHarness();
    render(<StudioMultiChapterExamSection quizId="quiz-1" studioApi={mockApi} />, {
      wrapper,
    });

    // Active operation shown in ProgressCard
    await waitFor(() => {
      expect(screen.getByText("در حال تولید هوشمند")).toBeInTheDocument();
    });

    // History section shows op-old-partial and op-old-failed-empty, NOT op-active-1 duplicated, NOT op-other-quiz
    await waitFor(() => {
      expect(screen.getByText("تکمیل جزئی")).toBeInTheDocument();
    });
    expect(screen.getByText("خطا در تولید")).toBeInTheDocument();
    expect(screen.queryByText("در حال تولید")).not.toBeInTheDocument();

    // Only 1 "بازبینی سؤالات" button (for op-old-partial which has totalCount=4, NOT for op-old-failed-empty which has totalCount=0)
    const reviewButtons = screen.getAllByRole("button", { name: "بازبینی سؤالات" });
    expect(reviewButtons.length).toBe(1);

    // Click review on old partial operation -> loads its staging questions with transferred status intact
    fireEvent.click(reviewButtons[0]);
    await waitFor(() => {
      expect(mockApi.getExamOperationQuestions).toHaveBeenCalledWith(
        "op-old-partial",
        undefined,
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "انتخاب سؤال ۱" })).toBeDisabled();
    });
  });

  it("4. preserves existing StudioQuizEditorPage rendering and integrates Multi-Chapter entry seamlessly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/exam-operations/active")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: () => Promise.resolve(JSON.stringify({ operation: null })),
          json: () => Promise.resolve({ operation: null }),
        } as unknown as Response);
      }
      if (urlStr.includes("/exam-operations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: () =>
            Promise.resolve(JSON.stringify({ operations: [], total: 0, limit: 20, offset: 0 })),
          json: () =>
            Promise.resolve({ operations: [], total: 0, limit: 20, offset: 0 }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              quiz: {
                id: "quiz-1",
                slug: "test-quiz",
                title: "آزمون تست یکپارچگی",
                status: "draft",
                settings: {},
                questions: [
                  {
                    id: "existing-q-1",
                    marketingQuizId: "quiz-1",
                    question: "سؤال موجود قبلی",
                    choices: [
                      { id: "1", text: "گزینه ۱" },
                      { id: "2", text: "گزینه ۲" },
                    ],
                    correctAnswer: { choiceId: "1" },
                    difficulty: "medium",
                    questionType: "multiple_choice",
                    sortOrder: 0,
                    createdAt: "2026-11-25T10:00:00Z",
                    updatedAt: "2026-11-25T10:00:00Z",
                  },
                ],
              },
            }),
          ),
        json: () =>
          Promise.resolve({
            quiz: {
              id: "quiz-1",
              slug: "test-quiz",
              title: "آزمون تست یکپارچگی",
              status: "draft",
              settings: {},
              questions: [],
            },
          }),
      } as unknown as Response);
    });

    const { wrapper } = createTestHarness();
    render(<StudioQuizEditorPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("آزمون تست یکپارچگی")).toBeInTheDocument();
    });

    expect(screen.getByText("سؤال موجود قبلی")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بانک جامع سؤالات/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /افزودن سؤال \/ هوش مصنوعی/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تولید آزمون چندفصلی/ })).toBeInTheDocument();
  });
});
