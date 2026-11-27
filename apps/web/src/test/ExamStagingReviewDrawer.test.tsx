import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toPersianDigits } from "@avana/domain";

import { ExamStagingReviewDrawer } from "../components/studio/exam-generation/index.js";
import {
  type createStudioApi,
  type StagingQuestionRecord,
} from "../lib/api/studio-api.js";

type MockStudioApi = ReturnType<typeof createStudioApi>;

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

function makeQuestions(): StagingQuestionRecord[] {
  return [
    {
      id: "q-pending",
      operationId: "op-1",
      taskId: "t-1",
      batchId: "b-1",
      courseId: "c-1",
      moduleId: "mod-1",
      questionIndex: 1,
      question: "متن سؤال در انتظار بازبینی",
      choices: [
        { id: "a", text: "گزینه اول" },
        { id: "b", text: "گزینه دوم" },
      ],
      correctAnswer: { choiceId: "a" },
      explanation: "توضیح سؤال اول",
      difficulty: "easy",
      topic: "فارماکولوژی",
      questionType: "multiple_choice",
      isAccepted: false,
      reviewStatus: "pending_review",
      transferredQuestionId: null,
      transferredAt: null,
      createdAt: "2026-11-25T12:00:00Z",
    },
    {
      id: "q-accepted",
      operationId: "op-1",
      taskId: "t-1",
      batchId: "b-1",
      courseId: "c-1",
      moduleId: "mod-1",
      questionIndex: 2,
      question: "متن سؤال تأییدشده",
      choices: [
        { id: "a", text: "پاسخ درست" },
        { id: "b", text: "پاسخ غلط" },
      ],
      correctAnswer: { choiceId: "a" },
      explanation: "توضیح سؤال دوم",
      difficulty: "medium",
      topic: "فارماکولوژی",
      questionType: "multiple_choice",
      isAccepted: true,
      reviewStatus: "accepted",
      transferredQuestionId: null,
      transferredAt: null,
      createdAt: "2026-11-25T12:00:00Z",
    },
    {
      id: "q-rejected",
      operationId: "op-1",
      taskId: "t-1",
      batchId: "b-1",
      courseId: "c-1",
      moduleId: "mod-1",
      questionIndex: 3,
      question: "متن سؤال ردشده",
      choices: [
        { id: "a", text: "گزینه الف" },
        { id: "b", text: "گزینه ب" },
      ],
      correctAnswer: { choiceId: "b" },
      explanation: null,
      difficulty: "hard",
      topic: "فارماکولوژی",
      questionType: "multiple_choice",
      isAccepted: false,
      reviewStatus: "rejected",
      transferredQuestionId: null,
      transferredAt: null,
      createdAt: "2026-11-25T12:00:00Z",
    },
    {
      id: "q-transferred",
      operationId: "op-1",
      taskId: "t-1",
      batchId: "b-1",
      courseId: "c-1",
      moduleId: "mod-1",
      questionIndex: 4,
      question: "متن سؤال منتقلشده",
      choices: [
        { id: "a", text: "گزینه ۱" },
        { id: "b", text: "گزینه ۲" },
      ],
      correctAnswer: { choiceId: "a" },
      explanation: null,
      difficulty: "medium",
      topic: "فارماکولوژی",
      questionType: "multiple_choice",
      isAccepted: true,
      reviewStatus: "transferred",
      transferredQuestionId: "quiz-q-1",
      transferredAt: "2026-11-25T12:05:00Z",
      createdAt: "2026-11-25T12:00:00Z",
    },
  ];
}

