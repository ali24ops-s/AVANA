import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LearningPage } from "../pages/LearningPage.js";
import { CourseReviewSummaryView } from "../components/documents/CourseReviewSummaryView.js";
import { AuthProvider } from "../providers/AuthProvider.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Official Course UI Permissions vs Personal Course", () => {
  const officialCourseId = "official-course-123";
  const personalCourseId = "personal-course-456";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupFetchMock = (options: {
    role: "student" | "platform_admin" | "content_worker";
    isOfficial: boolean;
    courseId: string;
    totalLessons?: number;
  }) => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();

      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "usr-1", email: "test@avana.ir", role: options.role },
              memberships: [],
            }),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-orgs",
              items: [{ id: "org-1", name: "سازمان تست" }],
            }),
        } as Response);
      }

      if (urlStr.includes(`/v1/courses/${options.courseId}/learn`)) {
        const count = options.totalLessons ?? 0;
        const lessons = count > 0
          ? [
              {
                id: "les-1",
                module_id: "mod-1",
                title: "درس نمونه",
                content_type: "markdown",
                content_markdown: "# عنوان درس",
                sort_order: 1,
                estimated_minutes: 10,
                completed: false,
                locked: false,
                is_preview: false,
              },
            ]
          : [];

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-learn",
              course: {
                id: options.courseId,
                title: options.isOfficial ? "دوره رسمی فیزیولوژی" : "دوره شخصی من",
                subject: "پزشکی",
                is_official: options.isOfficial,
                isOfficial: options.isOfficial,
                locked: false,
              },
              modules: [
                {
                  id: "mod-1",
                  title: "فصل اول",
                  sort_order: 1,
                  lessons,
                },
              ],
              progress: {
                total_lessons: count,
                completed_lessons: 0,
                progress_percent: 0,
              },
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      } as Response);
    });
  };

  it("Regular student viewing official course: Documents and Review tabs are hidden", async () => {
    setupFetchMock({ role: "student", isOfficial: true, courseId: officialCourseId, totalLessons: 1 });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${officialCourseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Lessons tab should exist
    expect(await screen.findByRole("tab", { name: "درس‌ها" })).toBeInTheDocument();

    // Resources & Review tabs must NOT be present
    expect(screen.queryByRole("tab", { name: /منابع و اسناد/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /صف بررسی محتوا/i })).not.toBeInTheDocument();
  });

  it("Regular student deep-linking to ?tab=documents on official course: redirected to lessons", async () => {
    setupFetchMock({ role: "student", isOfficial: true, courseId: officialCourseId, totalLessons: 1 });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${officialCourseId}?tab=documents`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Lessons tab active and rendered
    expect(await screen.findByRole("tab", { name: "درس‌ها" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /منابع و اسناد/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/بارگذاری سند/i)).not.toBeInTheDocument();
  });

  it("Regular student deep-linking to ?tab=review on official course: redirected to lessons", async () => {
    setupFetchMock({ role: "student", isOfficial: true, courseId: officialCourseId, totalLessons: 1 });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${officialCourseId}?tab=review`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("tab", { name: "درس‌ها" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /صف بررسی محتوا/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/صف بررسی و انتشار محتوای تولیدشده/i)).not.toBeInTheDocument();
  });

  it("Regular student viewing official course with 0 lessons: shows official empty state without upload button", async () => {
    setupFetchMock({ role: "student", isOfficial: true, courseId: officialCourseId, totalLessons: 0 });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${officialCourseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("هنوز محتوایی در این دوره منتشر نشده است")).toBeInTheDocument();
    expect(screen.getByText("محتوای آموزشی این دوره به زودی منتشر خواهد شد.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /افزودن فایل PDF/i })).not.toBeInTheDocument();
  });

  it("Admin viewing official course: tabs are visible", async () => {
    setupFetchMock({ role: "platform_admin", isOfficial: true, courseId: officialCourseId, totalLessons: 1 });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${officialCourseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("tab", { name: "درس‌ها" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /منابع و اسناد/i })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /صف بررسی محتوا/i })).toBeInTheDocument();
  });

  it("CourseReviewSummaryView on official course with 0 documents for student: shows appropriate empty state", async () => {
    setupFetchMock({ role: "student", isOfficial: true, courseId: officialCourseId, totalLessons: 0 });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CourseReviewSummaryView
          organizationId="org-1"
          courseId={officialCourseId}
          isOfficial={true}
          isManagerOrAdmin={false}
          modules={[]}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("خلاصه مروری برای این دوره هنوز منتشر نشده است")).toBeInTheDocument();
    expect(screen.getByText(/خلاصه مروری این دوره آموزشی به زودی پس از انتشار در دسترس قرار خواهد گرفت/i)).toBeInTheDocument();
    expect(screen.queryByText(/در بخش «منابع و اسناد \(PDF\)» بارگذاری کنید/i)).not.toBeInTheDocument();
  });
});
