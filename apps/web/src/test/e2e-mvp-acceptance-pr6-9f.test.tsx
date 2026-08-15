/**
 * PR6-9F — E2E / MVP Acceptance Integration Tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { LearningPage } from "../pages/LearningPage.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizExperience } from "../components/quiz/QuizExperience.js";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import { SignInPage } from "../components/shell/SignInPage.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

describe("PR6-9F — E2E / MVP Acceptance", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function setupAuthFetchMock() {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/v1/auth/me")) {
        const payload = {
          user: { id: "user-1", email: "student@example.com", name: "Student User" },
          memberships: [
            { id: "mem-1", organizationId: orgId, role: "organization_admin" },
          ],
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/learn")) {
        const payload = {
          request_id: "req-learn",
          course: { id: courseId, title: "Cardiology 101", subject: "Biology", exam_at: null },
          modules: [
            {
              id: "mod-1",
              title: "Module 1",
              lessons: [
                {
                  id: "les-1",
                  title: "Intro Lesson",
                  content_markdown: "Lesson markdown",
                  completed: false,
                },
              ],
            },
          ],
          progress: { total_lessons: 1, completed_lessons: 0, percent: 0 },
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/organizations") && urlStr.includes("/courses")) {
        const payload = {
          items: [{ id: courseId, title: "Cardiology 101", subject: "Biology" }],
          pagination: { limit: 10, next_cursor: null },
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/organizations")) {
        const payload = {
          items: [{ id: orgId, name: "Avana University" }],
          pagination: { limit: 10, next_cursor: null },
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/flashcards")) {
        const payload = {
          request_id: "req-fc",
          items: [],
          due_count: 0,
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/quizzes/")) {
        const payload = {
          request_id: "req-qz-detail",
          quiz: { id: "qz-1", title: "Sample Quiz" },
          questions: [],
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/quizzes")) {
        const payload = {
          request_id: "req-qz",
          items: [{ id: "qz-1", title: "Cardiology Quiz", question_count: 5 }],
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/study/analytics")) {
        const payload = {
          request_id: "req-an",
          analytics: {
            total_lessons: 5,
            completed_lessons: 2,
            lesson_progress_percent: 40,
            total_flashcards: 10,
            reviewed_flashcards: 5,
            flashcard_mastery_percent: 50,
            total_quizzes: 1,
            attempts_taken: 1,
            average_quiz_score: 90,
            weak_areas: [],
            recommended_next_steps: ["Review flashcards"],
          },
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/study/recommendations")) {
        const payload = {
          request_id: "req-rec",
          recommendations: [],
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      if (urlStr.includes("/documents")) {
        const payload = {
          items: [],
          pagination: { limit: 10, next_cursor: null },
        };
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
          json: () => Promise.resolve(payload),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
        json: () => Promise.resolve({}),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response;
    });
  }

  // -------------------------------------------------------------------------
  // 1. Authentication Journey
  // -------------------------------------------------------------------------
  describe("Authentication Journey", () => {
    it("renders sign-in page", async () => {
      const queryClient = createTestQueryClient();
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { code: "unauthorized" } })),
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
        headers: new Headers(),
      }) as Response);

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={["/sign-in"]}>
              <SignInPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/ایمیل/i)).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. URL Deep-Linking & Tab Navigation
  // -------------------------------------------------------------------------
  describe("URL Deep-Linking & Tab Navigation", () => {
    it("supports deep-linking to learning page tabs via query parameters", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/learn?tab=flashcards`]}>
              <Routes>
                <Route path="/courses/:courseId/learn" element={<LearningPage />} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/فلش‌کارت‌ها/i)).toBeInTheDocument();
      });
    });

    it("falls back gracefully when given an invalid tab parameter", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/learn?tab=unknown_tab`]}>
              <Routes>
                <Route path="/courses/:courseId/learn" element={<LearningPage />} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("Cardiology 101")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Complete Student Learning Experience Component Integration
  // -------------------------------------------------------------------------
  describe("Student Experience Components Integration", () => {
    it("renders course list page", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={["/courses"]}>
              <CourseListPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/cardiology 101/i)).toBeInTheDocument();
      });
    });

    it("renders flashcard experience component", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/learn?tab=flashcards`]}>
              <FlashcardExperience organizationId={orgId} courseId={courseId} />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/تازه‌سازی صف مرور/i)).toBeInTheDocument();
      });
    });

    it("renders quiz experience component", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/learn?tab=quizzes`]}>
              <QuizExperience organizationId={orgId} courseId={courseId} quizId="quiz-1" />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("سوالی برای این آزمون یافت نشد")).toBeInTheDocument();
      });
    });

    it("renders study analytics component", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/learn?tab=analytics`]}>
              <StudyAnalyticsView organizationId={orgId} courseId={courseId} />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByText("در حال حاضر پیشنهاد جدیدی برای این دوره ثبت نشده است."),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Course Manager Component Integration
  // -------------------------------------------------------------------------
  describe("Course Manager Workflow Components Integration", () => {
    it("renders documents management view", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/manage?tab=documents`]}>
              <CourseDocumentsView organizationId={orgId} courseId={courseId} />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("هنوز سندی بارگذاری نشده است")).toBeInTheDocument();
      });
    });

    it("renders review queue list with filter buttons", async () => {
      setupAuthFetchMock();
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/courses/${courseId}/manage?tab=review`]}>
              <ReviewQueueList organizationId={orgId} courseId={courseId} />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /همه/i })).toBeInTheDocument();
      });
    });
  });
});
