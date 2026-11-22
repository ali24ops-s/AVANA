import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningPage } from "../pages/LearningPage.js";

// Mock AuthProvider as an admin/editor who can generate content
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-admin-1", email: "admin@avana.ir", role: "organization_admin" },
    memberships: [{ organization_id: "org-1", role: "organization_admin" }],
    token: "mock-token",
  }),
}));

const mockGetCourseLearning = vi.fn();
const mockGetReviewQueue = vi.fn();
const mockListOrganizations = vi.fn();

vi.mock("../lib/api/learning.js", () => ({
  createLearningApi: () => ({
    getCourseLearning: mockGetCourseLearning,
    markLessonComplete: vi.fn(),
  }),
}));

vi.mock("../lib/api/review.js", () => ({
  createReviewApi: () => ({
    getReviewQueue: mockGetReviewQueue,
  }),
}));

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: mockListOrganizations,
  }),
}));

vi.mock("../lib/api/courses.js", () => ({
  createCourseApi: () => ({
    getCoursePublicationStatus: vi.fn().mockResolvedValue({ status: "draft" }),
  }),
}));

describe("LearningPage Slug vs Canonical UUID Boundary", () => {
  let queryClient: QueryClient;

  const testSlug = "course-550379aa";
  const canonicalUUID = "550379aa-1234-4567-8901-abcdef123456";

  const mockCourseData = {
    course: {
      id: canonicalUUID,
      name: "فارماکولوژی کاربردی",
      title: "فارماکولوژی کاربردی",
      slug: testSlug,
      subject: "داروسازی",
      isOfficial: false,
      organization_id: "org-1",
      can_edit: true,
    },
    modules: [
      {
        id: "mod-1",
        title: "فصل اول",
        lessons: [
          {
            id: "les-1",
            title: "مقدمات فارماکولوژی",
            completed: false,
            sort_order: 1,
          },
        ],
      },
    ],
    progress: {
      completed_lessons: 0,
      total_lessons: 1,
      progress_percent: 0,
    },
    access: { granted: true },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    mockListOrganizations.mockResolvedValue({
      items: [{ id: "org-1", name: "سازمان پزشکی" }],
    });
    mockGetReviewQueue.mockResolvedValue({
      pending: [],
      stats: { total: 0 },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("extracts route slug, requests course structure with slug, and propagates canonical UUID to reviewQueue", async () => {
    mockGetCourseLearning.mockResolvedValue(mockCourseData);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${testSlug}`]}>
          <Routes>
            <Route path="/courses/:courseId" element={<LearningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial public learning API should be called with the route param (slug)
    expect(mockGetCourseLearning).toHaveBeenCalledWith(testSlug);

    // Wait for course to load and render
    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی کاربردی")).toBeInTheDocument();
    });

    // ReviewQueue MUST receive canonical UUID, NOT the slug
    await waitFor(() => {
      expect(mockGetReviewQueue).toHaveBeenCalledWith("org-1", canonicalUUID);
      expect(mockGetReviewQueue).not.toHaveBeenCalledWith("org-1", testSlug);
    });

    // Admin link should point to canonical UUID
    const adminLink = screen.getByRole("link", { name: /مدیریت محتوا و سرفصل‌ها/i });
    expect(adminLink).toHaveAttribute("href", `/admin/courses/${canonicalUUID}`);
  });

  it("handles entry via legacy canonical UUID directly", async () => {
    mockGetCourseLearning.mockResolvedValue(mockCourseData);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${canonicalUUID}`]}>
          <Routes>
            <Route path="/courses/:courseId" element={<LearningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(mockGetCourseLearning).toHaveBeenCalledWith(canonicalUUID);

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی کاربردی")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockGetReviewQueue).toHaveBeenCalledWith("org-1", canonicalUUID);
    });
  });
});
