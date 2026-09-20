import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ExamConfigView } from "../components/quiz/ExamConfigView.js";

const mockRemoveExamAttemptFromHistory = vi.fn().mockResolvedValue({
  request_id: "req-1",
  success: true,
  attemptId: "att-1",
});

vi.mock("../lib/api/study.js", () => ({
  createStudyApi: () => ({
    getExamTopics: vi.fn().mockResolvedValue({
      courses: [
        {
          courseId: "course-1",
          courseTitle: "فارماکولوژی",
          hasAccess: true,
          questionCount: 20,
          modules: [
            {
              moduleId: "mod-1",
              moduleTitle: "داروهای قلب",
              questionCount: 20,
            },
          ],
        },
      ],
    }),
    getExamHistory: vi.fn().mockResolvedValue({
      items: [
        {
          attemptId: "att-1",
          topic: "آزمون فارماکولوژی ۱",
          status: "in_progress",
          isSpecialExam: false,
          totalQuestions: 10,
          correct: 0,
          score: 0,
          startedAt: "2026-09-20T00:00:00.000Z",
          completedAt: null,
        },
        {
          attemptId: "att-2",
          topic: "آزمون قلب و عروق ۲",
          status: "completed",
          isSpecialExam: true,
          totalQuestions: 15,
          correct: 12,
          score: 80,
          startedAt: "2026-09-19T10:00:00.000Z",
          completedAt: "2026-09-19T10:30:00.000Z",
        },
      ],
    }),
    removeExamAttemptFromHistory: (...args: unknown[]) => mockRemoveExamAttemptFromHistory(...args),
  }),
}));

describe("ExamConfigView Recent Exams Removal UI", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });

    queryClient.setQueryData(["exam-topics", "test-org"], {
      courses: [
        {
          courseId: "course-1",
          courseTitle: "فارماکولوژی",
          hasAccess: true,
          questionCount: 20,
          modules: [
            {
              moduleId: "mod-1",
              moduleTitle: "داروهای قلب",
              questionCount: 20,
            },
          ],
        },
      ],
    });

    queryClient.setQueryData(["exam-history", "test-org"], {
      items: [
        {
          attemptId: "att-1",
          topic: "آزمون فارماکولوژی ۱",
          status: "in_progress",
          isSpecialExam: false,
          totalQuestions: 10,
          correct: 0,
          score: 0,
          startedAt: "2026-09-20T00:00:00.000Z",
          completedAt: null,
        },
        {
          attemptId: "att-2",
          topic: "آزمون قلب و عروق ۲",
          status: "completed",
          isSpecialExam: true,
          totalQuestions: 15,
          correct: 12,
          score: 80,
          startedAt: "2026-09-19T10:00:00.000Z",
          completedAt: "2026-09-19T10:30:00.000Z",
        },
      ],
    });

    queryClient.setQueryData(["wallet-balance"], { balance: 100000 });
  });

  function renderView() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExamConfigView
            organizationId="test-org"
            onStartExam={vi.fn()}
            onSelectAttempt={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("renders recent exam cards with delete buttons and badges", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByText("آزمون فارماکولوژی ۱")).toBeInTheDocument();
      expect(screen.getByText("آزمون قلب و عروق ۲")).toBeInTheDocument();
    });

    const deleteBtn1 = screen.getByTestId("delete-attempt-att-1");
    const deleteBtn2 = screen.getByTestId("delete-attempt-att-2");
    expect(deleteBtn1).toBeInTheDocument();
    expect(deleteBtn2).toBeInTheDocument();
  });

  it("opens delete confirmation modal when delete button is clicked and closes on cancel", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("delete-attempt-att-1")).toBeInTheDocument();
    });

    // Click delete button on attempt 1
    fireEvent.click(screen.getByTestId("delete-attempt-att-1"));

    // Verify modal appears with confirmation text
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("حذف از آزمون‌های اخیر")).toBeInTheDocument();
    expect(screen.getByText(/آیا می‌خواهید آزمون/)).toBeInTheDocument();

    // Click cancel button
    fireEvent.click(screen.getByText("انصراف"));

    // Modal closes and card remains visible
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("آزمون فارماکولوژی ۱")).toBeInTheDocument();
  });

  it("confirms delete, calls removeExamAttemptFromHistory API, and updates query", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("delete-attempt-att-1")).toBeInTheDocument();
    });

    // Click delete button on attempt 1
    fireEvent.click(screen.getByTestId("delete-attempt-att-1"));

    // Click confirm delete in modal
    const confirmBtn = screen.getByText("حذف از لیست");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockRemoveExamAttemptFromHistory).toHaveBeenCalledWith("test-org", "att-1");
    });
  });
});
