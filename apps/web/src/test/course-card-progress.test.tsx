import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseListPage } from "../pages/CourseListPage.js";
import { CourseCard } from "../components/avana/CourseCard.js";
import { AuthProvider } from "../providers/AuthProvider.js";

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("avana_auth_token", "test-token");
  }
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("CourseCard UI — Progress Bar & Lesson Count (CourseListPage)", () => {
  const orgId = "org-progress-123";
  const courseId = "course-progress-456";

  it("renders progress bar percentage and real lesson count instead of hardcoded labels", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();

      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
                memberships: [{ organization_id: orgId, role: "student" }],
              }),
            ),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [{ id: orgId, name: "دانشکده پزشکی" }],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                items: [{ id: orgId, name: "دانشکده پزشکی" }],
              }),
            ),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-courses",
              items: [
                {
                  id: courseId,
                  organization_id: orgId,
                  title: "فیزیولوژی عمومی",
                  subject: null,
                  exam_at: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  archived: false,
                },
              ],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-courses",
                items: [
                  {
                    id: courseId,
                    organization_id: orgId,
                    title: "فیزیولوژی عمومی",
                    subject: null,
                    exam_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    archived: false,
                  },
                ],
              }),
            ),
        } as Response);
      }

      if (urlStr.includes(`/v1/courses/${courseId}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course_id: courseId,
              total_lessons: 12,
              completed_lessons: 8,
              percentage: 67,
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                course_id: courseId,
                total_lessons: 12,
                completed_lessons: 8,
                percentage: 67,
              }),
            ),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(JSON.stringify({})),
      } as Response);
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

    // Wait for course card to load title
    await waitFor(() => {
      expect(screen.getByText("فیزیولوژی عمومی")).toBeDefined();
    });

    // Verify progress percentage is rendered (67% / ۶۷٪)
    await waitFor(() => {
      expect(screen.getByText(/67%|۶۷٪/)).toBeDefined();
    });

    // Verify total lesson count is rendered (12 درس / ۱۲ درس)
    expect(screen.getByText(/12|۱۲\s*درس/)).toBeDefined();

    // Verify old labels "دوره تخصصی" and "آماده یادگیری" are NOT present in the course card
    expect(screen.queryByText("دوره تخصصی")).toBeNull();
    expect(screen.queryByText("آماده یادگیری")).toBeNull();

    // Verify progress bar accessibility role and attributes
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("67");
  });

  it("renders modules, lessons, flashcards, and quiz questions metadata accurately with Persian numerals", () => {
    render(
      <MemoryRouter>
        <CourseCard
          id="course-test-stats"
          title="فارماکولوژی بالینی"
          subject="داروسازی"
          stats={{
            moduleCount: 12,
            lessonCount: 48,
            flashcardCount: 320,
            quizQuestionCount: 180,
          }}
          access={{ hasAccess: true, isPurchased: true }}
        />
      </MemoryRouter>,
    );

    // Verify Persian numeral counts and text
    const moduleEl = screen.getByText(/۱۲\s*فصل/);
    expect(moduleEl).toBeDefined();
    expect(screen.getByText(/۴۸\s*درسنامه/)).toBeDefined();
    expect(screen.getByText(/۳۲۰\s*فلش‌کارت/)).toBeDefined();
    expect(screen.getByText(/۱۸۰\s*سؤال/)).toBeDefined();

    // Verify 2x2 CSS Grid container
    const gridContainer = moduleEl.closest(".grid");
    expect(gridContainer).not.toBeNull();
    expect(gridContainer?.className).toContain("grid-cols-2");
  });

  it("does not render flashcard or quiz stats when count is undefined or 0", () => {
    render(
      <MemoryRouter>
        <CourseCard
          id="course-test-no-stats"
          title="آناتومی پایه"
          stats={{
            moduleCount: 4,
            lessonCount: 10,
          }}
          access={{ hasAccess: true }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/۴\s*فصل/)).toBeDefined();
    expect(screen.getByText(/۱۰\s*درسنامه/)).toBeDefined();
    expect(screen.queryByText(/فلش‌کارت/)).toBeNull();
    expect(screen.queryByText(/سؤال/)).toBeNull();
  });
});
