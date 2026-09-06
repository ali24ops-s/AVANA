import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCommerceNavigation } from "../components/admin/commerce/AdminCommerceNavigation.js";
import { AdminCourseDeleteModal } from "../components/admin/courses/AdminCourseDeleteModal.js";
import { CourseSettingsPanel } from "../components/admin/studio/CourseSettingsPanel.js";
import { useAdmin } from "../hooks/useAdmin.js";
import type { OfficialCourse } from "../lib/api/admin.js";
import React from "react";

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

describe("Feature A: Admin Commerce Sub-Navigation & Pricing Accessibility", () => {
  it("renders all 6 commerce sub-navigation tabs with correct routes and Persian labels", () => {
    render(<AdminCommerceNavigation />, { wrapper });

    expect(screen.getByText(/نمای کلی/)).toBeInTheDocument();
    expect(screen.getByText("محصولات و قیمت‌گذاری")).toBeInTheDocument();
    expect(screen.getByText("اشتراک‌های کاربران")).toBeInTheDocument();
    expect(screen.getByText("سفارش‌ها")).toBeInTheDocument();
    expect(screen.getByText(/پرداخت‌ها/)).toBeInTheDocument();
    expect(screen.getByText(/دسترسی/)).toBeInTheDocument();

    const productLink = screen.getByText("محصولات و قیمت‌گذاری").closest("a");
    expect(productLink).toHaveAttribute("href", "/admin/commerce/products");
  });
});

describe("Feature B: Safe Course Deletion Modal & CourseSettingsPanel", () => {
  let mockDeleteOfficialCourse: ReturnType<typeof vi.fn>;
  let mockArchiveOfficialCourse: ReturnType<typeof vi.fn>;
  let mockUpdateCourseMetadata: ReturnType<typeof vi.fn>;

  const draftCourse: OfficialCourse = {
    id: "course-draft-123",
    name: "فارماکولوژی پیشرفته بالینی",
    subject: "داروسازی",
    description: null,
    status: "draft",
    isOfficial: true,
    moduleCount: 1,
    lessonCount: 2,
    flashcardCount: 5,
    quizQuestionCount: 5,
    product: null,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
  };

  const publishedCourse: OfficialCourse = {
    ...draftCourse,
    id: "course-published-456",
    name: "زیست‌شناسی جامع کنکور",
    status: "published",
    product: {
      id: "prod-1",
      code: "course_bio",
      price: 250000,
      currency: "toman",
      active: true,
    },
  };

  beforeEach(() => {
    queryClient.clear();
    mockDeleteOfficialCourse = vi.fn().mockResolvedValue({
      success: true,
      deletedCourseId: "course-draft-123",
      courseName: "فارماکولوژی پیشرفته بالینی",
      deletedDocumentsCount: 0,
      deletedProduct: false,
    });
    mockArchiveOfficialCourse = vi.fn().mockResolvedValue({
      success: true,
      courseStatus: "archived",
    });
    mockUpdateCourseMetadata = vi.fn().mockResolvedValue({
      success: true,
    });

    vi.mocked(useAdmin).mockReturnValue({
      deleteOfficialCourse: mockDeleteOfficialCourse,
      archiveOfficialCourse: mockArchiveOfficialCourse,
      updateCourseMetadata: mockUpdateCourseMetadata,
    } as any);
  });

  it("1. Renders confirmation modal for draft course and keeps delete button disabled until exact title is typed", async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <AdminCourseDeleteModal
        isOpen={true}
        onClose={handleClose}
        course={draftCourse}
        onSuccess={handleSuccess}
      />,
      { wrapper },
    );

    expect(screen.getByText("حذف قطعی دوره آموزشی")).toBeInTheDocument();
    expect(screen.getByText("فارماکولوژی پیشرفته بالینی")).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: /حذف قطعی و برگشت‌ناپذیر دوره/i });
    expect(deleteBtn).toBeDisabled();

    // Type partial name
    const input = screen.getByPlaceholderText("نام دوره را اینجا بنویسید...");
    fireEvent.change(input, { target: { value: "فارماکولوژی" } });
    expect(deleteBtn).toBeDisabled();

    // Type exact match
    fireEvent.change(input, { target: { value: "فارماکولوژی پیشرفته بالینی" } });
    expect(deleteBtn).not.toBeDisabled();

    // Trigger delete
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteOfficialCourse).toHaveBeenCalledWith("course-draft-123", {
        confirmationName: "فارماکولوژی پیشرفته بالینی",
        deleteSourceDocuments: false,
      });
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("2. Allows deletion for published courses if no financial dependencies exist", async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <AdminCourseDeleteModal
        isOpen={true}
        onClose={handleClose}
        course={publishedCourse}
        onSuccess={handleSuccess}
      />,
      { wrapper },
    );

    expect(
      screen.getByText(/حفظ سوابق مالی و حقوق کاربران/i),
    ).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: /حذف قطعی و برگشت‌ناپذیر دوره/i });
    expect(deleteBtn).toBeDisabled();

    // Type exact match for published course
    const input = screen.getByPlaceholderText("نام دوره را اینجا بنویسید...");
    fireEvent.change(input, { target: { value: "زیست‌شناسی جامع کنکور" } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteOfficialCourse).toHaveBeenCalledWith("course-published-456", {
        confirmationName: "زیست‌شناسی جامع کنکور",
        deleteSourceDocuments: false,
      });
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("3. Displays backend 409 error message if published course has financial dependencies", async () => {
    mockDeleteOfficialCourse.mockRejectedValueOnce(
      new Error("این دوره دارای سابقه خرید یا دسترسی کاربران است و حذف قطعی آن امکان‌پذیر نیست. می‌توانید دوره را آرشیو کنید."),
    );

    render(
      <AdminCourseDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        course={publishedCourse}
      />,
      { wrapper },
    );

    const input = screen.getByPlaceholderText("نام دوره را اینجا بنویسید...");
    fireEvent.change(input, { target: { value: "زیست‌شناسی جامع کنکور" } });

    const deleteBtn = screen.getByRole("button", { name: /حذف قطعی و برگشت‌ناپذیر دوره/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/این دوره دارای سابقه خرید یا دسترسی کاربران است/i),
      ).toBeInTheDocument();
    });
  });

  it("4. Supports deleteSourceDocuments flag checkbox in modal", async () => {
    render(
      <AdminCourseDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        course={draftCourse}
      />,
      { wrapper },
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const input = screen.getByPlaceholderText("نام دوره را اینجا بنویسید...");
    fireEvent.change(input, { target: { value: "فارماکولوژی پیشرفته بالینی" } });

    const deleteBtn = screen.getByRole("button", { name: /حذف قطعی و برگشت‌ناپذیر دوره/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteOfficialCourse).toHaveBeenCalledWith("course-draft-123", {
        confirmationName: "فارماکولوژی پیشرفته بالینی",
        deleteSourceDocuments: true,
      });
    });
  });

  it("5. Displays permanent deletion section in CourseSettingsPanel Danger Zone for both draft and published courses", async () => {
    render(
      <CourseSettingsPanel course={publishedCourse} onRefresh={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByText("حذف قطعی و دائمی دوره")).toBeInTheDocument();
    const openDeleteModalBtn = screen.getByRole("button", { name: /حذف قطعی این دوره/i });
    expect(openDeleteModalBtn).toBeInTheDocument();

    fireEvent.click(openDeleteModalBtn);

    // Modal opens
    expect(screen.getByText("حذف قطعی دوره آموزشی")).toBeInTheDocument();
  });
});
