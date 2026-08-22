import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../providers/AuthProvider.js";
import { LearningPage } from "../pages/LearningPage.js";
import type { CourseLearnResponse } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Course Lesson Study Page UI/UX Refinements", () => {
  const orgId = "org-test-123";
  const courseId = "course-test-123";
  const lesson1Id = "lesson-1";
  const lesson2Id = "lesson-2";
  const lesson3Id = "lesson-3";

  const mockCurriculumData: CourseLearnResponse = {
    request_id: "req-curriculum-test",
    course: {
      id: courseId,
      title: "فیزیولوژی قلب و عروق",
      subject: "پزشکی عمومی",
      exam_at: "2026-09-15T09:00:00.000Z",
    },
    modules: [
      {
        id: "mod-1",
        title: "فصل اول: الکتروفیزیولوژی قلب",
        description: "مبانی پتانسیل عمل و هدایت قلبی",
        sort_order: 0,
        lessons: [
          {
            id: lesson1Id,
            module_id: "mod-1",
            title: "گره سینوسی-دهلیزی (SA Node)",
            content_type: "markdown",
            content_markdown: "# گره سینوسی دهلیزی\n\nاین گره پیس‌میکر اصلی قلب انسان است و با ریتم ۶۰ تا ۱۰۰ ضربان در دقیقه پالس تولید می‌کند.",
            sort_order: 0,
            estimated_minutes: 10,
            completed: true,
            completed_at: "2026-08-20T10:00:00.000Z",
          },
          {
            id: lesson2Id,
            module_id: "mod-1",
            title: "گره دهلیزی-بطنی (AV Node)",
            content_type: "markdown",
            content_markdown: "# گره دهلیزی بطنی\n\nوظیفه ایجاد تاخیر در هدایت امواج دهلیزی به بطن‌ها را بر عهده دارد.",
            sort_order: 1,
            estimated_minutes: 8,
            completed: false,
            completed_at: null,
          },
        ],
      },
      {
        id: "mod-2",
        title: "فصل دوم: دینامیک خون و فشار",
        description: "همودینامیک و مقاومت عروقی",
        sort_order: 1,
        lessons: [
          {
            id: lesson3Id,
            module_id: "mod-2",
            title: "قانون استارلینگ قلب",
            content_type: "markdown",
            content_markdown: "# قانون استارلینگ\n\nافزایش حجم پایان دیاستولی موجب افزایش نیروی انقباضی میگردد.",
            sort_order: 0,
            estimated_minutes: 12,
            completed: false,
            completed_at: null,
          },
        ],
      },
    ],
    progress: {
      total_lessons: 3,
      completed_lessons: 1,
      progress_percent: 33,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCurriculumData)),
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
                items: [{ id: orgId, name: "سازمان آموزش پزشکی", slug: "med-org" }],
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders course header, progress, module titles, and loads initial lesson", async () => {
    const queryClient = createTestQueryClient();

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

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "فیزیولوژی قلب و عروق" })).toBeDefined();
      expect(screen.getByText("سرفصل‌های دوره")).toBeDefined();
      // Main lesson title rendered inside markdown content
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Verify progress
    expect(screen.getByText(/1 از 3 درس تکمیل شده/i)).toBeDefined();
    expect(screen.getByText("33%")).toBeDefined();

    // Verify markdown rendered
    expect(screen.getByText(/این گره پیس‌میکر اصلی قلب انسان است/i)).toBeDefined();
  });

  it("toggles desktop sidebar collapse and expansion", async () => {
    const queryClient = createTestQueryClient();

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

    await waitFor(() => {
      expect(screen.getByText("سرفصل‌های دوره")).toBeDefined();
    });

    // Collapse sidebar via button in header
    const focusModeBtn = screen.getByLabelText("بستن پنل سرفصل‌ها");
    fireEvent.click(focusModeBtn);

    // Sidebar should be collapsed (no longer in DOM)
    expect(screen.queryByText("سرفصل‌های دوره")).toBeNull();

    // Trigger button should now say "نمایش سرفصل‌ها" / "سرفصل‌ها"
    const openSidebarBtn = screen.getByRole("button", { name: /نمایش سرفصل‌ها/i });
    expect(openSidebarBtn).toBeDefined();

    // Expand sidebar again
    fireEvent.click(openSidebarBtn);

    await waitFor(() => {
      expect(screen.getByText("سرفصل‌های دوره")).toBeDefined();
    });
  });

  it("handles module accordion toggling and lesson selection", async () => {
    const queryClient = createTestQueryClient();

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

    await waitFor(() => {
      expect(screen.getByText("فصل دوم: دینامیک خون و فشار")).toBeDefined();
    });

    // Initially mod-2 lessons are collapsed
    expect(screen.queryByText("قانون استارلینگ قلب")).toBeNull();

    // Click to expand mod-2
    const mod2Button = screen.getByRole("button", { name: /فصل دوم: دینامیک خون و فشار/i });
    fireEvent.click(mod2Button);

    // Lessons in mod-2 should now be visible
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /قانون استارلینگ قلب/i })).toBeDefined();
    });

    // Click to select lesson 3
    const lesson3Btn = screen.getByRole("button", { name: /قانون استارلینگ قلب/i });
    fireEvent.click(lesson3Btn);

    // Main viewer should now display lesson 3 content
    await waitFor(() => {
      expect(screen.getByText(/افزایش حجم پایان دیاستولی موجب افزایش نیروی انقباضی/i)).toBeDefined();
    });
  });

  it("shows distinct status indicators for completed, current, and upcoming lessons", async () => {
    const queryClient = createTestQueryClient();

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

    await waitFor(() => {
      expect(screen.getByText("گره سینوسی-دهلیزی (SA Node)")).toBeDefined();
    });

    // Lesson 1 is selected and completed
    const lesson1Button = screen.getByRole("button", { name: /گره سینوسی-دهلیزی/i });
    expect(lesson1Button.getAttribute("aria-current")).toBe("true");

    // Lesson 2 is upcoming/uncompleted
    const lesson2Button = screen.getByRole("button", { name: /گره دهلیزی-بطنی/i });
    expect(lesson2Button.getAttribute("aria-current")).toBeNull();

    // Select lesson 2
    fireEvent.click(lesson2Button);

    await waitFor(() => {
      expect(lesson2Button.getAttribute("aria-current")).toBe("true");
      expect(lesson1Button.getAttribute("aria-current")).toBeNull();
    });
  });

  it("opens and closes mobile drawer upon lesson selection", async () => {
    const queryClient = createTestQueryClient();

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

    await waitFor(() => {
      expect(screen.getByText("گره سینوسی-دهلیزی (SA Node)")).toBeDefined();
    });

    // Trigger mobile drawer open
    const mobileTriggerBtn = screen.getByRole("button", { name: "سرفصل‌های دوره" });
    fireEvent.click(mobileTriggerBtn);

    // Mobile drawer should now be open
    await waitFor(() => {
      expect(screen.getByLabelText("سرفصل‌های دوره (موبایل)")).toBeDefined();
    });

    // Close button inside drawer
    const closeBtn = screen.getByLabelText("بستن منوی سرفصل‌ها");
    fireEvent.click(closeBtn);

    // Drawer should close
    expect(screen.queryByLabelText("سرفصل‌های دوره (موبایل)")).toBeNull();
  });
});
