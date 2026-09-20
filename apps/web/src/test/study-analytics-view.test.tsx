import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";
import { toPersianDigits } from "@avana/domain";
import type { DailyStudyPlanResponse } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Study Analytics & Recommendations Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const otherCourseId = "00000000-0000-0000-0000-000000000099";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders metrics, weak areas, and recommendations when no daily tasks exist", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-an",
            analytics: {
              total_lessons: 10,
              completed_lessons: 7,
              lesson_progress_percent: 70,
              total_flashcards: 50,
              reviewed_flashcards: 40,
              flashcard_mastery_percent: 80,
              total_quizzes: 3,
              attempts_taken: 5,
              average_quiz_score: 92,
              weak_areas: ["Pharmacokinetics", "Beta Blockers"],
              recommended_next_steps: ["Review Beta Blockers flashcards"],
            },
          }),
        });
      }
      if (url.includes("/study/recommendations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-rec",
            recommendations: [
              {
                id: "rec-1",
                summary: "You struggled on Beta Blockers in Quiz 2. Consider reviewing related flashcards.",
                topics: ["Beta Blockers", "Pharmacology"],
                source: "quiz_attempt",
              },
            ],
          }),
        });
      }
      if (url.includes("/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async (): Promise<DailyStudyPlanResponse> => ({
            request_id: "req-plan",
            plan: {
              id: "plan-1",
              userId: "user-1",
              planDate: "2026-09-19",
              status: "in_progress",
              targetDurationMinutes: 60,
              completedDurationMinutes: 0,
              remainingDurationMinutes: 60,
              tasks: [],
              createdAt: "2026-09-19T00:00:00Z",
              updatedAt: "2026-09-19T00:00:00Z",
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyAnalyticsView
            organizationId={mockOrgId}
            courseId={mockCourseId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(`${toPersianDigits(70)}٪`)).toBeDefined();
      expect(screen.getByText(`${toPersianDigits(80)}٪`)).toBeDefined();
      expect(screen.getByText(`${toPersianDigits(92)}٪`)).toBeDefined();
      expect(screen.getByText("Pharmacokinetics")).toBeDefined();
      expect(screen.getAllByText("Beta Blockers").length).toBeGreaterThan(0);
      expect(screen.getByText("Review Beta Blockers flashcards")).toBeDefined();
      expect(
        screen.getByText(/You struggled on Beta Blockers in Quiz 2/i),
      ).toBeDefined();
    });
  });

  it("renders course-specific study tasks and filters out other courses and global tasks", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            analytics: {
              total_lessons: 10,
              completed_lessons: 5,
              lesson_progress_percent: 50,
              total_flashcards: 20,
              reviewed_flashcards: 10,
              flashcard_mastery_percent: 50,
              total_quizzes: 2,
              attempts_taken: 2,
              average_quiz_score: 85,
              weak_areas: [],
              recommended_next_steps: ["Fallback step that should not be shown when tasks exist"],
            },
          }),
        });
      }
      if (url.includes("/study/recommendations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ recommendations: [] }),
        });
      }
      if (url.includes("/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async (): Promise<DailyStudyPlanResponse> => ({
            plan: {
              id: "plan-1",
              userId: "user-1",
              planDate: "2026-09-19",
              status: "in_progress",
              targetDurationMinutes: 60,
              completedDurationMinutes: 0,
              remainingDurationMinutes: 60,
              tasks: [
                // 1. Task for this course (Lesson)
                {
                  id: "task-course-lesson",
                  planId: "plan-1",
                  userId: "user-1",
                  taskType: "read_lesson",
                  status: "pending",
                  title: "درس دوم: فارماکولوژی بالینی",
                  description: "مطالعه درس",
                  priority: 1,
                  estimatedMinutes: 25,
                  completedAt: null,
                  courseId: mockCourseId,
                  moduleId: "mod-1",
                  lessonId: "les-1",
                  quizId: null,
                  metadata: { courseName: "فارماکولوژی ۱" },
                  createdAt: "2026-09-19T00:00:00Z",
                  updatedAt: "2026-09-19T00:00:00Z",
                },
                // 2. Task for this course (Flashcards)
                {
                  id: "task-course-flashcard",
                  planId: "plan-1",
                  userId: "user-1",
                  taskType: "review_flashcards",
                  status: "pending",
                  title: "مرور فلش‌کارت‌های فارماکولوژی ۱",
                  description: "مرور فلش‌کارت",
                  priority: 2,
                  estimatedMinutes: 15,
                  completedAt: null,
                  courseId: mockCourseId,
                  moduleId: null,
                  lessonId: null,
                  quizId: null,
                  metadata: { courseName: "فارماکولوژی ۱", chapterNumbers: [2] },
                  createdAt: "2026-09-19T00:00:00Z",
                  updatedAt: "2026-09-19T00:00:00Z",
                },
                // 3. Task for ANOTHER course (Should be filtered out!)
                {
                  id: "task-other-course",
                  planId: "plan-1",
                  userId: "user-1",
                  taskType: "read_lesson",
                  status: "pending",
                  title: "فیزیولوژی کلیه - دوره دیگر",
                  description: "مطالعه درس دوره دیگر",
                  priority: 3,
                  estimatedMinutes: 30,
                  completedAt: null,
                  courseId: otherCourseId,
                  moduleId: "mod-99",
                  lessonId: "les-99",
                  quizId: null,
                  metadata: { courseName: "فیزیولوژی ۲" },
                  createdAt: "2026-09-19T00:00:00Z",
                  updatedAt: "2026-09-19T00:00:00Z",
                },
                // 4. Global task with courseId: null (Should be filtered out!)
                {
                  id: "task-global-summary",
                  planId: "plan-1",
                  userId: "user-1",
                  taskType: "review_wrong_answers",
                  status: "pending",
                  title: "مرور عمومی اشتباهات",
                  description: "مرور کلی",
                  priority: 4,
                  estimatedMinutes: 10,
                  completedAt: null,
                  courseId: null,
                  moduleId: null,
                  lessonId: null,
                  quizId: null,
                  metadata: {},
                  createdAt: "2026-09-19T00:00:00Z",
                  updatedAt: "2026-09-19T00:00:00Z",
                },
              ],
              createdAt: "2026-09-19T00:00:00Z",
              updatedAt: "2026-09-19T00:00:00Z",
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyAnalyticsView
            organizationId={mockOrgId}
            courseId={mockCourseId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // 1. Should display active course badge
      expect(screen.getByText(`${toPersianDigits(2)} تسک فعال`)).toBeDefined();

      // 2. Should display this course's tasks
      expect(screen.getByText("فارماکولوژی بالینی")).toBeDefined();
      expect(screen.getByText(`مرور فلش‌کارت‌های فصل ${toPersianDigits(2)}`)).toBeDefined();

      // 3. Should NOT display other course's task
      expect(screen.queryByText("فیزیولوژی کلیه - دوره دیگر")).toBeNull();

      // 4. Should NOT display global task
      expect(screen.queryByText("مرور عمومی اشتباهات")).toBeNull();

      // 5. Should NOT display fallback text when real tasks exist
      expect(screen.queryByText("Fallback step that should not be shown when tasks exist")).toBeNull();
    });

    // Check navigation URLs
    const lessonLink = screen.getByRole("link", { name: "شروع مطالعه" });
    expect(lessonLink.getAttribute("href")).toBe(
      `/courses/${mockCourseId}?tab=lessons&lessonId=les-1`,
    );

    const flashcardLink = screen.getByRole("link", { name: "شروع مرور" });
    expect(flashcardLink.getAttribute("href")).toBe(
      `/flashcards/review?courses=${mockCourseId}`,
    );
  });

  it("handles completing a task from the course analysis view", async () => {
    let patchedTaskId: string | null = null;
    let patchedStatus: string | null = null;

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/study/daily-plan/tasks/")) {
        const match = url.match(/\/study\/daily-plan\/tasks\/([^/?]+)/);
        if (match) {
          patchedTaskId = match[1];
        }
        const body = init?.body ? JSON.parse(init.body as string) : {};
        patchedStatus = body.status;

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            task: {
              id: patchedTaskId,
              status: "completed",
              completedAt: new Date().toISOString(),
            },
          }),
        });
      }
      if (url.includes("/study/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            analytics: {
              total_lessons: 5,
              completed_lessons: 2,
              lesson_progress_percent: 40,
              total_flashcards: 10,
              reviewed_flashcards: 5,
              flashcard_mastery_percent: 50,
              total_quizzes: 1,
              attempts_taken: 1,
              average_quiz_score: 80,
              weak_areas: [],
              recommended_next_steps: [],
            },
          }),
        });
      }
      if (url.includes("/study/recommendations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ recommendations: [] }),
        });
      }
      if (url.includes("/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async (): Promise<DailyStudyPlanResponse> => ({
            plan: {
              id: "plan-1",
              userId: "user-1",
              planDate: "2026-09-19",
              status: "in_progress",
              targetDurationMinutes: 30,
              completedDurationMinutes: 0,
              remainingDurationMinutes: 30,
              tasks: [
                {
                  id: "task-to-complete-101",
                  planId: "plan-1",
                  userId: "user-1",
                  taskType: "take_quiz",
                  status: "pending",
                  title: "آزمون ارزیابی فصل اول",
                  description: "آزمون",
                  priority: 1,
                  estimatedMinutes: 15,
                  completedAt: null,
                  courseId: mockCourseId,
                  moduleId: "mod-1",
                  lessonId: null,
                  quizId: "quiz-101",
                  metadata: { courseName: "فارماکولوژی ۱" },
                  createdAt: "2026-09-19T00:00:00Z",
                  updatedAt: "2026-09-19T00:00:00Z",
                },
              ],
              createdAt: "2026-09-19T00:00:00Z",
              updatedAt: "2026-09-19T00:00:00Z",
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyAnalyticsView
            organizationId={mockOrgId}
            courseId={mockCourseId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/فصل اول/)).toBeDefined();
    });

    const completeButton = screen.getByRole("button", {
      name: /تکمیل تسک/,
    });
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(patchedTaskId).toBe("task-to-complete-101");
      expect(patchedStatus).toBe("completed");
    });
  });

  it("handles graceful empty state when neither course tasks nor recommended steps exist", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            analytics: {
              total_lessons: 0,
              completed_lessons: 0,
              lesson_progress_percent: 0,
              total_flashcards: 0,
              reviewed_flashcards: 0,
              flashcard_mastery_percent: 0,
              total_quizzes: 0,
              attempts_taken: 0,
              average_quiz_score: 0,
              weak_areas: [],
              recommended_next_steps: [],
            },
          }),
        });
      }
      if (url.includes("/study/recommendations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ recommendations: [] }),
        });
      }
      if (url.includes("/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async (): Promise<DailyStudyPlanResponse> => ({
            plan: {
              id: "plan-1",
              userId: "user-1",
              planDate: "2026-09-19",
              status: "pending",
              targetDurationMinutes: 0,
              completedDurationMinutes: 0,
              remainingDurationMinutes: 0,
              tasks: [],
              createdAt: "2026-09-19T00:00:00Z",
              updatedAt: "2026-09-19T00:00:00Z",
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyAnalyticsView
            organizationId={mockOrgId}
            courseId={mockCourseId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "با تکمیل بخش‌های بیشتر، گام‌های پیشنهادی اختصاصی فعال خواهند شد.",
        ),
      ).toBeDefined();
    });
  });
});
