/**
 * Frontend Unit & Integration Tests: Resume Study Position in LearningPage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningPage } from "../pages/LearningPage.js";

// Mock in-memory localStorage for test isolation
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockStorage,
  writable: true,
});

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "student@avana.ir", role: "student" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    token: "mock-token",
  }),
}));

// Mock study session tracker hook to avoid side effects
vi.mock("../hooks/useStudySessionTracker.js", () => ({
  useStudySessionTracker: () => ({
    sessionId: "mock-session-id",
    isTracking: true,
  }),
}));

const mockGetCourseLearning = vi.fn();

vi.mock("../lib/api/learning.js", () => ({
  createLearningApi: () => ({
    getCourseLearning: mockGetCourseLearning,
    markLessonComplete: vi.fn(),
  }),
}));

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: vi.fn().mockResolvedValue({ items: [] }),
  }),
}));

vi.mock("../lib/api/commerce.js", () => ({
  createCommerceApi: () => ({
    listProducts: vi.fn().mockResolvedValue({ items: [] }),
    checkout: vi.fn(),
    getMySubscription: vi.fn().mockResolvedValue({ has_active_subscription: false }),
    getMyEntitlements: vi.fn().mockResolvedValue({ items: [] }),
    checkAccess: vi.fn(),
  }),
}));

const sampleCourseData = {
  request_id: "req-1",
  course: {
    id: "course-101",
    organization_id: "org-1",
    title: "فیزیولوژی پزشکی",
    subject: "Medical Physiology",
    locked: false,
  },
  modules: [
    {
      id: "mod-1",
      title: "فصل ۱: سلول و فیزیولوژی عمومی",
      description: null,
      sort_order: 1,
      lessons: [
        {
          id: "lesson-1-1",
          module_id: "mod-1",
          title: "درسنامه ۱-۱: ساختار غشا",
          content_type: "markdown",
          content_markdown: "# ساختار غشای سلولی\n\nتوضیحات مربوط به غشا...",
          sort_order: 1,
          estimated_minutes: 15,
          completed: false,
          completed_at: null,
        },
        {
          id: "lesson-1-2",
          module_id: "mod-1",
          title: "درسنامه ۱-۲: پتانسیل عمل",
          content_type: "markdown",
          content_markdown: "# پتانسیل عمل و کانال‌های یونی",
          sort_order: 2,
          estimated_minutes: 20,
          completed: false,
          completed_at: null,
        },
      ],
    },
    {
      id: "mod-2",
      title: "فصل ۲: دستگاه عصبی",
      description: null,
      sort_order: 2,
      lessons: [
        {
          id: "lesson-2-1",
          module_id: "mod-2",
          title: "درسنامه ۲-۱: سیناپس‌ها و انتقال پیام",
          content_type: "markdown",
          content_markdown: "# سیناپس‌های شیمیایی و الکتریکی",
          sort_order: 1,
          estimated_minutes: 25,
          completed: false,
          completed_at: null,
        },
      ],
    },
  ],
  progress: {
    total_lessons: 3,
    completed_lessons: 0,
    progress_percent: 0,
    last_studied_lesson_id: null,
    last_studied_module_id: null,
    last_studied_at: null,
  },
};

describe("LearningPage Study Position Restoration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function renderPage(initialUrl = "/courses/course-101") {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <Routes>
            <Route path="/courses/:courseId" element={<LearningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("resumes study directly from server last_studied_lesson_id and expands its module", async () => {
    mockGetCourseLearning.mockResolvedValue({
      ...sampleCourseData,
      progress: {
        ...sampleCourseData.progress,
        last_studied_lesson_id: "lesson-2-1",
        last_studied_module_id: "mod-2",
        last_studied_at: new Date().toISOString(),
      },
    });

    renderPage();

    // Verify Lesson 2-1 is selected and its module title and markdown content are displayed
    await waitFor(() => {
      expect(screen.getByText("فصل ۲: دستگاه عصبی")).toBeInTheDocument();
      expect(screen.getByText("سیناپس‌های شیمیایی و الکتریکی")).toBeInTheDocument();
    });
  });

  it("prioritizes URL ?lessonId parameter over server last_studied_lesson_id", async () => {
    mockGetCourseLearning.mockResolvedValue({
      ...sampleCourseData,
      progress: {
        ...sampleCourseData.progress,
        last_studied_lesson_id: "lesson-2-1",
        last_studied_module_id: "mod-2",
      },
    });

    // User navigates directly to ?lessonId=lesson-1-2
    renderPage("/courses/course-101?lessonId=lesson-1-2");

    await waitFor(() => {
      expect(screen.getByText("پتانسیل عمل و کانال‌های یونی")).toBeInTheDocument();
    });
  });

  it("defaults to first lesson of first module when user has no study history", async () => {
    mockGetCourseLearning.mockResolvedValue({
      ...sampleCourseData,
      progress: {
        ...sampleCourseData.progress,
        last_studied_lesson_id: null,
        last_studied_module_id: null,
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("ساختار غشای سلولی")).toBeInTheDocument();
    });
  });

  it("gracefully falls back to first lesson if saved lesson was deleted or not found", async () => {
    mockGetCourseLearning.mockResolvedValue({
      ...sampleCourseData,
      progress: {
        ...sampleCourseData.progress,
        last_studied_lesson_id: "deleted-lesson-999",
        last_studied_module_id: "mod-1",
      },
    });

    renderPage();

    // Since deleted-lesson-999 does not exist in modules, it falls back to lesson 1-1
    await waitFor(() => {
      expect(screen.getByText("ساختار غشای سلولی")).toBeInTheDocument();
    });
  });

  it("saves the active study position in localStorage for fast offline/immediate restoration", async () => {
    mockGetCourseLearning.mockResolvedValue({
      ...sampleCourseData,
      progress: {
        ...sampleCourseData.progress,
        last_studied_lesson_id: "lesson-1-2",
        last_studied_module_id: "mod-1",
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("پتانسیل عمل و کانال‌های یونی")).toBeInTheDocument();
    });

    const cached = window.localStorage.getItem("avana:last_lesson:user-123:course-101");
    expect(cached).toBe("lesson-1-2");
  });
});
