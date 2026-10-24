/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamConfigView } from "../components/quiz/ExamConfigView.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { MemoryRouter } from "react-router-dom";
import * as studyApiModule from "../lib/api/study.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockTopicsData150 = {
  courses: [
    {
      courseId: "course-all",
      courseTitle: "دوره جامع پزشکی",
      hasAccess: true,
      questionCount: 150,
      modules: [
        {
          moduleId: "mod-1",
          moduleTitle: "بخش اول (۱۰۰ سؤال)",
          questionCount: 100,
          lessons: [{ lessonId: "les-1", lessonTitle: "درس ۱", questionCount: 100 }],
        },
        {
          moduleId: "mod-2",
          moduleTitle: "بخش دوم (۵۰ سؤال)",
          questionCount: 50,
          lessons: [{ lessonId: "les-2", lessonTitle: "درس ۲", questionCount: 50 }],
        },
      ],
    },
  ],
};

function renderExamConfigView(onStartExam = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ExamConfigView organizationId="org-test" onStartExam={onStartExam} />
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("ExamConfigView Question Count Options (80 and 120)", () => {
  it("renders 6 question count options in strictly ascending order: 10, 20, 40, 60, 80, 120", async () => {
    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData150),
      getExamHistory: vi.fn().mockResolvedValue({ items: [] }),
      startExamAttempt: vi.fn(),
      removeExamAttemptFromHistory: vi.fn(),
      getExamAttemptDetail: vi.fn(),
    } as unknown as ReturnType<typeof studyApiModule.createStudyApi>);

    renderExamConfigView();

    await waitFor(() => {
      expect(screen.getByText("دوره جامع پزشکی")).toBeInTheDocument();
    });

    const btn10 = screen.getByRole("button", { name: /^۱۰$/ });
    const btn20 = screen.getByRole("button", { name: /^۲۰$/ });
    const btn40 = screen.getByRole("button", { name: /^۴۰$/ });
    const btn60 = screen.getByRole("button", { name: /^۶۰$/ });
    const btn80 = screen.getByRole("button", { name: /^۸۰$/ });
    const btn120 = screen.getByRole("button", { name: /^۱۲۰$/ });

    expect(btn10).toBeInTheDocument();
    expect(btn20).toBeInTheDocument();
    expect(btn40).toBeInTheDocument();
    expect(btn60).toBeInTheDocument();
    expect(btn80).toBeInTheDocument();
    expect(btn120).toBeInTheDocument();

    // Verify ordering in DOM
    const buttons = screen.getAllByRole("button", { name: /^(۱۰|۲۰|۴۰|۶۰|۸۰|۱۲۰)$/ });
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["۱۰", "۲۰", "۴۰", "۶۰", "۸۰", "۱۲۰"]);
  });

  it("selects 80 questions: updates estimated time to 120 minutes and sends questionCount: 80 to API", async () => {
    let capturedPayload: unknown = null;
    const mockAttemptResult = {
      attemptId: "att-80-test",
      questions: Array.from({ length: 80 }, (_, i) => ({ id: `q-${i + 1}` })),
      topics: ["course-all", "mod-1"],
      difficulty: "medium",
      requestedCount: 80,
    };

    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData150),
      getExamHistory: vi.fn().mockResolvedValue({ items: [] }),
      startExamAttempt: vi.fn().mockImplementation(async (_orgId, payload: unknown) => {
        capturedPayload = payload;
        return mockAttemptResult;
      }),
      removeExamAttemptFromHistory: vi.fn(),
      getExamAttemptDetail: vi.fn(),
    } as unknown as ReturnType<typeof studyApiModule.createStudyApi>);

    const onStartExam = vi.fn();
    renderExamConfigView(onStartExam);

    await waitFor(() => {
      expect(screen.getByText("دوره جامع پزشکی")).toBeInTheDocument();
    });

    // Select module 1 (100 questions available)
    fireEvent.click(screen.getByText("دوره جامع پزشکی"));
    fireEvent.click(screen.getByText("بخش اول (۱۰۰ سؤال)"));

    // Select 80 questions button
    const btn80 = screen.getByRole("button", { name: /^۸۰$/ });
    expect(btn80).not.toBeDisabled();
    fireEvent.click(btn80);

    // Verify estimated time: 80 * 1.5 = 120 minutes
    expect(screen.getByText(/۱۲۰ دقیقه/)).toBeInTheDocument();

    // Click Start Exam
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(capturedPayload).toMatchObject({
        questionCount: 80,
        difficulty: "medium",
      });
      expect(onStartExam).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: "att-80-test",
          requestedCount: 80,
          questions: expect.arrayContaining([expect.objectContaining({ id: "q-1" })]),
        }),
      );
    });
  });

  it("selects 120 questions: updates estimated time to 180 minutes and sends questionCount: 120 to API", async () => {
    let capturedPayload: unknown = null;
    const mockAttemptResult = {
      attemptId: "att-120-test",
      questions: Array.from({ length: 120 }, (_, i) => ({ id: `q-${i + 1}` })),
      topics: ["course-all", "mod-1", "mod-2"],
      difficulty: "hard",
      requestedCount: 120,
    };

    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData150),
      getExamHistory: vi.fn().mockResolvedValue({ items: [] }),
      startExamAttempt: vi.fn().mockImplementation(async (_orgId, payload: unknown) => {
        capturedPayload = payload;
        return mockAttemptResult;
      }),
      removeExamAttemptFromHistory: vi.fn(),
      getExamAttemptDetail: vi.fn(),
    } as unknown as ReturnType<typeof studyApiModule.createStudyApi>);

    const onStartExam = vi.fn();
    renderExamConfigView(onStartExam);

    await waitFor(() => {
      expect(screen.getByText("دوره جامع پزشکی")).toBeInTheDocument();
    });

    // Select both modules (150 questions available total)
    fireEvent.click(screen.getByText("دوره جامع پزشکی"));
    fireEvent.click(screen.getByText("بخش اول (۱۰۰ سؤال)"));
    fireEvent.click(screen.getByText("بخش دوم (۵۰ سؤال)"));

    // Select 120 questions button
    const btn120 = screen.getByRole("button", { name: /^۱۲۰$/ });
    expect(btn120).not.toBeDisabled();
    fireEvent.click(btn120);

    // Select hard difficulty
    fireEvent.click(screen.getByRole("button", { name: "سخت" }));

    // Verify estimated time: 120 * 1.5 = 180 minutes
    expect(screen.getByText(/۱۸۰ دقیقه/)).toBeInTheDocument();

    // Click Start Exam
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(capturedPayload).toMatchObject({
        questionCount: 120,
        difficulty: "hard",
      });
      expect(onStartExam).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId: "att-120-test",
          requestedCount: 120,
        }),
      );
    });
  });

  it("disables 80 and 120 when available questions pool is insufficient (e.g. 50 questions)", async () => {
    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData150),
      getExamHistory: vi.fn().mockResolvedValue({ items: [] }),
      startExamAttempt: vi.fn(),
      removeExamAttemptFromHistory: vi.fn(),
      getExamAttemptDetail: vi.fn(),
    } as unknown as ReturnType<typeof studyApiModule.createStudyApi>);

    renderExamConfigView();

    await waitFor(() => {
      expect(screen.getByText("دوره جامع پزشکی")).toBeInTheDocument();
    });

    // Select only module 2 (50 questions available)
    fireEvent.click(screen.getByText("دوره جامع پزشکی"));
    fireEvent.click(screen.getByText("بخش دوم (۵۰ سؤال)"));

    // 10, 20, 40 should be enabled; 60, 80, 120 should be disabled
    expect(screen.getByRole("button", { name: /^۱۰$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^۲۰$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^۴۰$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^۶۰$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^۸۰$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^۱۲۰$/ })).toBeDisabled();
  });
});
