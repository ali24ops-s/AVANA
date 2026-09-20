import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReviewPage } from "../pages/ReviewPage.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { StudyPlanner } from "../components/planner/StudyPlanner.js";
import type { DailyStudyPlanResource, FlashcardResource } from "@avana/contracts";

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-scoped-1", email: "student@example.com" },
    memberships: [{ organization_id: "org-scoped-100", role: "student" }],
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Study Planner & Flashcards Strict Course Scoping", () => {
  const mockOrgId = "org-scoped-100";
  const courseA = "course-bio-101";
  const courseB = "course-chem-202";

  const cardsCourseA: FlashcardResource[] = [
    {
      id: "fc-bio-001",
      organization_id: mockOrgId,
      course_id: courseA,
      document_id: "doc-bio-1",
      generated_content_id: null,
      lesson_id: "lesson-bio-1",
      question: "زیست: میتوکندری چیست؟",
      answer: "اندامک تولید انرژی سلول",
      explanation: "تولیدکننده ATP",
      card_type: "concept",
      difficulty: "easy",
      due_at: new Date().toISOString(),
      interval_days: 1,
      ease_factor: 2.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "fc-bio-002",
      organization_id: mockOrgId,
      course_id: courseA,
      document_id: "doc-bio-1",
      generated_content_id: null,
      lesson_id: "lesson-bio-1",
      question: "زیست: ریبوزوم چه وظیفه‌ای دارد؟",
      answer: "سنتز پروتئین در سلول",
      explanation: "ترجمه RNA به پروتئین",
      card_type: "concept",
      difficulty: "medium",
      due_at: new Date().toISOString(),
      interval_days: 1,
      ease_factor: 2.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const cardsCourseB: FlashcardResource[] = [
    {
      id: "fc-chem-001",
      organization_id: mockOrgId,
      course_id: courseB,
      document_id: "doc-chem-1",
      generated_content_id: null,
      lesson_id: "lesson-chem-1",
      question: "شیمی: عدد آووگادرو چیست؟",
      answer: "۶.۰۲۲ ضرب در ۱۰ به توان ۲۳",
      explanation: "تعداد ذرات در یک مول ماده",
      card_type: "concept",
      difficulty: "easy",
      due_at: new Date().toISOString(),
      interval_days: 2,
      ease_factor: 2.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockStudyPlan: DailyStudyPlanResource = {
    id: "plan-scope-1",
    userId: "user-scoped-1",
    planDate: "2026-09-19",
    status: "in_progress",
    targetDurationMinutes: 45,
    completedDurationMinutes: 0,
    remainingDurationMinutes: 45,
    tasks: [
      {
        id: "task-flashcards-course-a",
        planId: "plan-scope-1",
        userId: "user-scoped-1",
        taskType: "review_flashcards",
        status: "pending",
        title: "مرور فلش‌کارت‌های زیست‌شناسی",
        description: "دوره زیست سلولی",
        priority: 1,
        estimatedMinutes: 15,
        completedAt: null,
        courseId: courseA,
        moduleId: null,
        lessonId: null,
        quizId: null,
        metadata: { courseName: "زیست‌شناسی پایه" },
        createdAt: "2026-09-19T08:00:00Z",
        updatedAt: "2026-09-19T08:00:00Z",
      },
      {
        id: "task-flashcards-course-b",
        planId: "plan-scope-1",
        userId: "user-scoped-1",
        taskType: "review_flashcards",
        status: "pending",
        title: "مرور فلش‌کارت‌های شیمی عمومی",
        description: "دوره شیمی آلی و عمومی",
        priority: 2,
        estimatedMinutes: 15,
        completedAt: null,
        courseId: courseB,
        moduleId: null,
        lessonId: null,
        quizId: null,
        metadata: { courseName: "شیمی عمومی" },
        createdAt: "2026-09-19T08:00:00Z",
        updatedAt: "2026-09-19T08:00:00Z",
      },
    ],
    createdAt: "2026-09-19T08:00:00Z",
    updatedAt: "2026-09-19T08:00:00Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("1. StudyPlanner generates separate distinct direct links for Course A and Course B tasks", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ plan: mockStudyPlan }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
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
      expect(screen.getByText("مرور فلش‌کارت‌های زیست‌شناسی")).toBeInTheDocument();
      expect(screen.getByText("مرور فلش‌کارت‌های شیمی عمومی")).toBeInTheDocument();
    });

    const links = screen.getAllByRole("link", { name: /شروع مرور/i });
    expect(links).toHaveLength(2);

    // Course A task links strictly to Course A review scope
    expect(links[0]).toHaveAttribute("href", `/flashcards/review?courses=${courseA}`);

    // Course B task links strictly to Course B review scope
    expect(links[1]).toHaveAttribute("href", `/flashcards/review?courses=${courseB}`);
  });

  it("2. Entering review for Course A fetches and displays ONLY Course A cards; Course B cards never appear", async () => {
    const fetchedUrls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("review-queue") && !urlStr.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: mockOrgId, name: "Test Org" }] }),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && urlStr.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            courses: [
              { course_id: courseA, title: "زیست‌شناسی پایه", total_cards: 2, due_cards: 2 },
              { course_id: courseB, title: "شیمی عمومی", total_cards: 1, due_cards: 1 },
            ],
          }),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${mockOrgId}/study/flashcards/review-queue`)) {
        // Verify that when courses=courseA is requested, only courseA cards are returned
        const params = new URL(urlStr, "http://localhost").searchParams;
        const requestedCourses = params.get("courseIds")?.split(",") || [];

        let returnedCards: FlashcardResource[] = [];
        if (requestedCourses.includes(courseA)) {
          returnedCards = cardsCourseA;
        } else if (requestedCourses.includes(courseB)) {
          returnedCards = cardsCourseB;
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ due_cards: returnedCards, items: returnedCards }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/flashcards/review?courses=${courseA}`]}>
          <Routes>
            <Route path="/flashcards/review" element={<ReviewPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify course A query was sent with courseIds=course-bio-101
    await waitFor(() => {
      expect(
        fetchedUrls.some((u) => u.includes("courseIds=course-bio-101")),
      ).toBe(true);
    });

    // Course A cards are rendered
    await waitFor(() => {
      expect(screen.getByText("زیست: میتوکندری چیست؟")).toBeInTheDocument();
    });

    // Verify Course B card is STRICTLY NOT in the DOM
    expect(screen.queryByText("شیمی: عدد آووگادرو چیست؟")).not.toBeInTheDocument();
  });

  it("3. Entering review for Course B fetches and displays ONLY Course B cards; Course A cards never appear", async () => {
    const fetchedUrls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("review-queue") && !urlStr.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: mockOrgId, name: "Test Org" }] }),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && urlStr.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            courses: [
              { course_id: courseA, title: "زیست‌شناسی پایه", total_cards: 2, due_cards: 2 },
              { course_id: courseB, title: "شیمی عمومی", total_cards: 1, due_cards: 1 },
            ],
          }),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${mockOrgId}/study/flashcards/review-queue`)) {
        const params = new URL(urlStr, "http://localhost").searchParams;
        const requestedCourses = params.get("courseIds")?.split(",") || [];

        let returnedCards: FlashcardResource[] = [];
        if (requestedCourses.includes(courseA)) {
          returnedCards = cardsCourseA;
        } else if (requestedCourses.includes(courseB)) {
          returnedCards = cardsCourseB;
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ due_cards: returnedCards, items: returnedCards }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/flashcards/review?courses=${courseB}`]}>
          <Routes>
            <Route path="/flashcards/review" element={<ReviewPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify course B query was sent with courseIds=course-chem-202
    await waitFor(() => {
      expect(
        fetchedUrls.some((u) => u.includes("courseIds=course-chem-202")),
      ).toBe(true);
    });

    // Course B cards are rendered
    await waitFor(() => {
      expect(screen.getByText("شیمی: عدد آووگادرو چیست؟")).toBeInTheDocument();
    });

    // Verify Course A cards are STRICTLY NOT in the DOM
    expect(screen.queryByText("زیست: میتوکندری چیست؟")).not.toBeInTheDocument();
    expect(screen.queryByText("زیست: ریبوزوم چه وظیفه‌ای دارد؟")).not.toBeInTheDocument();
  });

  it("4. Review ratings (SRS) are submitted with correct targetCourseId and cardId without cross-course interference", async () => {
    let submittedReviewUrl = "";
    let submittedReviewBody: Record<string, unknown> | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);

      if (init?.method === "POST" && urlStr.includes("/review")) {
        submittedReviewUrl = urlStr;
        submittedReviewBody = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            flashcard_id: "fc-bio-001",
            interval_days: 3,
            ease_factor: 2.6,
            due_at: new Date().toISOString(),
          }),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${mockOrgId}/study/flashcards/review-queue`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ due_cards: cardsCourseA, items: cardsCourseA }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience
          organizationId={mockOrgId}
          courseIds={[courseA]}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("زیست: میتوکندری چیست؟")).toBeInTheDocument();
    });

    // Flip card to reveal answer and SRS buttons
    fireEvent.click(screen.getByText("زیست: میتوکندری چیست؟"));

    await waitFor(() => {
      expect(screen.getByText("اندامک تولید انرژی سلول")).toBeInTheDocument();
    });

    // Rate "Good" (خوب)
    const goodButton = screen.getByRole("button", { name: /خوب/i });
    fireEvent.click(goodButton);

    await waitFor(() => {
      expect(submittedReviewUrl).toContain(
        `/v1/organizations/${mockOrgId}/courses/${courseA}/flashcards/fc-bio-001/review`,
      );
      expect(submittedReviewBody).toMatchObject({
        rating: "good",
      });
    });
  });

  it("5. StudyPlanner renders full course name under task title for read_lesson, take_quiz, and review_flashcards tasks", async () => {
    const multiTypePlan: DailyStudyPlanResource = {
      id: "plan-multitype-1",
      userId: "user-scoped-1",
      planDate: "2026-09-19",
      status: "in_progress",
      targetDurationMinutes: 60,
      completedDurationMinutes: 0,
      remainingDurationMinutes: 60,
      tasks: [
        {
          id: "task-lesson-1",
          planId: "plan-multitype-1",
          userId: "user-scoped-1",
          taskType: "read_lesson",
          status: "pending",
          title: "جلسه ۱۲: ساختار غشای سلولی (Cell Membrane Structure)",
          description: "درس در دوره «زیست‌شناسی سلولی»",
          priority: 1,
          estimatedMinutes: 20,
          completedAt: null,
          courseId: "course-bio-1",
          moduleId: "mod-1",
          lessonId: "lesson-1",
          quizId: null,
          metadata: { courseName: "زیست‌شناسی سلولی" },
          createdAt: "2026-09-19T08:00:00Z",
          updatedAt: "2026-09-19T08:00:00Z",
        },
        {
          id: "task-quiz-1",
          planId: "plan-multitype-1",
          userId: "user-scoped-1",
          taskType: "take_quiz",
          status: "pending",
          title: "فصل ۳ - آزمون فارماکوکینتیک — Pharmacokinetics",
          description: "آزمون مبحثی در دوره «فارماکولوژی پایه»",
          priority: 2,
          estimatedMinutes: 15,
          completedAt: null,
          courseId: "course-pharm-1",
          moduleId: "mod-2",
          lessonId: null,
          quizId: "quiz-1",
          metadata: { courseName: "فارماکولوژی پایه" },
          createdAt: "2026-09-19T08:00:00Z",
          updatedAt: "2026-09-19T08:00:00Z",
        },
        {
          id: "task-flashcard-1",
          planId: "plan-multitype-1",
          userId: "user-scoped-1",
          taskType: "review_flashcards",
          status: "pending",
          title: "مرور فلش‌کارت‌های داروهای ضد فشار خون",
          description: "۱۵ فلش‌کارت آماده مرور در دوره «فارماکولوژی ۲».",
          priority: 3,
          estimatedMinutes: 15,
          completedAt: null,
          courseId: "course-pharm-2",
          moduleId: null,
          lessonId: null,
          quizId: null,
          metadata: { courseName: "فارماکولوژی ۲" },
          createdAt: "2026-09-19T08:00:00Z",
          updatedAt: "2026-09-19T08:00:00Z",
        },
        {
          id: "task-flashcard-2",
          planId: "plan-multitype-1",
          userId: "user-scoped-1",
          taskType: "review_flashcards",
          status: "pending",
          title: "مرور فلش‌کارت‌های بیماری‌های قلبی",
          description: "۱۰ فلش‌کارت آماده مرور در دوره «فیزیولوژی ۲».",
          priority: 4,
          estimatedMinutes: 10,
          completedAt: null,
          courseId: "course-physio-2",
          moduleId: null,
          lessonId: null,
          quizId: null,
          metadata: { courseName: "فیزیولوژی ۲" },
          createdAt: "2026-09-19T08:00:00Z",
          updatedAt: "2026-09-19T08:00:00Z",
        },
      ],
      createdAt: "2026-09-19T08:00:00Z",
      updatedAt: "2026-09-19T08:00:00Z",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ plan: multiTypePlan }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
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
      // 1. Check cleaned/formatted task titles
      expect(screen.getByText("ساختار غشای سلولی")).toBeInTheDocument();
      expect(screen.getByText("آزمون فارماکوکینتیک")).toBeInTheDocument();
      expect(screen.getByText("مرور فلش‌کارت‌های داروهای ضد فشار خون")).toBeInTheDocument();
      expect(screen.getByText("مرور فلش‌کارت‌های بیماری‌های قلبی")).toBeInTheDocument();
    });

    // 2. Check full course names rendered under respective task titles
    expect(screen.getByText("زیست‌شناسی سلولی")).toBeInTheDocument();
    expect(screen.getByText("فارماکولوژی پایه")).toBeInTheDocument();
    expect(screen.getByText("فارماکولوژی ۲")).toBeInTheDocument();
    expect(screen.getByText("فیزیولوژی ۲")).toBeInTheDocument();
  });
});
