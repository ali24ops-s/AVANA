import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminContentPage } from "../pages/admin/AdminContentPage";
import { api } from "../lib/api/admin";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

vi.mock("../lib/api/admin", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("AdminContentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/dashboard") {
        return { totalCourses: 10, totalModules: 50, totalLessons: 100, totalFlashcards: 500, totalQuizzes: 50 };
      }
      if (url.startsWith("/admin/courses")) {
        return { courses: [{ id: "c1", name: "Course 1", counts: { modules: 2, lessons: 5 } }] };
      }
      if (url.startsWith("/admin/content/courses/c1/hierarchy")) {
        return {
          id: "c1",
          name: "Course 1",
          modules: [
            {
              id: "m1",
              title: "Module 1",
              lessons: [
                { id: "l1", title: "Lesson 1", publicationStatus: "published", flashcardCount: 5, quizCount: 1, hasContent: true, createdAt: "2023-01-01" },
                { id: "l2", title: "Lesson 2", publicationStatus: "draft", flashcardCount: 0, quizCount: 0, hasContent: false, createdAt: "2023-01-01" }
              ]
            }
          ]
        };
      }
      return {};
    });
  });

  it("renders the stats overview correctly", async () => {
    renderWithRouter(<AdminContentPage />);
    await waitFor(() => {
      expect(screen.getByText("مدیریت محتوا")).toBeInTheDocument();
      expect(screen.getByText("۱۰")).toBeInTheDocument(); // total courses
      expect(screen.getByText("۵۰۰")).toBeInTheDocument(); // total flashcards
    });
  });

  it("renders the course list and expands to show hierarchy", async () => {
    renderWithRouter(<AdminContentPage />);
    
    // Wait for courses to load
    await waitFor(() => {
      expect(screen.getByText("Course 1")).toBeInTheDocument();
    });

    // Expand course
    const courseBtn = screen.getByRole("button", { name: /Course 1/i });
    fireEvent.click(courseBtn);

    // Wait for hierarchy to load
    await waitFor(() => {
      expect(screen.getByText("Module 1")).toBeInTheDocument();
      expect(screen.getByText("Lesson 1")).toBeInTheDocument();
      expect(screen.getByText("Lesson 2")).toBeInTheDocument();
      expect(screen.getByText("بدون محتوا")).toBeInTheDocument();
    });
  });

  it("handles empty state gracefully", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/courses")) return { courses: [] };
      return {};
    });
    
    renderWithRouter(<AdminContentPage />);
    await waitFor(() => {
      expect(screen.getByText("دوره‌ای یافت نشد.")).toBeInTheDocument();
    });
  });

  it("handles API error gracefully", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/courses")) throw new Error("API Error");
      return {};
    });
    
    renderWithRouter(<AdminContentPage />);
    await waitFor(() => {
      expect(screen.getByText("API Error")).toBeInTheDocument();
    });
  });
});
