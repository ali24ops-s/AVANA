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

const mockTopicsData = {
  courses: [
    {
      courseId: "course-pharm",
      courseTitle: "فارماکولوژی",
      hasAccess: true,
      questionCount: 60,
      modules: [
        {
          moduleId: "mod-pharm-1",
          moduleTitle: "فارماکوکینتیک",
          questionCount: 30,
          lessons: [{ lessonId: "les-pharm-1", lessonTitle: "درس ۱", questionCount: 30 }],
        },
        {
          moduleId: "mod-pharm-2",
          moduleTitle: "فارماکودینامیک",
          questionCount: 30,
          lessons: [{ lessonId: "les-pharm-2", lessonTitle: "درس ۲", questionCount: 30 }],
        },
      ],
    },
    {
      courseId: "course-cardio",
      courseTitle: "کاردیولوژی",
      hasAccess: true,
      questionCount: 40,
      modules: [
        {
          moduleId: "mod-cardio-1",
          moduleTitle: "نوار قلب و آریتمی",
          questionCount: 20,
          lessons: [{ lessonId: "les-cardio-1", lessonTitle: "درس نوار قلب", questionCount: 20 }],
        },
        {
          moduleId: "mod-cardio-2",
          moduleTitle: "نارسایی قلبی",
          questionCount: 20,
          lessons: [{ lessonId: "les-cardio-2", lessonTitle: "درس نارسایی", questionCount: 20 }],
        },
      ],
    },
  ],
};

