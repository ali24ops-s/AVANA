import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdminCoursesPage } from "../pages/admin/AdminCoursesPage.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useAdmin } from "../hooks/useAdmin.js";
import React from "react";

// Mock the useAdmin hook
vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const mockCourses = [
  {
    id: "course-1",
    name: "فارماکولوژی بالینی",
    subject: "داروسازی",
    createdAt: "2026-08-23T10:00:00Z",
    counts: { modules: 2, lessons: 5, flashcards: 10, quizzes: 1 },
  },
  {
    id: "course-2",
    name: "شیمی دارویی پیشرفته",
    subject: null,
    createdAt: "2026-08-23T09:00:00Z",
    counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
  },
];

const mockOfficialCourses = [
  {
    id: "course-1",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    name: "فارماکولوژی بالینی",
    description: "توضیحات دوره داروشناسی",
    subject: "داروسازی",
    status: "approved" as const,
    isOfficial: true,
    moduleCount: 2,
    lessonCount: 5,
    flashcardCount: 10,
    quizQuestionCount: 1,
    product: {
      id: "prod-1",
      code: "course_1",
      price: 499000,
      currency: "toman",
      active: true,
    },
    createdAt: "2026-08-23T10:00:00Z",
    updatedAt: "2026-08-23T10:00:00Z",
  },
  {
    id: "course-2",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    name: "شیمی دارویی پیشرفته",
    description: null,
    subject: null,
    status: "draft" as const,
    isOfficial: true,
    moduleCount: 0,
    lessonCount: 0,
    flashcardCount: 0,
    quizQuestionCount: 0,
    product: null,
    createdAt: "2026-08-23T09:00:00Z",
    updatedAt: "2026-08-23T09:00:00Z",
  },
];