describe("ExamStagingReviewDrawer (Phase 2.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. renders loading state and empty state properly", async () => {
    const mockApi = {
      getExamOperationQuestions: vi.fn().mockReturnValue(new Promise(() => {})),
      getExamOperationDetails: vi.fn(),
    } as unknown as MockStudioApi;

    const { wrapper } = createTestHarness();
    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-1"
        quizId="quiz-1"
        studioApi={mockApi}
      />,
      { wrapper },
    );

    expect(screen.getByText("در حال بارگذاری سؤالات تولیدشده...")).toBeInTheDocument();

    // Now test empty state
    const emptyApi = {
      getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: [] }),
    } as unknown as MockStudioApi;
    const { wrapper: wrapper2 } = createTestHarness();

    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-empty"
        quizId="quiz-1"
        studioApi={emptyApi}
      />,
      { wrapper: wrapper2 },
    );

    await waitFor(() => {
      expect(screen.getByText("هیچ سؤالی در این وضعیت یافت نشد.")).toBeInTheDocument();
    });
  });

  it("2. displays all 4 review statuses, choices, correct answer, and disables review on transferred questions", async () => {
    const mockApi = {
      getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: makeQuestions() }),
    } as unknown as MockStudioApi;

    const { wrapper } = createTestHarness();
    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-1"
        quizId="quiz-1"
        quizTitle="آزمون جامع فارماکولوژی"
        studioApi={mockApi}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("متن سؤال در انتظار بازبینی")).toBeInTheDocument();
    });

    expect(screen.getByText("متن سؤال تأییدشده")).toBeInTheDocument();
    expect(screen.getByText("متن سؤال ردشده")).toBeInTheDocument();
    expect(screen.getByText("متن سؤال منتقلشده")).toBeInTheDocument();

    // Status badges (plus filter tabs)
    expect(screen.getAllByText(/در انتظار بازبینی/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/تأییدشده/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/ردشده/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/منتقلشده/).length).toBeGreaterThanOrEqual(2);

    // Correct answer indicator & explanation
    expect(screen.getAllByText("پاسخ صحیح").length).toBe(4);
    expect(screen.getByText("توضیح سؤال اول")).toBeInTheDocument();

    // Transferred question checkbox is disabled
    const q4Checkbox = screen.getByRole("button", {
      name: `انتخاب سؤال ${toPersianDigits(4)}`,
    });
    expect(q4Checkbox).toBeDisabled();
  });

  it("3. accepts single question, batch rejects, resets to pending_review, and invalidates cache", async () => {
    const mockApi = {
      getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: makeQuestions() }),
      reviewExamOperationQuestions: vi.fn().mockResolvedValue({
        updatedCount: 1,
        skippedTransferredIds: [],
        questions: [],
      }),
    } as unknown as MockStudioApi;

    const { queryClient, wrapper } = createTestHarness();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-1"
        quizId="quiz-1"
        studioApi={mockApi}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("متن سؤال در انتظار بازبینی")).toBeInTheDocument();
    });

    // Accept single pending question (first "تأیید" button)
    const acceptButtons = screen.getAllByRole("button", { name: "تأیید" });
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      expect(mockApi.reviewExamOperationQuestions).toHaveBeenCalledWith(
        "op-1",
        ["q-pending"],
        "accepted",
      );
    });
    expect(invalidateSpy).toHaveBeenCalled();

    // Select q-pending & q-accepted and batch reject
    fireEvent.click(screen.getByRole("button", { name: `انتخاب سؤال ${toPersianDigits(1)}` }));
    fireEvent.click(screen.getByRole("button", { name: `انتخاب سؤال ${toPersianDigits(2)}` }));
    fireEvent.click(screen.getByRole("button", { name: "رد گروهی" }));

    await waitFor(() => {
      expect(mockApi.reviewExamOperationQuestions).toHaveBeenCalledWith(
        "op-1",
        ["q-pending", "q-accepted"],
        "rejected",
      );
    });

    // Reset q-rejected to pending_review (index 0 is toolbar, index 1 is q-accepted, index 2 is q-rejected)
    const resetButtons = screen.getAllByRole("button", { name: "بازگشت به انتظار" });
    fireEvent.click(resetButtons[2]);

    await waitFor(() => {
      expect(mockApi.reviewExamOperationQuestions).toHaveBeenCalledWith(
        "op-1",
        ["q-rejected"],
        "pending_review",
      );
    });
  });

  it("4. blocks transferring pending or rejected questions and requires confirmation for accepted questions", async () => {
    const mockApi = {
      getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: makeQuestions() }),
      transferExamOperationQuestions: vi.fn().mockResolvedValue({
        transferredCount: 1,
        alreadyTransferredIds: [],
        existingTransferredQuestionIds: [],
        createdQuestions: [],
      }),
    } as unknown as MockStudioApi;

    const onTransferSuccess = vi.fn();
    const { queryClient, wrapper } = createTestHarness();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-1"
        quizId="quiz-1"
        quizTitle="آزمون جامع"
        onTransferSuccess={onTransferSuccess}
        studioApi={mockApi}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("متن سؤال تأییدشده")).toBeInTheDocument();
    });

    // Select pending question (q-1) and try transfer -> blocked, NO API call
    fireEvent.click(screen.getByRole("button", { name: `انتخاب سؤال ${toPersianDigits(1)}` }));
    fireEvent.click(screen.getByRole("button", { name: /انتقال به آزمون/ }));

    expect(
      screen.getByText(/فقط سؤالات تأییدشده قابل انتقال به آزمون هستند/),
    ).toBeInTheDocument();
    expect(mockApi.transferExamOperationQuestions).not.toHaveBeenCalled();

    // Unselect q-1, select accepted question (q-2)
    fireEvent.click(screen.getByRole("button", { name: `انتخاب سؤال ${toPersianDigits(1)}` }));
    fireEvent.click(screen.getByRole("button", { name: `انتخاب سؤال ${toPersianDigits(2)}` }));
    fireEvent.click(screen.getByRole("button", { name: /انتقال به آزمون/ }));

    // Confirmation box appears with destination quiz title
    expect(screen.getByText("تأیید نهایی انتقال به آزمون اصلی")).toBeInTheDocument();
    expect(screen.getByText(/آزمون «آزمون جامع»/)).toBeInTheDocument();
    expect(mockApi.transferExamOperationQuestions).not.toHaveBeenCalled();

    // Confirm transfer
    fireEvent.click(screen.getByRole("button", { name: "تأیید و انتقال نهایی" }));

    await waitFor(() => {
      expect(mockApi.transferExamOperationQuestions).toHaveBeenCalledWith("op-1", ["q-accepted"]);
    });
    expect(onTransferSuccess).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("5. prevents duplicate requests while mutation is pending and preserves selection on API error", async () => {
    let rejectReview!: (err: Error) => void;
    const reviewPromise = new Promise((_resolve, reject) => {
      rejectReview = reject;
    });

    const mockApi = {
      getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: makeQuestions() }),
      reviewExamOperationQuestions: vi.fn().mockReturnValue(reviewPromise),
    } as unknown as MockStudioApi;

    const { wrapper } = createTestHarness();
    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-1"
        quizId="quiz-1"
        studioApi={mockApi}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("متن سؤال در انتظار بازبینی")).toBeInTheDocument();
    });

    // Select q-1
    fireEvent.click(screen.getByRole("button", { name: `انتخاب سؤال ${toPersianDigits(1)}` }));
    expect(screen.getByText(`(${toPersianDigits(1)} مورد انتخاب‌شده)`)).toBeInTheDocument();

    // Click batch accept
    const batchAcceptBtn = screen.getByRole("button", { name: "تأیید گروهی" });
    fireEvent.click(batchAcceptBtn);

    // While pending, button becomes disabled and clicking again does not fire a second request
    await waitFor(() => {
      expect(batchAcceptBtn).toBeDisabled();
    });
    fireEvent.click(batchAcceptBtn);
    expect(mockApi.reviewExamOperationQuestions).toHaveBeenCalledTimes(1);

    // Reject with API error -> error displayed AND selection preserved
    rejectReview(new Error("خطای شبکه در ثبت بازبینی"));

    await waitFor(() => {
      expect(screen.getByText("خطای شبکه در ثبت بازبینی")).toBeInTheDocument();
    });
    expect(screen.getByText(`(${toPersianDigits(1)} مورد انتخاب‌شده)`)).toBeInTheDocument();
  });

  it("renders both legacy string[] choices with string correctAnswer and canonical {id, text}[] choices", async () => {
    const mixedQuestions: StagingQuestionRecord[] = [
      {
        id: "q-legacy-raw",
        operationId: "op-1",
        taskId: "t-1",
        batchId: "b-1",
        courseId: "c-1",
        moduleId: "mod-1",
        questionIndex: 1,
        question: "سؤال با ساختار خام رشته‌ای",
        choices: [
          "گزینه خام اول",
          "گزینه خام دوم",
          "گزینه خام سوم",
          "گزینه خام چهارم",
        ] as unknown as Array<{ id: string; text: string }>,
        correctAnswer: "گزینه خام سوم",
        explanation: "توضیح سؤال خام",
        difficulty: "medium",
        topic: "فارماکولوژی",
        questionType: "multiple_choice",
        isAccepted: false,
        reviewStatus: "pending_review",
        transferredQuestionId: null,
        transferredAt: null,
        createdAt: "2026-11-26T12:00:00Z",
      },
      {
        id: "q-canonical",
        operationId: "op-1",
        taskId: "t-1",
        batchId: "b-1",
        courseId: "c-1",
        moduleId: "mod-1",
        questionIndex: 2,
        question: "سؤال با ساختار استاندارد",
        choices: [
          { id: "1", text: "گزینه استاندارد اول" },
          { id: "2", text: "گزینه استاندارد دوم" },
          { id: "3", text: "گزینه استاندارد سوم" },
          { id: "4", text: "گزینه استاندارد چهارم" },
        ],
        correctAnswer: { choiceId: "2" },
        explanation: "توضیح سؤال استاندارد",
        difficulty: "hard",
        topic: "فارماکولوژی",
        questionType: "multiple_choice",
        isAccepted: true,
        reviewStatus: "accepted",
        transferredQuestionId: null,
        transferredAt: null,
        createdAt: "2026-11-26T12:00:00Z",
      },
    ];

    const mockApi = {
      getExamOperationQuestions: vi.fn().mockResolvedValue({ questions: mixedQuestions }),
    } as unknown as MockStudioApi;

    const { wrapper } = createTestHarness();
    render(
      <ExamStagingReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        operationId="op-1"
        quizId="quiz-1"
        studioApi={mockApi}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("سؤال با ساختار خام رشته‌ای")).toBeInTheDocument();
    });

    expect(screen.getByText("گزینه خام اول")).toBeInTheDocument();
    expect(screen.getByText("گزینه خام دوم")).toBeInTheDocument();
    expect(screen.getByText("گزینه خام سوم")).toBeInTheDocument();
    expect(screen.getByText("گزینه خام چهارم")).toBeInTheDocument();

    expect(screen.getByText("گزینه استاندارد اول")).toBeInTheDocument();
    expect(screen.getByText("گزینه استاندارد دوم")).toBeInTheDocument();
    expect(screen.getByText("گزینه استاندارد سوم")).toBeInTheDocument();
    expect(screen.getByText("گزینه استاندارد چهارم")).toBeInTheDocument();

    // Both questions should have their correct answer highlighted once each
    expect(screen.getAllByText("پاسخ صحیح")).toHaveLength(2);
  });
});
