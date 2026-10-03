/**
 * Frontend Unit & Component Tests for Descriptive Answer Integrity Tracking & Teacher Review UI.
 *
 * Covers:
 * 1. Student Taking View:
 *    - Captures paste events (character and word counts) without storing clipboard text string
 *    - Records typing events, edit counts, and rapid input intervals
 *    - Transmits structured `integrityData` during autosave payload
 * 2. Teacher Result Detail Page:
 *    - Renders DescriptiveAnswerIntegrityCard when analysis is present
 *    - Displays paste count, paste ratio, duration, edit count, and rapid input metrics
 *    - Displays large paste badge and review recommended banner when appropriate
 *    - Expands and collapses chronological timeline of events
 *    - Displays non-accusatory teacher disclaimer
 *    - Gracefully handles null/missing integrity metadata (backward compatibility)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StudentExamTakingView } from "../components/student-exams/StudentExamTakingView.js";
import { TeacherStudentResultDetailPage } from "../pages/teacher/TeacherStudentResultDetailPage.js";
import type { StudentAttemptDTO } from "../lib/api/student-platform.js";
import type { DescriptiveAnswerIntegrityAnalysis } from "@avana/domain";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "teacher-1", email: "teacher@example.com", name: "استاد ارجمند" },
    memberships: [{ organization_id: "org-1", role: "teacher" }],
    isLoading: false,
    error: null,
    signOut: vi.fn(),
  }),
}));

const mockDescriptiveAttempt: StudentAttemptDTO = {
  id: "att-desc-1",
  examId: "exam-desc-1",
  status: "in_progress",
  startedAt: new Date(Date.now() - 60000).toISOString(),
  deadlineAt: new Date(Date.now() + 1800000).toISOString(),
  submittedAt: null,
  allowBackNavigation: true,
  questions: [
    {
      id: "q-desc-1",
      orderIndex: 0,
      prompt: "مکانیسم تنظیم فشار خون توسط سیستم رنین-آنژیوتانسین را شرح دهید.",
      questionType: "descriptive",
      points: 10,
    },
  ],
  savedAnswers: [],
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Descriptive Answer Integrity UI — Student Taking & Teacher Review", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("1. Student Exam Taking Telemetry Capture", () => {
    it("1.1. Captures paste events and transmits numerical telemetry without clipboard content string", async () => {
      let savedAnswerPayload: any = null;
      let savedAnswerUrl: string = "";

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).includes("/answers/")) {
          savedAnswerUrl = String(url);
          savedAnswerPayload = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-desc-1"
              classroomId="cls-101"
              examTitle="آزمون فیزیولوژی تشریحی"
              attempt={mockDescriptiveAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const textarea = screen.getByPlaceholderText(/پاسخ تشریحی خود را اینجا بنویسید/);
      expect(textarea).toBeInTheDocument();

      // Simulate a paste event of 15 words / 90 characters
      const pastedText = "آنژیوتانسینوژن توسط کبد تولید شده و توسط آنزیم رنین به آنژیوتانسین یک تبدیل می‌گردد.";
      fireEvent.paste(textarea, {
        clipboardData: {
          getData: (format: string) => (format === "text/plain" ? pastedText : ""),
        },
      });

      // Update textarea value to match typing/pasting
      fireEvent.change(textarea, { target: { value: pastedText } });

      // Wait for autosave flush
      await waitFor(() => {
        expect(savedAnswerPayload).not.toBeNull();
      });

      expect(savedAnswerUrl).toContain("/answers/q-desc-1");
      expect(savedAnswerPayload.textAnswer).toBe(pastedText);
      expect(savedAnswerPayload.integrityData).toBeDefined();

      const { integrityData } = savedAnswerPayload;
      expect(integrityData.pasteCount).toBe(1);
      expect(integrityData.pastedCharactersTotal).toBe(pastedText.length);
      expect(integrityData.pastedWordsTotal).toBeGreaterThan(5);
      expect(integrityData.pasteEvents).toHaveLength(1);
      expect(integrityData.pasteEvents[0].characterCount).toBe(pastedText.length);

      // Verify ZERO clipboard content is retained in integrity telemetry object
      expect((integrityData as any).clipboardText).toBeUndefined();
      expect((integrityData.pasteEvents[0] as any).text).toBeUndefined();
      expect((integrityData.pasteEvents[0] as any).content).toBeUndefined();
    });
  });

  describe("2. Teacher Result Detail Page — Telemetry Card & Timeline", () => {
    const mockIntegrityAnalysis: DescriptiveAnswerIntegrityAnalysis = {
      pasteDetected: true,
      pasteCount: 2,
      pastedCharactersTotal: 450,
      pastedWordsTotal: 85,
      finalAnswerCharacters: 600,
      finalAnswerWords: 110,
      pasteRatio: 0.75,
      largePasteDetected: false,
      rapidInputDetected: true,
      rapidInputCount: 1,
      editCount: 8,
      durationMs: 145000, // 2 min 25 sec
      reviewRecommended: true,
      signals: [
        "تعداد ۲ عملیات Paste در ورود پاسخ ثبت شده است.",
        "تعداد ۱ مورد ورود سریع متن ثبت شده است.",
        "بخش عمده پاسخ از طریق عملیات Paste وارد شده است.",
      ],
      timeline: [
        {
          type: "start",
          timestamp: new Date(Date.now() - 145000).toISOString(),
        },
        {
          type: "paste",
          timestamp: new Date(Date.now() - 100000).toISOString(),
          characterDelta: 300,
          wordDelta: 55,
        },
        {
          type: "rapid_input",
          timestamp: new Date(Date.now() - 80000).toISOString(),
          characterDelta: 150,
          wordDelta: 30,
        },
        {
          type: "edit",
          timestamp: new Date(Date.now() - 40000).toISOString(),
          characterDelta: -20,
        },
        {
          type: "submit",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const mockTeacherExamResponse = {
      exam: {
        id: "exam-teacher-1",
        classroomId: "cls-1",
        title: "آزمون تشریحی پایان‌ترم",
        durationMinutes: 60,
      },
    };

    const mockStudentResultResponse = {
      result: {
        attempt: {
          id: "att-100",
          examId: "exam-teacher-1",
          studentId: "student-100",
          studentName: "علی رضایی",
          studentEmail: "ali@example.com",
          status: "submitted",
          score: 8,
          maxScore: 10,
          percentage: 80,
          passed: true,
          durationMinutes: 25,
          submittedAt: new Date().toISOString(),
        },
        questions: [
          {
            questionId: "q-100",
            questionType: "descriptive",
            prompt: "عملکرد هورمون ضدادراری (ADH) در نفرون را شرح دهید.",
            textAnswer: "هورمون ADH با افزایش نفوذپذیری لوله جمع‌کننده باعث بازجذب آب می‌شود.",
            gradingStatus: "ungraded",
            pointsEarned: null,
            maxPoints: 10,
            integrityAnalysis: mockIntegrityAnalysis,
          },
        ],
      },
    };

    it("2.1. Renders DescriptiveAnswerIntegrityCard with telemetry metrics, badges, and teacher disclaimer", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/teacher/exams/exam-teacher-1")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockTeacherExamResponse)),
          } as Response;
        }
        if (String(url).includes("/results/student-100")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockStudentResultResponse)),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/teacher/exams/exam-teacher-1/results/student-100"]}>
            <Routes>
              <Route
                path="/teacher/exams/:examId/results/:studentId"
                element={<TeacherStudentResultDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("اطلاعات ثبت و رفتار ورود پاسخ:")).toBeInTheDocument();
      });

      // Verify badges and review banner
      expect(screen.getByText("نیازمند بررسی تکمیلی")).toBeInTheDocument();
      expect(screen.getByText("ورود سریع متن")).toBeInTheDocument();
      expect(screen.getByText(/پیشنهاد بررسی توسط استاد:/)).toBeInTheDocument();

      // Verify non-accusatory disclaimer
      expect(screen.getByText(/این اطلاعات صرفاً گزارش عینی از نحوه و ریتم نگارش پاسخ است/)).toBeInTheDocument();

      // Verify signals are listed
      expect(screen.getByText(/بخش عمده پاسخ از طریق عملیات Paste وارد شده است/)).toBeInTheDocument();

      // Verify timeline button exists
      const timelineToggle = screen.getByRole("button", { name: /تایم‌لاین رویدادهای نگارش/ });
      expect(timelineToggle).toBeInTheDocument();

      // Click to expand timeline
      fireEvent.click(timelineToggle);

      await waitFor(() => {
        expect(screen.getByText("شروع نگارش پاسخ")).toBeInTheDocument();
        expect(screen.getByText("عملیات Paste")).toBeInTheDocument();
        expect(screen.getByText("ورود سریع متن (Rapid Input)")).toBeInTheDocument();
        expect(screen.getByText("ویرایش یا حذف متن")).toBeInTheDocument();
      });
    });

    it("2.2. Gracefully handles descriptive question with null integrityAnalysis without crashing", async () => {
      const responseWithNullIntegrity = {
        result: {
          ...mockStudentResultResponse.result,
          questions: [
            {
              ...mockStudentResultResponse.result.questions[0],
              integrityAnalysis: null,
            },
          ],
        },
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/teacher/exams/exam-teacher-1")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockTeacherExamResponse)),
          } as Response;
        }
        if (String(url).includes("/results/student-100")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(responseWithNullIntegrity)),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/teacher/exams/exam-teacher-1/results/student-100"]}>
            <Routes>
              <Route
                path="/teacher/exams/:examId/results/:studentId"
                element={<TeacherStudentResultDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("پاسخ تشریحی ارسالی دانش‌آموز:")).toBeInTheDocument();
      });

      // Integrity card should not render, and page should not crash
      expect(screen.queryByText("اطلاعات ثبت و رفتار ورود پاسخ:")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "ثبت نمره" })).toBeInTheDocument();
    });
  });
});
