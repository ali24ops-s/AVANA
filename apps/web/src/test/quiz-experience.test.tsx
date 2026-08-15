import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuizListView } from "../components/quiz/QuizListView.js";
import { QuizExperience } from "../components/quiz/QuizExperience.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Quiz Experience Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const mockQuizId = "00000000-0000-0000-0000-000000000003";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders quiz list with published quizzes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-ql",
        quizzes: [
          {
            id: mockQuizId,
            organization_id: mockOrgId,
            course_id: mockCourseId,
            document_id: "doc-1",
            title: "Cardiovascular Pharmacology Quiz",
            status: "published",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Cardiovascular Pharmacology Quiz")).toBeDefined();
      expect(screen.getByText("شروع آزمون")).toBeDefined();
    });
  });

  it("steps through questions and submits attempt with score display", async () => {
    global.fetch = vi.fn().mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-att",
            attempt: {
              attemptId: "att-1",
              quizId: mockQuizId,
              score: 100,
              correct: 1,
              total: 1,
              answers: { "q-1": "Vasodilation and reduced aldosterone" },
              completedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-qdet",
          quiz: {
            id: mockQuizId,
            organization_id: mockOrgId,
            course_id: mockCourseId,
            document_id: "doc-1",
            title: "Cardiovascular Pharmacology Quiz",
            status: "published",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            questions: [
              {
                id: "q-1",
                quiz_id: mockQuizId,
                generated_content_id: null,
                question: "What is the primary effect of ACE inhibitors?",
                question_type: "mcq",
                choices: [
                  "Vasodilation and reduced aldosterone",
                  "Increased sympathetic tone",
                  "Direct calcium influx",
                ],
                correct_answer: "Vasodilation and reduced aldosterone",
                explanation: "ACE inhibitors reduce AT-II synthesis.",
                sort_order: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
          quizId={mockQuizId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("What is the primary effect of ACE inhibitors?")).toBeDefined();
    });

    // Select choice A
    fireEvent.click(screen.getByText("Vasodilation and reduced aldosterone"));

    // Submit quiz
    const submitBtn = screen.getByText("ثبت و پایان آزمون");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("آزمون با موفقیت گذرانده شد!")).toBeDefined();
      expect(screen.getByText("100%")).toBeDefined();
    });
  });
});