describe("Education Workspace (/admin/courses) — Step 2 Test Matrix", () => {
  let mockListCourses: ReturnType<typeof vi.fn>;
  let mockListOfficialCourses: ReturnType<typeof vi.fn>;
  let mockUpdateCourseMetadata: ReturnType<typeof vi.fn>;
  let mockCreateOfficialCourse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient.clear();
    mockListCourses = vi.fn().mockResolvedValue({ courses: mockCourses, totalCount: 2 });
    mockListOfficialCourses = vi.fn().mockResolvedValue({ courses: mockOfficialCourses });
    mockUpdateCourseMetadata = vi.fn().mockResolvedValue({ success: true });
    mockCreateOfficialCourse = vi.fn().mockResolvedValue({
      success: true,
      course: { id: "new-course-id", name: "دوره بیوشیمی جدید" },
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

  it("Case 1: Education Workspace renders with Header Overview Stats and Course List", async () => {
    render(<AdminCoursesPage />, { wrapper });

    expect(screen.getByText(/در حال بارگذاری دوره‌ها/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("آموزش و دوره‌ها")).toBeInTheDocument();
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
      expect(screen.getByText("شیمی دارویی پیشرفته")).toBeInTheDocument();
    });

    // Check Header overview metric titles & badges
    expect(screen.getByText("تعداد کل دوره‌ها")).toBeInTheDocument();
    expect(screen.getByText("پیش‌نویس (Draft)")).toBeInTheDocument();
    expect(screen.getByText("در حال تولید AI")).toBeInTheDocument();
    expect(screen.getAllByText("در انتظار بازبینی").length).toBeGreaterThan(0);
    expect(screen.getByText("منتشر شده در کاتالوگ")).toBeInTheDocument();
  });

  it("Case 2: Search input triggers server query with search parameter", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/جستجوی نام یا موضوع دوره/i);
    fireEvent.change(searchInput, { target: { value: "فارماکولوژی" } });

    expect(mockListCourses).toHaveBeenCalledWith(1, 20, "فارماکولوژی");
  });

  it("Case 3: Status filter filters course cards locally", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
      expect(screen.getByText("شیمی دارویی پیشرفته")).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/فیلتر وضعیت دوره/i);
    // Filter to "approved"
    fireEvent.change(statusSelect, { target: { value: "approved" } });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
      expect(screen.queryByText("شیمی دارویی پیشرفته")).not.toBeInTheDocument();
    });
  });

  it("Case 4: Displays Course metrics, Commercial prices, and Status badges", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    // Subject badge
    expect(screen.getByText("داروسازی")).toBeInTheDocument();

    // Commercial price formatted in Persian
    expect(screen.getByText(/۴۹۹[٬,]۰۰۰ تومان/)).toBeInTheDocument();

    // Status badge
    expect(screen.getAllByText("تایید شده").length).toBeGreaterThan(0);
    expect(screen.getAllByText("پیش‌نویس").length).toBeGreaterThan(0);
  });

  it("Case 5: Course title links to Canonical Course Hub (?tab=structure)", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    const titleLink = screen.getByRole("link", { name: "فارماکولوژی بالینی" });
    expect(titleLink).toHaveAttribute("href", "/admin/courses/course-1?tab=structure");
  });

  it("Case 6: Quick action buttons link directly to appropriate tabs in Course Hub", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    const links = screen.getAllByRole("link");
    const structureLinks = links.filter((l) => l.getAttribute("href")?.includes("/admin/courses/course-1?tab=structure"));
    const generationLinks = links.filter((l) => l.getAttribute("href") === "/admin/courses/course-1?tab=generation");
    const reviewLinks = links.filter((l) => l.getAttribute("href") === "/admin/courses/course-1?tab=review");
    const publishLinks = links.filter((l) => l.getAttribute("href") === "/admin/courses/course-1?tab=publish");
    const settingsLinks = links.filter((l) => l.getAttribute("href") === "/admin/courses/course-1?tab=settings");

    expect(structureLinks.length).toBeGreaterThan(0);
    expect(generationLinks.length).toBeGreaterThan(0);
    expect(reviewLinks.length).toBeGreaterThan(0);
    expect(publishLinks.length).toBeGreaterThan(0);
    expect(settingsLinks.length).toBeGreaterThan(0);
  });

  it("Case 7: Empty state displays message and CTA to create first course", async () => {
    mockListCourses.mockResolvedValue({ courses: [], totalCount: 0 });
    mockListOfficialCourses.mockResolvedValue({ courses: [] });

    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("دوره‌ای یافت نشد")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ایجاد اولین دوره/i })).toBeInTheDocument();
    });
  });

  it("Case 8: Error state displays friendly error and retry button", async () => {
    mockListCourses.mockRejectedValue(new Error("API Network Failure"));

    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("خطا در دریافت لیست دوره‌ها.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeInTheDocument();
    });
  });

  it("Case 9: Create Course primary action opens modal and calls createOfficialCourse API", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("آموزش و دوره‌ها")).toBeInTheDocument();
    });

    const createBtn = screen.getByRole("button", { name: /ایجاد دوره جدید/i });
    fireEvent.click(createBtn);

    expect(screen.getByText("ایجاد دوره رسمی جدید")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/مثال: فیزیولوژی اعصاب بالینی/i);
    fireEvent.change(nameInput, { target: { value: "دوره بیوشیمی جدید" } });

    const submitBtn = screen.getByRole("button", { name: /ایجاد دوره و ورود به هاب/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateOfficialCourse).toHaveBeenCalledWith({
        name: "دوره بیوشیمی جدید",
        subject: undefined,
        description: undefined,
      });
    });
  });

  it("Case 10: Pagination controls navigate through server pages correctly", async () => {
    mockListCourses.mockResolvedValue({ courses: mockCourses, totalCount: 45 }); // 3 pages (20/page)

    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    const nextBtn = screen.getByLabelText("صفحه بعد");
    fireEvent.click(nextBtn);

    expect(mockListCourses).toHaveBeenCalledWith(2, 20, "");
  });

  it("Case 11: Quick Metadata Editing (PATCH /v1/admin/courses/:id) still functions seamlessly", async () => {
    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    const editBtn = screen.getByLabelText("ویرایش دوره فارماکولوژی بالینی");
    fireEvent.click(editBtn);

    expect(screen.getByText("ویرایش مشخصات دوره")).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/نام دوره/i);
    fireEvent.change(nameInput, { target: { value: "فارماکولوژی بالینی ویرایش ۲" } });

    const saveBtn = screen.getByText("ذخیره تغییرات");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateCourseMetadata).toHaveBeenCalledWith("course-1", {
        name: "فارماکولوژی بالینی ویرایش ۲",
        subject: "داروسازی",
      });
    });
  });

  it("Case 12: Status filter interaction with pagination semantics", async () => {
    mockListCourses.mockResolvedValue({ courses: mockCourses, totalCount: 40 });

    render(<AdminCoursesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی بالینی")).toBeInTheDocument();
    });

    // Select status filter "draft"
    const statusSelect = screen.getByLabelText(/فیلتر وضعیت دوره/i);
    fireEvent.change(statusSelect, { target: { value: "draft" } });

    await waitFor(() => {
      expect(screen.getByText("شیمی دارویی پیشرفته")).toBeInTheDocument();
      expect(screen.queryByText("فارماکولوژی بالینی")).not.toBeInTheDocument();
    });

    // Total count display still reflects server pagination total
    expect(screen.getByText(/مجموع: 40 دوره/i)).toBeInTheDocument();
  });
});
