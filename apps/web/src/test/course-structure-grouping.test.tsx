import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { CourseStructurePanel } from "../components/admin/studio/CourseStructurePanel.js";
import type { AdminCourseHierarchy } from "../lib/api/admin.js";

const mockHierarchy: AdminCourseHierarchy = {
  id: "course-123",
  name: "زیست‌شناسی جامع کنکور",
  subject: "زیست‌شناسی",
  groups: [
    {
      id: "grp-1",
      courseId: "course-123",
      title: "بخش اول: مبانی زیست‌شناسی",
      sortOrder: 0,
      createdAt: "2026-09-10T10:00:00Z",
      updatedAt: "2026-09-10T10:00:00Z",
    },
  ],
  modules: [
    {
      id: "mod-1",
      title: "فصل ۱: مولکول‌های زیستی",
      sortOrder: 0,
      subCourseGroupId: "grp-1",
      lessons: [
        {
          id: "les-1",
          title: "درس اول: ساختار کربوهیدرات‌ها",
          publicationStatus: "published",
          flashcardCount: 5,
          quizCount: 2,
          hasContent: true,
          createdAt: "2026-09-10T10:00:00Z",
        },
      ],
    },
    {
      id: "mod-2",
      title: "فصل ۲: سلول و بافت",
      sortOrder: 1,
      subCourseGroupId: null,
      lessons: [],
    },
  ],
};

describe("CourseStructurePanel - Groups and Chapter Reordering UI", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/hierarchy")) {
        return new Response(JSON.stringify(mockHierarchy), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/content-reports")) {
        return new Response(JSON.stringify({ items: [], totalCount: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  it("renders both grouped modules and ungrouped modules sections cleanly", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CourseStructurePanel courseId="course-123" />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const headings = screen.getAllByRole("heading").map((h) => h.textContent);
      expect(headings.some((h) => h?.includes("مبانی"))).toBe(true);
      expect(headings.some((h) => h?.includes("سلول"))).toBe(true);
      expect(headings.some((h) => h?.includes("عمومی"))).toBe(true);
    });
  });

  it("opens create group modal when clicking 'ایجاد سرفصل / گروه جدید'", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CourseStructurePanel courseId="course-123" />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ایجاد سرفصل / گروه جدید")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("ایجاد سرفصل / گروه جدید"));

    expect(screen.getByText("ایجاد گروه سرفصل جدید")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("عنوان گروه را وارد کنید...")).toBeInTheDocument();
  });
});