function renderExamConfigView(onStartExam = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  queryClient.setQueryData(["exam-topics", "org-test"], mockTopicsData);
  queryClient.setQueryData(["organizations"], { items: [{ id: "org-test", name: "Org Test" }] });

  return render(
    <AuthProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ExamConfigView organizationId="org-test" onStartExam={onStartExam} />
        </QueryClientProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("Exam Two-Panel Selector & Full-Width Vertical Layout", () => {
  it("renders Two-Panel selector with right panel courses and left panel chapters", async () => {
    renderExamConfigView();

    await waitFor(() => {
      expect(screen.getByText("دوره‌های من")).toBeInTheDocument();
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
      expect(screen.getAllByText("کاردیولوژی")[0]).toBeInTheDocument();
    });

    // Right panel displays course titles and chapter counts
    expect(screen.getAllByText("۲ فصل").length).toBeGreaterThanOrEqual(1);

    // Select Pharmacology
    fireEvent.click(screen.getAllByText("فارماکولوژی")[0]);

    // Left panel renders Pharmacology chapters
    expect(screen.getByText("سرفصل‌های فارماکولوژی")).toBeInTheDocument();
    expect(screen.getByText("فارماکوکینتیک")).toBeInTheDocument();
    expect(screen.getByText("فارماکودینامیک")).toBeInTheDocument();
  });

  it("supports multi-course selection, preserves selections when switching active course, and returns back", async () => {
    renderExamConfigView();

    await waitFor(() => {
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
    });

    // 1. Activate Pharmacology
    fireEvent.click(screen.getAllByText("فارماکولوژی")[0]);
    expect(screen.getByText("فارماکوکینتیک")).toBeInTheDocument();

    // 2. Select chapter "فارماکوکینتیک" from Pharmacology
    fireEvent.click(screen.getByText("فارماکوکینتیک"));

    // 3. Switch to Cardiology
    fireEvent.click(screen.getAllByText("کاردیولوژی")[0]);

    // 4. Verify left panel now shows Cardiology chapters
    expect(screen.getByText("سرفصل‌های کاردیولوژی")).toBeInTheDocument();
    expect(screen.getByText("نوار قلب و آریتمی")).toBeInTheDocument();
    expect(screen.queryByText("فارماکوکینتیک")).not.toBeInTheDocument();

    // 5. Select chapter "نوار قلب و آریتمی" from Cardiology
    fireEvent.click(screen.getByText("نوار قلب و آریتمی"));

    // 6. Switch back to Pharmacology
    fireEvent.click(screen.getAllByText("فارماکولوژی")[0]);

    // 7. Verify "فارماکوکینتیک" is still checked and visible in left panel
    expect(screen.getByText("سرفصل‌های فارماکولوژی")).toBeInTheDocument();
    expect(screen.getByText("فارماکوکینتیک")).toBeInTheDocument();
    const checkedCheckboxes = document.querySelectorAll(".lucide-check");
    expect(checkedCheckboxes.length).toBeGreaterThanOrEqual(1);

    // 8. Verify Box 2 Summary reflects BOTH courses and chapters
    // 2 courses selected, 2 chapters selected
    expect(screen.getAllByText("۲ فصل").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/فارماکولوژی:/)).toBeInTheDocument();
    expect(screen.getByText(/کاردیولوژی:/)).toBeInTheDocument();
  });

  it("handles 'انتخاب همه' and 'لغو انتخاب' strictly for the active course without affecting other courses", async () => {
    renderExamConfigView();

    await waitFor(() => {
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
    });

    // Activate Cardiology first and select 1 chapter
    fireEvent.click(screen.getAllByText("کاردیولوژی")[0]);
    fireEvent.click(screen.getByText("نوار قلب و آریتمی"));

    // Now switch to Pharmacology
    fireEvent.click(screen.getAllByText("فارماکولوژی")[0]);

    // Click "انتخاب همه" in Pharmacology
    const selectAllBtn = screen.getByRole("button", { name: "انتخاب همه" });
    fireEvent.click(selectAllBtn);

    // Pharmacology chapters should both be selected (total modules = 2 from pharm + 1 from cardio = 3)
    expect(screen.getByText("۳ فصل")).toBeInTheDocument();

    // Now click "لغو انتخاب" in Pharmacology
    const deselectBtn = screen.getByRole("button", { name: "لغو انتخاب" });
    fireEvent.click(deselectBtn);

    // Pharmacology is now cleared, but Cardiology's chapter remains!
    expect(screen.getByText("۱ فصل")).toBeInTheDocument();

    // Switch back to Cardiology to confirm its chapter is intact
    fireEvent.click(screen.getAllByText("کاردیولوژی")[0]);
    expect(screen.getByText("سرفصل‌های کاردیولوژی")).toBeInTheDocument();
    expect(screen.getByText("نوار قلب و آریتمی")).toBeInTheDocument();
  });

  it("updates question count, difficulty, and invokes startExamAttempt with full multi-course payload", async () => {
    const mockAttemptResult = {
      attemptId: "att-multi-123",
      questions: [{ id: "q-1" }, { id: "q-2" }],
      topics: ["course-pharm", "course-cardio", "mod-pharm-1", "mod-cardio-1", "les-pharm-1", "les-cardio-1"],
      difficulty: "hard",
      requestedCount: 40,
    };
    let capturedPayload: unknown = null;
    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData),
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
      expect(screen.getAllByText("فارماکولوژی")[0]).toBeInTheDocument();
    });

    // Start button is disabled before selecting any chapters
    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    expect(startButton).toBeDisabled();

    // Select 1 chapter from Pharmacology (30 questions available)
    fireEvent.click(screen.getAllByText("فارماکولوژی")[0]);
    fireEvent.click(screen.getByText("فارماکوکینتیک"));

    // Select 1 chapter from Cardiology (20 questions available) -> total 50 questions
    fireEvent.click(screen.getAllByText("کاردیولوژی")[0]);
    fireEvent.click(screen.getByText("نوار قلب و آریتمی"));

    // Start button is now enabled
    expect(startButton).not.toBeDisabled();

    // Change Question count to 40
    const count40Btn = screen.getByRole("button", { name: /۴۰/ });
    fireEvent.click(count40Btn);

    // Change Difficulty to "سخت"
    const hardBtn = screen.getByRole("button", { name: "سخت" });
    fireEvent.click(hardBtn);

    // Click Start Exam
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(capturedPayload).toEqual({
        sections: expect.arrayContaining(["mod-pharm-1", "mod-cardio-1"]),
        chapters: expect.arrayContaining(["les-pharm-1", "les-cardio-1"]),
        topics: expect.arrayContaining(["course-pharm", "course-cardio", "mod-pharm-1", "mod-cardio-1", "les-pharm-1", "les-cardio-1"]),
        difficulty: "hard",
        questionCount: 40,
      });
      expect(onStartExam).toHaveBeenCalledWith({
        attemptId: "att-multi-123",
        questions: [{ id: "q-1" }, { id: "q-2" }],
        topics: expect.arrayContaining(["mod-pharm-1", "mod-cardio-1"]),
        difficulty: "hard",
        requestedCount: 40,
      });
    });
  });

  it("prevents invalid submission, restricts question count exceeding available pool, and handles API errors gracefully", async () => {
    vi.spyOn(studyApiModule, "createStudyApi").mockReturnValue({
      getExamTopics: vi.fn().mockResolvedValue(mockTopicsData),
      getExamHistory: vi.fn().mockResolvedValue({ items: [] }),
      startExamAttempt: vi.fn().mockRejectedValue(new Error("بانک سوالات موقتاً در دسترس نیست")),
      removeExamAttemptFromHistory: vi.fn(),
      getExamAttemptDetail: vi.fn(),
    } as unknown as ReturnType<typeof studyApiModule.createStudyApi>);

    const onStartExam = vi.fn();
    renderExamConfigView(onStartExam);

    await waitFor(() => {
      expect(screen.getAllByText("کاردیولوژی")[0]).toBeInTheDocument();
    });

    const startButton = screen.getByRole("button", { name: /شروع آزمون/i });
    expect(startButton).toBeDisabled();

    // Select Cardiology chapter with 20 questions
    fireEvent.click(screen.getAllByText("کاردیولوژی")[0]);
    const ecgChapter = screen.getByText("نوار قلب و آریتمی");
    fireEvent.click(ecgChapter);

    // With 20 questions available, 10 and 20 should be enabled, 40, 60, 80, and 120 disabled
    expect(screen.getByRole("button", { name: /^۱۰$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^۲۰$/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^۴۰$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^۶۰$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^۸۰$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^۱۲۰$/ })).toBeDisabled();

    // Deselect the chapter -> start button should be disabled again
    fireEvent.click(ecgChapter);
    expect(startButton).toBeDisabled();

    // Re-select chapter -> start button enabled
    fireEvent.click(ecgChapter);
    expect(startButton).not.toBeDisabled();

    // Attempt to start exam -> API rejects
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText("بانک سوالات موقتاً در دسترس نیست")).toBeInTheDocument();
      expect(startButton).not.toBeDisabled();
      expect(onStartExam).not.toHaveBeenCalled();
    });
  });
});
