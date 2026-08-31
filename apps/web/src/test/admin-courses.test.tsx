import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdminCoursesPage } from "../pages/admin/AdminCoursesPage.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAdmin } from "../hooks/useAdmin.js";
import React from "react";

// Mock the hook
vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const mockCourses = [
  {
    id: "course-1",
    name: "Course 1",
    subject: "Math",
    createdAt: "2026-08-23T10:00:00Z",
    counts: { modules: 2, lessons: 5, flashcards: 10, quizzes: 1 }
  },
  {
    id: "course-2",
    name: "Course 2",
    subject: null,
    createdAt: "2026-08-23T11:00:00Z",
    counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 }
  }
];

describe("AdminCoursesPage", () => {
  let mockListCourses: ReturnType<typeof vi.fn>;
  let mockUpdateCourseMetadata: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient.clear();
    mockListCourses = vi.fn().mockResolvedValue({ courses: mockCourses, totalCount: 2 });
    mockUpdateCourseMetadata = vi.fn().mockResolvedValue({ success: true });

    vi.mocked(useAdmin).mockReturnValue({
      listCourses: mockListCourses,
      updateCourseMetadata: mockUpdateCourseMetadata,
    } as unknown as ReturnType<typeof useAdmin>);
  });

  afterEach(() => {
    cleanup();
  });

  it("Case 1 & 2: Platform Admin Courses render & API returns known courses", async () => {
    render(<AdminCoursesPage />, { wrapper });
    
    expect(screen.getByText(/در حال بارگذاری دوره‌ها/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText("Course 1")).toBeInTheDocument();
      expect(screen.getByText("Course 2")).toBeInTheDocument();
    });
    
    expect(screen.getByText("Math")).toBeInTheDocument();
  });

  it("Case 3 & 4: Search and Filtering", async () => {
    render(<AdminCoursesPage />, { wrapper });
    
    await waitFor(() => {
      expect(screen.getByText("Course 1")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/جستجوی دوره/i);
    fireEvent.change(searchInput, { target: { value: "test search" } });

    expect(mockListCourses).toHaveBeenCalledWith(1, 20, "test search");
  });

  it("Case 5: Pagination page change", async () => {
    mockListCourses.mockResolvedValue({ courses: mockCourses, totalCount: 45 }); // 3 pages (20/page)
    render(<AdminCoursesPage />, { wrapper });
    
    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    const nextBtn = screen.getByLabelText("صفحه بعد");
    fireEvent.click(nextBtn);

    expect(mockListCourses).toHaveBeenCalledWith(2, 20, "");
  });

  it("Case 6 & 7: Empty Database / Empty Search Result", async () => {
    mockListCourses.mockResolvedValue({ courses: [], totalCount: 0 });
    render(<AdminCoursesPage />, { wrapper });
    
    await waitFor(() => {
      expect(screen.getByText("دوره‌ای یافت نشد")).toBeInTheDocument();
    });
  });

  it("Case 9: API Error state", async () => {
    mockListCourses.mockRejectedValue(new Error("API Error"));
    render(<AdminCoursesPage />, { wrapper });
    
    await waitFor(() => {
      expect(screen.getByText("خطا در دریافت لیست دوره‌ها.")).toBeInTheDocument();
    });
  });

  it("Case 10: Existing Course Action (Edit)", async () => {
    render(<AdminCoursesPage />, { wrapper });
    
    await waitFor(() => {
      expect(screen.getByText("Course 1")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByLabelText(/ویرایش دوره/i);
    fireEvent.click(editBtns[0]); // Click edit on Course 1

    expect(screen.getByText("ویرایش مشخصات دوره")).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/نام دوره/i);
    fireEvent.change(nameInput, { target: { value: "Updated Course 1" } });

    const saveBtn = screen.getByText("ذخیره تغییرات");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateCourseMetadata).toHaveBeenCalledWith("course-1", { name: "Updated Course 1", subject: "Math" });
    });
  });
});
