import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseDetailPage } from "../pages/CourseDetailPage.js";
import { CourseHeader } from "../pages/LearningPage.js";
import { HomePage } from "../pages/HomePage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
}

describe("Course Detail Page - Exam Date Display", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000010";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT display past exam date in CourseDetailPage header", async () => {
    const pastExamDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: {
                id: courseId,
                title: "فارماکولوژی",
                subject: "داروسازی",
                created_at: "2026-01-01T00:00:00Z",
                exam_at: pastExamDate,
              },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <Routes>
            <Route path="/courses/:courseId" element={<CourseDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی")).toBeInTheDocument();
    });

    // Verify "تاریخ آزمون" is NOT rendered for past exam
    expect(screen.queryByText("تاریخ آزمون")).not.toBeInTheDocument();
  });

  it("displays upcoming exam date in CourseDetailPage header", async () => {
    const futureExamDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: {
                id: courseId,
                title: "فیزیولوژی",
                subject: "پزشکی",
                created_at: "2026-01-01T00:00:00Z",
                exam_at: futureExamDate,
              },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <Routes>
            <Route path="/courses/:courseId" element={<CourseDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فیزیولوژی")).toBeInTheDocument();
      expect(screen.getByText("تاریخ آزمون")).toBeInTheDocument();
    });
  });
});

describe("HomePage AddExamModal - Create Mode vs Edit Mode", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseWithPastExam = "00000000-0000-0000-0000-000000000011";
  const courseWithUpcomingExam = "00000000-0000-0000-0000-000000000012";
  const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const upcomingDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function setupMocks() {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations/") && urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [
                {
                  id: courseWithPastExam,
                  organization_id: orgId,
                  title: "دوره دارای آزمون گذشته",
                  exam_at: pastDate,
                },
                {
                  id: courseWithUpcomingExam,
                  organization_id: orgId,
                  title: "دوره دارای آزمون پیش رو",
                  exam_at: upcomingDate,
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: { id: courseWithUpcomingExam, title: "دوره دارای آزمون پیش رو" },
              modules: [],
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });
  }

  it("Create Mode: opens with empty state, no prefilled course or date, and delete button is hidden", async () => {
    setupMocks();

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره دارای آزمون پیش رو")).toBeInTheDocument();
    });

    const upcomingSection = screen.getByText("امتحانات پیش رو").closest("section")!;
    // Past exam course should NOT be displayed in upcoming exams list
    expect(within(upcomingSection).queryByText("دوره دارای آزمون گذشته")).not.toBeInTheDocument();
    // Upcoming exam course should be displayed
    expect(within(upcomingSection).getByText("دوره دارای آزمون پیش رو")).toBeInTheDocument();

    // Click "افزودن امتحان" button
    const addExamBtn = screen.getByRole("button", { name: /افزودن امتحان/i });
    fireEvent.click(addExamBtn);

    // Modal opens in Create mode
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("افزودن تاریخ امتحان")).toBeInTheDocument();
    });

    // Course select dropdown starts with placeholder
    const selectEl = screen.getByLabelText("انتخاب درس / دوره") as HTMLSelectElement;
    expect(selectEl.value).toBe("");

    // Date picker display is empty ("انتخاب تاریخ شمسی...")
    expect(screen.getByText(/انتخاب تاریخ شمسی/)).toBeInTheDocument();

    // Delete button ("حذف تاریخ امتحان") is NOT visible in create mode
    expect(screen.queryByRole("button", { name: /حذف تاریخ امتحان/i })).not.toBeInTheDocument();

    // Select course with past exam: date field MUST REMAIN EMPTY (never prefill past exam)
    fireEvent.change(selectEl, { target: { value: courseWithPastExam } });
    expect(screen.getByText(/انتخاب تاریخ شمسی/)).toBeInTheDocument();
  });

  it("Edit Mode: opens with existing course preselected, date prefilled, and delete button visible", async () => {
    setupMocks();

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره دارای آزمون پیش رو")).toBeInTheDocument();
    });

    // Click edit button for the upcoming exam
    const editBtn = screen.getByRole("button", { name: "ویرایش امتحان دوره دارای آزمون پیش رو" });
    fireEvent.click(editBtn);

    // Modal opens in Edit mode
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("ویرایش تاریخ و مباحث امتحان")).toBeInTheDocument();
    });

    // Delete button IS visible in edit mode
    expect(screen.getByRole("button", { name: /حذف تاریخ امتحان/i })).toBeInTheDocument();

    // Time input must NOT be present in edit mode
    expect(screen.queryByLabelText(/ساعت/i)).not.toBeInTheDocument();
  });

  it("Create & Edit Modes: exam form has no time input and submits cleanly with only date", async () => {
    let capturedPayload: any = null;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/exam`) && init?.method === "POST") {
        capturedPayload = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-saved",
              course: {
                id: courseWithUpcomingExam,
                title: "دوره دارای آزمون پیش رو",
                exam_at: capturedPayload.exam_at,
              },
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-courses",
              items: [
                {
                  id: courseWithUpcomingExam,
                  organization_id: orgId,
                  title: "دوره دارای آزمون پیش رو",
                  exam_at: "2026-11-20T10:30:00.000Z", // Legacy exam with time
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-orgs",
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره دارای آزمون پیش رو")).toBeInTheDocument();
    });

    // Open edit modal
    const editBtn = screen.getByRole("button", { name: "ویرایش امتحان دوره دارای آزمون پیش رو" });
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Confirm that time input and any time labels do not exist
    expect(screen.queryByLabelText(/ساعت/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ساعت برگزاری/i)).not.toBeInTheDocument();

    // Submit the form
    const submitBtn = screen.getByRole("button", { name: "ثبت تغییرات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedPayload).not.toBeNull();
      // Exam must be saved without any time offset / legacy time
      expect(capturedPayload.exam_at).toContain("00:00:00.000Z");
    });
  });
});

describe("LearningPage CourseHeader - Exam Date Display", () => {
  it("does NOT render exam date badge for courses with past exams", () => {
    const pastExamDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const course = {
      id: "course-past-1",
      title: "بیوشیمی پزشکی",
      subject: "پزشکی",
      exam_at: pastExamDate,
    };
    const progress = {
      total_lessons: 10,
      completed_lessons: 5,
      progress_percent: 50,
    };

    render(
      <MemoryRouter>
        <CourseHeader course={course as any} progress={progress as any} />
      </MemoryRouter>,
    );

    expect(screen.getByText("بیوشیمی پزشکی")).toBeInTheDocument();
    expect(screen.queryByText(/آزمون:/)).not.toBeInTheDocument();
  });

  it("renders exam date badge for courses with upcoming exams", () => {
    const upcomingExamDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const course = {
      id: "course-upcoming-1",
      title: "ایمونولوژی کاربردی",
      subject: "پزشکی",
      exam_at: upcomingExamDate,
    };
    const progress = {
      total_lessons: 10,
      completed_lessons: 5,
      progress_percent: 50,
    };

    render(
      <MemoryRouter>
        <CourseHeader course={course as any} progress={progress as any} />
      </MemoryRouter>,
    );

    expect(screen.getByText("ایمونولوژی کاربردی")).toBeInTheDocument();
    expect(screen.getByText(/آزمون:/)).toBeInTheDocument();
  });
});

