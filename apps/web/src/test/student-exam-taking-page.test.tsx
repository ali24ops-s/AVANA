import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StudentExamTakingPage } from "../pages/student/StudentExamTakingPage.js";
import type { StudentAttemptDTO, StudentExamListDTO } from "../lib/api/student-platform.js";

// Mock hooks
const mockUseStudentClassroomExams = vi.fn();
const mockUseCurrentStudentExamAttempt = vi.fn();
const mockUseStartStudentExamAttempt = vi.fn();
const mockUseSaveStudentExamAnswer = vi.fn();
const mockUseSubmitStudentExamAttempt = vi.fn();

vi.mock("../hooks/useStudentTeacherExams.js", () => ({
  useStudentClassroomExams: (classroomId?: string) => mockUseStudentClassroomExams(classroomId),
  useCurrentStudentExamAttempt: (examId?: string) => mockUseCurrentStudentExamAttempt(examId),
  useStartStudentExamAttempt: (examId: string, classroomId?: string) =>
    mockUseStartStudentExamAttempt(examId, classroomId),
  useSaveStudentExamAnswer: (examId: string) => mockUseSaveStudentExamAnswer(examId),
  useSubmitStudentExamAttempt: (examId: string, classroomId?: string) =>
    mockUseSubmitStudentExamAttempt(examId, classroomId),
  studentExamKeys: {
    classroomExams: (classroomId: string) => ["student-classroom-exams", classroomId] as const,
    currentAttempt: (examId: string) => ["student-exam-attempt", examId] as const,
    review: (examId: string) => ["student-exam-review", examId] as const,
    allExams: () => ["student-all-exams"] as const,
  },
}));

// Mock Auth
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "student-1", email: "student@example.com" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    isLoading: false,
  }),
}));

const mockExam: StudentExamListDTO = {
  id: "exam-101",
  classroomId: "cls-101",
  title: "آزمون بیوشیمی",
  description: "آزمون کلاسی بیوشیمی",
  durationMinutes: 30,
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
  passingScorePercentage: 50,
  showResultsImmediately: true,
  allowBackNavigation: true,
  runtimeState: "active",
  hasAttempt: true,
  attemptStatus: "in_progress",
  score: null,
  maxScore: null,
  percentage: null,
  passed: null,
};

