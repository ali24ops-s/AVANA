import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../providers/AuthProvider.js";
import { LearningPage } from "../pages/LearningPage.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizExperience } from "../components/quiz/QuizExperience.js";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";
import type {
  CourseLearnResponse,
  FlashcardResource,
  QuizResponse,
  QuizAttemptResult,
  StudyAnalyticsResponse,
  StudyRecommendationsResponse,
} from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("PR6-9B: End-to-End Student Learning Journey", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";
  const quizId = "00000000-0000-0000-0000-000000000003";
  const lessonId = "00000000-0000-0000-0000-000000000004";

  const mockCurriculum: CourseLearnResponse = {
    request_id: "req-curriculum",
    course: {
      id: courseId,
      title: "Human Cardiovascular System",
      subject: "Cardiology",
      exam_at: null,
    },
    modules: [
      {
        id: "mod-1",
        title: "Cardiac Electrophysiology",
        description: "Electrical conduction in myocardium",
        sort_order: 0,
        lessons: [
          {
            id: lessonId,
            module_id: "mod-1",
            title: "The Sinoatrial Node & Pacemaker Cells",
            content_type: "markdown",
            content_markdown: "# The Sinoatrial Node\n\nThe SA node generates action potentials spontaneously at 60-100 bpm.",
            sort_order: 0,
            estimated_minutes: 10,
            completed: false,
            completed_at: null,
          },
        ],
      },
    ],
    progress: {
      total_lessons: 1,
      completed_lessons: 0,
      progress_percent: 0,
    },
  };

  const mockDueFlashcards: FlashcardResource[] = [
    {
      id: "fc-card-1",
      organization_id: orgId,
      course_id: courseId,
      document_id: "doc-1",
      generated_content_id: null,
      card_type: "concept",
      difficulty: "medium",
      question: "Which node is the primary pacemaker of the human heart?",
      answer: "Sinoatrial (SA) node",
      explanation: "Located in the right atrium near the superior vena cava.",
      interval_days: 1,
      ease_factor: 2.5,
      due_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockQuizDetail: QuizResponse = {
    request_id: "req-quiz-detail",
    quiz: {
      id: quizId,
      organization_id: orgId,
      course_id: courseId,
      document_id: "doc-1",
      title: "Cardiovascular Mastery Assessment",
      status: "published",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          id: "q-1",
          quiz_id: quizId,
          generated_content_id: null,
          question: "What is the intrinsic firing rate of the SA node?",
          question_type: "multiple_choice",
          choices: ["20-40 bpm", "40-60 bpm", "60-100 bpm", "100-120 bpm"],
          correct_answer: "60-100 bpm",
          explanation: "The normal intrinsic pacemaker rate is 60 to 100 beats per minute.",
          sort_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    },
  };

  const mockAttemptResult: QuizAttemptResult = {
    attemptId: "attempt-1",
    quizId: quizId,
    score: 100,
    correct: 1,
    total: 1,
    answers: { "q-1": "60-100 bpm" },
    completedAt: new Date().toISOString(),
  };

  const mockAnalytics: StudyAnalyticsResponse = {
    request_id: "req-analytics",
    analytics: {
      total_lessons: 5,
      completed_lessons: 3,
      lesson_progress_percent: 60,
      total_flashcards: 20,
      reviewed_flashcards: 16,
      flashcard_mastery_percent: 80,
      total_quizzes: 2,
      attempts_taken: 3,
      average_quiz_score: 88,
      weak_areas: ["Coronary Circulation"],
      recommended_next_steps: ["Review 4 due flashcards on Coronary Arteries"],
    },
  };

  const mockRecommendations: StudyRecommendationsResponse = {
    request_id: "req-recs",
    recommendations: [
      {
        id: "rec-1",
        source: "flashcard_review",
        summary: "Review Cardiac Electrophysiology flashcards",
        topics: ["SA Node", "Action Potentials"],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Journey Step 1 & 2: Course Discovery & Learning Hub Entry
  // -------------------------------------------------------------------------
  it("renders course list and allows student to select course and enter Learning hub", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/organizations/") && urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-courses",
                items: [
                  {
                    id: courseId,
                    organization_id: orgId,
                    title: "Human Cardiovascular System",
                    code: "BIO301",
                    description: "Anatomy of the heart",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                ],
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Medical Academy", slug: "med-acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ request_id: "req-def" })),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses"]}>
          <AuthProvider>
            <CourseListPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Human Cardiovascular System")).toBeDefined();
    });

    const courseLink = screen.getByRole("link", { name: /human cardiovascular system/i });
    expect(courseLink.getAttribute("href")).toBe(`/courses/${courseId}`);
  });

  // -------------------------------------------------------------------------
  // Journey Step 3 & 4: Curriculum Loading, Lesson Reading, and Completion
  // -------------------------------------------------------------------------
  it("loads curriculum, renders lesson markdown, and marks lesson complete with query invalidation", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      const method = opts?.method || "GET";

      if (urlStr.includes("/progress") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-progress",
                progress: {
                  lesson_id: lessonId,
                  completed: true,
                  completed_at: new Date().toISOString(),
                },
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCurriculum)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Medical Academy", slug: "med-acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify curriculum & markdown content loaded
    await waitFor(() => {
      expect(
        screen.getByText(/generates action potentials spontaneously at 60-100 bpm/i),
      ).toBeDefined();
    });

    // Mark as complete
    const completeButton = screen.getByRole("button", { name: /ثبت به عنوان خوانده‌شده/i });
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["course-learning", courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["study-analytics", orgId, courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["study-recommendations", orgId, courseId],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Journey Step 5 & 6: Flashcards Tab, Flip, Rating & Invalidation
  // -------------------------------------------------------------------------
  it("allows flashcard review, keyboard flipping, rating submission, and invalidates study queries", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      const method = opts?.method || "GET";

      if (urlStr.includes("/review") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-rev",
                success: true,
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("flashcards/review-queue") || urlStr.includes("flashcards/queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-q",
                due_cards: mockDueFlashcards,
                flashcards: mockDueFlashcards,
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("flashcards")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-fc",
                due_cards: mockDueFlashcards,
                flashcards: mockDueFlashcards,
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience organizationId={orgId} courseId={courseId} />
      </QueryClientProvider>,
    );

    // Verify question is displayed
    await waitFor(() => {
      expect(
        screen.getByText("Which node is the primary pacemaker of the human heart?"),
      ).toBeDefined();
    });

    // Flip card via keyboard Enter
    screen.getByRole("button", { name: /سوال فلش‌کارت/i });
    fireEvent.keyDown(window, { key: "Enter" });

    // Verify answer is visible
    await waitFor(() => {
      expect(screen.getByText("Sinoatrial (SA) node")).toBeDefined();
    });

    // Rate "Good"
    const goodRatingButton = screen.getByRole("button", { name: /خوب/i });
    fireEvent.click(goodRatingButton);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["flashcards", orgId, courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["flashcards-queue", orgId, courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["study-analytics", orgId, courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["study-recommendations", orgId, courseId],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Journey Step 7 & 8: Quizzes Tab, Taking Quiz, Submitting, and Reviewing
  // -------------------------------------------------------------------------
  it("allows selecting a quiz, taking it, submitting attempt, and reviewing scored results", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      const method = opts?.method || "GET";

      if (urlStr.includes("/attempts") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-submit-quiz",
                attempt: mockAttemptResult,
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("/quizzes/") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockQuizDetail)),
        } as unknown as Response);
      }
      if (urlStr.includes("/quizzes")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-quizzes",
                quizzes: [mockQuizDetail.quiz],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience organizationId={orgId} courseId={courseId} quizId={quizId} />
      </QueryClientProvider>,
    );

    // Verify question is loaded
    await waitFor(() => {
      expect(screen.getByText("What is the intrinsic firing rate of the SA node?")).toBeDefined();
      expect(screen.getByText("60-100 bpm")).toBeDefined();
    });

    // Select choice "60-100 bpm"
    const choiceButton = screen.getByRole("button", { name: /60-100 bpm/i });
    fireEvent.click(choiceButton);
    expect(choiceButton.getAttribute("aria-pressed")).toBe("true");

    // Submit Quiz
    const submitBtn = screen.getByRole("button", { name: /ثبت و پایان آزمون/i });
    fireEvent.click(submitBtn);

    // Verify results view and query invalidations
    await waitFor(() => {
      expect(screen.getByText("آزمون با موفقیت گذرانده شد!")).toBeDefined();
      expect(screen.getByText("100%")).toBeDefined();
      expect(screen.getByText("مرور سوالات و پاسخ‌ها")).toBeDefined();
      expect(screen.getByText(/normal intrinsic pacemaker rate is 60 to 100/i)).toBeDefined();
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["quizzes", orgId, courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["study-analytics", orgId, courseId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["study-recommendations", orgId, courseId],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Journey Step 9 & 10: Analytics, Weak Areas, Recommendations & Tab Routing
  // -------------------------------------------------------------------------
  it("renders study analytics KPIs, identified weak areas, and routes to recommended study sessions", async () => {
    const queryClient = createTestQueryClient();
    const onNavigateTab = vi.fn();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/study/analytics")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockAnalytics)),
        } as unknown as Response);
      }
      if (urlStr.includes("/study/recommendations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockRecommendations)),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudyAnalyticsView
          organizationId={orgId}
          courseId={courseId}
          onNavigateToTab={onNavigateTab}
        />
      </QueryClientProvider>,
    );

    // Verify analytics values and progressbars
    await waitFor(() => {
      expect(screen.getByText("60%")).toBeDefined(); // Lesson progress
      expect(screen.getByText("80%")).toBeDefined(); // Flashcard mastery
      expect(screen.getByText("88%")).toBeDefined(); // Quiz average
      expect(screen.getByText("Coronary Circulation")).toBeDefined(); // Weak area
      expect(screen.getByText("Review Cardiac Electrophysiology flashcards")).toBeDefined();
    });

    // Click "Start Recommended Session"
    const startSessionButton = screen.getByRole("button", {
      name: /شروع تمرین پیشنهادی/i,
    });
    fireEvent.click(startSessionButton);

    expect(onNavigateTab).toHaveBeenCalledWith("flashcards");
  });

  // -------------------------------------------------------------------------
  // Deep-Link & URL Tab Parameter Sanitization
  // -------------------------------------------------------------------------
  it("sanitizes invalid query tab parameters and renders lessons by default", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCurriculum)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Medical Academy", slug: "med-acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}?tab=unknown_invalid_tab`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify it smoothly falls back to Lessons tab
    await waitFor(() => {
      expect(
        screen.getByText(/generates action potentials spontaneously at 60-100 bpm/i),
      ).toBeDefined();
      expect(screen.getByText("سرفصل‌های دوره")).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error Recovery & Retry
  // -------------------------------------------------------------------------
  it("provides retry button on learning page error", async () => {
    const queryClient = createTestQueryClient();
    let callCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Internal Server Error"),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCurriculum)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Medical Academy", slug: "med-acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify error state
    await waitFor(() => {
      expect(screen.getByText("خطا در بارگذاری محتوای دوره")).toBeDefined();
    });

    // Click Retry
    const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/i });
    fireEvent.click(retryBtn);

    // Verify recovery
    await waitFor(() => {
      expect(
        screen.getByText(/generates action potentials spontaneously at 60-100 bpm/i),
      ).toBeDefined();
    });
  });
});
