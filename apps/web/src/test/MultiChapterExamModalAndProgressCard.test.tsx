import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toPersianDigits } from "@avana/domain";

import {
  MultiChapterExamModal,
  ExamOperationProgressCard,
} from "../components/studio/exam-generation/index.js";
import {
  type createStudioApi,
  type QuestionBankSourcesResponse,
  type CreatedExamOperationResponse,
  type ExamOperationProgressSummary,
  type FullExamOperationDetails,
  type CancelExamOperationResponse,
  type StudioExamOperationRecord,
} from "../lib/api/studio-api.js";

type MockStudioApi = ReturnType<typeof createStudioApi>;

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockSourcesData: QuestionBankSourcesResponse = {
  courses: [
    {
      id: "course-1",
      title: "فارماکولوژی پایه و بالینی",
      modules: [
        { id: "mod-1", title: "فصل ۱: کلیات و فارماکوکینتیک", lessons: [{ id: "l1", title: "درس ۱" }] },
        { id: "mod-2", title: "فصل ۲: فارماکودینامیک و گیرنده‌ها", lessons: [{ id: "l2", title: "درس ۲" }] },
        { id: "mod-3", title: "فصل ۳: داروهای سیستم خودکار", lessons: [] },
      ],
    },
    {
      id: "course-2",
      title: "فیزیولوژی پزشکی گایتون",
      modules: [
        { id: "mod-4", title: "فصل ۱: فیزیولوژی سلول", lessons: [] },
      ],
    },
  ],
  questionTypes: [{ id: "multiple_choice", label: "چهارگزینه‌ای" }],
  topics: ["فارماکولوژی", "فیزیولوژی"],
};

