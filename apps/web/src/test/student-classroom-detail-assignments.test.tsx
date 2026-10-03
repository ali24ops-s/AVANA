import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentClassroomDetailPage } from "../pages/student/StudentClassroomDetailPage.js";
import type { StudentAssignmentListItemDTO } from "../lib/api/student-platform.js";

// Mock hooks
let mockClassroomsData: { classrooms: Array<{ id: string; title: string; description: string | null }> } | undefined;
let mockExamsData: {
  exams: Array<{
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    startsAt: string;
    endsAt: string;
    runtimeState: string;
    hasAttempt: boolean;
    attemptStatus: string | null;
    score: number | null;
    maxScore: number | null;
  }>;
} | undefined;
let mockAssignmentsData: { assignments: StudentAssignmentListItemDTO[] } | undefined;
let mockIsLoading = false;

vi.mock("../hooks/useStudentTeacherExams.js", () => ({
  useStudentClassrooms: () => ({
    data: mockClassroomsData,
    isLoading: mockIsLoading,
  }),
  useStudentClassroomExams: () => ({
    data: mockExamsData,
    isLoading: mockIsLoading,
    isError: false,
  }),
  useLeaveClassroom: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("../hooks/useStudentAssignments.js", () => ({
  useStudentClassroomAssignments: () => ({
    data: mockAssignmentsData,
    isLoading: mockIsLoading,
  }),
  useStudentAssignment: () => ({
    data: undefined,
    isLoading: false,
    error: null,
  }),
  useSubmitAssignment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("StudentClassroomDetailPage — Published Assignments Visibility Regression Tests", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    mockIsLoading = false;

    mockClassroomsData = {
      classrooms: [
        {
          id: "cls-123",
          title: "کلاس زیست‌شناسی پیشرفته",
          description: "کلاس مباحث بیوشیمی و ژنتیک",
        },
      ],
    };

    mockExamsData = {
      exams: [
        {
          id: "exam-1",
          title: "آزمون میان‌ترم ژنتیک",
          description: "آزمون تستی فصل‌های ۱ تا ۴",
          durationMinutes: 45,
          startsAt: new Date(Date.now() - 3600000).toISOString(),
          endsAt: new Date(Date.now() + 3600000).toISOString(),
          runtimeState: "active",
          hasAttempt: false,
          attemptStatus: null,
          score: null,
          maxScore: 100,
        },
      ],
    };

    mockAssignmentsData = {
      assignments: [
        {
          id: "asg-1",
          classroomId: "cls-123",
          title: "تکلیف ساختار DNA و همانندسازی",
          description: "پاسخ به سوالات تشریحی فصل ۵",
          startsAt: new Date(Date.now() - 3600000).toISOString(),
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          status: "published",
          runtimeState: "active",
          studentStatus: "can_submit",
          hasSubmitted: false,
          submittedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  });

  it("1. Displays published assignments when 'تکالیف' tab is selected", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/classrooms/cls-123?tab=assignments"]}>
          <Routes>
            <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Header and classroom info (in breadcrumb and page header)
    expect(screen.getAllByText("کلاس زیست‌شناسی پیشرفته").length).toBeGreaterThan(0);

    // The assignments tab should be active
    expect(screen.getByText("فهرست تکالیف کلاسی")).toBeInTheDocument();
    expect(screen.getByText("تکلیف ساختار DNA و همانندسازی")).toBeInTheDocument();
    expect(screen.getByText("پاسخ به سوالات تشریحی فصل ۵")).toBeInTheDocument();
    expect(screen.getByText("قابل ارسال")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ارسال پاسخ/i })).toBeInTheDocument();
  });

  it("2. Allows student to switch between 'تکالیف' and 'آزمون‌ها' tabs seamlessly", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/classrooms/cls-123?tab=assignments"]}>
          <Routes>
            <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial state: assignments tab visible
    expect(screen.getByText("فهرست تکالیف کلاسی")).toBeInTheDocument();

    // Click on exams tab
    const examsTabButton = screen.getByRole("button", { name: /آزمون‌ها/i });
    fireEvent.click(examsTabButton);

    // Now exams view should be active (table view and card view both present)
    expect(screen.getByText("آزمون‌های این کلاس")).toBeInTheDocument();
    expect(screen.getAllByText("آزمون میان‌ترم ژنتیک").length).toBeGreaterThan(0);

    // Click back to assignments tab
    const assignmentsTabButton = screen.getByRole("button", { name: /تکالیف/i });
    fireEvent.click(assignmentsTabButton);

    // Assignments view should be active again
    expect(screen.getByText("فهرست تکالیف کلاسی")).toBeInTheDocument();
    expect(screen.getByText("تکلیف ساختار DNA و همانندسازی")).toBeInTheDocument();
  });

  it("3. Displays proper empty state when no assignments are published for the classroom", () => {
    mockAssignmentsData = { assignments: [] };

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/classrooms/cls-123?tab=assignments"]}>
          <Routes>
            <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("هنوز تکلیفی برای این کلاس تعریف یا منتشر نشده است.")).toBeInTheDocument();
  });
});