const mockAttempt: StudentAttemptDTO = {
  id: "att-101",
  examId: "exam-101",
  status: "in_progress",
  startedAt: new Date(Date.now() - 60000).toISOString(),
  deadlineAt: new Date(Date.now() + 1800000).toISOString(),
  submittedAt: null,
  allowBackNavigation: true,
  questions: [
    {
      id: "q-1",
      orderIndex: 0,
      prompt: "کدام آنزیم مرحله محدودکننده گلیکولیز است؟",
      options: [
        { id: "opt-1", text: "فسفوفروکتوکیناز-۱" },
        { id: "opt-2", text: "هگزوکیناز" },
      ],
      points: 10,
    },
  ],
  savedAnswers: [],
};

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/classrooms/cls-101/exams/exam-101/take"]}>
        <Routes>
          <Route
            path="/classrooms/:classroomId/exams/:examId/take"
            element={<StudentExamTakingPage />}
          />
          <Route
            path="/classrooms/:classroomId/exams/:examId/results"
            element={<div>صفحه نتایج آزمون</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("StudentExamTakingPage — Non-destructive State Transition & Regression Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStartStudentExamAttempt.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseSaveStudentExamAnswer.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    });
    mockUseSubmitStudentExamAttempt.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ result: { id: "att-101", status: "submitted" } }),
      isPending: false,
    });
  });

  it("Case 1: Initial load is successful — exam questions and title remain visible", () => {
    mockUseStudentClassroomExams.mockReturnValue({
      data: { exams: [mockExam] },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: { attempt: mockAttempt },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderComponent();

    // Verify question prompt and exam title are visible
    expect(screen.getByText("کدام آنزیم مرحله محدودکننده گلیکولیز است؟")).toBeInTheDocument();
    expect(screen.getByText("فسفوفروکتوکیناز-۱")).toBeInTheDocument();
    expect(screen.getByText("آزمون بیوشیمی")).toBeInTheDocument();
    // Verify full-page error is NOT shown
    expect(screen.queryByText("خطا در بارگذاری آزمون")).not.toBeInTheDocument();
  });

  it("Case 2: Primary Regression — Refetch fails after initial success (data present, isError: true), valid exam MUST NOT disappear", () => {
    // Simulate query state where a background refetch failed (isError: true), but cached data is still present
    mockUseStudentClassroomExams.mockReturnValue({
      data: { exams: [mockExam] },
      isLoading: false,
      isError: true, // background refetch failed
      error: new Error("Network timeout during refetch"),
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: { attempt: mockAttempt },
      isLoading: false,
      isError: true, // background refetch failed
      error: new Error("500 Internal Server Error during refetch"),
    });

    renderComponent();

    // Active exam taking view MUST remain mounted and functional
    expect(screen.getByText("کدام آنزیم مرحله محدودکننده گلیکولیز است؟")).toBeInTheDocument();
    expect(screen.getByText("فسفوفروکتوکیناز-۱")).toBeInTheDocument();

    // Full-page error screen MUST NOT overwrite the active exam
    expect(screen.queryByText("خطا در بارگذاری آزمون")).not.toBeInTheDocument();
    expect(
      screen.queryByText("اطلاعات این آزمون در دسترس نیست یا ممکن است دسترسی شما به کلاس منقضی شده باشد."),
    ).not.toBeInTheDocument();
  });

  it("Case 3: Initial loading state (no data yet, isLoading: true) renders loading message", () => {
    mockUseStudentClassroomExams.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderComponent();

    expect(
      screen.getByText("در حال بازیابی اطلاعات تلاش و سؤالات آزمون از سرور..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("خطا در بارگذاری آزمون")).not.toBeInTheDocument();
  });

  it("Case 4: Real Error with No Data (403 Forbidden / Not enrolled) renders full-page error", () => {
    mockUseStudentClassroomExams.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("403 Forbidden"),
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("403 Forbidden"),
    });

    renderComponent();

    expect(screen.getByText("خطا در بارگذاری آزمون")).toBeInTheDocument();
    expect(
      screen.getByText("اطلاعات این آزمون در دسترس نیست یا ممکن است دسترسی شما به کلاس منقضی شده باشد."),
    ).toBeInTheDocument();
    expect(screen.getByText("بازگشت به کلاس")).toBeInTheDocument();
  });

  it("Case 5: Real Error with No Data (404 Not Found / Attempt missing) renders full-page error", () => {
    mockUseStudentClassroomExams.mockReturnValue({
      data: { exams: [] }, // exam not in classroom
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: { attempt: null },
      isLoading: false,
      isError: true,
      error: new Error("404 Not Found"),
    });

    renderComponent();

    expect(screen.getByText("خطا در بارگذاری آزمون")).toBeInTheDocument();
    expect(
      screen.getByText("اطلاعات این آزمون در دسترس نیست یا ممکن است دسترسی شما به کلاس منقضی شده باشد."),
    ).toBeInTheDocument();
  });

  it("Case 6: Student hasn't started yet (attempt: null, isError: false) renders Start Exam CTA card", () => {
    mockUseStudentClassroomExams.mockReturnValue({
      data: { exams: [mockExam] },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: { attempt: null },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderComponent();

    expect(screen.getByText("شروع آزمون «آزمون بیوشیمی»")).toBeInTheDocument();
    expect(
      screen.getByText("شما هنوز در این آزمون شرکت نکرده‌اید. با کلیک بر روی دکمه زیر تلاش شما آغاز خواهد شد."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "شروع آزمون" })).toBeInTheDocument();
  });

  it("Case 7: Fallback title is used when exam is missing from classroom list query but valid attempt exists", () => {
    mockUseStudentClassroomExams.mockReturnValue({
      data: { exams: [] }, // exam list empty or failed
      isLoading: false,
      isError: true,
      error: new Error("Failed to list classroom exams"),
    });
    mockUseCurrentStudentExamAttempt.mockReturnValue({
      data: { attempt: mockAttempt },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderComponent();

    // The snapshot questions are rendered safely with fallback title
    expect(screen.getByText("کدام آنزیم مرحله محدودکننده گلیکولیز است؟")).toBeInTheDocument();
    expect(screen.getByText("آزمون کلاسی")).toBeInTheDocument();
    expect(screen.queryByText("خطا در بارگذاری آزمون")).not.toBeInTheDocument();
  });
});