describe("Multi-Chapter AI Exam Generation UI (Phase 2.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("MultiChapterExamModal", () => {
    it("1. loads and displays courses and chapters when opened", async () => {
      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={vi.fn()}
          quizId="quiz-100"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      // Verify sources requested
      expect(mockApi.getQuestionBankSources).toHaveBeenCalled();

      // Verify course select rendered
      await waitFor(() => {
        expect(screen.getByLabelText("انتخاب دوره آموزشی")).toBeInTheDocument();
      });

      // Change course to course-1
      const select = screen.getByLabelText("انتخاب دوره آموزشی");
      fireEvent.change(select, { target: { value: "course-1" } });

      // Verify chapters rendered
      expect(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک")).toBeInTheDocument();
      expect(screen.getByText("فصل ۲: فارماکودینامیک و گیرنده‌ها")).toBeInTheDocument();
      expect(screen.getByText("فصل ۳: داروهای سیستم خودکار")).toBeInTheDocument();
    });

    it("2. allows selecting and toggling multiple chapters", async () => {
      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={vi.fn()}
          quizId="quiz-100"
          initialCourseId="course-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک")).toBeInTheDocument();
      });

      // Click chapter 1
      fireEvent.click(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک"));
      expect(screen.getByText(`${toPersianDigits(1)} از ${toPersianDigits(3)} فصل`)).toBeInTheDocument();

      // Click chapter 2
      fireEvent.click(screen.getByText("فصل ۲: فارماکودینامیک و گیرنده‌ها"));
      expect(screen.getByText(`${toPersianDigits(2)} از ${toPersianDigits(3)} فصل`)).toBeInTheDocument();

      // Unclick chapter 1
      fireEvent.click(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک"));
      expect(screen.getByText(`${toPersianDigits(1)} از ${toPersianDigits(3)} فصل`)).toBeInTheDocument();
    });

    it("3. handles 'select all' and 'deselect all' chapters", async () => {
      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={vi.fn()}
          quizId="quiz-100"
          initialCourseId="course-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText(`انتخاب همه (${toPersianDigits(3)})`)).toBeInTheDocument();
      });

      // Select all
      fireEvent.click(screen.getByText(`انتخاب همه (${toPersianDigits(3)})`));
      expect(screen.getByText(`${toPersianDigits(3)} از ${toPersianDigits(3)} فصل`)).toBeInTheDocument();

      // Deselect all
      fireEvent.click(screen.getByText("لغو انتخاب همه"));
      expect(screen.getByText(`${toPersianDigits(0)} از ${toPersianDigits(3)} فصل`)).toBeInTheDocument();
    });

    it("4. handles switching to manual distribution mode and validates quotas sum", async () => {
      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={vi.fn()}
          quizId="quiz-100"
          initialCourseId="course-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک")).toBeInTheDocument();
      });

      // Select 2 chapters
      fireEvent.click(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک"));
      fireEvent.click(screen.getByText("فصل ۲: فارماکودینامیک و گیرنده‌ها"));

      // Switch to manual mode
      fireEvent.click(screen.getByText("سهمیه‌بندی دستی"));

      // Default quotas for 10 questions across 2 chapters should sum to 10
      expect(screen.getByText(`${toPersianDigits(10)} از ${toPersianDigits(10)} سؤال`)).toBeInTheDocument();

      // Change one quota input to make sum mismatched (e.g. set to 2)
      const inputs = screen.getAllByRole("spinbutton");
      // Find chapter quota input (last two spinbuttons are for chapters)
      const chapter1Input = inputs[1]; // input 0 is totalQuestions
      fireEvent.change(chapter1Input, { target: { value: "2" } });

      // Now sum is 2 + 5 = 7 (mismatch with 10)
      expect(screen.getByText(/مجموع سهمیه فصول .* با تعداد کل .* برابر نیست/)).toBeInTheDocument();

      // Submit button should be disabled
      const submitBtn = screen.getByRole("button", { name: /شروع تولید هوشمند/ });
      expect(submitBtn).toBeDisabled();
    });

    it("5. validates total questions bounds and preset buttons", async () => {
      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={vi.fn()}
          quizId="quiz-100"
          initialCourseId="course-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک")).toBeInTheDocument();
      });

      // Select 1 chapter
      fireEvent.click(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک"));

      // Click preset 30
      fireEvent.click(screen.getByText(toPersianDigits(30)));
      expect(screen.getByRole("button", { name: `شروع تولید هوشمند (${toPersianDigits(30)} سؤال)` })).toBeInTheDocument();

      // Set invalid number 0
      const totalInput = screen.getAllByRole("spinbutton")[0];
      fireEvent.change(totalInput, { target: { value: "0" } });
      expect(screen.getByRole("button", { name: /شروع تولید هوشمند/ })).toBeDisabled();
    });

    it("6. submits valid auto-distribution request and calls onSuccess and onClose", async () => {
      const mockCreated: CreatedExamOperationResponse = {
        operation: {
          id: "op-created-101",
          quizId: "quiz-100",
          status: "pending",
          totalRequestedQuestions: 10,
          totalGeneratedQuestions: 0,
          progressPercentage: 0,
          createdAt: "2026-11-25T12:00:00Z",
          updatedAt: "2026-11-25T12:00:00Z",
        } as unknown as StudioExamOperationRecord,
        tasks: [],
        batches: [],
      };

      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn().mockResolvedValue(mockCreated),
      } as unknown as MockStudioApi;

      const onSuccess = vi.fn();
      const onClose = vi.fn();
      const wrapper = createTestWrapper();

      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
          quizId="quiz-100"
          initialCourseId="course-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک")).toBeInTheDocument();
      });

      // Select chapters
      fireEvent.click(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک"));
      fireEvent.click(screen.getByText("فصل ۲: فارماکودینامیک و گیرنده‌ها"));

      // Set difficulty to hard
      fireEvent.click(screen.getByText("دشوار"));

      // Fill instructions
      const textarea = screen.getByPlaceholderText(/مثال: سؤالات دارای سناریوی بالینی باشند/);
      fireEvent.change(textarea, { target: { value: "سؤالات متمرکز بر فارماکوکینتیک بالینی باشند" } });

      // Submit
      const submitBtn = screen.getByRole("button", { name: /شروع تولید هوشمند/ });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockApi.createExamOperation).toHaveBeenCalledWith("quiz-100", {
          totalQuestions: 10,
          courseId: "course-1",
          difficulty: "hard",
          instructions: "سؤالات متمرکز بر فارماکوکینتیک بالینی باشند",
          moduleIds: ["mod-1", "mod-2"],
        });
      });

      expect(onSuccess).toHaveBeenCalledWith("op-created-101");
      expect(onClose).toHaveBeenCalled();
    });

    it("7. displays API error message when creation fails", async () => {
      const mockApi = {
        getQuestionBankSources: vi.fn().mockResolvedValue(mockSourcesData),
        createExamOperation: vi.fn().mockRejectedValue(new Error("سرور در دسترس نیست.")),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <MultiChapterExamModal
          isOpen={true}
          onClose={vi.fn()}
          quizId="quiz-100"
          initialCourseId="course-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("فصل ۱: کلیات و فارماکوکینتیک"));
      const submitBtn = screen.getByRole("button", { name: /شروع تولید هوشمند/ });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("سرور در دسترس نیست.")).toBeInTheDocument();
      });
    });
  });

  describe("ExamOperationProgressCard", () => {
    it("1. renders pending state correctly", async () => {
      const pendingProgress: ExamOperationProgressSummary = {
        operationId: "op-pending",
        quizId: "quiz-1",
        status: "pending",
        totalRequestedQuestions: 20,
        totalGeneratedQuestions: 0,
        progressPercentage: 0,
        updatedAt: "2026-11-25T12:00:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(pendingProgress),
        getExamOperationDetails: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <ExamOperationProgressCard
          operationId="op-pending"
          quizId="quiz-1"
          courseTitle="فارماکولوژی پزشکی"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("در صف پردازش")).toBeInTheDocument();
      });

      expect(screen.getByText("فارماکولوژی پزشکی")).toBeInTheDocument();
      expect(screen.getByText(`${toPersianDigits(0)} از ${toPersianDigits(20)} سؤال (${toPersianDigits(0)}٪)`)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "لغو عملیات" })).toBeInTheDocument();
    });

    it("2. renders processing state with chapter progress correctly", async () => {
      const processingProgress: ExamOperationProgressSummary = {
        operationId: "op-proc",
        quizId: "quiz-1",
        status: "processing",
        totalRequestedQuestions: 20,
        totalGeneratedQuestions: 10,
        progressPercentage: 50,
        updatedAt: "2026-11-25T12:01:00Z",
        tasks: [
          {
            taskId: "t-1",
            moduleId: "mod-1",
            courseId: "course-1",
            targetCount: 10,
            generatedCount: 7,
            status: "processing",
          },
          {
            taskId: "t-2",
            moduleId: "mod-2",
            courseId: "course-1",
            targetCount: 10,
            generatedCount: 3,
            status: "processing",
          },
        ],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(processingProgress),
        getExamOperationDetails: vi.fn(),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <ExamOperationProgressCard
          operationId="op-proc"
          quizId="quiz-1"
          chapterTitles={{
            "mod-1": "فصل ۱: فارماکوکینتیک",
            "mod-2": "فصل ۲: فارماکودینامیک",
          }}
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("در حال تولید هوشمند")).toBeInTheDocument();
      });

      expect(screen.getByText(`${toPersianDigits(10)} از ${toPersianDigits(20)} سؤال (${toPersianDigits(50)}٪)`)).toBeInTheDocument();
      expect(screen.getByText("فصل ۱: فارماکوکینتیک")).toBeInTheDocument();
      expect(screen.getByText(`${toPersianDigits(7)} / ${toPersianDigits(10)} سؤال`)).toBeInTheDocument();
      expect(screen.getByText("فصل ۲: فارماکودینامیک")).toBeInTheDocument();
      expect(screen.getByText(`${toPersianDigits(3)} / ${toPersianDigits(10)} سؤال`)).toBeInTheDocument();
    });

    it("3. handles cancel flow with confirmation", async () => {
      const processingProgress: ExamOperationProgressSummary = {
        operationId: "op-cancel",
        quizId: "quiz-1",
        status: "processing",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 2,
        progressPercentage: 20,
        updatedAt: "2026-11-25T12:01:00Z",
        tasks: [],
      };

      const mockCancelResponse: CancelExamOperationResponse = {
        cancelled: true,
        reason: "لغو توسط کاربر",
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(processingProgress),
        cancelExamOperation: vi.fn().mockResolvedValue(mockCancelResponse),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <ExamOperationProgressCard
          operationId="op-cancel"
          quizId="quiz-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "لغو عملیات" })).toBeInTheDocument();
      });

      // Click cancel button -> opens confirmation
      fireEvent.click(screen.getByRole("button", { name: "لغو عملیات" }));
      expect(screen.getByText(/آیا از لغو این عملیات مطمئن هستید؟/)).toBeInTheDocument();

      // Click "بله، لغو شود"
      fireEvent.click(screen.getByRole("button", { name: "بله، لغو شود" }));

      await waitFor(() => {
        expect(mockApi.cancelExamOperation).toHaveBeenCalledWith("op-cancel", "لغو توسط کاربر از پنل کاربری");
      });
    });

    it("4. renders completed state and invokes onReviewQuestions", async () => {
      const completedProgress: ExamOperationProgressSummary = {
        operationId: "op-comp",
        quizId: "quiz-1",
        status: "completed",
        totalRequestedQuestions: 15,
        totalGeneratedQuestions: 15,
        progressPercentage: 100,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(completedProgress),
      } as unknown as MockStudioApi;

      const onReviewQuestions = vi.fn();
      const wrapper = createTestWrapper();

      render(
        <ExamOperationProgressCard
          operationId="op-comp"
          quizId="quiz-1"
          onReviewQuestions={onReviewQuestions}
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("تکمیل شد")).toBeInTheDocument();
      });

      expect(screen.getByText("تولید هوشمند سؤالات با موفقیت به پایان رسید!")).toBeInTheDocument();

      const reviewBtn = screen.getByRole("button", { name: /بررسی و افزودن سؤالات/ });
      fireEvent.click(reviewBtn);

      expect(onReviewQuestions).toHaveBeenCalledWith("op-comp");
    });

    it("5. renders failed state with sanitized error message from details", async () => {
      const failedProgress: ExamOperationProgressSummary = {
        operationId: "op-fail",
        quizId: "quiz-1",
        status: "failed",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 1,
        progressPercentage: 10,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const fullDetails: FullExamOperationDetails = {
        operation: { id: "op-fail", status: "failed" } as unknown as StudioExamOperationRecord,
        tasks: [
          {
            id: "t-failed",
            errorMessage: "متن فصل دارای محتوای کافی برای تولید سؤالات چهارگزینه‌ای نبود.",
          } as unknown as FullExamOperationDetails["tasks"][0],
        ],
        batches: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(failedProgress),
        getExamOperationDetails: vi.fn().mockResolvedValue(fullDetails),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <ExamOperationProgressCard
          operationId="op-fail"
          quizId="quiz-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("خطا در تولید")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText("متن فصل دارای محتوای کافی برای تولید سؤالات چهارگزینه‌ای نبود.")).toBeInTheDocument();
      });
    });

    it("6. renders cancelled state appropriately", async () => {
      const cancelledProgress: ExamOperationProgressSummary = {
        operationId: "op-cancelled",
        quizId: "quiz-1",
        status: "cancelled",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 2,
        progressPercentage: 20,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(cancelledProgress),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <ExamOperationProgressCard
          operationId="op-cancelled"
          quizId="quiz-1"
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("لغو شده")).toBeInTheDocument();
      });

      expect(screen.getByText("عملیات تولید سؤالات متوقف گردید.")).toBeInTheDocument();
    });

    it("7. renders partial state with insufficient_content task badge and shows review button when generatedCount > 0", async () => {
      const partialProgress: ExamOperationProgressSummary = {
        operationId: "op-partial",
        quizId: "quiz-1",
        status: "partial",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 5,
        progressPercentage: 50,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [
          {
            taskId: "t-ok",
            moduleId: "mod-1",
            courseId: "course-1",
            targetCount: 5,
            generatedCount: 5,
            status: "completed",
          },
          {
            taskId: "t-bad",
            moduleId: "mod-2",
            courseId: "course-1",
            targetCount: 5,
            generatedCount: 0,
            status: "insufficient_content",
          },
        ],
      };

      const fullDetails: FullExamOperationDetails = {
        operation: { id: "op-partial", status: "partial" } as unknown as StudioExamOperationRecord,
        tasks: [
          {
            id: "t-bad",
            errorMessage: "محتوای متنی درس‌های فصل دوم کافی نیست.",
          } as unknown as FullExamOperationDetails["tasks"][0],
        ],
        batches: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(partialProgress),
        getExamOperationDetails: vi.fn().mockResolvedValue(fullDetails),
      } as unknown as MockStudioApi;

      const onReviewQuestions = vi.fn();
      const wrapper = createTestWrapper();

      render(
        <ExamOperationProgressCard
          operationId="op-partial"
          quizId="quiz-1"
          chapterTitles={{
            "mod-1": "فصل ۱",
            "mod-2": "فصل ۲",
          }}
          onReviewQuestions={onReviewQuestions}
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("تکمیل جزئی")).toBeInTheDocument();
      });

      expect(screen.getByText("محتوای ناکافی")).toBeInTheDocument();
      expect(screen.getByText("تولید هوشمند به‌صورت جزئی تکمیل شد")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("محتوای متنی درس‌های فصل دوم کافی نیست.")).toBeInTheDocument();
      });

      const reviewBtn = screen.getByRole("button", { name: /بررسی و افزودن سؤالات/ });
      fireEvent.click(reviewBtn);
      expect(onReviewQuestions).toHaveBeenCalledWith("op-partial");
    });

    it("8. hides review button in partial state when generatedCount is 0", async () => {
      const zeroPartialProgress: ExamOperationProgressSummary = {
        operationId: "op-partial-zero",
        quizId: "quiz-1",
        status: "partial",
        totalRequestedQuestions: 10,
        totalGeneratedQuestions: 0,
        progressPercentage: 0,
        updatedAt: "2026-11-25T12:05:00Z",
        tasks: [],
      };

      const mockApi = {
        getExamOperationProgress: vi.fn().mockResolvedValue(zeroPartialProgress),
        getExamOperationDetails: vi.fn().mockResolvedValue({
          operation: { id: "op-partial-zero", status: "partial" },
          tasks: [],
          batches: [],
        }),
      } as unknown as MockStudioApi;

      const wrapper = createTestWrapper();
      render(
        <ExamOperationProgressCard
          operationId="op-partial-zero"
          quizId="quiz-1"
          onReviewQuestions={vi.fn()}
          studioApi={mockApi}
        />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText("تکمیل جزئی")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /بررسی و افزودن سؤالات/ })).not.toBeInTheDocument();
    });
  });
});
