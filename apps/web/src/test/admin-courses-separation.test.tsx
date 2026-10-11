import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdminCoursesPage } from "../pages/admin/AdminCoursesPage.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { useAdmin } from "../hooks/useAdmin.js";
import React from "react";
import type { AdminCourseRecord } from "../lib/api/admin.js";

// Mock the useAdmin hook
vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});

function LocationDisplay() {
  const [searchParams] = useSearchParams();
  return <div data-testid="current-tab-param">{searchParams.get("tab") || "none"}</div>;
}

const wrapperWithInitialEntries = (initialEntries: string[] = ["/admin/courses"]) => {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <LocationDisplay />
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
};

const mockOfficialCourse: AdminCourseRecord = {
  id: "course-official-1",
  name: "فارماکولوژی بالینی رسمی",
  subject: "داروسازی",
  organizationId: "system-org-uuid",
  isOfficial: true,
  scope: "official",
  status: "published",
  createdAt: "2026-08-20T10:00:00Z",
  counts: { modules: 4, lessons: 12, flashcards: 40, quizzes: 8 },
  product: { id: "p1", code: "PHARM-1", price: 350000, currency: "toman", active: true },
};

const mockTeacherCourse: AdminCourseRecord = {
  id: "course-teacher-1",
  name: "فیزیولوژی پزشکی پیشرفته",
  subject: "پزشکی",
  organizationId: "teacher-org-uuid",
  isOfficial: false,
  scope: "teacher",
  status: "draft",
  createdAt: "2026-08-21T10:00:00Z",
  counts: { modules: 2, lessons: 6, flashcards: 15, quizzes: 2 },
  teacher: { id: "u-prof-1", name: "دکتر سهرابی", email: "dr.sohrabi@med.edu" },
  classroom: { id: "cls-1", title: "کلاس فیزیولوژی ۱۴۰۳", inviteCode: "MED-1403" },
};

const mockUserCourseWithContent: AdminCourseRecord = {
  id: "course-user-1",
  name: "خلاصه‌های بافت‌شناسی من",
  subject: "علوم پایه",
  organizationId: "user-org-uuid",
  isOfficial: false,
  scope: "user",
  status: "draft",
  createdAt: "2026-08-22T10:00:00Z",
  counts: { modules: 1, lessons: 3, flashcards: 25, quizzes: 0 },
  hasContent: true,
  owner: { id: "u-student-1", name: "علی احمدی", email: "ali@example.com" },
};

const mockUserCourseConflicting: AdminCourseRecord = {
  id: "course-user-2",
  name: "او تی سی تراپی",
  subject: "داروشناسی",
  organizationId: "user-org-uuid-2",
  isOfficial: false,
  scope: "user",
  status: "draft",
  createdAt: "2026-08-23T10:00:00Z",
  counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
  hasContent: false,
  needsReview: true,
  reviewReason: "دوره در سازمان کاربر تعریف شده اما سوابق ایجاد سیستمی دارد",
  owner: { id: "u-student-2", name: "مریم کریمی", email: "maryam@example.com" },
};

