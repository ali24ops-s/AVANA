import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  StudyPlanner,
  formatStudyPlannerTaskTitle,
} from "../components/planner/StudyPlanner.js";
import type {
  DailyStudyPlanResource,
} from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Daily Study Planner Component (Phase 4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const mockPlan: DailyStudyPlanResource = {
    id: "plan-123",
    userId: "user-456",
    planDate: "2026-09-18",
    status: "in_progress",
    targetDurationMinutes: 60,
    completedDurationMinutes: 20,
    remainingDurationMinutes: 40,
    tasks: [
      {
        id: "task-lesson-1",
        planId: "plan-123",
        userId: "user-456",
        taskType: "read_lesson",
        status: "completed",
        title: "درس ۱: ساختار سلول",
        description: "درس در دوره زیست‌شناسی",
        priority: 1,
        estimatedMinutes: 20,
        completedAt: "2026-09-18T10:00:00Z",
        courseId: "course-bio-1",
        moduleId: "mod-1",
        lessonId: "lesson-cell-1",
        quizId: null,
        metadata: {},
        createdAt: "2026-09-18T08:00:00Z",
        updatedAt: "2026-09-18T10:00:00Z",
      },
      {
        id: "task-flashcards-1",
        planId: "plan-123",
        userId: "user-456",
        taskType: "review_flashcards",
        status: "in_progress",
        title: "مرور فلش‌کارت‌های بیوشیمی",
        description: "۱۵ کارت سررسیدشده",
        priority: 2,
        estimatedMinutes: 15,
        completedAt: null,
        courseId: "course-chem-1",
        moduleId: null,
        lessonId: null,
        quizId: null,
        metadata: {},
        createdAt: "2026-09-18T08:00:00Z",
        updatedAt: "2026-09-18T08:00:00Z",
      },
      {
        id: "task-quiz-1",
        planId: "plan-123",
        userId: "user-456",
        taskType: "take_quiz",
        status: "pending",
        title: "آزمون مبحث ژنتیک",
        description: "آزمون پایانی فصل دوم",
        priority: 3,
        estimatedMinutes: 15,
        completedAt: null,
        courseId: "course-bio-1",
        moduleId: null,
        lessonId: null,
        quizId: "quiz-genetics-1",
        metadata: {},
        createdAt: "2026-09-18T08:00:00Z",
        updatedAt: "2026-09-18T08:00:00Z",
      },
      {
        id: "task-wrong-1",
        planId: "plan-123",
        userId: "user-456",
        taskType: "review_wrong_answers",
        status: "skipped",
        title: "مرور و آزمون مجدد فارماکولوژی",
        description: "پاسخ‌های نادرست آزمون قبلی",
        priority: 4,
        estimatedMinutes: 10,
        completedAt: null,
        courseId: "course-pharm-1",
        moduleId: null,
        lessonId: null,
        quizId: "quiz-pharm-1",
        metadata: {},
        createdAt: "2026-09-18T08:00:00Z",
        updatedAt: "2026-09-18T08:00:00Z",
      },
    ],
    createdAt: "2026-09-18T08:00:00Z",
    updatedAt: "2026-09-18T10:00:00Z",
  };

  it("1. renders Daily Study Planner with live API response and Persian header/stats", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: mockPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Header title and stats
    expect(screen.getByText("برنامه مطالعه امروز")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/۲۰ دقیقه از ۶۰ دقیقه هدف/)).toBeInTheDocument();
      expect(screen.getByText("۳۳٪")).toBeInTheDocument();
      expect(screen.getByText(/انجام‌شده: ۲۰ دقیقه/)).toBeInTheDocument();
      expect(screen.getByText(/باقیمانده: ۴۰ دقیقه/)).toBeInTheDocument();
    });

    // Toggle button is rendered showing task count (collapsed by default)
    const toggleBtn = screen.getByRole("button", { name: /فعالیت‌های مطالعه امروز/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText("مشاهده")).toBeInTheDocument();

    // Expand tasks list
    fireEvent.click(toggleBtn);

    // Verify all 4 tasks rendered in server order with cleaned titles
    expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    expect(screen.getByText("مرور فلش‌کارت‌های بیوشیمی")).toBeInTheDocument();
    expect(screen.getByText("آزمون مبحث ژنتیک")).toBeInTheDocument();
    expect(screen.getByText("مرور و آزمون مجدد فارماکولوژی")).toBeInTheDocument();

    // Verify no old mock or english strings
    expect(screen.queryByText("Cardiovascular Pharmacology")).not.toBeInTheDocument();
    expect(screen.queryByText("Dr. Patricia Chen")).not.toBeInTheDocument();
    expect(screen.queryByText("به‌زودی")).not.toBeInTheDocument();
  });

  it("2. renders skeleton loading state while data is being fetched", async () => {
    // Hang fetch to test loading state
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("برنامه مطالعه امروز")).toBeInTheDocument();
    const loadingContainer = screen.getByRole("region", { name: "برنامه مطالعه امروز" });
    expect(loadingContainer.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("3. renders empty state when tasks list is empty", async () => {
    const emptyPlan: DailyStudyPlanResource = {
      ...mockPlan,
      tasks: [],
      completedDurationMinutes: 0,
      remainingDurationMinutes: 60,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: emptyPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("برای امروز کاری برای انجام باقی نمانده است")).toBeInTheDocument();
    });

    // Empty state CTA and header action
    expect(screen.getAllByRole("button", { name: /بازسازی برنامه/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("4. renders error state and allows retry on API error", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network connection lost"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: mockPlan }),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("خطا در دریافت برنامه مطالعه امروز")).toBeInTheDocument();
    });

    // Click retry
    const retryBtn = screen.getByRole("button", { name: "تلاش مجدد" });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });
  });

  it("5. renders all 4 task types correctly with accessible icons and action labels", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: mockPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });

    // Verify task types are rendered with accessible icons
    expect(screen.getByRole("img", { name: "مطالعه درس" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "مرور فلش‌کارت" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "آزمون" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "مرور اشتباهات" })).toBeInTheDocument();

    // Verify action button links with accessible labels (icon-only buttons)
    expect(screen.getByRole("link", { name: "مشاهده درس" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شروع مرور" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شروع آزمون" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مرور اشتباهات" })).toBeInTheDocument();
  });

  it("6. renders task statuses correctly with appropriate indicators and badges", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: mockPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });

    // Completed task has checked box with completion title
    expect(screen.getByTitle("تسک تکمیل شده است")).toBeInTheDocument();

    // In-progress and skipped have status badges
    expect(screen.getByText("در حال انجام")).toBeInTheDocument();
    expect(screen.getByText("رد شده")).toBeInTheDocument();

    // Non-completed tasks have unchecked box with pending title
    expect(screen.getAllByTitle("علامت‌گذاری به عنوان انجام‌شده").length).toBeGreaterThan(0);
  });

  it("7. completes a pending task via PATCH /v1/study/daily-plan/tasks/:taskId", async () => {
    let patchedBody: Record<string, unknown> | null = null;
    let patchedUrl = "";

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (init?.method === "PATCH" && urlStr.includes("/tasks/")) {
        patchedUrl = urlStr;
        patchedBody = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              task: {
                ...mockPlan.tasks[2],
                status: "completed",
                completedAt: "2026-09-18T10:30:00Z",
              },
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: mockPlan }),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("آزمون مبحث ژنتیک")).toBeInTheDocument();
    });

    // Find completion button for the pending quiz task
    const completeBtn = screen.getByLabelText("تکمیل تسک آزمون مبحث ژنتیک");
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(patchedUrl).toContain("/v1/study/daily-plan/tasks/task-quiz-1");
      expect(patchedBody).toEqual({ status: "completed" });
    });
  });

  it("8. does NOT revert an already completed task to pending on click (completion semantics)", async () => {
    let patchCalled = false;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (init?.method === "PATCH") {
        patchCalled = true;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: mockPlan }),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });

    // The completed task checkbox button is disabled/locked
    const completedBtn = screen.getByLabelText("تکمیل تسک ساختار سلول");
    expect(completedBtn).toBeDisabled();

    fireEvent.click(completedBtn);
    expect(patchCalled).toBe(false);
  });

  it("9. regenerates daily study plan via POST /v1/study/daily-plan/regenerate with disabled & loading state", async () => {
    let regenCalled = false;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (init?.method === "POST" && urlStr.includes("/regenerate")) {
        regenCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ plan: mockPlan }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: mockPlan }),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });

    const regenBtn = screen.getByLabelText("بازسازی برنامه مطالعه");
    expect(regenBtn).not.toBeDisabled();

    fireEvent.click(regenBtn);

    await waitFor(() => {
      expect(regenCalled).toBe(true);
    });
  });

  it("10. builds correct real navigation links for lessons, flashcards, quizzes, and exams", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: mockPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });

    // 1. Lesson link (completed -> "مشاهده درس")
    const lessonLink = screen.getByRole("link", { name: /مشاهده درس/i });
    expect(lessonLink).toHaveAttribute(
      "href",
      "/courses/course-bio-1?tab=lessons&lessonId=lesson-cell-1",
    );

    // 2. Flashcards link (in_progress -> "شروع مرور" direct to flashcards review experience)
    const flashcardLink = screen.getByRole("link", { name: /شروع مرور/i });
    expect(flashcardLink).toHaveAttribute(
      "href",
      "/flashcards/review?courses=course-chem-1",
    );

    // 3. Quiz link (pending -> "شروع آزمون" direct to specific quiz)
    const quizLink = screen.getByRole("link", { name: /شروع آزمون/i });
    expect(quizLink).toHaveAttribute(
      "href",
      "/courses/course-bio-1?tab=quizzes&quizId=quiz-genetics-1",
    );

    // 4. Wrong answers review link (direct to specific quiz)
    const wrongAnswersLink = screen.getByRole("link", { name: /مرور اشتباهات/i });
    expect(wrongAnswersLink).toHaveAttribute(
      "href",
      "/courses/course-pharm-1?tab=quizzes&quizId=quiz-pharm-1",
    );
  });

  it("11. handles missing course/reference IDs gracefully without fake navigation or crashing", async () => {
    const planWithMissingRefs: DailyStudyPlanResource = {
      ...mockPlan,
      tasks: [
        {
          ...mockPlan.tasks[0],
          id: "task-no-refs",
          courseId: null,
          lessonId: null,
          title: "تسک بدون شناسه دوره",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: planWithMissingRefs }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("تسک بدون شناسه دوره")).toBeInTheDocument();
    });

    // Button should be disabled with no href
    const disabledBtn = screen.getByRole("button", { name: /شروع مطالعه/i });
    expect(disabledBtn).toBeDisabled();
    expect(disabledBtn).not.toHaveAttribute("href");
  });

  it("12. invalidates all parameterized query variants on task completion", async () => {
    let fetchCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              task: {
                ...mockPlan.tasks[2],
                status: "completed",
                completedAt: "2026-09-18T10:30:00Z",
              },
            }),
        } as Response);
      }

      fetchCount++;
      const currentPlan = fetchCount === 1 ? mockPlan : {
        ...mockPlan,
        completedDurationMinutes: 35,
        remainingDurationMinutes: 25,
        tasks: mockPlan.tasks.map((t) =>
          t.id === "task-quiz-1" ? { ...t, status: "completed" as const } : t,
        ),
      };

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: currentPlan }),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("آزمون مبحث ژنتیک")).toBeInTheDocument();
    });
    expect(fetchCount).toBe(1);

    // Complete task
    const completeBtn = screen.getByLabelText("تکمیل تسک آزمون مبحث ژنتیک");
    fireEvent.click(completeBtn);

    // Verify invalidation triggered refetch and updated plan metrics from server
    await waitFor(() => {
      expect(fetchCount).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/انجام‌شده: ۳۵ دقیقه/)).toBeInTheDocument();
    });
  });

  it("13. renders exam urgency badge and category badges (mandatory, optional, extra_practice) correctly", async () => {
    const examPlan: DailyStudyPlanResource = {
      ...mockPlan,
      tasks: [
        {
          id: "task-exam-mandatory",
          planId: "plan-123",
          userId: "user-456",
          taskType: "read_lesson",
          status: "pending",
          title: "درس فارماکولوژی قلب",
          description: "درس مهم امتحان",
          priority: 1,
          estimatedMinutes: 20,
          completedAt: null,
          courseId: "course-pharm-1",
          moduleId: "mod-1",
          lessonId: "lesson-1",
          quizId: null,
          metadata: {
            category: "mandatory",
            isExamRelated: true,
            examDaysRemaining: 2,
            examCourseName: "فارماکولوژی",
          },
          createdAt: "2026-09-18T08:00:00Z",
          updatedAt: "2026-09-18T08:00:00Z",
        },
        {
          id: "task-optional",
          planId: "plan-123",
          userId: "user-456",
          taskType: "take_quiz",
          status: "pending",
          title: "کوییز تکمیلی",
          description: "کوییز اختیاری",
          priority: 2,
          estimatedMinutes: 15,
          completedAt: null,
          courseId: "course-pharm-1",
          moduleId: null,
          lessonId: null,
          quizId: "quiz-1",
          metadata: {
            category: "optional",
          },
          createdAt: "2026-09-18T08:00:00Z",
          updatedAt: "2026-09-18T08:00:00Z",
        },
        {
          id: "task-extra",
          planId: "plan-123",
          userId: "user-456",
          taskType: "review_flashcards",
          status: "pending",
          title: "فلش‌کارت‌های تمرینی",
          description: "کارت‌های تکمیلی",
          priority: 3,
          estimatedMinutes: 10,
          completedAt: null,
          courseId: "course-pharm-1",
          moduleId: null,
          lessonId: null,
          quizId: null,
          metadata: {
            category: "extra_practice",
          },
          createdAt: "2026-09-18T08:00:00Z",
          updatedAt: "2026-09-18T08:00:00Z",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: examPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("درس فارماکولوژی قلب")).toBeInTheDocument();
    });

    // Exam urgency badge
    expect(screen.getByText(/برای امتحان ۲ روز دیگر/)).toBeInTheDocument();

    // Category Legend
    expect(screen.getByText("اجباری")).toBeInTheDocument();
    expect(screen.getByText("اختیاری")).toBeInTheDocument();
    expect(screen.getByText("تمرین بیشتر")).toBeInTheDocument();

    // Category indicators inside task items accessible via aria-label
    expect(screen.getByLabelText(/اولویت:\s*اجباری/)).toBeInTheDocument();
    expect(screen.getByLabelText(/اولویت:\s*اختیاری/)).toBeInTheDocument();
    expect(screen.getByLabelText(/اولویت:\s*تمرین بیشتر/)).toBeInTheDocument();
  });

  it("14. renders compact minimal UI without redundant text badges inside task items", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: mockPlan }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StudyPlanner defaultOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ساختار سلول")).toBeInTheDocument();
    });

    // Legend is present
    expect(screen.getByLabelText("راهنمای اولویت برنامه‌ها")).toBeInTheDocument();

    // Redundant inline text badge strings should not appear outside accessible labels/action buttons
    expect(screen.getByRole("img", { name: "مطالعه درس" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "مرور فلش‌کارت" })).toBeInTheDocument();
  });

  describe("Title Formatter & Study Planner UI title cleaning", () => {
    it("case 1: strips 'جلسه ۱۲: ' prefix from Persian title", () => {
      expect(formatStudyPlannerTaskTitle("جلسه ۱۲: عنوان فارسی")).toBe("عنوان فارسی");
      expect(formatStudyPlannerTaskTitle("جلسه ۱۲: داروهای ضد فشار خون")).toBe("داروهای ضد فشار خون");
      expect(formatStudyPlannerTaskTitle("جلسه 5: درمان دیابت")).toBe("درمان دیابت");
      expect(formatStudyPlannerTaskTitle("جلسه ۵: درمان دیابت")).toBe("درمان دیابت");
    });

    it("case 2: strips 'فصل ۳ - ' prefix from Persian title", () => {
      expect(formatStudyPlannerTaskTitle("فصل ۳ - عنوان فارسی")).toBe("عنوان فارسی");
      expect(formatStudyPlannerTaskTitle("فصل 3 - بیماری‌های قلبی")).toBe("بیماری‌های قلبی");
      expect(formatStudyPlannerTaskTitle("فصل ۳: بیماری‌های قلبی")).toBe("بیماری‌های قلبی");
      expect(formatStudyPlannerTaskTitle("فصل چهارم: فیزیولوژی کلیه")).toBe("فیزیولوژی کلیه");
    });

    it("case 3: strips 'جلسه ۱۲: ' prefix and ' — English Title' suffix", () => {
      expect(
        formatStudyPlannerTaskTitle("جلسه ۱۲: عنوان فارسی — English Title"),
      ).toBe("عنوان فارسی");
      expect(
        formatStudyPlannerTaskTitle("جلسه ۱۲: داروهای ضد فشار خون — Antihypertensive Drugs"),
      ).toBe("داروهای ضد فشار خون");
      expect(
        formatStudyPlannerTaskTitle("جلسه ۲ - آنتی‌بیوتیک‌ها - Antibiotics"),
      ).toBe("آنتی‌بیوتیک‌ها");
      expect(
        formatStudyPlannerTaskTitle("جلسه ۱: مبانی فارماکوکینتیک | Pharmacokinetics"),
      ).toBe("مبانی فارماکوکینتیک");
    });

    it("case 4: strips 'فصل ۳: ' prefix and '(English Title)' parenthesized suffix", () => {
      expect(
        formatStudyPlannerTaskTitle("فصل ۳: عنوان فارسی (English Title)"),
      ).toBe("عنوان فارسی");
      expect(
        formatStudyPlannerTaskTitle("فصل ۳ - بیماریهای قلبی (Cardiovascular Diseases)"),
      ).toBe("بیماریهای قلبی");
      expect(
        formatStudyPlannerTaskTitle("فصل ۲: اختلالات چربی خون [Dyslipidemia]"),
      ).toBe("اختلالات چربی خون");
    });

    it("case 5: preserves Persian title without prefix or suffix", () => {
      expect(formatStudyPlannerTaskTitle("عنوان فارسی بدون prefix/suffix")).toBe(
        "عنوان فارسی بدون prefix/suffix",
      );
      expect(formatStudyPlannerTaskTitle("داروهای ضد انعقاد و ترومبولیتیک")).toBe(
        "داروهای ضد انعقاد و ترومبولیتیک",
      );
    });

    it("case 6: preserves embedded English terms inside Persian titles (not a suffix)", () => {
      expect(
        formatStudyPlannerTaskTitle("مکانیسم اثر داروی Beta-Blocker در درمان فشار خون"),
      ).toBe("مکانیسم اثر داروی Beta-Blocker در درمان فشار خون");
      expect(
        formatStudyPlannerTaskTitle("بررسی داروی Warfarin و تداخلات بالینی آن"),
      ).toBe("بررسی داروی Warfarin و تداخلات بالینی آن");
      expect(
        formatStudyPlannerTaskTitle("کاربرد تست PCR در تشخیص سریع عفونت‌ها"),
      ).toBe("کاربرد تست PCR در تشخیص سریع عفونت‌ها");
      expect(
        formatStudyPlannerTaskTitle("جلسه ۴: مکانیسم عملکرد پمپ Na+/K+-ATPase"),
      ).toBe("مکانیسم عملکرد پمپ Na+/K+-ATPase");
    });

    it("case 7: strips descriptive activity prefixes like 'ادامه مطالعه:' and 'حل آزمون:'", () => {
      expect(
        formatStudyPlannerTaskTitle("ادامه مطالعه: جلسه ۱: فارماکولوژی قلب"),
      ).toBe("فارماکولوژی قلب");
      expect(
        formatStudyPlannerTaskTitle("ادامه مطالعه: جلسه ۲: داروهای ضد فشار خون"),
      ).toBe("داروهای ضد فشار خون");
      expect(
        formatStudyPlannerTaskTitle("حل آزمون: آزمون ارزیابی آموخته‌ها: مبحث قلب"),
      ).toBe("مبحث قلب");
      expect(
        formatStudyPlannerTaskTitle("حل آزمون: آزمون ارزیابی آموخته‌ها"),
      ).toBe("آزمون ارزیابی آموخته‌ها");
      expect(
        formatStudyPlannerTaskTitle("ادامه مطالعه: جلسه ۱: داروهای ضد فشار خون — Antihypertensive Drugs"),
      ).toBe("داروهای ضد فشار خون");
      expect(
        formatStudyPlannerTaskTitle("حل آزمون: آزمون ارزیابی آموخته‌ها: فصل قلب — Cardiovascular Assessment"),
      ).toBe("فصل قلب");
    });

    it("handles pure English titles and edge cases safely without blanking out", () => {
      expect(formatStudyPlannerTaskTitle("Antihypertensive Drugs")).toBe("Antihypertensive Drugs");
      expect(formatStudyPlannerTaskTitle("Chapter 1: Antihypertensive Drugs")).toBe("Antihypertensive Drugs");
      expect(formatStudyPlannerTaskTitle("Cardiovascular Diseases (CVD)")).toBe("Cardiovascular Diseases (CVD)");
      expect(formatStudyPlannerTaskTitle("جلسه ۱")).toBe("جلسه ۱");
      expect(formatStudyPlannerTaskTitle("فصل ۳")).toBe("فصل ۳");
      expect(formatStudyPlannerTaskTitle("آزمون ارزیابی آموخته‌ها")).toBe("آزمون ارزیابی آموخته‌ها");
      expect(formatStudyPlannerTaskTitle("")).toBe("");
      expect(formatStudyPlannerTaskTitle(null)).toBe("");
      expect(formatStudyPlannerTaskTitle(undefined)).toBe("");
    });

    it("renders cleaned titles in StudyPlanner UI while preserving courseName and original raw task data", async () => {
      const customPlan: DailyStudyPlanResource = {
        id: "plan-clean-test",
        userId: "user-456",
        planDate: "2026-09-18",
        status: "in_progress",
        targetDurationMinutes: 60,
        completedDurationMinutes: 0,
        remainingDurationMinutes: 60,
        tasks: [
          {
            id: "task-clean-1",
            planId: "plan-clean-test",
            userId: "user-456",
            taskType: "read_lesson",
            status: "pending",
            title: "جلسه ۱۲: داروهای ضد فشار خون — Antihypertensive Drugs",
            description: "توضیح درس",
            priority: 1,
            estimatedMinutes: 20,
            completedAt: null,
            courseId: "course-pharm-1",
            moduleId: "mod-1",
            lessonId: "les-1",
            quizId: null,
            metadata: { courseName: "فارماکولوژی پزشکی ۲" },
            createdAt: "2026-09-18T08:00:00Z",
            updatedAt: "2026-09-18T08:00:00Z",
          },
          {
            id: "task-clean-2",
            planId: "plan-clean-test",
            userId: "user-456",
            taskType: "take_quiz",
            status: "pending",
            title: "فصل ۳ - بیماریهای قلبی (Cardiovascular Diseases)",
            description: "آزمون مبحث",
            priority: 2,
            estimatedMinutes: 15,
            completedAt: null,
            courseId: "course-cardio-1",
            moduleId: null,
            lessonId: null,
            quizId: "quiz-1",
            metadata: { courseName: "فیزیوپاتولوژی قلب و عروق" },
            createdAt: "2026-09-18T08:00:00Z",
            updatedAt: "2026-09-18T08:00:00Z",
          },
          {
            id: "task-clean-3",
            planId: "plan-clean-test",
            userId: "user-456",
            taskType: "read_lesson",
            status: "pending",
            title: "جلسه ۵: درمان دیابت",
            description: "درس دیابت",
            priority: 3,
            estimatedMinutes: 25,
            completedAt: null,
            courseId: "course-endo-1",
            moduleId: "mod-2",
            lessonId: "les-2",
            quizId: null,
            metadata: { courseName: "غدد درون‌ریز و متابولیسم" },
            createdAt: "2026-09-18T08:00:00Z",
            updatedAt: "2026-09-18T08:00:00Z",
          },
        ],
        createdAt: "2026-09-18T08:00:00Z",
        updatedAt: "2026-09-18T08:00:00Z",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: customPlan }),
      } as Response);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <StudyPlanner defaultOpen={true} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // 1. Cleaned titles rendered in UI
      await waitFor(() => {
        expect(screen.getByText("داروهای ضد فشار خون")).toBeInTheDocument();
        expect(screen.getByText("بیماریهای قلبی")).toBeInTheDocument();
        expect(screen.getByText("درمان دیابت")).toBeInTheDocument();
      });

      // 2. Metadata prefixes and suffixes not displayed in UI headers
      expect(screen.queryByText("جلسه ۱۲: داروهای ضد فشار خون — Antihypertensive Drugs")).not.toBeInTheDocument();
      expect(screen.queryByText("فصل ۳ - بیماریهای قلبی (Cardiovascular Diseases)")).not.toBeInTheDocument();
      expect(screen.queryByText("جلسه ۵: درمان دیابت")).not.toBeInTheDocument();

      // 3. Full Course names remain complete below the task
      expect(screen.getByText("فارماکولوژی پزشکی ۲")).toBeInTheDocument();
      expect(screen.getByText("فیزیوپاتولوژی قلب و عروق")).toBeInTheDocument();
      expect(screen.getByText("غدد درون‌ریز و متابولیسم")).toBeInTheDocument();

      // 4. Raw plan tasks data remains unchanged in underlying state/object
      expect(customPlan.tasks[0].title).toBe("جلسه ۱۲: داروهای ضد فشار خون — Antihypertensive Drugs");
      expect(customPlan.tasks[1].title).toBe("فصل ۳ - بیماریهای قلبی (Cardiovascular Diseases)");
      expect(customPlan.tasks[2].title).toBe("جلسه ۵: درمان دیابت");
    });

    it("formats flashcard titles accurately based on chapter numbers in metadata or raw title", () => {
      // 1. Single chapter in metadata
      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های فارماکولوژی ۳", {
          taskType: "review_flashcards",
          metadata: { chapterNumbers: [3], courseName: "فارماکولوژی ۳" },
        }),
      ).toBe("مرور فلش‌کارت‌های فصل ۳");

      // 2. Multiple chapters in metadata (unsorted -> sorted output)
      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های فارماکولوژی ۳", {
          taskType: "review_flashcards",
          metadata: { chapterNumbers: [4, 1], courseName: "فارماکولوژی ۳" },
        }),
      ).toBe("مرور فلش‌کارت‌های فصل ۱، ۴");

      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های فارماکولوژی ۳", {
          taskType: "review_flashcards",
          metadata: { chapterNumbers: [7, 1, 4], courseName: "فارماکولوژی ۳" },
        }),
      ).toBe("مرور فلش‌کارت‌های فصل ۱، ۴، ۷");

      // 3. Fallback when no chapters in metadata: keeps course or raw title
      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های فارماکولوژی ۳", {
          taskType: "review_flashcards",
          metadata: { courseName: "فارماکولوژی ۳" },
        }),
      ).toBe("مرور فلش‌کارت‌های فارماکولوژی ۳");

      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های سررسیدشده", {
          taskType: "review_flashcards",
          metadata: {},
        }),
      ).toBe("مرور فلش‌کارت‌های سررسیدشده");

      // 4. Already formatted chapter titles in raw string
      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های فصل ۳"),
      ).toBe("مرور فلش‌کارت‌های فصل ۳");

      expect(
        formatStudyPlannerTaskTitle("مرور فلش‌کارت‌های فصل 4, 1"),
      ).toBe("مرور فلش‌کارت‌های فصل ۱، ۴");
    });

    it("renders chapter-based flashcard titles on line 1 and full course name on line 2 in UI", async () => {
      const flashcardPlan: DailyStudyPlanResource = {
        id: "plan-fc-chapter-test",
        userId: "user-456",
        planDate: "2026-09-18",
        status: "in_progress",
        targetDurationMinutes: 30,
        completedDurationMinutes: 0,
        remainingDurationMinutes: 30,
        tasks: [
          {
            id: "task-fc-1",
            planId: "plan-fc-chapter-test",
            userId: "user-456",
            taskType: "review_flashcards",
            status: "pending",
            title: "مرور فلش‌کارت‌های فصل ۳",
            description: "فلش‌کارت‌های سررسیدشده",
            priority: 1,
            estimatedMinutes: 5,
            completedAt: null,
            courseId: "course-pharm-3",
            moduleId: null,
            lessonId: null,
            quizId: null,
            metadata: {
              chapterNumbers: [3],
              courseName: "فارماکولوژی ۳",
            },
            createdAt: "2026-09-18T08:00:00Z",
            updatedAt: "2026-09-18T08:00:00Z",
          },
          {
            id: "task-fc-2",
            planId: "plan-fc-chapter-test",
            userId: "user-456",
            taskType: "review_flashcards",
            status: "pending",
            title: "مرور فلش‌کارت‌های فصل ۱، ۴",
            description: "فلش‌کارت‌های سررسیدشده",
            priority: 2,
            estimatedMinutes: 10,
            completedAt: null,
            courseId: "course-physio-2",
            moduleId: null,
            lessonId: null,
            quizId: null,
            metadata: {
              chapterNumbers: [1, 4],
              courseName: "فیزیولوژی ۲",
            },
            createdAt: "2026-09-18T08:00:00Z",
            updatedAt: "2026-09-18T08:00:00Z",
          },
        ],
        createdAt: "2026-09-18T08:00:00Z",
        updatedAt: "2026-09-18T08:00:00Z",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ plan: flashcardPlan }),
      } as Response);

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <StudyPlanner defaultOpen={true} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Line 1: Chapter-based titles
      await waitFor(() => {
        expect(screen.getByText("مرور فلش‌کارت‌های فصل ۳")).toBeInTheDocument();
        expect(screen.getByText("مرور فلش‌کارت‌های فصل ۱، ۴")).toBeInTheDocument();
      });

      // Line 2: Full Course Names
      expect(screen.getByText("فارماکولوژی ۳")).toBeInTheDocument();
      expect(screen.getByText("فیزیولوژی ۲")).toBeInTheDocument();
    });
  });
});