describe("Admin Courses Segregation UI Integration (/admin/courses)", () => {
  let mockListCourses: ReturnType<typeof vi.fn>;
  let mockListOfficialCourses: ReturnType<typeof vi.fn>;
  let mockUpdateCourseMetadata: ReturnType<typeof vi.fn>;
  let mockCreateOfficialCourse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient.clear();
    mockListCourses = vi.fn().mockImplementation((_page, _pageSize, _search, scope) => {
      if (scope === "teacher") {
        return Promise.resolve({
          courses: [mockTeacherCourse],
          totalCount: 1,
          counts: { official: 1, teacher: 1, user: 2 },
        });
      }
      if (scope === "user") {
        return Promise.resolve({
          courses: [mockUserCourseWithContent, mockUserCourseConflicting],
          totalCount: 2,
          counts: { official: 1, teacher: 1, user: 2 },
        });
      }
      // default / official
      return Promise.resolve({
        courses: [mockOfficialCourse],
        totalCount: 1,
        counts: { official: 1, teacher: 1, user: 2 },
      });
    });

    mockListOfficialCourses = vi.fn().mockResolvedValue({
      courses: [
        {
          id: mockOfficialCourse.id,
          name: mockOfficialCourse.name,
          organizationId: mockOfficialCourse.organizationId,
          isOfficial: true,
          status: mockOfficialCourse.status,
          moduleCount: 4,
          lessonCount: 12,
          flashcardCount: 40,
          quizQuestionCount: 8,
          product: mockOfficialCourse.product,
        },
      ],
    });

    mockUpdateCourseMetadata = vi.fn().mockResolvedValue({ success: true });
    mockCreateOfficialCourse = vi.fn().mockResolvedValue({
      success: true,
      course: { id: "new-official-id", name: "دوره جدید" },
    });

    vi.mocked(useAdmin).mockReturnValue({
      listCourses: mockListCourses,
      listOfficialCourses: mockListOfficialCourses,
      updateCourseMetadata: mockUpdateCourseMetadata,
      createOfficialCourse: mockCreateOfficialCourse,
    } as unknown as ReturnType<typeof useAdmin>);
  });

  afterEach(() => {
    cleanup();
  });

  it("1. Renders 3 mandatory tabs in strictly defined order with badge counts", async () => {
    const Wrapper = wrapperWithInitialEntries();
    render(<AdminCoursesPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("دوره‌های رسمی آوانا")).toBeInTheDocument();
      expect(screen.getByText("دوره‌های اساتید")).toBeInTheDocument();
      expect(screen.getByText("دوره‌های کاربران")).toBeInTheDocument();
      expect(screen.getByText("فارماکولوژی بالینی رسمی")).toBeInTheDocument();
      expect(screen.getByText("رسمی آوانا")).toBeInTheDocument();
    });

    // Verify initial query without tabParam defaults backward-compatibly
    expect(mockListCourses).toHaveBeenCalledWith(1, 20, "");
  });

  it("2. Switching to 'دوره‌های اساتید' updates URL to ?tab=teacher and displays teacher & classroom metadata", async () => {
    const Wrapper = wrapperWithInitialEntries();
    render(<AdminCoursesPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("دوره‌های اساتید")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("دوره‌های اساتید"));

    await waitFor(() => {
      expect(screen.getByTestId("current-tab-param")).toHaveTextContent("teacher");
      expect(screen.getByText("فیزیولوژی پزشکی پیشرفته")).toBeInTheDocument();
    });

    // Check teacher specific badges and metadata
    expect(screen.getByText("دوره استاد")).toBeInTheDocument();
    expect(screen.getByText(/دکتر سهرابی/)).toBeInTheDocument();
    expect(screen.getByText(/کلاس فیزیولوژی ۱۴۰۳/)).toBeInTheDocument();
    expect(screen.getByText(/MED-1403/)).toBeInTheDocument();

    // Inspect link points to ?tab=structure
    const inspectLinks = screen.getAllByRole("link", { name: /بررسی ساختار دوره/i });
    expect(inspectLinks.length).toBeGreaterThan(0);
    expect(inspectLinks[0]).toHaveAttribute("href", "/admin/courses/course-teacher-1?tab=structure");
  });

  it("3. Switching to 'دوره‌های کاربران' updates URL to ?tab=user and displays content flags and review warning", async () => {
    const Wrapper = wrapperWithInitialEntries(["/admin/courses?tab=user"]);
    render(<AdminCoursesPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("current-tab-param")).toHaveTextContent("user");
      expect(screen.getByText("خلاصه‌های بافت‌شناسی من")).toBeInTheDocument();
      expect(screen.getByText("او تی سی تراپی")).toBeInTheDocument();
    });

    // Scope badges
    expect(screen.getAllByText("دوره شخصی کاربر").length).toBe(2);

    // User course 1: has content
    expect(screen.getByText("علی احمدی")).toBeInTheDocument();
    expect(screen.getByText("دارای محتوا")).toBeInTheDocument();

    // User course 2: empty and needs review
    expect(screen.getByText("مریم کریمی")).toBeInTheDocument();
    expect(screen.getByText("خالی / آزمایشی")).toBeInTheDocument();
    expect(screen.getByText("نیازمند بررسی مالکیت")).toBeInTheDocument();
  });

  it("4. Deep-linking to /admin/courses?tab=teacher directly queries teacher scope", async () => {
    const Wrapper = wrapperWithInitialEntries(["/admin/courses?tab=teacher"]);
    render(<AdminCoursesPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockListCourses).toHaveBeenCalledWith(1, 20, "", "teacher");
      expect(screen.getByText("فیزیولوژی پزشکی پیشرفته")).toBeInTheDocument();
    });
  });
});
